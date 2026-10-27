import test from 'node:test';
import assert from 'node:assert/strict';
import {detectNativeSignatures} from '../src/discover.mjs';
import {nativeSystemThemeMessage} from '../src/version-guidance.mjs';

test('requires all three independent native capability markers',()=>{
  const marker="function isFollowSystemThemeKey(x){return x==='follow-system'}";
  const option="nameEn: 'System', appearance: 'system'";
  const apply="'applyTheme-follow-system';thing.setTheme('auto')";
  assert.equal(detectNativeSignatures([marker,option,apply]).detected,true);
  for(const sources of [[marker,option],[option,apply],[marker,apply],[]])assert.equal(detectNativeSignatures(sources).detected,false);
  assert.match(nativeSystemThemeMessage('99.4'),/可能/);
});
