import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {cacheKey} from '../mods/ciupaga/cache.js';

// GPUI and core are external hosts. Exercise the real controller, with in-memory
// host state and deferred core replies; pure model/runtime modules stay real.
const data=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const kit=data('export class View{}; export const div=()=>({id(){return this}});');
const base=data('export class InputState { static new(o){return new InputState(o)} constructor(o){this.text=o.value||""} on(){} value(){return this.text} set_value(v){this.text=v} release(){this.released=true} }');
const ui=data('export const uiMetrics=()=>({px:x=>x}); export const render=(view,cx)=>globalThis.__ciupagaRenderProbe?.(view,cx); export const launcher=render,outputView=render,launchView=render,taskMenu=render;');
const names=['focused','spaces','terminals','panes','theme','window','props','shared','setShared','exec','hc','readTextFile','run','layout','openOverlay','closeOverlay','nextCommand','notify'];
const host=data(names.map(name=>`export const ${name}=(...args)=>globalThis.__ciupagaTestHost.${name}(...args);`).join('\n'));
const mainURL=new URL('../mods/ciupaga/main.js',import.meta.url);
const source=(await readFile(mainURL,'utf8')).replace(/from '([^']+)'/g,(_match,name)=>`from '${({'gpui-kit':kit,'gpui-base':base,herdr:host,'./ui.js':ui})[name]||new URL(name,mainURL).href}'`);
const Main=(await import(data(source))).default;
function setup(actions=[]){
  const context={space:'s1',machine:null,folder:'D:/project'},state={},commands=[],tasks=[];
  let focus={space:'s1',tab:'tab1',pane:'pane1',cwd:'D:/project'};
  state['ciupaga.v2.metadata']={[cacheKey(context)]:{context,sources:[],platform:'windows',checkedAt:1}};
  state['ciupaga.v1.preferences']={manualActions:actions};
  globalThis.__ciupagaTestHost={focused:()=>focus,spaces:()=>[{id:'s1',folder:'D:/space',machine:null}],terminals:()=>[],panes:()=>[],theme:()=>({}),window:()=>({platform:'windows'}),props:()=>({}),shared:k=>state[k],setShared:(k,v)=>{state[k]=v},exec:async()=>{throw new Error('unexpected discovery IO')},hc:async()=>({code:0,stdout:'{"address":"t100"}'}),readTextFile:async()=>null,run:(...args)=>commands.push(args),layout:()=>({}),openOverlay:o=>commands.push(['overlay',o]),closeOverlay:()=>{},nextCommand:()=>new Promise(()=>{}),notify:()=>{}};
  const cx={focus_handle:()=>({}),notify(){},timer:{every(){}},spawn(fn){const pending=Promise.resolve(fn(cx));tasks.push(pending);},sleep:async()=>{}};
  const view=new Main();view.init({role:'popup',context},cx);
  return {view,cx,state,commands,tasks,setFocus:value=>{focus=value}};
}
const action={id:'a',name:'dev',command:'echo hello',scope:'global',shell:'powershell',peekLines:1,console:'background'};

test('manual-only controller creates, edits and deletes stable actions without task files',()=>{
  const {view,cx,state}=setup();view.editManual(null,cx);
  view.editorInputs.name.set_value('own');view.editorInputs.command.set_value('echo one');view.saveManual(cx);
  assert.equal(view.message,'');const id=view.sources[0].tasks[0].id;
  assert.equal(view.launcherChoices()[0].name,'own');
  view.editManual(id,cx);view.editorInputs.name.set_value('renamed');view.saveManual(cx);
  assert.equal(view.launcherChoices()[0].id,id);assert.equal(view.launcherChoices()[0].name,'renamed');
  view.setActionSettings(view.launcherChoices()[0],{icon:'terminal',peekLines:7,console:'left'},cx);
  assert.equal(state['ciupaga.v1.preferences'].manualActions[0].peekLines,7);
  view.deleteManual(id,cx);assert.equal(view.launcherTask(),null);
});
test('converting a global action to this space binds the current space rather than its creation space',()=>{
  const {view,cx}=setup([{...action,space:'old-space',machine:'old-machine'}]);
  view.editManual('a',cx);view.editor.scope='space';view.saveManual(cx);
  assert.equal(view.launcherChoices().length,1);assert.equal(view.launcherChoices()[0].space,'s1');
});
test('manual controller passes shell command and space cwd and reserves before async launch',async()=>{
  const {view,cx,state,setFocus}=setup([action]);let release,args;
  globalThis.__ciupagaTestHost.hc=argv=>{args=argv;return new Promise(r=>{release=r})};
  const task=view.launcherChoices()[0];view.start(task,cx);view.start(task,cx);
  const records=state['ciupaga.v1.runs'];assert.equal(Object.keys(records).length,1);
  const entry=Object.values(records)[0];assert.equal(entry.phase,'starting');
  assert.equal(args[args.indexOf('--cwd')+1],'D:/space');assert.equal(args.at(-1),'echo hello');
  setFocus({space:'s2',pane:'other'});release({code:0,stdout:'{"address":"t100"}'});await Promise.resolve();await Promise.resolve();
  assert.equal(Object.values(state['ciupaga.v1.runs'])[0].context.space,'s1');
});
test('quick selection and launch requests resolve source/id rather than duplicate display names',()=>{
  const {view,cx,state}=setup([action,{...action,id:'b'}]);
  view.start=task=>{view.lastStarted=task.id};
  view.chooseLauncher(view.launcherChoices()[1],cx);
  assert.equal(view.launcherTask().id,'b');assert.equal(view.lastStarted,'b');
  state['ciupaga.v1.launch']={id:'a',task:'dev',space:'s1',folder:'D:/project',at:Date.now()};
  view.consumeLaunch(cx);assert.equal(view.lastStarted,'a');assert.equal(state['ciupaga.v1.launch'].claimed,true);
});
test('automatic console intent survives finished records and is owned once across views',()=>{
  const {view,cx,state}=setup([action]);
  const final={address:'t200',state:'exited',exit_code:0};
  state['ciupaga.v1.runs']={k:{id:'automatic-unique',task:action,context:view.context,destination:{place:'left',space:'s1',pane:'p1'},final}};
  let calls=0,done;view.console=(_task,_place,_cx,options)=>{calls++;done=options.done};
  view.reconcile(cx);view.reconcile(cx);assert.equal(calls,1);done(true);view.reconcile(cx);assert.equal(calls,1);
  assert.equal(state['ciupaga.v1.runs'].k.consoleDone,true);
});
test('automatic attachment is leased across separate toolbar runtimes',()=>{
  const {view,cx,state}=setup([action]);
  state['ciupaga.v1.runs']={k:{id:'cross-runtime',task:action,context:view.context,destination:{place:'tab',space:'s1'},final:{address:'t300',state:'exited'}}};
  let calls=0;view.console=()=>{calls++};view.services={...view.services,autoConsoles:new Set()};view.reconcile(cx);
  const second=new Main();Object.assign(second,view,{services:{...view.services,autoConsoles:new Set()}});second.reconcile(cx);
  assert.equal(calls,1);
});
test('a disposed view cannot leave an expired private attachment lock blocking recovery',()=>{
  const {view,cx,state}=setup([action]);
  view.services={...view.services,autoConsoles:new Set(['expired-lock'])};
  state['ciupaga.v1.runs']={k:{id:'expired-lock',destination:{place:'tab',space:'s1'},consoleLeaseUntil:Date.now()-1,task:action,context:view.context,final:{address:'t400',state:'exited'}}};
  let calls=0;view.console=()=>{calls++};view.reconcile(cx);assert.equal(calls,1);
});
test('closing a popup during core launch preserves the run without using its disposed context',async()=>{
  const {view,cx,tasks,state}=setup([action]);let release;
  globalThis.__ciupagaTestHost.hc=()=>new Promise(resolve=>{release=resolve});
  view.start(view.launcherChoices()[0],cx);const pending=tasks.at(-1);view.close();
  cx.notify=()=>{throw new Error('disposed context')};release({code:0,stdout:'{"address":"t500"}'});
  await assert.doesNotReject(pending);assert.equal(Object.values(state['ciupaga.v1.runs'])[0].address,'t500');
});
test('disabling a peek removes an already registered read before the next timer tick',()=>{
  const {view,cx}=setup([action]);let reads=0;
  view.record=()=>({entry:{id:'disable-peek-test'},terminal:{address:'t600',state:'live'}});
  globalThis.__ciupagaTestHost.hc=async()=>{reads++;return {code:0,stdout:'output'}};
  const task=view.launcherChoices()[0];view.peek(task,cx);view.setActionSettings(task,{peekLines:0},cx);view.refreshPeeks(cx);
  assert.equal(reads,0);
});
test('pinned task views do not overwrite the active toolbar snapshot',()=>{
  const {view,state}=setup([action]);
  const snapshot={space:'other',folder:'D:/other',task:'other'};
  state['ciupaga.v1.launcher']=snapshot;view.publishLauncher();
  assert.deepEqual(state['ciupaga.v1.launcher'],snapshot);
  view.role='button';view.publishLauncher();assert.equal(state['ciupaga.v1.launcher'].space,'s1');
});
test('cancelling a task kills it through core once without a competing native pane removal',async()=>{
  const {view,cx,tasks,commands}=setup([action]),calls=[];
  globalThis.__ciupagaTestHost.hc=async args=>{calls.push(args);return {code:0,stdout:''}};
  view.killOnce('cancel-via-core','t700',cx);view.killOnce('cancel-via-core','t700',cx);
  await Promise.resolve();
  assert.deepEqual(calls,[['kill','t700']]);assert.ok(!commands.some(([name])=>name==='terminal.kill'));
});
test('a large render snapshots host preferences, runs and terminals instead of rereading each row',()=>{
  const {view,cx}=setup(),source={kind:'just',file:'justfile',tasks:Array.from({length:30},(_,i)=>({name:'task'+i,parameters:[]}))};
  view.discoveredSources=[source];const reads={},host=globalThis.__ciupagaTestHost,originalShared=host.shared;
  host.shared=key=>{reads[key]=(reads[key]||0)+1;return originalShared(key)};
  let terminals=0,panes=0;host.terminals=()=>{terminals++;return []};host.panes=()=>{panes++;return []};
  globalThis.__ciupagaRenderProbe=rendered=>{for(const task of source.tasks){rendered.record(task);rendered.settingsFor(task);rendered.consolePane('missing');}};
  try{view.render(cx);
    assert.ok(reads['ciupaga.v1.preferences']<=1,`preferences: ${reads['ciupaga.v1.preferences']}`);
    assert.ok(reads['ciupaga.v1.runs']<=1,`runs: ${reads['ciupaga.v1.runs']}`);
    assert.ok(terminals<=1,`terminals: ${terminals}`);assert.ok(panes<=1,`panes: ${panes}`);
    assert.equal(view.frameData,null);
  }finally{delete globalThis.__ciupagaRenderProbe;}
});
