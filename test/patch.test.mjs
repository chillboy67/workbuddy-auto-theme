import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {transformSource,buildPatch,classify,PROFILE} from '../src/patch.mjs';

// Entirely synthetic: small methods with the three matching patch anchors.
// No WorkBuddy application module or other vendor source is included.
function fixture(){return `class Theme {
constructor(){this.currentConfig=this.getInitialTheme();this.initializeSystemThemeListener()}
getInitialTheme(){let e=this.readAppearanceFromLastApplied();return this.buildBaseThemeConfig(e)}
readAppearanceFromLastApplied(){return 'light'}
getSystemTheme(){return system}
buildBaseThemeConfig(theme,followSystem=false){return {theme,followSystem,vsCodeThemeKind:'vscode-'+theme}}
initializeSystemThemeListener(){this.handleSystemThemeChange=()=>{this.currentConfig.followSystem&&(this.currentConfig.theme=this.getSystemTheme(),this.applyTheme(),this.notifyListeners())}}
setTheme(e){let t=e===\`auto\`;this.currentConfig=this.buildBaseThemeConfig(t?this.getSystemTheme():e,t);this.applyTheme()}
applyTheme(){this.applied={...this.currentConfig}}
notifyListeners(){}
}globalThis.theme=new Theme();
console.warn(\`[Theme] ${'synthetic diagnostic padding '.repeat(20)}\`);`}

function harness(flag=true){
  const values=new Map(flag?[['workbuddy.autoTheme.enabled','true']]:[]);
  const context={system:'light',localStorage:{getItem:k=>values.get(k)??null},console:{warn(){}}};
  vm.createContext(context);new vm.Script(transformSource(fixture())).runInContext(context);
  return context;
}

test('preserves exact source byte length and remains valid JavaScript',()=>{
  const source=fixture(),out=transformSource(source);
  assert.equal(Buffer.byteLength(out),Buffer.byteLength(source));
  assert.doesNotThrow(()=>new vm.Script(out));
});
test('enabled flag overrides fixed startup snapshot',()=>{
  const c=harness();assert.equal(c.theme.currentConfig.followSystem,true);
});
test('skin sync cannot turn off enabled automatic mode',()=>{
  const c=harness();c.system='dark';c.theme.setTheme('light');
  assert.equal(c.theme.applied.theme,'dark');assert.equal(c.theme.applied.followSystem,true);
});
test('system change updates theme and native-control metadata in both directions',()=>{
  const c=harness();
  for(const scheme of ['dark','light','dark']){
    c.system=scheme;c.theme.handleSystemThemeChange();
    assert.equal(c.theme.applied.theme,scheme);assert.equal(c.theme.applied.vsCodeThemeKind,'vscode-'+scheme);
  }
});
test('disabled flag preserves fixed theme behavior',()=>{
  const c=harness(false);assert.equal(c.theme.currentConfig.followSystem,false);
  c.system='dark';c.theme.setTheme('light');assert.equal(c.theme.applied.theme,'light');
});
test('missing, duplicated, and already patched anchors fail closed',()=>{
  const source=fixture();
  assert.throws(()=>transformSource(source.replace('getInitialTheme(){let e=','changed(){let e=')),/结构/);
  assert.throws(()=>transformSource(source+source),/结构/);
  assert.throws(()=>transformSource(transformSource(source)),/结构/);
});
test('growing beyond the ASAR size is rejected',()=>{
  assert.throws(()=>transformSource(fixture().replace(/console.warn[\s\S]*$/,'')),/长度/);
});
test('production patch refuses synthetic or unknown source bytes',()=>{
  assert.throws(()=>buildPatch(Buffer.from(fixture())),/SHA-256/);
  assert.equal(classify(Buffer.from('unknown')),'unsupported');assert.equal(PROFILE.bytes,10592);
});
