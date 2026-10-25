#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createInterface} from 'node:readline/promises';
import {parseArgs} from 'node:util';
import {PROFILE,sha256} from '../src/patch.mjs';
import {inspectApp,prepareBackup,validateBackup,writePatched,restoreOriginal,atomicWrite,withLock} from '../src/files.mjs';
import {appVersion,quitApp,openApp,debugSession} from '../src/platform.mjs';
import {SNAPSHOT,ENABLE,READ_STATE,restoreExpression,assertAutoState,verifyMedia} from '../src/runtime.mjs';

const HELP=`WorkBuddy Auto Theme v0.1.0 — macOS 原生深浅色自动跟随

用法：node bin/workbuddy-auto-theme.mjs <命令> [选项]

  status       只读检查版本、文件状态与本地备份（不重启应用）
  install      备份、安装补丁并开启自动跟随；会重启 WorkBuddy
  verify       临时调试验证深浅色和页面重载；会重启 WorkBuddy
  uninstall    恢复安装前设置与原版主题模块；会重启 WorkBuddy

  --yes                 已保存工作，同意重启和修改已签名应用资源
  --app <path>          默认 /Applications/WorkBuddy.app
  --state-dir <path>    默认 ~/Library/Application Support/WorkBuddy Auto Theme
  --port <number>       临时本机调试端口，默认 9333
  --original-backup <file>  接管早期补丁时提供已有原版备份
  --json                status 输出 JSON
  --help                显示帮助

仅支持已验证的 WorkBuddy 5.8.3 主题文件哈希。
补丁会使原有资源签名校验失效；不会重签名或关闭系统安全检查。
备份只存本机，不随卸载删除。未知版本或哈希会停止操作。`;

async function confirm(command,yes){
  if(yes)return;
  if(!process.stdin.isTTY)throw new Error('需要确认重启。保存工作后使用 --yes，或在交互终端执行。');
  const readline=createInterface({input:process.stdin,output:process.stdout});
  try{
    console.log('这会退出并重新打开 WorkBuddy。安装会修改已签名资源，使资源签名校验失效。');
    const answer=await readline.question(`已保存工作并同意执行 ${command}？输入 yes 继续：`);
    if(answer.trim()!=='yes')throw new Error('已取消，未修改应用。');
  }finally{readline.close();}
}

async function main(){
  const [major,minor]=process.versions.node.split('.').map(Number);
  if(major<22 || (major===22&&minor<13))throw new Error('需要 Node.js 22.13 或更新版本。');
  const {values,positionals}=parseArgs({allowPositionals:true,options:{
    yes:{type:'boolean',default:false},app:{type:'string',default:'/Applications/WorkBuddy.app'},
    'state-dir':{type:'string',default:path.join(os.homedir(),'Library/Application Support/WorkBuddy Auto Theme')},
    port:{type:'string',default:'9333'},'original-backup':{type:'string'},json:{type:'boolean'},help:{type:'boolean',short:'h'},
  }});
  const command=positionals[0];
  if(values.help || !command){console.log(HELP);return;}
  if(positionals.length!==1 || !['status','install','verify','uninstall'].includes(command))throw new Error('未知命令或多余参数。使用 --help 查看用法。');
  if(process.platform!=='darwin')throw new Error('此工具仅支持 macOS。');
  const app=path.resolve(values.app),stateDir=path.resolve(values['state-dir']),port=Number(values.port);
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('--port 必须是 1024–65535 的整数。');
  const info=inspectApp(app,appVersion(app));
  if(command==='status'){
    let backup='absent';
    if(fs.existsSync(path.join(stateDir,'state.json'))){try{validateBackup(info,stateDir);backup='valid';}catch{backup='invalid';}}
    const status={version:info.version,module:PROFILE.module,state:info.kind,sha256:info.hash,backup,
      signatureEffect:info.kind==='patched'?'modified signed resource':'not evaluated',runtime:'not inspected',appPath:app,stateDir};
    console.log(values.json?JSON.stringify(status,null,2):
      `版本：${status.version}\n主题文件：${status.state}\n备份：${status.backup}\n运行态：未连接（status 只检查磁盘）\n备份目录：${stateDir}`);
    return;
  }
  await confirm(command,values.yes);
  return withLock(stateDir,async()=>{
  if(command==='install'){
    prepareBackup(info,stateDir,values['original-backup']&&path.resolve(values['original-backup']));
    const appearanceFile=path.join(stateDir,'appearance.json');
    let snapshot;
    await quitApp();
    try{
      writePatched(info,stateDir);
      await debugSession(app,port,async client=>{
        try{
          snapshot=await client.evaluate(SNAPSHOT);
          if(snapshot.skin)throw new Error('当前使用自定义皮肤。请先在 WorkBuddy 外观中选择原生浅色或深色，再安装。');
          restoreExpression(snapshot); // Validate the snapshot before any runtime mutation.
          if(!fs.existsSync(appearanceFile))atomicWrite(appearanceFile,JSON.stringify(snapshot,null,2)+'\n');
          await client.evaluate(ENABLE);
          assertAutoState(await client.evaluate(READ_STATE));
        }catch(error){
          if(snapshot){try{await client.evaluate(restoreExpression(snapshot));}catch(restoreError){throw new AggregateError([error,restoreError],'安装失败，运行态恢复也失败；备份已保留。');}}
          throw error;
        }
      });
      console.log('自动跟随已开启。已退出临时调试实例并正常重启；原版备份保留在：'+stateDir);
    }catch(error){
      // Do not overwrite a file changed concurrently by an update or another tool.
      const current=fs.readFileSync(info.target);
      if(sha256(current)===PROFILE.patchedHash || sha256(current)===PROFILE.originalHash){
        await quitApp();atomicWrite(info.target,info.bytes,fs.statSync(info.target).mode&0o777);openApp(app);
      }
      throw error;
    }
    return;
  }
  validateBackup(info,stateDir);
  if(command==='verify'){
    if(info.kind!=='patched')throw new Error('当前未安装受支持的补丁。');
    const results=await debugSession(app,port,async client=>{
      assertAutoState(await client.evaluate(READ_STATE));
      const media=await verifyMedia(client);
      await client.send('Page.reload',{ignoreCache:true});
      let last;
      for(let i=0;i<100;i++){
        try{const state=await client.evaluate(READ_STATE);assertAutoState(state);last=null;break;}
        catch(error){last=error;await new Promise(r=>setTimeout(r,200));}
      }
      if(last)throw last;
      return [...media,{reload:true,passed:true}];
    });
    console.log(JSON.stringify({checks:results,method:'CDP media emulation + renderer reload',normalRelaunch:true},null,2));
    return;
  }
  if(info.kind==='unsupported')throw new Error('应用文件已更新或被修改，停止卸载以避免覆盖新版。');
  const appearanceFile=path.join(stateDir,'appearance.json');
  if(!fs.existsSync(appearanceFile))throw new Error('缺少安装前外观备份；停止卸载，请参考 docs/RECOVERY.md 手动恢复。');
  const snapshot=JSON.parse(fs.readFileSync(appearanceFile,'utf8'));
  const expression=restoreExpression(snapshot);
  await debugSession(app,port,async client=>{
    await client.evaluate(expression);
    restoreOriginal(info,stateDir);
  });
  console.log('已恢复安装前外观设置和原版主题文件，并正常重启 WorkBuddy。备份仍保留在：'+stateDir);
  });
}

main().catch(error=>{
  console.error(`错误：${error.message}`);
  if(error instanceof AggregateError)for(const cause of error.errors)console.error(`  ${cause.message}`);
  process.exitCode=1;
});
