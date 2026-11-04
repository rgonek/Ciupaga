// Explicit opt-in integration check: starts only labeled demo terminals, cleans up its own records.
import {execFileSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {launchArgs,runState} from '../mods/ciupaga/runtime.js';
import {platformArgv,sourceKey} from '../mods/ciupaga/model.js';

const folder=resolve(dirname(fileURLToPath(import.meta.url)),'../examples/northstar');
const context={folder,machine:null},id=`ciupaga-check-${Date.now()}`,addresses=[];
const core=(args)=>execFileSync('hc',args,{encoding:'utf8',timeout:15000});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try {
  for(const [name,code] of [['build',0],['fail',7]]) {
    const started=JSON.parse(core(launchArgs(context,sourceKey(context,'check')+'\n'+name,id+'-'+name,platformArgv(['node','tasks.js',name],process.platform==='win32'?'windows':'linux'))));
    const address=started.address||started.terminal?.address;assert.ok(address,JSON.stringify(started));addresses.push(address);
    let terminal;
    for(let i=0;i<100;i++){terminal=JSON.parse(core(['get',address,'--json']));if(terminal.state!=='live')break;await sleep(100);}
    assert.equal(terminal.exit_code,code,JSON.stringify(terminal));
    assert.equal(runState(terminal),code===0?'succeeded':'failed');
    assert.match(core(['read',address,'--lines','100']),/Northstar demo/);
    console.log(`${name}: ${runState(terminal)} · exit ${terminal.exit_code} · output retained`);
  }
  const started=JSON.parse(core(launchArgs(context,'ciupaga-cancel-check',id+'-dev',['node','tasks.js','dev'])));
  const address=started.address||started.terminal?.address;assert.ok(address);addresses.push(address);
  core(['send',address,'ciupaga-input-check']);
  let output='';
  for(let i=0;i<100;i++){output=core(['read',address,'--lines','100']);if(output.includes('Input: ciupaga-input-check'))break;await sleep(100);}
  assert.match(output,/Input: ciupaga-input-check/);
  console.log('dev: terminal input received');
  core(['kill',address]);let terminal;
  for(let i=0;i<100;i++){terminal=JSON.parse(core(['get',address,'--json']));if(terminal.state!=='live')break;await sleep(100);}
  assert.equal(runState(terminal),'cancelled',JSON.stringify(terminal));
  console.log('dev: cancelled');
} finally {
  for(const address of addresses){try{core(['kill',address]);}catch{}try{core(['rm',address]);}catch{}}
}
