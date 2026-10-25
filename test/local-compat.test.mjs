import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PROFILE,buildPatch,sha256} from '../src/patch.mjs';
import {inspectApp,prepareBackup,writePatched,restoreOriginal,validateBackup} from '../src/files.mjs';

// Optional private fixture supplied only by the tester. Never commit vendor code.
test('optional local original: install, idempotent backup, refusal after update, restore',{
  skip:!process.env.WORKBUDDY_TEST_ORIGINAL,
},t=>{
  const original=fs.readFileSync(process.env.WORKBUDDY_TEST_ORIGINAL);
  const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'wb-compat-test-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const app=path.join(root,'WorkBuddy.app'),target=path.join(app,PROFILE.relativeTarget),state=path.join(root,'state');
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,original);
  const entry={size:PROFILE.bytes,unpacked:true,integrity:{hash:PROFILE.originalHash}};
  const header=Buffer.from(JSON.stringify({files:{renderer:{files:{assets:{files:{[PROFILE.module]:entry}}}}}}));
  const prefix=Buffer.alloc(16);prefix.writeUInt32LE(header.length,12);
  fs.writeFileSync(path.join(app,'Contents/Resources/app.asar'),Buffer.concat([prefix,header]));
  const info=inspectApp(app,PROFILE.version);
  prepareBackup(info,state);writePatched(info,state);
  assert.equal(sha256(fs.readFileSync(target)),PROFILE.patchedHash);
  assert.equal(fs.statSync(target).size,PROFILE.bytes);
  assert.equal(prepareBackup(inspectApp(app,PROFILE.version),state).fresh,false);
  assert.equal(sha256(fs.readFileSync(path.join(state,'original.js'))),PROFILE.originalHash);
  assert.doesNotThrow(()=>validateBackup(info,state));
  fs.writeFileSync(target,'new version');assert.throws(()=>restoreOriginal(info,state),/更新/);
  fs.writeFileSync(target,buildPatch(original));restoreOriginal(info,state);
  assert.equal(sha256(fs.readFileSync(target)),PROFILE.originalHash);
  assert.throws(()=>inspectApp(app,'9.9.9'),/仅支持/);
});
