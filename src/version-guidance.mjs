// Do not extrapolate this observation to untested releases.
export function hasNativeSystemTheme(version) {
  return version === '5.9.2';
}

export function nativeSystemThemeMessage(version) {
  return `WorkBuddy ${version} 已有原生“跟随系统”主题。请在 WorkBuddy「外观」中选择「System / 跟随系统」，并在 macOS「系统设置 → 外观」中选择「自动」。本工具不会安装 5.8.3 补丁或覆盖旧版备份。`;
}
