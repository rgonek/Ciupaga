import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

test('installer refuses existing unknown mods and updates only its marked copy',async()=>{
  const home=await mkdtemp(join(tmpdir(),'ciupaga-install-'));
  const install=(...args)=>spawnSync(process.execPath,['scripts/install.mjs','--home',home,...args],{encoding:'utf8'});
  try {
    const target=join(home,'mods','ciupaga');await mkdir(target,{recursive:true});await writeFile(join(target,'main.js'),'// personal mod');
    assert.notEqual(install().status,0);
    assert.notEqual(install('--update').status,0);
    assert.equal(await readFile(join(target,'main.js'),'utf8'),'// personal mod');
    await rm(target,{recursive:true});
    assert.equal(install().status,0);assert.equal(install('--update').status,0);
    assert.match(await readFile(join(target,'main.js'),'utf8'),/extends View/);
    assert.equal(await readFile(join(target,'.ciupaga-install.json'),'utf8').then(JSON.parse).then(x=>x.owner),'rgonek/Ciupaga');
  } finally {assert.ok(resolve(home).startsWith(resolve(tmpdir())));await rm(home,{recursive:true,force:true});}
});
