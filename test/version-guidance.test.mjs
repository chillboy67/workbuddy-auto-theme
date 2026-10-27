import test from 'node:test';
import assert from 'node:assert/strict';
import {hasNativeSystemTheme,nativeSystemThemeMessage} from '../src/version-guidance.mjs';

test('only the actually observed 5.9.2 version gets native-theme guidance',()=>{
  assert.equal(hasNativeSystemTheme('5.9.2'),true);
  for(const version of ['5.8.3','5.9.1','5.9.3','6.0.0',''])assert.equal(hasNativeSystemTheme(version),false);
});
test('guidance describes the native option and keeps old backups safe',()=>{
  const text=nativeSystemThemeMessage('5.9.2');
  assert.match(text,/System/);assert.match(text,/自动/);assert.match(text,/不会安装/);assert.match(text,/备份/);
});
