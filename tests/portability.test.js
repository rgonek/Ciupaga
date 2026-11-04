import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {platformArgv,platformFromUname} from '../mods/ciupaga/model.js';
import {discover} from '../mods/ciupaga/discovery.js';

test('remote uname recognizes Unix and Windows compatibility environments',()=>{
  for(const name of ['MINGW32_NT-6.2','MSYS_NT-10.0','CYGWIN_NT-10.0'])assert.equal(platformFromUname(name),'windows');
  assert.equal(platformFromUname('Darwin\n'),'macos');
  assert.equal(platformFromUname('Linux\n'),'linux');
  assert.throws(()=>platformFromUname('unknown'),/Unrecognized/);
});
for(const same of [true,false])test(`macOS file aliases preserve physical identity: same=${same}`,async()=>{
  let enumerations=0;
  const sources=await discover({folder:'/repo'},async path=>/\/justfile$/i.test(path)?'build:':null,async(command)=>{
    if(command==='git')return {code:0,stdout:''};
    if(command==='sh')return {code:same?0:1};
    enumerations++;return {code:0,stdout:'{"recipes":{"build":{"parameters":[]}}}'};
  },'macos');
  assert.equal(sources.length,same?1:2);assert.equal(enumerations,same?1:2);
});
test('Unix discovery respects the actual filesystem case sensitivity',{skip:process.platform==='win32'},async()=>{
  const folder=mkdtempSync(join(tmpdir(),'ciupaga-case-'));
  try {
    writeFileSync(join(folder,'justfile'),'lower');writeFileSync(join(folder,'Justfile'),'upper');
    const distinct=readFileSync(join(folder,'justfile'),'utf8')==='lower';
    const sources=await discover({folder},async path=>{try{return readFileSync(path,'utf8');}catch{return null;}},async(command,args,options)=>{
      if(command==='just')return {code:0,stdout:'{"recipes":{"build":{"parameters":[]}}}'};
      const result=spawnSync(command,args,{cwd:options.cwd,encoding:'utf8'});
      return {code:result.status,stdout:result.stdout||'',stderr:result.stderr||''};
    },process.platform==='darwin'?'macos':'linux');
    assert.equal(sources.length,distinct?2:1);
  } finally {rmSync(folder,{recursive:true,force:true});}
});
test('Windows native and batch launch preserve literal argv under Restricted policy',{skip:process.platform!=='win32'},()=>{
  const folder=mkdtempSync(join(tmpdir(),'ciupaga argv '));
  try {
    const capture=join(folder,'capture.cjs');
    writeFileSync(capture,'process.stdout.write(JSON.stringify(process.argv.slice(2)))');
    const shim=join(folder,'capture.cmd');
    writeFileSync(shim,`@echo off\r\n"${process.execPath}" "${capture}" %*\r\n`);
    const values=['','two words','literal"quote','trailing\\','two \\"quoted"','&|<>^%!()','%CIUPAGA_LITERAL_TEST%','a\'b','$(whoami)','żółć'];
    for(const argv of [[process.execPath,capture,...values],[shim,...values]]) {
      const [command,...args]=platformArgv(argv,'windows');
      args.splice(args.indexOf('-Command'),0,'-ExecutionPolicy','Restricted');
      const result=spawnSync(command,args,{encoding:'utf8',timeout:15000,env:{...process.env,CIUPAGA_LITERAL_TEST:'EXPANDED'}});
      assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),values);
    }
    const [command,...args]=platformArgv(['npm','--version'],'windows');
    args.splice(args.indexOf('-Command'),0,'-ExecutionPolicy','Restricted');
    const npm=spawnSync(command,args,{encoding:'utf8',timeout:15000});assert.equal(npm.status,0,npm.stderr);
  } finally {rmSync(folder,{recursive:true,force:true});}
});
