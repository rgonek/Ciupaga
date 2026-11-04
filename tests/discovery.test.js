import test from 'node:test';
import assert from 'node:assert/strict';
import {discover} from '../mods/ciupaga/discovery.js';
import {collectArguments} from '../mods/ciupaga/model.js';

test('discovery isolates errors, deduplicates Windows aliases and propagates machine',async()=>{
  const reads=[],calls=[];
  const sources=await discover({folder:'C:/project',machine:'work'},async(path,opts)=>{
    reads.push([path,opts]);
    return path.endsWith('/justfile')||path.endsWith('/Justfile')?'build:\n echo hi':path.endsWith('/package.json')?'{"scripts":{"test":"node test.js"},"packageManager":"pnpm@10"}':null;
  },async(...args)=>{calls.push(args);return {code:1,stderr:'just is unavailable'};},'windows');
  assert.equal(sources.length,2);
  assert.match(sources[0].error,/unavailable/);
  assert.equal(sources[1].manager,'pnpm');
  assert.equal(calls.length,1);
  assert.equal(calls[0][2].on,'work');
  assert.ok(reads.every(([,opts])=>opts.on==='work'));
});
test('Just positional forms enforce required and avoid shifting later arguments',()=>{
  const p=[{name:'first',required:true},{name:'optional',required:false},{name:'rest',variadic:true}];
  assert.throws(()=>collectArguments(p,{}),/Enter first/);
  assert.throws(()=>collectArguments(p,{first:'a',rest:'b'}),/earlier/);
  assert.deepEqual(collectArguments(p,{first:'a',optional:'b',rest:'"c d" e'},'--flag'),['a','b','c d','e','--flag']);
});

test('named options never shift positional parameters and booleans emit only when checked',()=>{
  const p=[{name:'force',boolean:true,option:'--force'},{name:'mode',option:'--mode'},{name:'target',required:true}];
  assert.deepEqual(collectArguments(p,{force:true,mode:'release',target:'app'}),['--force','--mode','release','app']);
  assert.deepEqual(collectArguments(p,{force:false,target:'app'}),['app']);
});

test('unchanged task sources do not respawn runners; edits, TTL and forced refresh do',async()=>{
  let calls=0,content='first';
  const read=async path=>path.endsWith('/justfile')?content:null;
  const execute=async()=>{calls++;return {code:0,stdout:'{"recipes":{"build":{"parameters":[]}}}'};};
  const context={folder:'/repo',machine:null};
  let sources=await discover(context,read,execute,'linux',null,{now:0});assert.equal(calls,1);
  const previous=()=>({sources,fingerprints:sources.fingerprints});
  sources=await discover(context,read,execute,'linux',previous(),{now:10000});assert.equal(calls,1);
  content='changed';sources=await discover(context,read,execute,'linux',previous(),{now:20000});assert.equal(calls,2);
  sources=await discover(context,read,execute,'linux',previous(),{now:80000});assert.equal(calls,3);
  sources=await discover(context,read,execute,'linux',previous(),{force:true,now:80001});assert.equal(calls,4);
});
test('missing runners are also cached and Windows source aliases are read only once',async()=>{
  let calls=0;const reads=[];
  const read=async path=>{reads.push(path);return /\/justfile$/i.test(path)?'build:':null;};
  const execute=async()=>{calls++;return {code:1,stderr:'not installed'};};
  const context={folder:'C:/repo'};
  const sources=await discover(context,read,execute,'windows',null,{now:0});
  await discover(context,read,execute,'windows',{sources,fingerprints:sources.fingerprints},{now:10000});
  assert.equal(calls,1);assert.equal(reads.filter(p=>/\/justfile$/i.test(p)).length,2);
});
