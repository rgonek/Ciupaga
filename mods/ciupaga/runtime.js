export function runState(t) {
  if(!t)return 'idle';
  if(t.state==='live')return 'running';
  if(t.reason==='killed')return 'cancelled';
  if(t.exit_code==null)return 'finished';
  return t.exit_code===0?'succeeded':'failed';
}
export function latestRun(terminals,key) {
  return terminals.filter(t=>t.labels?.['ciupaga.task']===key).sort((a,b)=>(b.created_ms||0)-(a.created_ms||0))[0]||null;
}
export function launchArgs(context,key,id,argv) {
  return ['run','--json','--bg','--no-parent','--no-notify','--cwd',context.folder,
    ...(context.machine?['--on',context.machine]:[]),'--label',`ciupaga.task=${key}`,'--label',`ciupaga.run=${id}`,'--',...argv];
}
export function contextFrom(props,focus,spaces) {
  if(props.context?.folder)return props.context;
  const space=spaces.find(s=>s.id===focus?.space)||spaces.find(s=>s.active);
  return {folder:space?.folder||focus?.cwd||'',machine:space?.machine||null,space:space?.id||focus?.space};
}
export function findNode(tree,id) {
  if(!tree)return null;
  if(tree.id===id)return tree;
  for(const child of tree.children||[]) {const match=findNode(child,id);if(match)return match;}
  return null;
}
export function viewAction(place,tree,focus) {
  if(place==='tab')return {name:'tab.new',args:{mod:'ciupaga',name:'Ciupaga'}};
  if(place==='sidebar'&&findNode(tree,'ciupaga-sidebar'))return {name:'layout.show',args:{id:'ciupaga-sidebar'}};
  if(!focus?.pane)throw new Error('Focus a terminal pane before opening a split');
  return {name:'pane.split',args:{pane:focus.pane,direction:place==='down'?'down':'right',mod:'ciupaga'}};
}
export const statusText=(state,t)=>({idle:'Ready',starting:'Starting…',cancelling:'Cancelling…',running:'Running',succeeded:'Succeeded',failed:`Failed · exit ${t?.exit_code??'?'}`,cancelled:'Cancelled',finished:'Finished · exit code unavailable',error:'Could not start'})[state]||state;

// One owner reserves before awaiting hc, so other copies cannot double launch.
export function reserveRun(records,key,id,now=Date.now()) {
  const existing=records[key];
  if(existing?.phase==='starting'&&now-existing.at<35000)throw new Error('This task is already starting');
  return {...records,[key]:{id,at:now,phase:'starting',cancel:false}};
}
