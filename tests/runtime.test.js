import test from 'node:test';
import assert from 'node:assert/strict';
import {runState,latestRun,launchArgs,contextFrom,findNode,viewAction,resolveRecord,reserveRun,terminalIndex,consoleDestination,historyArgv,settleConsolePlacement} from '../mods/ciupaga/runtime.js';
import {sourceKey,taskContext,taskArgv} from '../mods/ciupaga/model.js';

test('automatic console retains the original destination and falls back to its space tab',()=>{
  const origin={space:'s1',tab:'t1',pane:'p1'};
  const left=consoleDestination('left',origin);origin.space='s2';origin.pane='p2';
  assert.deepEqual(left,{place:'left',space:'s1',tab:'t1',pane:'p1'});
  assert.deepEqual(consoleDestination('right',{space:'s1'}),{place:'tab',space:'s1',tab:null,pane:null});
  assert.equal(consoleDestination('background',origin),null);
  assert.equal(consoleDestination('tab',origin).space,'s2');
});
test('finished console keeps an ordinary shell alive and treats terminal address literally',()=>{
  const windows=historyArgv('t1', 'windows');
  assert.ok(windows.includes('-NoExit'));assert.equal(windows.at(-1),"& hc read 't1' --lines 10000");
  const unix=historyArgv('remote/t1;echo bad','linux');
  assert.equal(unix.at(-1),'remote/t1;echo bad');assert.match(unix[2],/exec/);assert.match(unix[2],/"\$1"/);
});
test('left console placement waits through optimistic attachment and verifies the final order',async()=>{
  const origin={pane:'source',tab:'tab'},consolePane={pane:'console',tab:'tab'};let tick=0,order=[origin,consolePane],swaps=0;
  const result=await settleConsolePlacement(consolePane,origin,'left',{
    panes:()=>order,
    wait:async()=>{tick++;if(tick===4)order=[origin,consolePane];},
    swap:args=>{assert.ok(tick>=3,'must not race the initial keep operation');assert.deepEqual(args,{pane:'console',target:'source'});swaps++;order=[consolePane,origin];}
  });
  assert.equal(result,true);assert.deepEqual(order.map(p=>p.pane),['console','source']);assert.equal(swaps,2);
});
test('console placement stops if its pane disappears during attachment',async()=>{
  assert.equal(await settleConsolePlacement({pane:'gone',tab:'tab'},{pane:'source'},'left',{panes:()=>[],wait:async()=>{},swap:()=>assert.fail('no surviving console')}),false);
});

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
test('nested package launch uses the manifest folder as cwd',()=>{
  const context={folder:'/repo',machine:'remote',space:'s1'},source={kind:'package',file:'ui/package.json',folder:'/repo/ui',manager:'npm'};
  const args=launchArgs(taskContext(context,source),'key','run',taskArgv(source,{name:'dev'}));
  assert.equal(args[args.indexOf('--cwd')+1],'/repo/ui');
  assert.deepEqual(args.slice(-3),['npm','run','dev']);
});
test('latest terminal is selected by label and creation time, not address reuse',()=>{
  const records=[{address:'t1',created_ms:10,labels:{'ciupaga.task':'key'}},{address:'t2',created_ms:20,labels:{'ciupaga.task':'key'}},{address:'t3',created_ms:30,labels:{'ciupaga.task':'other'}}];
  assert.equal(latestRun(records,'key').address,'t2');
});
test('live terminals launched before key migration remain visible through Windows aliases',()=>{
  const old=JSON.stringify([null,'C:\\Project','Justfile'])+'\nbuild';
  const key=sourceKey({folder:'c:/project'},'justfile')+'\nbuild';
  const terminal={address:'t1',state:'live',created_ms:10,labels:{'ciupaga.task':old,'ciupaga.run':'one'}};
  assert.equal(latestRun([terminal],key),terminal);
  assert.equal(resolveRecord(key,{id:'one',phase:'launched'},terminalIndex([terminal])).state,'running');
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
