import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const data=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const native=data(`
export function element(id){ const state={_id:id,_children:[]}; let self; self=new Proxy(state,{get(target,key){ if(key in target)return target[key]; return (...args)=>{if(key==='when')return args[0]?args[1](self):self;if(key==='child'||key==='trigger')target._children.push(args[0]);if(key==='children')target._children.push(...args[0]);if(key==='id')target._id=args[0];if(key==='h')target._height=args[0];if(key==='on_mouse_down')target._mouseDown=args[1];if(key==='on_click')target._click=args[0];return self;}; }});return self; }
export const div=()=>element(); export const svg=()=>element();
export const list=(id,count,key,row)=>{const e=element(id);e._row=row;e._key=key;return e;};
export const h_flex=div,v_flex=div;
export const Button={new:element},Toggle=Button,Checkbox=Button,Popover=Button,Input=Button,TextView={html:element};
`);
const host=data('export const theme=()=>{globalThis.__uiReads.theme++;return {}},terminals=()=>[],settings=()=>{globalThis.__uiReads.settings++;return {ui_font_size:13}};');
const uiURL=new URL('../mods/ciupaga/ui.js',import.meta.url);
const source=(await readFile(uiURL,'utf8')).replace(/from '([^']+)'/g,(_match,name)=>`from '${({'gpui-kit':native,'gpui-base':native,herdr:host})[name]||new URL(name,uiURL).href}'`);
const {launcher,taskMenu,render}=await import(data(source+'\n//# sourceURL=ciupaga-ui-under-test.js'));
globalThis.__uiReads={theme:0,settings:0,rem:0};
globalThis.window={rem_size:()=>{globalThis.__uiReads.rem++;return 16}};
function find(root,id){if(root._id===id)return root;for(const c of root._children||[])if(c&&typeof c==='object'){const result=find(c,id);if(result)return result;}return null;}
function view(){const task={id:'a',name:'dev',file:'@manual'};return {task,launcherMode:()=>true,launcherTask:()=>task,launcherChoices:()=>[task],record:()=>({state:'running',terminal:{address:'t1',state:'live'}}),settingsFor:()=>({icon:'terminal',peekLines:1}),menuHandle:()=>({}),openPopup(){},peek:()=>null};}
test('primary quick run forwards event context for both run and cancellation',()=>{
  const v=view(),cx={};let received;
  v.launchQuick=(task,context)=>{received={task,context}};
  find(launcher(v,cx),'ciupaga-run')._click({},cx);
  assert.equal(received.context,cx);assert.equal(received.task.id,'a');
});
test('quick peek registers output reads only when the native lazy row is drawn',()=>{
  const v=view();let calls=0;v.peek=()=>{calls++;return {text:'output'}};
  const tree=taskMenu(v,{});assert.equal(calls,0);
  const lazy=find(tree,'peek-lazy-quick-0');assert.ok(lazy);lazy._row(0,{});assert.equal(calls,1);
});
test('a large task list snapshots host theme and typography once per render',()=>{
  const v=view(),source={file:'justfile',tasks:Array.from({length:30},(_,i)=>({name:'task'+i,description:'A task',parameters:[]}))};
  Object.assign(v,{role:'pane',context:{folder:'D:/project'},sources:[source],source:()=>source,sourcePrefs:()=>({}),search:{value:()=>''},prefs:()=>({}),record:()=>({state:'idle'}),formKey:t=>t.name});
  globalThis.__uiReads={theme:0,settings:0,rem:0};render(v,{});
  assert.ok(globalThis.__uiReads.theme<=2,`theme reads: ${globalThis.__uiReads.theme}`);
  assert.ok(globalThis.__uiReads.settings<=2,`settings reads: ${globalThis.__uiReads.settings}`);
  assert.ok(globalThis.__uiReads.rem<=2,`rem reads: ${globalThis.__uiReads.rem}`);
});
test('opening the full view dismisses the quick menu before creating the popup',()=>{
  const v=view();v.openMenu='launcher';let menuAtOpen,notifications=0;
  v.openPopup=()=>{menuAtOpen=v.openMenu};
  find(taskMenu(v,{}),'full-view')._click({},{notify(){notifications++}});
  assert.equal(menuAtOpen,null);assert.equal(notifications,1);
});
test('the quick arrow records its bounds for anchoring the full popup',()=>{
  const v=view(),bounds={x:100,y:10,width:24,height:28};
  find(launcher(v,{}),'quick-actions-trigger')._mouseDown({bounds},{});
  assert.equal(v.buttonBounds,bounds);
});
test('the popup reserves a real task viewport rather than collapsing to header and footer',()=>{
  const v=view(),source={file:'justfile',tasks:[]};
  Object.assign(v,{role:'popup',context:{folder:'D:/project'},sources:[source],source:()=>source,sourcePrefs:()=>({}),search:{value:()=>''},prefs:()=>({}),record:()=>({state:'idle'})});
  assert.ok(render(v,{})._height>=400);
});
test('changed peek text invalidates the lazy row measurement without resetting unchanged text',()=>{
  const v=view();let text='first';v.peekSnapshot=()=>({text});
  const a=find(taskMenu(v,{}),'peek-lazy-quick-0')._key(0);
  const same=find(taskMenu(v,{}),'peek-lazy-quick-0')._key(0);assert.equal(same,a);
  text='first\nsecond';const changed=find(taskMenu(v,{}),'peek-lazy-quick-0')._key(0);
  assert.notEqual(changed,a);
});
