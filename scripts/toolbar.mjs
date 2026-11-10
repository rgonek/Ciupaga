import {readFile,writeFile,cp,mkdir,readdir} from 'node:fs/promises';
import {join} from 'node:path';

// Only replace the known Ciupaga block, never the surrounding personal toolbar.
export function integrateToolbar(source){
  if(source.includes('// ciupaga-retained-launcher-v1'))return source;
  const start=source.search(/\.child\(h_flex\(\)\.id\(["']ciupaga-launcher["']\)/);
  if(start<0)throw new Error('Cannot find the existing Ciupaga launcher; toolbar left unchanged');
  let depth=0,quote=null,escaped=false,end=-1;
  for(let i=start+6;i<source.length;i++){
    const char=source[i];
    if(quote){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char===quote)quote=null;continue;}
    if(['"',"'",'`'].includes(char)){quote=char;continue;}
    if(char==='(')depth++;
    if(char===')'&&--depth===0){end=i+1;break;}
  }
  if(end<0||! /init\([^)]*,\s*cx\)\s*\{/.test(source))throw new Error('Unsupported Ciupaga launcher structure; toolbar left unchanged');
  return "// ciupaga-retained-launcher-v1\nimport Ciupaga from './ciupaga/main.js';\n"+
    (source.slice(0,start)+'.child(div().w(160).min_w(0).flex_none().child(this.ciupaga))'+source.slice(end))
      .replace(/init\([^)]*,\s*cx\)\s*\{/,match=>match+"\n    this.ciupaga=cx.new(Ciupaga,{role:'button',embedded:true});");
}
export async function updateToolbar(home,name,modFolder){
  if(!/^[\w-]+$/.test(name)||name==='ciupaga')throw new Error('Invalid personal toolbar mod name');
  const folder=join(home,'mods',name),file=join(folder,'main.js');
  const original=await readFile(file,'utf8'),updated=integrateToolbar(original);
  const backup=join(folder,`main.js.ciupaga-backup-${Date.now()}`);
  await writeFile(backup,original);
  await mkdir(join(folder,'ciupaga'),{recursive:true});
  for(const file of await readdir(modFolder))if(file.endsWith('.js'))await cp(join(modFolder,file),join(folder,'ciupaga',file));
  await writeFile(file,updated);
  return backup;
}
