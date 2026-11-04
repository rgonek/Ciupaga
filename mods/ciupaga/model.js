// Pure data and command construction; no Herdr or platform globals.
export const joinPath=(root,file)=>`${root.replace(/[\\/]+$/,'')}/${file}`;
export const sourceKey=(context,file)=>JSON.stringify([context.machine||null,context.folder,file]);
export const taskKey=(context,source,task)=>sourceKey(context,source.file)+'\n'+task.name;

// Arguments are literal tokens, never a shell program. Backslashes stay literal
// (also in Windows paths); matching quotes group tokens, doubled quotes escape.
export function parseArguments(text='') {
  const result=[]; let token='',quote=null,started=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(quote) {
      if(c===quote) { if(text[i+1]===quote){token+=c;i++;}else quote=null; }
      else token+=c;
    } else if(c==='"'||c==="'") {quote=c;started=true;}
    else if(/\s/.test(c)) {if(started){result.push(token);token='';started=false;}}
    else {token+=c;started=true;}
  }
  if(quote)throw new Error('Unclosed quote in arguments');
  if(started)result.push(token);
  return result;
}

const sorted=tasks=>tasks.sort((a,b)=>a.name.localeCompare(b.name));
const task=(name,description='',parameters=[])=>({name,description,parameters});
export function parseMake(text) {
  const found=new Map(); let comment='';
  for(const line of text.replace(/\\\r?\n/g,' ').split(/\r?\n/)) {
    if(/^\s*#/.test(line)){comment=line.replace(/^\s*#+\s*/,'');continue;}
    if(/^\t/.test(line))continue;
    const match=/^([^\s#:=][^:=]*?)\s*:(?![=])(?:[^#]*?)(?:##\s*(.*))?$/.exec(line);
    if(match) {
      const names=match[1].trim().split(/\s+/);
      if(names[0]==='.PHONY')for(const name of line.split(':').slice(1).join(':').split('#')[0].trim().split(/\s+/)) {
        if(/^[\w][\w./-]*$/.test(name)&&!found.has(name))found.set(name,task(name));
      }
      for(const name of names)if(/^[\w][\w./-]*$/.test(name))found.set(name,task(name,match[2]||comment));
    }
    comment='';
  }
  return sorted([...found.values()]);
}
export function parseJust(data,prefix='') {
  const tasks=[];
  for(const [key,r] of Object.entries(data.recipes||{})) {
    if(r.private||key.startsWith('_'))continue;
    tasks.push(task(prefix+key,r.doc||'',(r.parameters||[]).map(p=>({
      name:p.name,required:p.default==null&&p.kind!=='star',
      boolean:Boolean(p.flag),option:p.long?`--${p.long}`:p.short?`-${p.short}`:null,
      variadic:p.kind==='star'||p.kind==='plus',
      hint:p.help||(p.default==null?'':`Default: ${typeof p.default==='string'?p.default:JSON.stringify(p.default)}`)
    }))));
  }
  for(const [name,module] of Object.entries(data.modules||{}))if(module&&typeof module==='object')tasks.push(...parseJust(module,prefix+name+'::'));
  return sorted(tasks);
}
export function parseTask(data) {
  if(!Array.isArray(data.tasks))throw new Error('Unsupported Task JSON: expected tasks array');
  return sorted(data.tasks.filter(t=>!t.internal).map(t=>task(t.name||t.task,t.desc||t.summary||'')));
}
export function parseMise(data) {
  if(!Array.isArray(data))throw new Error('Unsupported Mise JSON: expected tasks array');
  return sorted(data.filter(t=>!t.hide).map(t=>({...task(t.name,t.description||''),source:t.source})));
}
export function packageTasks(data) {
  return sorted(Object.entries(data.scripts||{}).filter(([,v])=>typeof v==='string').map(([name,value])=>task(name,value)));
}
export function jsonTasks(data,kind) {
  return sorted(Object.entries(data[kind==='deno'?'tasks':'scripts']||{}).map(([name,value])=>task(name,typeof value==='string'?value:JSON.stringify(value))));
}
export function packageManager(data,locks=[]) {
  const declared=data.packageManager?.split('@')[0];
  if(['npm','pnpm','yarn','bun'].includes(declared))return declared;
  if(locks.includes('pnpm-lock.yaml'))return 'pnpm';
  if(locks.includes('yarn.lock'))return 'yarn';
  if(locks.includes('bun.lock')||locks.includes('bun.lockb'))return 'bun';
  return 'npm';
}
export function taskArgv(source,t,args=[]) {
  if(!t.name||t.name.startsWith('-'))throw new Error('Task names beginning with - are unsupported');
  switch(source.kind) {
    case 'just': return ['just','--justfile',source.file,'--',t.name,...args];
    case 'make': return ['make','-f',source.file,'--',t.name,...args];
    case 'task': return ['task','--taskfile',source.file,t.name,...(args.length?['--',...args]:[])];
    case 'mise': return ['mise','run',t.name,...args];
    case 'package': return [source.manager||'npm','run',t.name,...(args.length&&(!source.manager||source.manager==='npm')?['--']:[]),...args];
    case 'composer': return ['composer','run-script',t.name,...(args.length?['--',...args]:[])];
    case 'deno': return ['deno','task','--config',source.file,t.name,...args];
    default: throw new Error(`Unsupported runner: ${source.kind}`);
  }
}
export function platformArgv(argv,platform) {
  if(platform!=='windows')return argv;
  const quote=s=>"'"+String(s).replace(/'/g,"''")+"'";
  return ['powershell.exe','-NoLogo','-NoProfile','-NonInteractive','-Command',
    `$ErrorActionPreference='Stop'; & ${argv.map(quote).join(' ')}; if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }; if (-not $?) { exit 1 }`];
}
export function groupTasks(tasks,stars=[]) {
  const selected=new Set(stars),primary=tasks.filter(t=>selected.has(t.name));
  return primary.length?{primary,others:tasks.filter(t=>!selected.has(t.name))}:{primary:tasks,others:[]};
}
export function collectArguments(parameters,values,extra='') {
  const args=[]; let omitted=false;
  for(const p of parameters) {
    const value=values[p.name]??'';
    if(p.boolean){if(value===true)args.push(p.option);else if(p.required)throw new Error(`Enable ${p.name}`);continue;}
    if(value==='') {
      if(p.required)throw new Error(`Enter ${p.name}`);
      if(!p.option)omitted=true;continue;
    }
    if(omitted&&!p.option)throw new Error('Fill earlier positional parameters before later ones');
    const tokens=p.variadic?parseArguments(value):[value];
    if(p.option)for(const token of tokens)args.push(p.option,token);
    else args.push(...tokens);
  }
  return [...args,...parseArguments(extra)];
}
