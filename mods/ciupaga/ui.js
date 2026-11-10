import {div,svg,list} from 'gpui-kit';
import {h_flex,v_flex,Button,Toggle,Checkbox,Popover,Input,TextView} from 'gpui-base';
import {theme as hostTheme,terminals,settings} from 'herdr';
import {typography} from './typography.js';
import {groupTasks,taskArgv} from './model.js';
import {statusText,terminalIndex} from './runtime.js';
import {ACTION_ICONS,MANUAL_FILE,actionSettings} from './actions.js';

let frame=null;
function uiFrame(body){
  if(frame)return body();
  frame={theme:hostTheme(),metrics:typography(settings().ui_font_size,window.rem_size())};
  try{return body();}finally{frame=null;}
}
function theme(){return frame?.theme||hostTheme();}
export function uiMetrics(){return frame?.metrics||typography(settings().ui_font_size,window.rem_size());}
const px=value=>uiMetrics().px(value);

function text(value,muted=false){return div().text_size(uiMetrics().body).text_color(muted?theme().muted:theme().foreground).child(value);}
const icon=(name,size=14)=>svg(`mods/ciupaga/icons/${name}.svg`).size(px(size)).flex_none();
export function button(id,label,action,{tip=label,primary=false,disabled=false}={}) {
  const t=theme();
  return Button.new(id).h(px(28)).px(px(8)).flex_none().rounded(px(6)).items_center().justify_center().text_size(uiMetrics().control)
    .tab_index(0).accessibility_label(typeof tip==='string'?tip:'Action').tooltip(typeof tip==='string'?tip:'Action')
    .disabled(disabled).opacity(disabled?0.45:1).text_color(primary?t.solid_foreground:t.foreground)
    .bg(primary?t.solid:t.surface).when(!disabled,e=>e.cursor_pointer().hover(s=>s.bg(primary?t.accent:t.hover)).active(s=>s.bg(t.selected)))
    .when(Boolean(action),e=>e.on_click(action)).child(label);
}
function field(input){return Input.new(input).h(px(30)).flex_1().min_w(0).px(px(8)).rounded(px(6)).border_1().border_color(theme().input).bg(theme().background).text_color(theme().foreground).text_size(uiMetrics().control);}
function menu(view,cx,id,label,items,tip) {
  const open=view.openMenu===id,t=theme();
  return Popover.new(id).open(open).track_focus(view.menuHandle(id,cx))
    .on_open_change((next,cx)=>{view.openMenu=next?id:null;cx.notify();})
    .trigger(button(id+'-trigger',label,null,{tip:tip||label}))
    .when(open,e=>e.content(v_flex().w(px(232)).max_h(px(300)).overflow_y_scrollbar().p(px(4)).gap(px(2)).bg(t.popover).rounded(px(8)).border_1().border_color(t.border)
      .children(items.map((item,i)=>button(id+'-'+i,item.icon?h_flex().gap(px(8)).items_center().child(icon(item.icon)).child(text(item.label)):item.label,(_e,cx)=>{view.openMenu=null;item.action(cx);cx.notify();},{tip:item.tip||item.label,disabled:item.disabled}).w_full().justify_start()))));
}
export function launchView(view) {
  return h_flex().id('ciupaga-launch').h(px(36)).px(px(10)).gap(px(8)).items_center().bg(theme().background)
    .child(icon('loader-circle',14).spin(900)).child(text(view.options.task||'Task').truncate());
}
export function taskMenu(view,cx){return uiFrame(()=>taskMenuContent(view,cx));}
function taskMenuContent(view,cx) {
  const t=theme(),choices=view.launcherChoices();
  const rowsHeight=choices.reduce((height,item)=>height+px(48)+(view.settingsFor(item).peekLines&&view.record(item).terminal?Math.min(px(180),Math.max(1,(view.peekSnapshot?.(item)?.text||'').split('\n').length)*uiMetrics().fontSize*1.5+px(5)):0),0);
  return v_flex().id('ciupaga-menu').w_full().h(Math.min(px(420),px(44)+Math.max(px(45),rowsHeight))).max_h(px(420)).bg(t.popover)
    .child(h_flex().p(px(5)).gap(px(4)).items_center()
      .child(button('full-view','Full view',(_event,cx)=>{view.openMenu=null;cx.notify();view.openPopup();},{tip:'Open all actions and settings'}).flex_1())
      .child(button('add-action','Add action',(_event,cx)=>{view.openMenu=null;cx.notify();view.openPopup(undefined,undefined,true);},{tip:'Create a custom action'}).flex_1()))
    .child(v_flex().flex_1().min_h(0).overflow_y_scrollbar().p(px(4)).gap(px(2))
      .when(!choices.length,e=>e.child(text(view.loading?'Reading tasks…':'Add an action or star a project task',true).p(px(8))))
      .children(choices.map((item,i)=>{
        const record=view.record(item),busy=['running','starting','cancelling'].includes(record.state);
        return v_flex().flex_none().gap(px(2)).rounded(px(5)).bg(t.surface)
          .child(button('pick-'+i,h_flex().gap(px(7)).items_center().w_full().min_w(0)
            .child(icon(busy?'loader-circle':view.settingsFor(item).icon,14).when(busy,e=>e.spin(900)))
            .child(v_flex().flex_1().min_w(0).child(text(item.name).truncate()).child(text(`${item.id?(item.scope==='global'?'Global':'Space'):item.file} · ${statusText(record.state,record.terminal)}`,true).text_size(uiMetrics().caption).truncate())),(_e,cx)=>view.chooseLauncher(item,cx),{tip:busy?`Cancel ${item.name}`:`Run ${item.name}`,disabled:record.state==='cancelling'}).w_full().h(px(43)).justify_start())
          .child(peekRow(view,item,cx,'quick-'+i));
      })));
}
export function launcher(view,cx){return uiFrame(()=>launcherContent(view,cx));}
function launcherContent(view,cx) {
  const bounds=(event)=>{view.buttonBounds=event.bounds;};
  const open=button('ciupaga-open',h_flex().gap(px(6)).items_center().child(icon('ciupaga',17)).child('Ciupaga'),()=>view.openPopup(),{tip:'Ciupaga · run project tasks'}).on_mouse_down('left',bounds);
  if(!view.launcherMode())return open;
  const t=theme(),task=view.launcherTask(),choices=view.launcherChoices(),record=task?view.record(task):null,state=record?.state||'idle';
  const busy=['running','starting','cancelling'].includes(state),pending=state==='cancelling';
  const name=task?.name||(view.loading?'…':'Ciupaga');
  const tip=busy?`Cancel ${task.name}`:task?`Run ${task.name}${state==='idle'?'':' · '+statusText(state,record?.terminal)}`:'Ciupaga · run project tasks';
  const run=Button.new('ciupaga-run').h(px(28)).flex_1().min_w(0).px(px(6)).rounded(px(6)).items_center().justify_start().text_size(uiMetrics().control)
    .tab_index(0).accessibility_label(tip).tooltip(tip).disabled(pending).opacity(pending?0.45:1)
    .text_color(t.foreground).bg(t.surface).when(!pending,e=>e.cursor_pointer().hover(s=>s.bg(t.hover)).active(s=>s.bg(t.selected)))
    .on_mouse_down('left',bounds).on_click((_event,cx)=>task?view.launchQuick(task,cx):view.openPopup())
    .child(h_flex().flex_1().min_w(0).gap(px(6)).items_center().child(busy?icon('loader-circle',14).spin(900):icon(task?view.settingsFor(task).icon:'ciupaga',15)).child(div().flex_1().min_w(0).truncate().text_size(uiMetrics().body).text_color(t.foreground).child(name))
      .when(!busy&&state!=='idle',e=>e.child(icon(state==='succeeded'?'check':'square',11).text_color(state==='succeeded'?t.done:['failed','error'].includes(state)?t.ansi1:t.dim))));
  const chevron=Popover.new('quick-actions').open(view.openMenu==='launcher').track_focus(view.menuHandle())
    .on_open_change((open,cx)=>{view.openMenu=open?'launcher':null;cx.notify();})
    .trigger(button('quick-actions-trigger',icon('chevron-down',12),null,{tip:'Quick actions'}).w(px(24)).px(0).on_mouse_down('left',bounds))
    .when(view.openMenu==='launcher',e=>e.content(div().w(px(360)).rounded(px(8)).border_1().border_color(t.border).child(taskMenu(view,cx))));
  return h_flex().id('ciupaga-launcher').w_full().min_w(0).gap(px(2)).items_center().child(run).child(chevron);
}
function peekRow(view,task,cx,id){
  if(!view.settingsFor(task).peekLines||!view.record(task).terminal)return div();
  const escape=value=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const saved=view.peekSnapshot?.(task),lineCount=Math.max(1,(saved?.text||'').split('\n').length);
  const contentKey=JSON.stringify([id,saved?.text||'',Boolean(saved?.unavailable)]);
  // A one-item native lazy list is clipped by the enclosing task scroller.
  // Its row callback registers IO only for peeks actually drawn on screen.
  return div().px(px(9)).pb(px(5)).min_w(0).h(Math.min(px(180),lineCount*uiMetrics().fontSize*1.5+px(5)))
    .child(list('peek-lazy-'+id,1,()=>contentKey,(_index,cx)=>{
      return uiFrame(()=>{
        const snapshot=view.peek(task,cx);
        return snapshot?.text?TextView.html('peek-'+id,`<pre>${escape(snapshot.text)}</pre>`).selectable(true).scrollable(false).text_size(uiMetrics().code).text_color(theme().muted):text(snapshot?.unavailable?'Output unavailable':'',true).text_size(uiMetrics().caption);
      });
    }).size_full());
}
function settingsControls(view,cx,id,value,update,peekInput){
  return v_flex().gap(px(6))
    .child(h_flex().gap(px(6)).items_center().child(text('Icon',true).w(px(100)))
      .child(menu(view,cx,'icon-'+id,h_flex().gap(px(5)).items_center().child(icon(value.icon)).child(text(value.icon)),ACTION_ICONS.map(name=>({label:name,icon:name,action:cx=>update({icon:name},cx)})),'Action icon')))
    .child(h_flex().gap(px(6)).items_center().child(text('Terminal',true).w(px(100)))
      .child(menu(view,cx,'terminal-'+id,({background:'Background',tab:'New tab',left:'Left',right:'Right'})[value.console],['background','tab','left','right'].map(place=>({label:({background:'Background',tab:'New tab',left:'Left',right:'Right'})[place],action:cx=>update({console:place},cx)})),'Show terminal when this action starts')))
    .child(h_flex().gap(px(6)).items_center().child(text('Peek lines',true).w(px(100))).child(div().w(px(70)).child(field(peekInput))).child(text('0 = off · 1–50',true).text_size(uiMetrics().caption)));
}
export function manualEditor(view,cx){
  const action=view.editor,value=actionSettings(action);
  return v_flex().flex_1().min_h(0).overflow_y_scrollbar().p(px(12)).gap(px(8))
    .child(text((view.prefs().manualActions||[]).some(a=>a.id===action.id)?'Edit action':'New action').font_semibold())
    .children(['name','description','command','cwd'].map(name=>v_flex().gap(px(3)).child(text(({name:'Name',description:'Description',command:'Command',cwd:'Working folder (optional)'})[name],true)).child(field(view.editorInputs[name]))))
    .child(h_flex().gap(px(6)).items_center().child(text('Scope',true).w(px(100))).child(menu(view,cx,'scope',action.scope==='global'?'Global':'This space',['space','global'].map(scope=>({label:scope==='global'?'Global':'This space',action:cx=>{view.editor.scope=scope;cx.notify();}})),'Action scope')))
    .child(h_flex().gap(px(6)).items_center().child(text('Shell',true).w(px(100))).child(menu(view,cx,'shell',action.shell,['powershell','cmd','sh','bash'].map(shell=>({label:shell,action:cx=>{view.editor.shell=shell;cx.notify();}})),'Shell on the target machine')))
    .child(text('Command uses shell syntax, including pipes and variables.',true).text_size(uiMetrics().caption))
    .child(settingsControls(view,cx,'editor',value,(patch,cx)=>{Object.assign(view.editor,patch);cx.notify();},view.editorInputs.peekLines))
    .child(h_flex().gap(px(6)).items_center()
      .child(button('save-action','Save',(_e,cx)=>view.saveManual(cx),{primary:true}))
      .child(button('cancel-editor','Cancel',(_e,cx)=>view.closeEditor(cx)))
      .when((view.prefs().manualActions||[]).some(a=>a.id===action.id),e=>e.child(button('delete-action','Delete',(_e,cx)=>view.deleteManual(action.id,cx)))));
}
function taskRow(view,task,cx,source,index) {
  const t=theme(),record=view.record(task,index),state=record.state,id=task.id||task.name;
  const starred=(view.sourcePrefs().stars||[]).includes(task.name),expanded=view.detail&&view.formKey(view.detail)===view.formKey(task);
  const busy=['running','starting','cancelling'].includes(state),pending=state==='cancelling';
  const color=state==='running'?t.working:state==='succeeded'?t.done:['failed','error'].includes(state)?t.ansi1:t.dim;
  const open=record.terminal&&view.consolePane(record.terminal.address);
  const consoleItems=[{label:open?'Focus console':'Open in new tab',icon:'app-window',action:cx=>view.console(task,'tab',cx)}];
  if(!open) {
    consoleItems.push({label:'Open left',icon:'columns-2',action:cx=>view.console(task,'left',cx)});
    consoleItems.push({label:'Open beside',icon:'columns-2',action:cx=>view.console(task,'right',cx)});
    consoleItems.push({label:'Open above',icon:'rows-2',action:cx=>view.console(task,'up',cx)});
    consoleItems.push({label:'Open below',icon:'rows-2',action:cx=>view.console(task,'down',cx)});
  } else consoleItems.push({label:record.terminal.state==='live'?'Hide console · keep running':'Close console',icon:'panel-right',action:cx=>view.console(task,'hide',cx)});
  const row=v_flex().flex_none().rounded(px(7)).border_1().border_color(expanded?t.input:t.border).bg(t.surface)
    .child(h_flex().min_h(px(57)).px(px(6)).gap(px(6)).items_center()
      .when(!task.id,e=>e.child(div().id('star-tip-'+task.name).flex_none().tooltip(starred?'Unstar task':'Star task')
        .child(Toggle.new('star-'+task.name).pressed(starred).w(px(26)).h(px(28)).flex_none().rounded(px(5)).cursor_pointer().tab_index(0)
          .accessibility_label(`${starred?'Unstar':'Star'} ${task.name}`).text_color(starred?t.ansi3:t.dim)
          .hover(e=>e.bg(t.hover)).on_change((_pressed,cx)=>view.toggleStar(task,cx)).child(icon('star').when(starred,e=>e.opacity(1)).when(!starred,e=>e.opacity(0.55))))))
      .child(icon(view.settingsFor(task).icon,16))
      .child(v_flex().flex_1().min_w(0).gap(px(2)).id('task-detail-'+id).cursor_pointer().tooltip(task.description||task.name)
        .on_click((_e,cx)=>view.showDetail(task,cx))
        .child(text(task.name).font_semibold().truncate())
        .child(text(state==='idle'?(task.description||'Ready'):statusText(state,record.terminal),true).text_size(uiMetrics().caption).text_color(color).truncate()))
      .when(Boolean(record.terminal),e=>e.child(menu(view,cx,'console-'+id,icon('square-terminal'),consoleItems,'Console placement and output')))
      .child(button('options-'+id,icon('ellipsis'),(_e,cx)=>view.showDetail(task,cx),{tip:'Arguments and task details'}).w(px(26)).px(0))
      .child(button('run-'+(task.id||task.name),busy?h_flex().gap(px(5)).items_center().child(icon('loader-circle',12).spin(900)).child(pending?'Stopping':'Cancel'):'Run',(_e,cx)=>busy?view.cancel(task,cx):view.start(task,cx),{primary:!busy,disabled:pending||Boolean(source.error),tip:busy?`Cancel ${task.name}`:`Run ${task.name}`}).w(px(busy?82:59))))
    .child(peekRow(view,task,cx,task.id||task.name));
  if(!expanded)return row;
  return row.child(v_flex().px(px(10)).pb(px(10)).gap(px(7))
    .child(text(task.description||'No description',true))
    .when(Boolean(record.entry?.error),e=>e.child(text(record.entry.error).text_color(t.ansi1)))
    .children(task.parameters.map(p=>p.boolean?
      Checkbox.new('parameter-'+task.name+'-'+p.name).checked(Boolean(view.flags[p.name])).tab_index(0).accessibility_label(p.name)
        .on_change((checked,cx)=>{view.flags[p.name]=checked;view.saveForm();cx.notify();})
        .child(h_flex().gap(px(6)).items_center().child(icon(view.flags[p.name]?'check':'square')).child(text(p.name))):
      h_flex().gap(px(8)).items_center().child(text(`${p.name}${p.required?' *':''}`).w(px(100)).truncate()).child(p.choices?
        menu(view,cx,'parameter-'+p.name,view.inputs[p.name].value()||'Choose…',p.choices.map(choice=>({label:choice,action:()=>{view.inputs[p.name].set_value(choice);view.saveForm();}})),p.name):field(view.inputs[p.name]))))
    .when(!task.id,e=>e.child(h_flex().gap(px(8)).items_center().child(text('Arguments',true).w(px(100))).child(field(view.inputs.$extra)))
      .child(text('Literal arguments · quote values containing spaces',true).text_size(uiMetrics().caption)))
    .child(settingsControls(view,cx,task.id||task.name,view.settingsFor(task),(patch,cx)=>view.setActionSettings(task,patch,cx),view.inputs.$peek))
    .when(Boolean(task.id),e=>e.child(button('edit-'+task.id,'Edit action',(_e,cx)=>view.editManual(task.id,cx))))
    .child(text(task.id?task.command:taskArgv(source,task).join(' '),true).text_size(uiMetrics().code).truncate()));
}
export function render(view,cx){return uiFrame(()=>renderContent(view,cx));}
function renderContent(view,cx) {
  const t=theme(),source=view.source(),query=view.search.value().toLowerCase();
  const index=terminalIndex(view.frameData?.terminals||terminals());
  const groups=groupTasks(source?.tasks||[],view.sourcePrefs().stars||[]);
  const matches=task=>!query||`${task.name} ${task.description}`.toLowerCase().includes(query);
  const primary=groups.primary.filter(matches),others=groups.others.filter(matches),showOthers=view.others||Boolean(query);
  const quick=view.launcherMode();
  const frame=v_flex().id('ciupaga-root').size_full().when(view.role==='popup',e=>e.h(px(520))).when(view.role==='sidebar',e=>e.border_1().border_color(t.border).rounded(px(8))).min_w(0).min_h(0).bg(t.background).text_color(t.foreground).text_size(uiMetrics().body).line_height(uiMetrics().lineHeight).track_focus(view.handle);
  const embedded=view.role==='pane'||view.role==='tab';
  const sourceChoice=view.sources.length>1?menu(view,cx,'sources',h_flex().gap(px(6)).items_center().child(text(source?.label||source?.file||'Source').truncate()).child(icon('chevron-down',12)),view.sources.map(s=>({label:s.label||s.file,action:cx=>view.selectSource(s.file,cx)})),'Choose task source'):text(source?.label||source?.file||'Tasks',true).truncate();
  return frame
    .when(!embedded,e=>e.child(h_flex().h(px(44)).flex_none().px(px(10)).gap(px(8)).items_center().border_b(1).border_color(t.border)
      .child(icon('ciupaga',19).text_color(t.muted))
      .child(text('Ciupaga').font_semibold().flex_none()).child(div().flex_1().max_w(px(200)).min_w(0).child(sourceChoice)).child(div().flex_1())
      .child(menu(view,cx,'presentation',icon('external-link'),[
        {label:'Move to sidebar',icon:'panel-right',action:cx=>view.present('sidebar',cx)},
        {label:'Open in new tab',icon:'app-window',action:cx=>view.present('tab',cx)},
        {label:'Open beside',icon:'columns-2',action:cx=>view.present('right',cx)},
        {label:'Open below',icon:'rows-2',action:cx=>view.present('down',cx)}
      ],'Choose where to show Ciupaga'))
      .child(button('refresh',icon('refresh-cw'),(_e,cx)=>view.reload(cx,true),{tip:'Refresh tasks',disabled:view.loading}).w(px(27)).px(0))))
    .child(h_flex().px(px(10)).py(px(7)).gap(px(6)).flex_none().items_center()
      .when(embedded,e=>e.child(div().flex_none().max_w(px(180)).min_w(0).child(sourceChoice)))
      .child(field(view.search))
      .child(button('add-custom','Add',(_e,cx)=>view.editManual(null,cx),{tip:'Add custom action'}))
      .when(embedded,e=>e.child(button('refresh',icon('refresh-cw'),(_e,cx)=>view.reload(cx,true),{tip:'Refresh tasks',disabled:view.loading}).w(px(27)).px(0))))
    .child(text(view.context?.folder?`${view.context.folder.replace(/\\/g,'/').split('/').filter(Boolean).at(-1)}${view.context.machine?' · '+view.context.machine:''}`:'Open a project space to see its tasks',true).px(px(12)).pb(px(7)).truncate().tooltip(view.context?.folder||''))
    .when(Boolean(view.message),e=>e.child(text(view.message).text_color(t.ansi1).px(px(12)).py(px(6))))
    .when(Boolean(source?.error),e=>e.child(text(source.error).text_color(t.ansi1).px(px(12)).py(px(6)).truncate().tooltip(source.error)))
    .when(Boolean(view.editor),e=>e.child(manualEditor(view,cx)))
    .when(!view.editor,e=>e.child(v_flex().flex_1().min_h(0).min_w(0).overflow_y_scrollbar().px(px(10)).pb(px(10)).gap(px(5))
      .when(view.loading&&!source,e=>e.child(text('Reading project tasks…',true).p(px(12))))
      .when(!view.loading&&!source,e=>e.child(v_flex().gap(px(8)).p(px(12)).child(text('No task files found',true)).child(text('Make · Just · Task · Mise · package.json · Composer · Deno',true))))
      .when(Boolean(source)&&!source.tasks.length&&!source.error,e=>e.child(text('No runnable tasks in this source.',true).p(px(12))))
      .when(Boolean(source),e=>e.children(primary.map(task=>taskRow(view,task,cx,source,index))))
      .when(Boolean(others.length),e=>e.child(button('others',h_flex().gap(px(6)).items_center().child(text(`Others · ${others.length}`,true)).child(icon(showOthers?'chevron-up':'chevron-down')),(_e,cx)=>{view.others=!view.others;cx.notify();},{tip:'Show or hide unstarred tasks'}).w_full()))
      .when(showOthers&&Boolean(source),e=>e.children(others.map(task=>taskRow(view,task,cx,source,index))))
      .when(Boolean(query)&&!primary.length&&!others.length,e=>e.child(text('No matching tasks.',true).p(px(12))))))
    .child(h_flex().min_h(px(29)).px(px(12)).py(px(6)).flex_none().gap(px(8)).items_center().border_t(1).border_color(t.border)
      .child(text(source?`${source.tasks.length} tasks${source.manager?' · '+source.manager:''}`:'Ciupaga',true).text_size(uiMetrics().caption))
      .child(div().flex_1())
      .child(button('launcher-quick',h_flex().gap(px(6)).items_center().child(icon(quick?'check':'square',12)).child(text('Quick run',true).text_size(uiMetrics().caption)),()=>{view.setLauncher(quick===false);},{tip:'Quick run lists custom actions and starred project tasks.'}).px(px(6))))
    .when(Boolean(source?.note),e=>e.child(text(source.note,true).text_size(uiMetrics().caption).px(px(12)).pb(px(8))));
}
export function outputView(view) {
  return v_flex().size_full().p(px(10)).gap(px(8)).bg(theme().background).child(text('Open the task output in a console.'))
    .child(button('native-console',h_flex().gap(px(6)).items_center().child(icon('square-terminal')).child('Open console'),(_e,cx)=>view.openOutput({name:view.options.taskName},{address:view.options.address},'tab',cx),{tip:'Open native console'}));
}
