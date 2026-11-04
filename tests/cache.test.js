import test from 'node:test';
import assert from 'node:assert/strict';
import {MetadataCache,cacheKey,metadataContext} from '../mods/ciupaga/cache.js';
import {contextFrom} from '../mods/ciupaga/runtime.js';

test('metadata cache coalesces copies and only refreshes on explicit request regardless of age',async()=>{
  let calls=0,finish;const cache=new MetadataCache();
  const load=async previous=>{calls++;if(calls===1)await new Promise(r=>finish=r);return {sources:[{file:'justfile'}],previous};};
  const a=cache.load('repo',load,0),b=cache.load('repo',load,0);assert.equal(calls,1);finish();
  assert.equal(await a,await b);await cache.load('repo',load,100);assert.equal(calls,1);
  await cache.load('repo',load,86400000);assert.equal(calls,1);
  await cache.load('repo',load,86400001,true);assert.equal(calls,2);
});
test('failed refresh retains the last usable snapshot and permits retry',async()=>{
  const cache=new MetadataCache();await cache.load('repo',async()=>({sources:['valid']}),0);
  await assert.rejects(cache.load('repo',async()=>{throw new Error('offline');},11000,true));
  assert.deepEqual(cache.peek('repo').sources,['valid']);
  await cache.load('repo',async()=>({sources:['new']}),12000,true);assert.deepEqual(cache.peek('repo').sources,['new']);
});
test('persisted metadata hydrates a new copy without a loader call',async()=>{
  const cache=new MetadataCache();cache.seed('repo',{sources:['cached'],checkedAt:0});
  const value=await cache.load('repo',async()=>{throw new Error('unexpected work');},86400000);
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
test('reused project metadata retains the current space rather than the first view space',()=>{
  const resolved={folder:'/repo',machine:null,space:'old'};
  assert.deepEqual(metadataContext({folder:'/repo/src',space:'current'},resolved),{folder:'/repo',machine:null,space:'current'});
  assert.equal(resolved.space,'old');
  assert.equal(metadataContext({folder:'/repo'},resolved).space,undefined);
});
