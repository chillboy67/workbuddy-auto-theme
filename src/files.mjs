import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PROFILE, sha256, classify, buildPatch } from './patch.mjs';

export function assertRegularFile(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`拒绝操作非普通文件：${file}`);
}

export function assertNoSymlink(file) {
  const absolute = path.resolve(file);
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
      throw new Error(`路径包含符号链接，停止操作：${current}`);
    }
  }
}

export function atomicWrite(file, data, mode = 0o600) {
  assertNoSymlink(file);
  fs.mkdirSync(path.dirname(file), {recursive: true, mode: 0o700});
  const temp = `${file}.auto-theme-${process.pid}-${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, data, {mode, flag: 'wx'});
    fs.renameSync(temp, file);
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}

export function readAsarEntry(archive, parts) {
  const fd = fs.openSync(archive, 'r');
  try {
    const prefix = Buffer.alloc(16);
    if (fs.readSync(fd, prefix, 0, 16, 0) !== 16) throw new Error('ASAR 头不完整。');
    const length = prefix.readUInt32LE(12);
    if (length < 2 || length > 32 * 1024 * 1024) throw new Error('ASAR 头长度异常。');
    const buffer = Buffer.alloc(length);
    if (fs.readSync(fd, buffer, 0, length, 16) !== length) throw new Error('ASAR 元数据不完整。');
    let entry = JSON.parse(buffer.toString('utf8'));
    for (const name of parts) entry = entry?.files?.[name];
    return entry;
  } finally { fs.closeSync(fd); }
}

export function inspectApp(appPath, version) {
  appPath = path.resolve(appPath);
  if (!appPath.endsWith('.app')) throw new Error('--app 必须指向 WorkBuddy.app 应用包。');
  assertNoSymlink(appPath);
  const target = path.join(appPath, PROFILE.relativeTarget);
  assertNoSymlink(target);
  assertRegularFile(target);
  const bytes = fs.readFileSync(target);
  const entry = readAsarEntry(path.join(appPath, 'Contents/Resources/app.asar'), ['renderer','assets',PROFILE.module]);
  if (!entry?.unpacked || entry.size !== PROFILE.bytes || entry.integrity?.hash !== PROFILE.originalHash) {
    throw new Error('ASAR 元数据与支持的原版主题文件不匹配。');
  }
  if (version !== PROFILE.version) throw new Error(`仅支持 WorkBuddy ${PROFILE.version}；当前为 ${version}。`);
  return {appPath, target, version, bytes, kind: classify(bytes), hash: sha256(bytes)};
}

export function prepareBackup(info, stateDir, legacyOriginal) {
  if (info.kind === 'unsupported') throw new Error('主题文件已被修改或不受支持；停止安装。');
  assertNoSymlink(stateDir);
  const manifestFile = path.join(stateDir, 'state.json');
  const originalFile = path.join(stateDir, 'original.js');
  if (fs.existsSync(manifestFile)) {
    const manifest = validateBackup(info, stateDir);
    return {manifest, fresh: false};
  }
  if (fs.existsSync(originalFile)) throw new Error('存在不完整备份，请先检查备份目录。');
  let original;
  if (info.kind === 'original') original = info.bytes;
  else {
    if (!legacyOriginal) throw new Error('检测到早期补丁。请用 --original-backup 指定已有原版备份后再接管。');
    assertNoSymlink(legacyOriginal); assertRegularFile(legacyOriginal);
    original = fs.readFileSync(legacyOriginal);
  }
  buildPatch(original); // Verify both original identity and deterministic output.
  const manifest = {schema:1, version:info.version, appPath:info.appPath, relativeTarget:PROFILE.relativeTarget,
    originalHash:PROFILE.originalHash, patchedHash:PROFILE.patchedHash, bytes:PROFILE.bytes};
  atomicWrite(originalFile, original);
  atomicWrite(manifestFile, JSON.stringify(manifest,null,2)+'\n');
  return {manifest, fresh:true};
}

export function validateBackup(info, stateDir) {
  const manifestFile = path.join(stateDir,'state.json'), originalFile = path.join(stateDir,'original.js');
  assertNoSymlink(manifestFile); assertNoSymlink(originalFile);
  assertRegularFile(manifestFile); assertRegularFile(originalFile);
  const m = JSON.parse(fs.readFileSync(manifestFile,'utf8'));
  if (m.schema !== 1 || m.version !== PROFILE.version || m.appPath !== info.appPath || m.relativeTarget !== PROFILE.relativeTarget ||
      m.originalHash !== PROFILE.originalHash || m.patchedHash !== PROFILE.patchedHash || m.bytes !== PROFILE.bytes) {
    throw new Error('备份记录与当前应用不匹配。');
  }
  if (sha256(fs.readFileSync(originalFile)) !== PROFILE.originalHash) throw new Error('原版备份校验失败。');
  return m;
}

export function writePatched(info, stateDir) {
  validateBackup(info,stateDir);
  const current = fs.readFileSync(info.target);
  if (!['original','patched'].includes(classify(current))) throw new Error('主题文件在检查后发生变化，停止写入。');
  const patched = buildPatch(fs.readFileSync(path.join(stateDir,'original.js')));
  atomicWrite(info.target, patched, fs.statSync(info.target).mode & 0o777);
}

export function restoreOriginal(info, stateDir) {
  validateBackup(info,stateDir);
  if (!['original','patched'].includes(classify(fs.readFileSync(info.target)))) {
    throw new Error('应用文件已更新或被其他工具修改，停止恢复。');
  }
  atomicWrite(info.target, fs.readFileSync(path.join(stateDir,'original.js')), fs.statSync(info.target).mode & 0o777);
}

export async function withLock(stateDir, operation) {
  assertNoSymlink(stateDir);
  fs.mkdirSync(stateDir,{recursive:true,mode:0o700});
  const lock=path.join(stateDir,'operation.lock');
  try { fs.mkdirSync(lock,{mode:0o700}); }
  catch(error) { if(error.code==='EEXIST')throw new Error('另一个操作正在进行，或上次中断留下 operation.lock。请参考恢复文档。');throw error; }
  try {
    fs.writeFileSync(path.join(lock,'pid'),String(process.pid),{mode:0o600,flag:'wx'});
    return await operation();
  } finally {
    if(fs.existsSync(path.join(lock,'pid')))fs.unlinkSync(path.join(lock,'pid'));
    fs.rmdirSync(lock);
  }
}
