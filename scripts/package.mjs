import {mkdir,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const target=join(root,'dist','ciupaga');
const files=['README.md','RECIPE.md','LICENSE','THIRD_PARTY_NOTICES.md','preview.png','package.json','scripts/install.mjs'];
const modFiles=['main.js','model.js','runtime.js','discovery.js','ui.js','mod.json'];
const icons=['axe','star','terminal','ellipsis','external-link','refresh-cw','chevron-down','chevron-up','check','square'];
for(const file of files)await readFile(join(root,file)); // Validate before replacing output.
if(dirname(target)!==join(root,'dist'))throw new Error('Package destination escaped dist');
await rm(target,{recursive:true,force:true});
await mkdir(join(target,'mods','ciupaga'),{recursive:true});
for(const file of files){await mkdir(dirname(join(target,file)),{recursive:true});await cp(join(root,file),join(target,file));}
for(const file of modFiles)await cp(join(root,'mods','ciupaga',file),join(target,'mods','ciupaga',file));
await mkdir(join(target,'mods','ciupaga','icons'));
for(const file of [...icons.map(name=>name+'.svg'),'LICENSE-Lucide.txt'])await cp(join(root,'mods','ciupaga','icons',file),join(target,'mods','ciupaga','icons',file));
await writeFile(join(target,'package.json'),JSON.stringify({name:'ciupaga',version:'0.1.0',private:true,type:'module',scripts:{'install-mod':'node scripts/install.mjs'},engines:{node:'>=22'}},null,2)+'\n');
console.log(`Package ready: ${target}`);
