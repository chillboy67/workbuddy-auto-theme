import {execFileSync} from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {connectCdp} from './cdp.mjs';

export const BUNDLE_ID='com.tencent.workbuddy.mac';
const run=(file,args)=>execFileSync(file,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:15000}).trim();
export function appVersion(app){
  const plist=path.join(app,'Contents/Info.plist');
  const id=run('/usr/libexec/PlistBuddy',['-c','Print :CFBundleIdentifier',plist]);
  if(id!==BUNDLE_ID)throw new Error('应用 Bundle ID 不是官方 WorkBuddy macOS 客户端。');
  return run('/usr/libexec/PlistBuddy',['-c','Print :CFBundleShortVersionString',plist]);
}
export function isRunning(){return run('/usr/bin/osascript',['-e',`application id "${BUNDLE_ID}" is running`])==='true';}
export async function quitApp(){
  if(!isRunning())return;
  run('/usr/bin/osascript',['-e',`tell application id "${BUNDLE_ID}" to quit`]);
  for(let i=0;i<50;i++){if(!isRunning())return;await new Promise(r=>setTimeout(r,200));}
  throw new Error('WorkBuddy 未退出。请先保存工作并手动退出，再重试；不会强制结束进程。');
}
export function openApp(app,debugPort){
  const args=['-a',app];
  if(debugPort)args.push('--args',`--remote-debugging-port=${debugPort}`,'--remote-debugging-address=127.0.0.1');
  run('/usr/bin/open',args);
}
export async function assertPortFree(port){
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('--port 必须是 1024–65535 的整数。');
  await new Promise((resolve,reject)=>{
    const server=net.createServer();
    server.once('error',()=>reject(new Error(`本机端口 ${port} 已占用或不可用；不会连接或关闭占用者。`)));
    server.listen({port,host:'127.0.0.1',exclusive:true},()=>server.close(resolve));
  });
}
export async function assertPortClosed(port){
  await assertPortFree(port);
}
export async function debugSession(app,port,operation){
  await assertPortFree(port);
  await quitApp();
  let client,started=false,primaryError;
  try{
    openApp(app,port);started=true;
    const expected=pathToFileURL(path.join(app,'Contents/Resources/app.asar/renderer/index.html')).href;
    client=await connectCdp(port,expected);
    // Loading the window is not equivalent to the host being initialized.
    for(let i=0;i<100;i++){
      if(await client.evaluate('!!globalThis.wb?.config?.theme'))break;
      if(i===99)throw new Error('等待 WorkBuddy 配置服务超时。');
      await new Promise(r=>setTimeout(r,200));
    }
    return await operation(client);
  }catch(error){primaryError=error;throw error;}
  finally{
    client?.close();
    if(started){
      try{await quitApp();await assertPortClosed(port);openApp(app);}
      catch(error){
        if(primaryError)throw new AggregateError([primaryError,error],'操作失败，且未能完成调试实例清理。请退出 WorkBuddy 并正常重新打开。');
        throw error;
      }
    }
  }
}
