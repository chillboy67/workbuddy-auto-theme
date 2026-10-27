import fs from 'node:fs';
import path from 'node:path';
import {PROFILE,sha256,classify} from './patch.mjs';

const MAX_HEADER=32*1024*1024;
const MAX_FILE=2*1024*1024;
const MAX_SCAN=256*1024*1024;

function inventory(node,parts=[],output=[]){
  if(!node?.files || typeof node.files!=='object')return output;
  for(const [name,entry] of Object.entries(node.files)){
    if(!name || name==='.' || name==='..' || name.includes('/') || name.includes('\\') || name.includes('\0'))throw new Error('ASAR 包含不安全的文件路径。');
    const next=[...parts,name];
    if(entry.files)inventory(entry,next,output);
    else output.push({parts:next,logicalPath:next.join('/'),entry});
  }
  return output;
}

export function openArchive(file){
  const fd=fs.openSync(file,'r');
  try{
    const pre=Buffer.alloc(16);
    if(fs.readSync(fd,pre,0,16,0)!==16)throw new Error('ASAR 头不完整。');
    const length=pre.readUInt32LE(12),headerSize=pre.readUInt32LE(4);
    if(length<2||length>MAX_HEADER||headerSize<length+8)throw new Error('ASAR 头长度异常。');
    const header=Buffer.alloc(length);
    if(fs.readSync(fd,header,0,length,16)!==length)throw new Error('ASAR 元数据不完整。');
    const dataOffset=8+headerSize, stat=fs.fstatSync(fd);
    if(dataOffset>stat.size)throw new Error('ASAR 数据偏移超出文件。');
    return {fd,dataOffset,size:stat.size,entries:inventory(JSON.parse(header.toString('utf8')))};
  }catch(error){fs.closeSync(fd);throw error;}
}

function readPacked(archive,item){
  const {entry}=item,size=entry.size,offset=Number(entry.offset);
  if(entry.unpacked||!Number.isSafeInteger(size)||size<0||size>MAX_FILE ||
     !Number.isSafeInteger(offset)||offset<0||archive.dataOffset+offset+size>archive.size)return null;
  const data=Buffer.alloc(size);
  if(fs.readSync(archive.fd,data,0,size,archive.dataOffset+offset)!==size)throw new Error('ASAR 模块读取不完整。');
  // Trust evidence only when bytes match the archive's declared integrity.
  if(typeof entry.integrity?.hash!=='string'||sha256(data)!==entry.integrity.hash)return null;
  return data;
}

export function detectNativeSignatures(sources){
  const marker=sources.some(s=>/function\s+isFollowSystemThemeKey\s*\(/.test(s) && /[`'\"]follow-system[`'\"]/.test(s));
  const option=sources.some(s=>/nameEn\s*:\s*[`'\"]System[`'\"]/.test(s) && /appearance\s*:\s*[`'\"]system[`'\"]/.test(s));
  const apply=sources.some(s=>s.includes('applyTheme-follow-system') && /\.setTheme\(\s*[`'\"]auto[`'\"]\s*\)/.test(s));
  return {marker,option,apply,detected:marker&&option&&apply};
}

export function discoverArchive(archive){
  const matches=archive.entries.filter(({entry})=>entry.unpacked===true && entry.size===PROFILE.bytes && entry.integrity?.hash===PROFILE.originalHash);
  if(matches.length>1)throw new Error('找到多个匹配的旧主题模块，无法安全确定目标。');
  let total=0,exhausted=false;
  const evidence={marker:false,option:false,apply:false};
  // Scan bounded application JS by content, independent of hashed names and locations.
  // Dependency packages are excluded: a dependency's examples cannot establish app capability.
  for(const item of archive.entries){
    if(!item.logicalPath.endsWith('.js')||item.parts.includes('node_modules')||item.entry.unpacked||item.entry.size>MAX_FILE)continue;
    if(total+item.entry.size>MAX_SCAN){exhausted=true;break;}
    const data=readPacked(archive,item);if(!data)continue;
    total+=data.length;
    const source=data.toString('utf8');
    const found=detectNativeSignatures([source]);
    for(const key of Object.keys(evidence))evidence[key] ||= found[key];
    if(Object.values(evidence).every(Boolean))return {kind:'native-candidate',evidence,scannedBytes:total};
  }
  if(matches.length===1)return {kind:'known-patch',match:matches[0],scanComplete:!exhausted,scannedBytes:total};
  return {kind:'unsupported',scanComplete:!exhausted,scannedBytes:total};
}

export function findAppTheme(appPath){
  const resources=path.join(appPath,'Contents','Resources');
  const archivePath=path.join(resources,'app.asar');
  const archive=openArchive(archivePath);
  try{
    const result=discoverArchive(archive);
    if(result.kind!=='known-patch')return result;
    const {match}=result;
    const relativeTarget=path.join('Contents','Resources','app.asar.unpacked',...match.parts);
    const target=path.join(appPath,relativeTarget);
    return {...result,logicalPath:match.logicalPath,relativeTarget,target};
  }finally{fs.closeSync(archive.fd);}
}

export function inspectKnownTheme(discovery,appPath,version,assertNoSymlink,assertRegularFile){
  const {target,relativeTarget,logicalPath}=discovery;
  assertNoSymlink(target);assertRegularFile(target);
  const bytes=fs.readFileSync(target);
  return {appPath,target,relativeTarget,logicalPath,version,bytes,kind:classify(bytes),hash:sha256(bytes)};
}
