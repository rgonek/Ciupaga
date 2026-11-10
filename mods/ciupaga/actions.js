import {taskKey} from './model.js';

export const ACTION_ICONS=['play','terminal','square-terminal','ciupaga','axe','star','check','refresh-cw','columns-2','rows-2','app-window','panel-right','arrow-up','arrow-right','arrow-down'];
export const MANUAL_FILE='@manual';
export const launcherPreferenceKey=context=>'launcher:'+JSON.stringify([context?.machine||'',context?.space||'']);
export function actionIdentity(context,source,task){
  return source?.kind==='manual'?'manual:'+JSON.stringify([context?.machine||'',context?.space||'',task.id]):taskKey(context,source,task);
}
export function manualActionsFor(actions=[],context={}){
  return actions.filter(a=>a.scope==='global'||(a.scope==='space'&&a.space===context.space&&(a.machine||null)===(context.machine||null)));
}
export function actionSettings(saved={}){
  const peekLines=saved.peekLines??1;
  if(!Number.isInteger(peekLines)||peekLines<0||peekLines>50)throw new Error('Peek must be off or 1–50 lines');
  return {icon:ACTION_ICONS.includes(saved.icon)?saved.icon:'play',console:['background','tab','left','right'].includes(saved.console)?saved.console:'background',peekLines};
}
export function validateManualAction(value){
  const action={...value,name:String(value.name||'').trim(),command:String(value.command||'').trim(),cwd:String(value.cwd||'').trim()};
  if(!action.id||!action.name||!action.command)throw new Error('Name and command are required');
  if(/[\0]/.test(action.command+action.cwd))throw new Error('Command and folder cannot contain NUL');
  if(!['global','space'].includes(action.scope)||action.scope==='space'&&!action.space)throw new Error('Choose a valid action scope');
  if(!['powershell','cmd','sh','bash'].includes(action.shell))throw new Error('Choose a shell');
  return {...action,...actionSettings(action)};
}
export function manualArgv(action,platform){
  const shell=action.shell||(platform==='windows'?'powershell':'sh');
  if(platform==='windows'){
    if(shell==='powershell')return ['powershell.exe','-NoLogo','-NoProfile','-Command',action.command];
    if(shell==='cmd')return ['cmd.exe','/d','/s','/c',action.command];
  }else if(shell==='sh'||shell==='bash')return [shell,'-lc',action.command];
  throw new Error(`Shell ${shell} is not supported on ${platform}`);
}
export function manualContext(context,space,action){
  const folder=action.cwd||space?.folder;
  if(!folder)throw new Error('Choose a space folder or set an action folder');
  return {...context,folder,machine:space?.machine||context.machine||null};
}
