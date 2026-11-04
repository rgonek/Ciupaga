import test from 'node:test';
import assert from 'node:assert/strict';
import {runState,latestRun,launchArgs,contextFrom,findNode,viewAction,resolveRecord,reserveRun} from '../mods/ciupaga/runtime.js';

test('terminal feedback distinguishes success, failure, kill and unknown code',()=>{
  assert.equal(runState(null),'idle');
  assert.equal(runState({state:'live'}),'running');
  assert.equal(runState({state:'exited',exit_code:0}),'succeeded');
  assert.equal(runState({state:'exited',exit_code:4}),'failed');
  assert.equal(runState({state:'exited',exit_code:null}),'finished');
  assert.equal(runState({state:'exited',reason:'killed'}),'cancelled');
});

test('completed tasks retain feedback after disappearing from live terminal data',()=>{
  const final={address:'t1',state:'finished',exit_code:7,labels:{'ciupaga.run':'one','ciupaga.task':'key'}};
  assert.equal(resolveRecord('key',{id:'one',phase:'finished',final},[]).state,'failed');
  assert.equal(resolveRecord('key',{id:'two',phase:'starting',at:100},[final],101).state,'starting');
  assert.equal(resolveRecord('key',{id:'two',phase:'starting',at:100,cancel:true},[final],101).state,'cancelling');
});
test('launch reservations reject rapid duplicate starts but expire abandoned owners',()=>{
  const records=reserveRun({},'key','one',100);
  assert.throws(()=>reserveRun(records,'key','two',200),/already starting/);
  assert.equal(reserveRun(records,'key','two',40000).key.id,'two');
});
test('sidebar routing works with custom layout ids and nested stacks',()=>{
  const tree={id:'custom',type:'stack',children:[{id:'my-tasks',content:{mod:'ciupaga',props:{role:'sidebar'}}}]};
  const action=viewAction('sidebar',tree,{});
  assert.equal(action.args.id,'my-tasks');
  assert.deepEqual(action.path.map(n=>n.id),['custom','my-tasks']);
});
test('launch labels encode full task identity and target remote core',()=>{
  const args=launchArgs({folder:'/repo',machine:'build'},'key','run123',['just','build']);
  assert.ok(args.includes('--bg'));assert.ok(args.includes('--no-parent'));
  assert.equal(args[args.indexOf('--on')+1],'build');
  assert.equal(args.at(-2),'just');
  assert.ok(args.includes('ciupaga.task=key'));
});
test('latest terminal is selected by label and creation time, not address reuse',()=>{
  const records=[{address:'t1',created_ms:10,labels:{'ciupaga.task':'key'}},{address:'t2',created_ms:20,labels:{'ciupaga.task':'key'}},{address:'t3',created_ms:30,labels:{'ciupaga.task':'other'}}];
  assert.equal(latestRun(records,'key').address,'t2');
});
test('context prefers the focused terminal over a stale space folder and can be pinned',()=>{
  const spaces=[{id:'s1',folder:'/root',machine:'remote'}];
  assert.equal(contextFrom({}, {space:'s1',cwd:'/root/sub'},spaces).folder,'/root/sub');
  assert.equal(contextFrom({context:{folder:'/fixed',machine:null}}, {space:'s1'},spaces).folder,'/fixed');
});
test('sidebar locates existing slot; portable fallback is a mod pane',()=>{
  const tree={id:'root',children:[{id:'panel',children:[{id:'ciupaga-sidebar',content:{mod:'ciupaga'}}]}]};
  assert.equal(findNode(tree,'ciupaga-sidebar').id,'ciupaga-sidebar');
  assert.equal(viewAction('sidebar',tree,{pane:'p1'}).name,'layout.show');
  assert.equal(viewAction('sidebar',{}, {pane:'p1'}).name,'pane.split');
  assert.equal(viewAction('tab',{}, {}).name,'tab.new');
});
