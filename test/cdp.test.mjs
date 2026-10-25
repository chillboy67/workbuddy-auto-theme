import test from 'node:test';
import assert from 'node:assert/strict';
import {CdpClient,validateTarget} from '../src/cdp.mjs';
const expected='file:///Applications/WorkBuddy.app/Contents/Resources/app.asar/renderer/index.html';
const target=(url=expected,ws='ws://127.0.0.1:9333/devtools/page/ABC-123')=>({type:'page',url,webSocketDebuggerUrl:ws});
class Socket extends EventTarget{sent=[];send(x){this.sent.push(JSON.parse(x));}close(){this.dispatchEvent(new Event('close'));}reply(data){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(data)}));}}
test('accepts only the expected application main window and local socket',()=>{
  assert.equal(validateTarget(target(expected+'?locale=zh'),expected,9333),true);
  assert.equal(validateTarget(target(expected+'?windowAppId=settings'),expected,9333),false);
  assert.equal(validateTarget(target('https://example.org'),expected,9333),false);
  for(const socket of ['ws://evil.example:9333/devtools/page/ABC','ws://127.0.0.1:9334/devtools/page/ABC','ws://user:password@127.0.0.1:9333/devtools/page/ABC'])assert.throws(()=>validateTarget(target(expected,socket),expected,9333),/拒绝/);
});
test('matches concurrent responses by ID and clears pending calls',async()=>{
  const socket=new Socket(),client=new CdpClient(socket),a=client.send('A'),b=client.send('B');
  socket.reply({id:2,result:{value:'second'}});socket.reply({id:1,result:{value:'first'}});
  assert.deepEqual(await a,{value:'first'});assert.deepEqual(await b,{value:'second'});assert.equal(client.pending.size,0);client.close();
});
test('request timeout and disconnect reject pending calls',async()=>{
  const socket=new Socket(),client=new CdpClient(socket,10);
  await assert.rejects(client.send('never'),/超时/);
  const request=client.send('pending');client.close();await assert.rejects(request,/关闭/);
});
test('remote evaluation exceptions are surfaced without dumping private values',async()=>{
  const socket=new Socket(),client=new CdpClient(socket),result=client.evaluate('1');
  socket.reply({id:1,result:{exceptionDetails:{text:'private exception'}}});
  await assert.rejects(result,error=>error.message==='WorkBuddy 外观配置调用失败。');client.close();
});
