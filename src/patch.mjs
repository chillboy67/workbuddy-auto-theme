import crypto from 'node:crypto';

export const FLAG = 'workbuddy.autoTheme.enabled';
export const PROFILE = Object.freeze({
  version: '5.8.3',
  module: 'theme-B1Mw-Fbn.js',
  relativeTarget: 'Contents/Resources/app.asar.unpacked/renderer/assets/theme-B1Mw-Fbn.js',
  originalHash: '6c27166fa8dbd8046315aff5787fde65ae06398e00d2e4dd020a509139aa27f9',
  patchedHash: 'e5ce8e30f0158fbd3b1d70a4545bd3890dea3bbe04c2f60d0efe4fb9e181b80e',
  bytes: 10592,
});
export const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

// Short anchors describe the change; no vendor application bundle is distributed.
export const EDITS = Object.freeze([
  ['getInitialTheme(){let e=this.readAppearanceFromLastApplied();',
    'getInitialTheme(){if(localStorage.getItem(`workbuddy.autoTheme.enabled`)===`true`)return this.buildBaseThemeConfig(this.getSystemTheme(),!0);let e=this.readAppearanceFromLastApplied();'],
  ['this.currentConfig.followSystem&&(this.currentConfig.theme=this.getSystemTheme(),this.applyTheme(),this.notifyListeners())',
    'this.currentConfig.followSystem&&this.setTheme(`auto`)'],
  ['setTheme(e){let t=e===`auto`',
    'setTheme(e){localStorage.getItem(`workbuddy.autoTheme.enabled`)===`true`&&(e=`auto`);let t=e===`auto`'],
]);

export function transformSource(source) {
  let result = source;
  for (const [before, after] of EDITS) {
    if (result.split(before).length !== 2) throw new Error('主题代码结构不匹配；未修改文件。');
    result = result.replace(before, after);
  }
  // Electron's ASAR header retains the unpacked file size. Shorten only theme
  // diagnostic strings and pad the tail, retaining the exact original byte count.
  result = result.replace(/\[Theme\] [^`]*`/g, '[Theme]`');
  const size = Buffer.byteLength(source);
  const available = size - Buffer.byteLength(result) - 1;
  if (available < 0) throw new Error('补丁超过 ASAR 记录的文件长度；未修改文件。');
  return result + ' '.repeat(available) + '\n';
}

export function buildPatch(original) {
  if (sha256(original) !== PROFILE.originalHash) throw new Error('原文件 SHA-256 不受支持；拒绝修改未知版本。');
  const patched = Buffer.from(transformSource(original.toString('utf8')));
  if (patched.length !== PROFILE.bytes || sha256(patched) !== PROFILE.patchedHash) {
    throw new Error('补丁结果校验失败；未修改应用。');
  }
  return patched;
}

export function classify(bytes) {
  const hash = sha256(bytes);
  return hash === PROFILE.originalHash ? 'original' : hash === PROFILE.patchedHash ? 'patched' : 'unsupported';
}
