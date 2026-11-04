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
