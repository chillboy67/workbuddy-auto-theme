import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {sha256,PROFILE} from '../src/patch.mjs';
import {findAppTheme} from '../src/discover.mjs';

function fixture(t,items){
  const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'wb-discovery-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const app=path.join(root,'WorkBuddy.app'),files={},payload=[];let offset=0;
  for(const item of items){
    const parts=item.path.split('/'),name=parts.pop();let dir=files;
    for(const part of parts)dir=(dir[part]??={files:{}}).files;
    if(item.known){dir[name]={unpacked:true,size:PROFILE.bytes,integrity:{hash:PROFILE.originalHash}};continue;}
    const data=Buffer.from(item.source);dir[name]={size:data.length,offset:String(offset),integrity:{hash:sha256(data)}};offset+=data.length;payload.push(data);
  }
  const header=Buffer.from(JSON.stringify({files})),prefix=Buffer.alloc(16);
  prefix.writeUInt32LE(header.length,12);prefix.writeUInt32LE(header.length+8,4);
  fs.mkdirSync(path.join(app,'Contents/Resources'),{recursive:true});
  fs.writeFileSync(path.join(app,'Contents/Resources/app.asar'),Buffer.concat([prefix,header,...payload]));
  return app;
}
test('discovers a known hash under arbitrary renamed nested paths',t=>{
  for(const name of ['new/bundle-XYZ.js','deep/random/name.mjs']){
    const app=fixture(t,[{path:name,known:true}]);
    const found=findAppTheme(app);
    assert.equal(found.kind,'known-patch');assert.equal(found.logicalPath,name);
  }
});
test('detects native indications by content across renamed modules',t=>{
  const app=fixture(t,[
    {path:'new/a.js',source:"function isFollowSystemThemeKey(x){return x==='follow-system'}"},
    {path:'another/b.js',source:"nameEn: 'System', appearance: 'system'"},
    {path:'c.js',source:"'applyTheme-follow-system';thing.setTheme('auto')"},
    {path:'old/random.js',known:true},
  ]);
  assert.equal(findAppTheme(app).kind,'native-candidate');
});
test('rejects unknown hashes and ambiguous known candidates',t=>{
  const unknown=fixture(t,[{path:'theme.js',source:'unknown code'}]);
  assert.equal(findAppTheme(unknown).kind,'unsupported');
  const duplicate=fixture(t,[{path:'a.js',known:true},{path:'b.js',known:true}]);
  assert.throws(()=>findAppTheme(duplicate),/多个/);
});
