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
  assert.equal(calls.length,2); // One native runner and one bounded Git package lookup.
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
  const execute=async command=>{if(command==='git')return {code:0,stdout:''};calls++;return {code:0,stdout:'{"recipes":{"build":{"parameters":[]}}}'};};
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
  const execute=async command=>{if(command==='git')return {code:0,stdout:''};calls++;return {code:1,stderr:'not installed'};};
  const context={folder:'C:/repo'};
  const sources=await discover(context,read,execute,'windows',null,{now:0});
  await discover(context,read,execute,'windows',{sources,fingerprints:sources.fingerprints},{now:10000});
  assert.equal(calls,1);assert.equal(reads.filter(p=>/\/justfile$/i.test(p)).length,2);
});

test('nested package scripts are discovered one level down and use their own folder and manager',async()=>{
  const read=async path=>path==='/repo/EndUserZone/package.json'?'{"scripts":{"dev":"webpack","test":"jest"},"packageManager":"pnpm@10"}':null;
  const execute=async(command,args)=>{assert.equal(command,'git');assert.ok(args.includes(':(glob)*/package.json'));return {code:0,stdout:'EndUserZone/package.json\0node_modules/package.json\0deep/child/package.json\0'};};
  const sources=await discover({folder:'/repo'},read,execute,'linux',null,{now:0});
  assert.equal(sources.length,1);assert.equal(sources[0].file,'EndUserZone/package.json');
  assert.equal(sources[0].folder,'/repo/EndUserZone');assert.equal(sources[0].manager,'pnpm');
  assert.deepEqual(sources[0].tasks.map(t=>t.name),['dev','test']);
});
test('nested package search is cached for a minute; known manifests are still checked every probe',async()=>{
  let scans=0,text='{"scripts":{"dev":"webpack"}}';
  const read=async path=>path==='/repo/ui/package.json'?text:null;
  const execute=async()=>{scans++;return {code:0,stdout:'ui/package.json\0'};};
  let sources=await discover({folder:'/repo'},read,execute,'linux',null,{now:0});
  let previous=()=>({sources,fingerprints:sources.fingerprints,packages:sources.packages});
  text='{"scripts":{"build":"webpack"}}';
  sources=await discover({folder:'/repo'},read,execute,'linux',previous(),{now:10000});
  assert.equal(scans,1);assert.equal(sources[0].tasks[0].name,'build');
  sources=await discover({folder:'/repo'},read,execute,'linux',previous(),{now:60000});assert.equal(scans,2);
});
test('nested manager detection reads lockfiles beside the manifest rather than the repository root',async()=>{
  const read=async path=>path==='/repo/ui/package.json'?'{"scripts":{"dev":"vite"}}':path==='/repo/ui/yarn.lock'?'lock':null;
  const sources=await discover({folder:'/repo'},read,async()=>({code:0,stdout:'ui/package.json\0'}),'linux');
  assert.equal(sources[0].manager,'yarn');
});
test('Windows metadata uses the native runner and only falls back for a launch failure',async()=>{
  const read=async path=>path.endsWith('/justfile')?'build:':null;
  const calls=[];
  const execute=async command=>{calls.push(command);if(command==='git')return {code:0,stdout:''};if(command==='just')throw new Error('os error 193');return {code:0,stdout:'{"recipes":{"build":{"parameters":[]}}}'};};
  const sources=await discover({folder:'C:/repo'},read,execute,'windows');
  assert.equal(sources[0].tasks[0].name,'build');assert.equal(calls.filter(c=>c==='powershell.exe').length,1);
  calls.length=0;
  await discover({folder:'C:/repo'},read,async command=>{calls.push(command);if(command==='git')return {code:0,stdout:''};throw new Error('execution timed out');},'windows');
  assert.ok(!calls.includes('powershell.exe'));
});
