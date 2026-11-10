import test from 'node:test';
import assert from 'node:assert/strict';
import {validateManualAction,manualActionsFor,actionSettings,actionIdentity,manualArgv,manualContext,launcherPreferenceKey} from '../mods/ciupaga/actions.js';
import {quickLaunchCatalog} from '../mods/ciupaga/model.js';

test('manual actions are global or restricted to the actual space and machine',()=>{
  const actions=[{id:'g',scope:'global'},{id:'s',scope:'space',space:'one',machine:null},{id:'r',scope:'space',space:'one',machine:'remote'}];
  assert.deepEqual(manualActionsFor(actions,{space:'one'}).map(a=>a.id),['g','s']);
  assert.deepEqual(manualActionsFor(actions,{space:'two'}).map(a=>a.id),['g']);
  assert.deepEqual(manualActionsFor(actions,{space:'one',machine:'remote'}).map(a=>a.id),['g','r']);
});
test('manual names do not define identity; execution and launcher pins are space specific',()=>{
  const c={space:'one',machine:null,folder:'D:/repo'},s={kind:'manual'};
  assert.equal(actionIdentity(c,s,{id:'a',name:'before'}),actionIdentity(c,s,{id:'a',name:'after'}));
  assert.notEqual(actionIdentity(c,s,{id:'a',name:'dev'}),actionIdentity(c,s,{id:'b',name:'dev'}));
  assert.notEqual(actionIdentity(c,s,{id:'a'}),actionIdentity({...c,space:'two'},s,{id:'a'}));
  assert.notEqual(launcherPreferenceKey(c),launcherPreferenceKey({...c,space:'two'}));
});
test('manual validation prevents unusable definitions and preserves stable ids',()=>{
  const a={id:'a',name:' Build ',command:'echo hi | cat',scope:'global',shell:'sh'};
  assert.equal(validateManualAction(a).id,'a');assert.equal(validateManualAction(a).name,'Build');
  for(const patch of [{name:''},{command:' '},{scope:'bad'},{scope:'space',space:''},{command:'a\0b'},{shell:'bad'}])assert.throws(()=>validateManualAction({...a,...patch}));
});
test('settings keep safe defaults and validate configurable output bounds',()=>{
  assert.deepEqual(actionSettings({}),{icon:'play',console:'background',peekLines:1});
  assert.deepEqual(actionSettings({icon:'../../bad',console:'bad',peekLines:0}),{icon:'play',console:'background',peekLines:0});
  assert.equal(actionSettings({peekLines:50,console:'left',icon:'terminal'}).peekLines,50);
  for(const peekLines of [-1,51,1.2,'x'])assert.throws(()=>actionSettings({peekLines}));
});
test('manual command syntax reaches the explicit target shell unchanged',()=>{
  assert.deepEqual(manualArgv({shell:'powershell',command:'echo "a b" | % { $_ }'},'windows'),['powershell.exe','-NoLogo','-NoProfile','-Command','echo "a b" | % { $_ }']);
  assert.deepEqual(manualArgv({shell:'sh',command:'printf "%s" "$HOME" | cat'},'linux'),['sh','-lc','printf "%s" "$HOME" | cat']);
  assert.throws(()=>manualArgv({shell:'powershell',command:'echo a'},'linux'));
  assert.deepEqual(manualContext({folder:'D:/nested',space:'one'},{folder:'D:/space',machine:'remote'},{}),{folder:'D:/space',space:'one',machine:'remote'});
  assert.equal(manualContext({space:'one'},{folder:'D:/space'},{cwd:'D:/explicit'}).folder,'D:/explicit');
  assert.throws(()=>manualContext({space:'one'},null,{}));
});
test('quick catalog includes manual actions without starring and never unstarred file tasks',()=>{
  const sources=[{kind:'manual',file:'@manual',tasks:[{id:'a',name:'own'}]},{kind:'just',file:'justfile',tasks:[{name:'build'},{name:'test'}]}];
  assert.deepEqual(quickLaunchCatalog(sources,()=>[]).map(t=>t.name),['own']);
  assert.deepEqual(quickLaunchCatalog(sources,s=>s.file==='justfile'?['test']:[]).map(t=>t.name),['own','test']);
});
