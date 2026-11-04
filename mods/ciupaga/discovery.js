import {joinPath,parseMake,parseJust,parseTask,parseMise,packageTasks,packageManager,jsonTasks,platformArgv} from './model.js';

export const candidates=[
  ['justfile','just'],['Justfile','just'],['.justfile','just'],
  ['GNUmakefile','make'],['makefile','make'],['Makefile','make'],
  ['Taskfile.yml','task'],['Taskfile.yaml','task'],['taskfile.yml','task'],['taskfile.yaml','task'],['Taskfile.dist.yml','task'],['Taskfile.dist.yaml','task'],
  ['mise.toml','mise'],['.mise.toml','mise'],['.config/mise.toml','mise'],
  ['package.json','package'],['composer.json','composer'],['deno.json','deno']
];
export async function discover(context,read,execute,platform) {
  const sources=[],seen=new Set();
  const files=await Promise.all(candidates.map(async([file,kind])=>({file,kind,text:await read(joinPath(context.folder,file),{on:context.machine})})));
  for(const {file,kind,text} of files) {
    if(text==null)continue;
    const id=platform==='windows'?file.toLowerCase():file;
    // Windows aliases point to the same physical file. Mise layers are one effective config.
    if(seen.has(id)||(kind==='mise'&&sources.some(s=>s.kind==='mise')))continue;
    seen.add(id);
    const source={file,kind,tasks:[],error:null,note:''};sources.push(source);
    try {
      if(kind==='make') {
        source.tasks=parseMake(text);
        source.note='Explicit targets only; included files, variables and generated targets are not expanded.';
      } else if(kind==='package') {
        const data=JSON.parse(text),locks=[];
        for(const lock of ['pnpm-lock.yaml','yarn.lock','bun.lock'])if(await read(joinPath(context.folder,lock),{on:context.machine})!=null)locks.push(lock);
        source.manager=packageManager(data,locks);source.tasks=packageTasks(data);
      } else if(kind==='composer'||kind==='deno') source.tasks=jsonTasks(JSON.parse(text),kind);
      else {
        const argv=kind==='just'?['just','--justfile',file,'--dump','--dump-format','json']:
          kind==='task'?['task','--taskfile',file,'--list-all','--json']:['mise','tasks','ls','--local','--json'];
        const [command,...args]=platformArgv(argv,platform);
        const result=await execute(command,args,{cwd:context.folder,on:context.machine});
        if(result.code!==0)throw new Error((result.stderr||result.stdout).trim()||`${argv[0]} exited ${result.code}`);
        const data=JSON.parse(result.stdout);
        source.tasks=kind==='just'?parseJust(data):kind==='task'?parseTask(data):parseMise(data);
        if(kind==='mise')source.note='Mise merges project configuration layers and file tasks; this is the effective local task list.';
      }
    } catch(error) {source.error=String(error.message||error);}
  }
  return sources;
}
