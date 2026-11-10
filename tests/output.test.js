import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePeek,PeekCoordinator} from '../mods/ciupaga/output.js';

test('peek removes terminal controls, keeps literal text and tails nonempty output',()=>{
  assert.equal(normalizePeek('\x1b]0;title\x07\x1b[32mfirst\x1b[0m\r\nsecond\n\n',1),'second');
  assert.equal(normalizePeek('first\n\nsecond\n',3),'first\n\nsecond');
  assert.equal(normalizePeek('old\rnew\n',1),'new');
  assert.equal(normalizePeek('secret',0),'');
});
test('peek coalesces views, rate limits and makes one final read',async()=>{
  const c=new PeekCoordinator();let calls=0,resolve;
  const loader=()=>{calls++;return new Promise(r=>{resolve=r;});};
  const a=c.read('run1',{lines:1},loader,0),b=c.read('run1',{lines:1},loader,1);
  assert.equal(calls,1);resolve('one\ntwo\n');assert.equal((await a).text,'two');await b;
  await c.read('run1',{lines:1},loader,999);assert.equal(calls,1);
  const final=c.read('run1',{lines:1,finished:true},loader,1000);assert.equal(calls,2);resolve('done');await final;
  await c.read('run1',{lines:1,finished:true},loader,4000);assert.equal(calls,2);
  const more=c.read('run1',{lines:2,finished:true},loader,5000);resolve('before\ndone');assert.equal((await more).text,'before\ndone');
});
test('peek reads retry after errors, isolate restarts, and skip disabled reads',async()=>{
  const c=new PeekCoordinator();let calls=0;
  const load=async()=>{calls++;throw new Error('history missing');};
  assert.equal((await c.read('old',{lines:1},load,0)).unavailable,true);
  assert.equal((await c.read('new',{lines:1},async()=>'new result',1)).text,'new result');
  await c.read('old',{lines:1},load,1001);assert.equal(calls,2);
  await c.read('off',{lines:0},load,5000);assert.equal(calls,2);
});
test('peek bounds retained runs while preserving pending reads',async()=>{
  const c=new PeekCoordinator(2);
  for(const key of ['a','b','c'])await c.read(key,{lines:1,finished:true},async()=>key,0);
  assert.equal(c.entries.size,2);assert.equal(c.entries.has('a'),false);
});
test('separate toolbar runtimes share pending leases and completed output',async()=>{
  const state=new Map(),store={get:key=>state.get(key),set:(key,value)=>state.set(key,value)};
  const a=new PeekCoordinator(100,store),b=new PeekCoordinator(100,store);let calls=0,release;
  const load=()=>{calls++;return new Promise(resolve=>{release=resolve})};
  const first=a.read('shared',{lines:1},load,100);
  const second=b.read('shared',{lines:1},load,100);assert.equal(calls,1);await second;
  release('shared output');await first;
  assert.equal((await b.read('shared',{lines:1},load,200)).text,'shared output');assert.equal(calls,1);
});
