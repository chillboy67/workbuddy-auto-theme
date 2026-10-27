import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {atomicWrite,assertNoSymlink,assertRegularFile,readAsarEntry,prepareBackup,validateBackup,restoreOriginal,withLock} from '../src/files.mjs';
import {PROFILE} from '../src/patch.mjs';
const temp=t=>{const dir=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'wb-auto-theme-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;};

test('atomic writes preserve requested permissions and leave no temporary files',t=>{
  const dir=temp(t),file=path.join(dir,'nested/file');atomicWrite(file,'one');atomicWrite(file,'two');
  assert.equal(fs.readFileSync(file,'utf8'),'two');
  if(process.platform!=='win32')assert.equal(fs.statSync(file).mode&0o777,0o600);
  assert.deepEqual(fs.readdirSync(path.dirname(file)),['file']);
});
test('symlink file and parent are rejected without changing their destination',t=>{
  if(process.platform==='win32')return t.skip('symlink privileges vary');
  const dir=temp(t),real=path.join(dir,'real');fs.mkdirSync(real);fs.writeFileSync(path.join(real,'file'),'untouched');
  const link=path.join(dir,'link');fs.symlinkSync(real,link);
  assert.throws(()=>atomicWrite(path.join(link,'file'),'changed'),/符号链接/);
  assert.throws(()=>assertRegularFile(link),/普通文件/);
  assert.equal(fs.readFileSync(path.join(real,'file'),'utf8'),'untouched');
  assert.throws(()=>assertNoSymlink(path.join(link,'new')),/符号链接/);
});
test('reads bounded ASAR metadata without loading the application payload',t=>{
  const dir=temp(t),file=path.join(dir,'sample.asar');
  const header=Buffer.from(JSON.stringify({files:{renderer:{files:{test:{size:42,unpacked:true}}}}}));
  const prefix=Buffer.alloc(16);prefix.writeUInt32LE(header.length,12);fs.writeFileSync(file,Buffer.concat([prefix,header]));
  assert.equal(readAsarEntry(file,['renderer','test']).size,42);
  assert.equal(readAsarEntry(file,['missing']),undefined);
});
test('rejects truncated and oversized ASAR headers',t=>{
  const dir=temp(t),file=path.join(dir,'bad.asar');fs.writeFileSync(file,'x');assert.throws(()=>readAsarEntry(file,[]),/不完整/);
  const prefix=Buffer.alloc(16);prefix.writeUInt32LE(64*1024*1024,12);fs.writeFileSync(file,prefix);assert.throws(()=>readAsarEntry(file,[]),/长度/);
});
test('unknown application bytes never create a backup or modify files',t=>{
  const dir=temp(t),state=path.join(dir,'state');
  assert.throws(()=>prepareBackup({kind:'unsupported'},state),/不受支持/);assert.equal(fs.existsSync(state),false);
});
test('legacy adoption requires an explicit original backup',t=>{
  const state=path.join(temp(t),'state');
  assert.throws(()=>prepareBackup({kind:'patched'},state),/original-backup/);assert.equal(fs.existsSync(state),false);
});
test('corrupt original backup fails validation and cannot restore application',t=>{
  const dir=temp(t),state=path.join(dir,'state');fs.mkdirSync(state);const target=path.join(dir,'target.js');fs.writeFileSync(target,'unchanged');
  const info={appPath:'/Applications/WorkBuddy.app',target,version:'5.8.3',relativeTarget:'example/theme.js'};
  fs.writeFileSync(path.join(state,'state.json'),JSON.stringify({schema:1,version:info.version,appPath:info.appPath,relativeTarget:info.relativeTarget,originalHash:PROFILE.originalHash,patchedHash:PROFILE.patchedHash,bytes:PROFILE.bytes}));
  fs.writeFileSync(path.join(state,'original.js'),'corrupt');
  assert.throws(()=>validateBackup(info,state),/校验/);assert.throws(()=>restoreOriginal(info,state),/校验/);
  assert.equal(fs.readFileSync(target,'utf8'),'unchanged');
});

test('operation lock rejects concurrent writers and is released on failure',async t=>{
  const state=path.join(temp(t),'state');
  await assert.rejects(withLock(state,async()=>{
    await assert.rejects(withLock(state,async()=>{}),/另一个操作/);
    throw Error('simulated failure');
  }),/simulated failure/);
  assert.equal(fs.existsSync(path.join(state,'operation.lock')),false);
  assert.equal(await withLock(state,async()=>42),42);
});
