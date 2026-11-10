import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const data=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const native=data(`
export function element(id){ const state={_id:id,_children:[]}; let self; self=new Proxy(state,{get(target,key){ if(key in target)return target[key]; return (...args)=>{if(key==='when')return args[0]?args[1](self):self;if(key==='child'||key==='trigger')target._children.push(args[0]);if(key==='children')target._children.push(...args[0]);if(key==='id')target._id=args[0];if(key==='on_click')target._click=args[0];return self;}; }});return self; }
export const div=()=>element(); export const svg=()=>element();
export const list=(id,count,key,row)=>{const e=element(id);e._row=row;return e;};
export const h_flex=div,v_flex=div;
export const Button={new:element},Toggle=Button,Checkbox=Button,Popover=Button,Input=Button,TextView={html:element};
`);
const host=data('export const theme=()=>({}),terminals=()=>[],settings=()=>({ui_font_size:13}),window=()=>({rem_size:()=>16});');
const uiURL=new URL('../mods/ciupaga/ui.js',import.meta.url);
const source=(await readFile(uiURL,'utf8')).replace(/from '([^']+)'/g,(_match,name)=>`from '${({'gpui-kit':native,'gpui-base':native,herdr:host})[name]||new URL(name,uiURL).href}'`);
const {launcher,taskMenu}=await import(data(source));
globalThis.window={rem_size:()=>16};
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
