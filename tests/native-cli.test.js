import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parseJust,parseTask,parseMise,parseMake,taskArgv,platformArgv,collectArguments} from '../mods/ciupaga/model.js';

const cwd=fileURLToPath(new URL('../examples/northstar/',import.meta.url));
const platform=process.platform==='win32'?'windows':'linux';
function execute(argv) {
  const [command,...args]=platformArgv(argv,platform);
  return spawnSync(command,args,{cwd,encoding:'utf8',timeout:60000});
}
function unavailable(result){
  const missing=result.error?.code==='ENOENT'||/is not recognized as the name|command not found/i.test(result.stderr||'');
  if(missing&&process.env.CIUPAGA_REQUIRE_RUNNERS)assert.fail('Required native runner is missing: '+(result.stderr||result.error?.message));
  return missing;
}
for(const [kind,command,enumeration,parse,file] of [
  ['just','just',['--justfile','justfile','--dump','--dump-format','json'],parseJust,'justfile'],
  ['task',process.env.CIUPAGA_TASK_BIN||'task',['--taskfile','Taskfile.yml','--list-all','--json'],parseTask,'Taskfile.yml'],
  ['mise',process.env.CIUPAGA_MISE_BIN||'mise',['tasks','ls','--local','--json'],parseMise,'mise.toml']
]) {
  test(`${kind}: real runner metadata and build invocation`,t=>{
    const probe=execute([command,'--version']);
    if(unavailable(probe)){t.skip(`${command} is not installed`);return;}
    assert.equal(probe.status,0,probe.error?.message||probe.stderr);
    const list=execute([command,...enumeration]);assert.equal(list.status,0,list.stderr);
    const tasks=parse(JSON.parse(list.stdout));assert.ok(tasks.some(t=>t.name==='build'));
    const argv=taskArgv({kind,file},{name:'build'});argv[0]=command;
    const run=execute(argv);assert.equal(run.status,0,run.stderr);assert.match(run.stdout,/Northstar demo/);
    if(kind==='just') {
      const option=tasks.find(t=>t.name==='options');
      assert.equal(option.parameters[0].boolean,true);
      assert.deepEqual(option.parameters[1].choices,['debug','release']);
      const optionArgs=collectArguments(option.parameters,{verbose:true,mode:'release'});
      const result=execute(taskArgv({kind,file},option,optionArgs));
      assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/yes release/);
      const settings=tasks.find(t=>t.name==='settings');
      const positional=execute(taskArgv({kind,file},settings,collectArguments(settings.parameters,{verbose:true})));
      assert.equal(positional.status,0,positional.stderr);assert.match(positional.stdout,/true true/);
    }
  });
}
test('Make: real explicit target execution',t=>{
  const probe=execute(['make','--version']);if(unavailable(probe)){t.skip('make is not installed');return;}
  assert.equal(probe.status,0,probe.error?.message||probe.stderr);
  const tasks=parseMake(readFileSync(new URL('../examples/northstar/Makefile',import.meta.url),'utf8'));
  assert.equal(tasks.length,5);
  const result=execute(taskArgv({kind:'make',file:'Makefile'},tasks.find(t=>t.name==='build')));
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/Northstar demo/);
});
test('package: real npm script and literal argument forwarding',()=>{
  const result=execute(taskArgv({kind:'package',file:'package.json',manager:'npm'},{name:'build'},['two words','C:\\path\\file']));
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/two words C:\\path\\file/);
});
