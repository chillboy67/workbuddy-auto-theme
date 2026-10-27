import test from 'node:test';
import assert from 'node:assert/strict';
import {assertAutoState,restoreExpression,verifyMedia} from '../src/runtime.mjs';
const url='file:///Applications/WorkBuddy.app/Contents/Resources/app.asar/renamed/any.js';
const state=scheme=>({theme:'auto',source:'auto',runtime:{followSystem:true,theme:scheme},actual:'vscode-'+scheme,dom:scheme,media:scheme==='dark',skin:null});
test('checks resolved theme, control metadata, source, and active skin',()=>{
  assert.doesNotThrow(()=>assertAutoState(state('dark')));
  assert.throws(()=>assertAutoState({...state('dark'),actual:'vscode-light'}),/同步/);
  assert.throws(()=>assertAutoState({...state('dark'),skin:'custom'}),/状态/);
  assert.throws(()=>assertAutoState({...state('dark'),theme:'dark'}),/状态/);
});
test('restoration accepts typed local settings and rejects malformed backup',()=>{
  assert.match(restoreExpression({schema:1,theme:'light',flag:null,agentTheme:null},url),/removeItem/);
  assert.throws(()=>restoreExpression({schema:1,theme:'invalid'},url),/格式/);
});
test('verifies both media states and always removes its emulation override',async()=>{
  let color='light';const calls=[];
  const client={send:async(method,params)=>{calls.push({method,params});if(params.features.length)color=params.features[0].value;},evaluate:async()=>state(color)};
  const result=await verifyMedia(client,url);assert.deepEqual(result.map(x=>x.scheme),['dark','light']);assert.deepEqual(calls.at(-1).params,{features:[]});
});
test('emulation is cleared even when a protocol request fails',async()=>{
  const calls=[];const client={send:async(method,params)=>{calls.push(params);if(params.features.length)throw Error('network failure');}};
  await assert.rejects(verifyMedia(client,url),/network failure/);assert.deepEqual(calls.at(-1),{features:[]});
});
