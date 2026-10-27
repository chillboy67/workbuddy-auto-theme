import {FLAG} from './patch.mjs';

function moduleSpecifier(url){
  const parsed=new URL(url);
  if(parsed.protocol!=='file:' || parsed.search || parsed.hash || !parsed.pathname.includes('/Contents/Resources/app.asar/'))throw new Error('主题模块地址无效。');
  return JSON.stringify(parsed.href);
}
const flag=JSON.stringify(FLAG);
export const SNAPSHOT = `(async()=>{
  if(!globalThis.wb?.config?.theme)throw Error('Host not ready');
  return {schema:1,theme:await wb.config.theme(),flag:localStorage.getItem(${flag}),
    agentTheme:localStorage.getItem('agent-ui-theme'),skin:document.documentElement.getAttribute('data-skin')};
})()`;

export const enableExpression = url => { const moduleUrl=moduleSpecifier(url); return `(async()=>{
  if(document.documentElement.hasAttribute('data-skin'))throw Error('Custom skin active');
  localStorage.setItem(${flag},'true');
  await wb.config.setTheme('auto');
  const m=await import(${moduleUrl});m.i();m.o('auto');
  return {theme:await wb.config.theme(),runtime:m.n(),source:document.body.getAttribute('data-theme-source')};
})()`; };

export const readStateExpression = url => { const moduleUrl=moduleSpecifier(url); return `(async()=>{
  const m=await import(${moduleUrl});m.i();
  return {theme:await wb.config.theme(),runtime:m.n(),source:document.body.getAttribute('data-theme-source'),
    actual:document.body.getAttribute('data-vscode-theme-kind'),dom:document.documentElement.getAttribute('data-theme'),
    media:matchMedia('(prefers-color-scheme: dark)').matches,skin:document.documentElement.getAttribute('data-skin')};
})()`; };

export function restoreExpression(snapshot,url){
  const moduleUrl=moduleSpecifier(url);
  if(snapshot?.schema!==1 || !['light','dark','auto'].includes(snapshot.theme) ||
      ![null,'true','false'].includes(snapshot.flag) || (snapshot.agentTheme!==null&&typeof snapshot.agentTheme!=='string')) {
    throw new Error('外观备份格式不受支持。');
  }
  const saved=JSON.stringify(snapshot);
  return `(async()=>{
    const saved=${saved};
    saved.flag===null?localStorage.removeItem(${flag}):localStorage.setItem(${flag},saved.flag);
    const m=await import(${moduleUrl});m.i();m.o(saved.theme);
    await wb.config.setTheme(saved.theme);
    saved.agentTheme===null?localStorage.removeItem('agent-ui-theme'):localStorage.setItem('agent-ui-theme',saved.agentTheme);
    return {restored:true};
  })()`;
}

export function assertAutoState(state,expected){
  if(!state || state.theme!=='auto' || state.source!=='auto' || !state.runtime?.followSystem || state.skin)throw new Error('自动跟随状态验证失败。');
  const color=expected??(state.media?'dark':'light');
  if(state.runtime.theme!==color || state.actual!==`vscode-${color}` || state.dom!==color)throw new Error(`配色同步验证失败：期望 ${color}。`);
}

export async function verifyMedia(client,url){
  const results=[];
  try{
    for(const value of ['dark','light']){
      await client.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value}]});
      let state;
      for(let i=0;i<20;i++){
        state=await client.evaluate(readStateExpression(url));
        try{assertAutoState(state,value);break;}catch(error){if(i===19)throw error;await new Promise(r=>setTimeout(r,100));}
      }
      results.push({scheme:value,passed:true});
    }
  }finally{await client.send('Emulation.setEmulatedMedia',{features:[]});}
  return results;
}
