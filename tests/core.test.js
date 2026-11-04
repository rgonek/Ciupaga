import test from 'node:test';
import assert from 'node:assert/strict';
import {parseArguments, parseMake, parseJust, parseTask, parseMise, packageTasks, taskArgv, sourceKey, groupTasks, platformArgv} from '../mods/ciupaga/model.js';

test('argument tokens preserve literal values, empty strings and Windows paths', () => {
  assert.deepEqual(parseArguments('--name "hello world" \'\' C:\\temp\\x "a\\b"'), ['--name','hello world','','C:\\temp\\x','a\\b']);
  assert.deepEqual(parseArguments('"$(whoami)" ; &'), ['$(whoami)',';','&']);
  assert.throws(()=>parseArguments('"unfinished'), /Unclosed/);
});
test('Make lists explicit targets, descriptions, phony names, skips recipes and patterns', () => {
  const tasks=parseMake('.PHONY: clean\n# Build application\nbuild test: input ## Compile\n\tignored: recipe\n%.o: %.c\nVAR := x\n.hidden: x\n');
  assert.deepEqual(tasks.map(t=>t.name), ['build','clean','test']);
  assert.equal(tasks.find(t=>t.name==='build').description,'Compile');
});
test('Just metadata supplies parameters, defaults and module task names', () => {
  const result=parseJust({recipes:{hello:{name:'hello',doc:'Hello',parameters:[{name:'name',default:null,kind:'singular'},{name:'rest',default:null,kind:'star'}]},_private:{private:true}},modules:{tools:{recipes:{lint:{parameters:[]}}}}});
  assert.deepEqual(result.map(t=>t.name),['hello','tools::lint']);
  assert.equal(result[0].parameters[0].required,true);
  assert.equal(result[0].parameters[1].variadic,true);
});
test('native Task and Mise lists normalize descriptions and exclude internal tasks', () => {
  assert.deepEqual(parseTask({tasks:[{name:'ns:build',desc:'Build'},{name:'secret',internal:true}]}).map(t=>t.name),['ns:build']);
  assert.equal(parseMise([{name:'build',description:'Build',source:'/p/mise.toml'}])[0].description,'Build');
});
test('package scripts select declared manager, pass args after separator only for npm', () => {
  const source={kind:'package',file:'package.json',manager:'pnpm'};
  assert.equal(packageTasks({scripts:{dev:'vite'},packageManager:'pnpm@10'})[0].description,'vite');
  assert.deepEqual(taskArgv(source,{name:'dev'},['--port','4000']),['pnpm','run','dev','--port','4000']);
  assert.deepEqual(taskArgv({...source,manager:'npm'},{name:'dev'},['--watch']),['npm','run','dev','--','--watch']);
  assert.deepEqual(taskArgv({kind:'just',file:'Justfile'},{name:'hello'},['Joe']),['just','--justfile','Justfile','--','hello','Joe']);
});
test('stars only collapse Others when an existing task is starred', () => {
  const tasks=[{name:'a'},{name:'b'}];
  assert.deepEqual(groupTasks(tasks,['gone']).primary,tasks);
  assert.deepEqual(groupTasks(tasks,['b']).primary,[tasks[1]]);
  assert.deepEqual(groupTasks(tasks,['b']).others,[tasks[0]]);
  assert.notEqual(sourceKey({folder:'/Repo',machine:null},'justfile'),sourceKey({folder:'/repo',machine:null},'justfile'));
  assert.notEqual(sourceKey({folder:'/repo',machine:'server'},'justfile'),sourceKey({folder:'/repo',machine:null},'justfile'));
});
test('Windows command wrapper quotes literals rather than executing user arguments', () => {
  const argv=platformArgv(['npm','run','dev',"a'b",'$(whoami)'],'windows');
  assert.equal(argv[0],'powershell.exe');
  assert.match(argv.at(-1), /'a''b'/);
  assert.match(argv.at(-1), /'\$\(whoami\)'/);
  assert.deepEqual(platformArgv(['just','build'],'linux'),['just','build']);
});

test('Just named options and explicit boolean flags generate their declared CLI spelling',()=>{
  const [t]=parseJust({recipes:{build:{parameters:[{name:'force',long:'force',flag:false,value:'yes',default:'no',kind:'singular'},{name:'mode',long:'mode',default:'fast',kind:'singular',pattern:['debug|release']},{name:'target',default:null,kind:'singular'}]}}});
  assert.equal(t.parameters[0].boolean,true);
  assert.equal(t.parameters[1].option,'--mode');
  assert.deepEqual(t.parameters[1].choices,['debug','release']);
});
