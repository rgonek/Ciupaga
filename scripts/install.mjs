import {cp,mkdir,readFile,writeFile,access} from 'node:fs/promises';
import {homedir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const homeArg=args.indexOf('--home');
if(homeArg!==-1&&!args[homeArg+1])throw new Error('--home requires a folder');
const home=resolve(homeArg===-1?(process.env.HERDR_APP_HOME||join(homedir(),'.config','herdr-app')):args[homeArg+1]);
const target=join(home,'mods','ciupaga'),marker=join(target,'.ciupaga-install.json');
let exists=false;try{await access(target);exists=true;}catch{}
if(exists) {
  if(!args.includes('--update'))throw new Error(`Already exists: ${target}. Use --update for an installation managed by this script.`);
  const owner=JSON.parse(await readFile(marker,'utf8').catch(()=>'{"owner":null}'));
  if(owner.owner!=='rgonek/Ciupaga')throw new Error('Existing ciupaga folder is not managed by this installer; refusing to overwrite.');
}
await mkdir(dirname(target),{recursive:true});
await cp(join(root,'mods','ciupaga'),target,{recursive:true,force:exists,errorOnExist:!exists});
await writeFile(marker,JSON.stringify({owner:'rgonek/Ciupaga',version:'0.1.0'})+'\n');
console.log(`Installed Ciupaga in ${target}`);
console.log('The mod reads project task files, enumerates native runners and starts selected commands through herdr-core. No network calls in the mod.');
console.log('Open: herdr-app do mod.open --name ciupaga');
console.log('Toolbar block: {"type":"block","size":{"px":106},"content":{"mod":"ciupaga","props":{"role":"button"}}}');
