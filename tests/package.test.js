import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

test('public package has required artifacts and excludes runtime state and generated types',async()=>{
  const result=spawnSync(process.execPath,['scripts/package.mjs'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const root='dist/ciupaga';
  const files=await readdir(root,{recursive:true});
  for(const file of ['README.md','RECIPE.md','preview.png','LICENSE','scripts/install.mjs','mods/ciupaga/main.js'])assert.ok(files.some(path=>path.replace(/\\/g,'/')===file),file);
  assert.ok(!files.some(path=>/shared\.json|gpui-kit\.d\.ts|jsconfig|\.superpowers|node_modules|\.ciupaga-install/.test(path)));
  const png=await readFile(root+'/preview.png');assert.equal(png.subarray(1,4).toString(),'PNG');
});
