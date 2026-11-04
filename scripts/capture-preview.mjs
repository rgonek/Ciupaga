// Native Ciupaga controls with synthetic sample data. No tasks are executed.
// Run with Herdr open; capture with `herdr-app shot`, close with `overlay.close`.
import {cpSync,existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';

const mode=process.argv[2]||'tasks';
if(!['tasks','arguments'].includes(mode))throw Error('Use tasks or arguments');
const name='ciupaga-marketing-'+mode;
const home=process.env.HERDR_APP_HOME||join(homedir(),'.config','herdr-app');
const destination=join(home,'mods',name);
if(existsSync(destination))throw Error(`Fixture already exists: ${destination}`);
mkdirSync(destination,{recursive:true});
cpSync(resolve('mods/ciupaga'),destination,{recursive:true,filter:p=>!p.endsWith('.d.ts')&&!p.endsWith('jsconfig.json')});
writeFileSync(join(destination,'controller.js'),readFileSync(join(destination,'main.js'),'utf8').replaceAll('ciupaga.','ciupaga-marketing-fixture.'));
writeFileSync(join(destination,'ui.js'),readFileSync(join(destination,'ui.js'),'utf8').replaceAll('mods/ciupaga/','mods/'+name+'/'));
writeFileSync(join(destination,'mod.json'),JSON.stringify({place:'none',title:'Ciupaga preview',overlay:{width:620,height:mode==='tasks'?510:620}}));
writeFileSync(join(destination,'main.js'),`import Ciupaga from './controller.js';
const task=(name,description,parameters=[])=>({name,description,parameters});
const tasks=[task('build','Build the application'),task('dev','Start the development server'),task('test','Run the test suite'),task('lint','Check code style'),task('hello','Greet someone',[
{name:'name',required:true,hint:'Required'},{name:'suffix',required:false,hint:'friend'}]),task('fail','Try failure feedback'),task('options','Choose build options'),task('settings','Configure the project')];
export default class Preview extends Ciupaga {
  init(initial,cx){
    super.init(initial,cx);this.role='sidebar';
    this.context={folder:'/projects/northstar',machine:null};
    this.sources=[{file:'justfile',kind:'just',tasks},{file:'package.json',kind:'package',manager:'npm',tasks}];
    ${mode==='arguments'?"this.showDetail(tasks.find(t=>t.name==='hello'),cx);this.inputs.name.set_value('Ada');":''}
  }
  activate(){} reload(){} reconcile(){}
  source(){return this.sources[0];}
  sourcePrefs(){return {stars:${JSON.stringify(mode==='tasks'?['build','dev','test','lint','hello']:['build','dev','hello'])}};}
  patchPrefs(){} saveForm(){} start(){} cancel(){} console(){} present(){}
  record(t){const state={build:'succeeded',dev:'running',test:'failed'}[t.name]||'idle';return {state,terminal:state==='idle'?null:{address:'sample-'+t.name,exit_code:state==='failed'?1:0,state:state==='running'?'live':'exited'}};}
  consolePane(){return null;}
}
`);
execFileSync('herdr-app',['check',destination],{stdio:'inherit'});
execFileSync('herdr-app',['do','mod.open','--name',name],{stdio:'inherit'});
console.log(`Native sample fixture: ${destination}`);
