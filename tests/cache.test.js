import test from 'node:test';
import assert from 'node:assert/strict';
import {MetadataCache,cacheKey} from '../mods/ciupaga/cache.js';
import {contextFrom} from '../mods/ciupaga/runtime.js';

test('metadata cache coalesces concurrent copies, reopens immediately and revalidates only when due',async()=>{
  let calls=0,finish;const cache=new MetadataCache();
  const load=async previous=>{calls++;if(calls===1)await new Promise(r=>finish=r);return {sources:[{file:'justfile'}],previous};};
  const a=cache.load('repo',load,0),b=cache.load('repo',load,0);assert.equal(calls,1);finish();
  assert.equal(await a,await b);await cache.load('repo',load,100);assert.equal(calls,1);
  await cache.load('repo',load,11000);assert.equal(calls,2);
  await cache.load('repo',load,11001,true);assert.equal(calls,3);
});
test('failed refresh retains the last usable snapshot and permits retry',async()=>{
  const cache=new MetadataCache();await cache.load('repo',async()=>({sources:['valid']}),0);
  await assert.rejects(cache.load('repo',async()=>{throw new Error('offline');},11000));
  assert.deepEqual(cache.peek('repo').sources,['valid']);
  await cache.load('repo',async()=>({sources:['new']}),12000);assert.deepEqual(cache.peek('repo').sources,['new']);
});
test('persisted metadata hydrates a new copy without a loader call',async()=>{
  const cache=new MetadataCache();cache.seed('repo',{sources:['cached'],checkedAt:0});
  const value=await cache.load('repo',async()=>{throw new Error('unexpected work');},100);
  assert.deepEqual(value.sources,['cached']);
});
test('an empty project context has a valid cache key and cannot collide with a project',()=>{
  const context=contextFrom({},null,[]);
  assert.equal(context.folder,'');assert.doesNotThrow(()=>cacheKey(context));
  assert.notEqual(cacheKey(context),cacheKey({folder:'/project'}));
  assert.notEqual(cacheKey(context),cacheKey({folder:'/'}));
});
test('metadata retention is bounded and recently reused contexts remain cached',async()=>{
  const cache=new MetadataCache(2),load=async()=>({sources:[]});
  await cache.load('one',load,0);await cache.load('two',load,0);await cache.load('one',load,1);await cache.load('three',load,1);
  assert.ok(cache.peek('one'));assert.equal(cache.peek('two'),null);assert.equal(cache.entries.size,2);
});
