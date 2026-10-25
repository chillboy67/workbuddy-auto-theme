export class CdpClient {
  constructor(socket, timeout = 10000) {
    this.socket=socket; this.timeout=timeout; this.id=0; this.pending=new Map();
    socket.addEventListener('message', event=>{
      let message; try {message=JSON.parse(event.data);} catch {this.fail(new Error('CDP 返回无效 JSON。'));return;}
      const task=this.pending.get(message.id); if(!task)return;
      clearTimeout(task.timer);this.pending.delete(message.id);
      message.error?task.reject(new Error(message.error.message||'CDP error')):task.resolve(message.result);
    });
    socket.addEventListener('close',()=>this.fail(new Error('CDP 连接已关闭。')));
    socket.addEventListener('error',()=>this.fail(new Error('CDP 连接错误。')));
  }
  fail(error){for(const task of this.pending.values()){clearTimeout(task.timer);task.reject(error);}this.pending.clear();}
  send(method,params={}){
    return new Promise((resolve,reject)=>{
      const id=++this.id;
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`CDP 请求超时：${method}`));},this.timeout);
      this.pending.set(id,{resolve,reject,timer});
      try{this.socket.send(JSON.stringify({id,method,params}));}catch(error){clearTimeout(timer);this.pending.delete(id);reject(error);}
    });
  }
  async evaluate(expression){
    const response=await this.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(response.exceptionDetails)throw new Error('WorkBuddy 外观配置调用失败。');
    return response.result?.value;
  }
  close(){this.fail(new Error('CDP 客户端已关闭。'));this.socket.close();}
}

export function validateTarget(target, expectedUrl, port) {
  if(target?.type!=='page' || typeof target.url!=='string')return false;
  const page=new URL(target.url);
  if(page.origin!==new URL(expectedUrl).origin || page.pathname!==new URL(expectedUrl).pathname || page.searchParams.has('windowAppId'))return false;
  const socket=new URL(target.webSocketDebuggerUrl);
  if(socket.protocol!=='ws:' || socket.hostname!=='127.0.0.1' || socket.port!==String(port) ||
      socket.username || socket.password || !/^\/devtools\/page\/[A-Za-z0-9_-]+$/.test(socket.pathname)) {
    throw new Error('拒绝连接不符合本机 WorkBuddy 目标约束的 CDP 地址。');
  }
  return true;
}

export async function connectCdp(port,expectedUrl,{timeout=30000}={}){
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){
    let targets;
    try{
      const response=await fetch(`http://127.0.0.1:${port}/json/list`,{redirect:'error',signal:AbortSignal.timeout(1500)});
      const raw=await response.text();
      if(raw.length>1024*1024)throw new Error('CDP 目标列表过大。');
      targets=JSON.parse(raw);
    }catch{await new Promise(r=>setTimeout(r,200));continue;}
    if(!Array.isArray(targets))throw new Error('CDP 目标列表无效。');
    const target=targets.find(t=>validateTarget(t,expectedUrl,port));
    if(!target){await new Promise(r=>setTimeout(r,200));continue;}
    const socket=new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{socket.close();reject(new Error('CDP 建连超时。'));},5000);
      socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
      socket.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('CDP 建连失败。'));},{once:true});
    });
    return new CdpClient(socket);
  }
  throw new Error('等待 WorkBuddy 主窗口调试接口超时。');
}
