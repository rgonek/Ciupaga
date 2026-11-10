import {div,svg} from 'gpui-kit';
import {h_flex,v_flex,Button,Toggle,Checkbox,Popover,Input} from 'gpui-base';
import {theme,terminals,settings} from 'herdr';
import {typography} from './typography.js';
import {groupTasks,taskArgv} from './model.js';
import {statusText,terminalIndex} from './runtime.js';

export function uiMetrics(){return typography(settings().ui_font_size,window.rem_size());}
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
export function taskMenu(view,cx) {
  const t=theme(),choices=view.launcherChoices(),current=view.launcherTask(),many=new Set(choices.map(item=>item.file)).size>1;
  return v_flex().id('ciupaga-menu').w_full().max_h(px(320)).bg(t.popover)
    .child(button('launcher-off',h_flex().gap(px(8)).items_center().w_full().child(icon('check',12)).child(text('Quick run')),(_e,cx)=>{view.setLauncher(false,cx);view.dismiss();},{tip:'The tab bar button opens Ciupaga again'}).w_full().justify_start())
    .child(div().h(px(1)).bg(t.border))
    .child(v_flex().flex_1().min_h(0).overflow_y_scrollbar().p(px(4)).gap(px(2))
      .when(!choices.length,e=>e.child(text(view.loading?'Reading tasks…':'No tasks',true).p(px(8))))
      .children(choices.map((item,i)=>button('pick-'+i,h_flex().gap(px(8)).items_center().w_full().min_w(0).child(icon(item.file===current?.file&&item.name===current?.name?'check':'square',12)).child(text(many?`${item.file} · ${item.name}`:item.name).truncate()),(_e,cx)=>{view.chooseLauncher(item,cx);},{tip:item.description||item.name}).w_full().justify_start())));
}
export function launcher(view,cx) {
  const bounds=(event)=>{view.buttonBounds=event.bounds;};
  const open=button('ciupaga-open',h_flex().gap(px(6)).items_center().child(icon('axe',17)).child('Ciupaga'),()=>view.openPopup(),{tip:'Ciupaga · run project tasks'}).on_mouse_down('left',bounds);
  if(!view.launcherMode())return open;
  const t=theme(),task=view.launcherTask(),choices=view.launcherChoices(),record=task?view.record(task):null,state=record?.state||'idle';
  const busy=['running','starting','cancelling'].includes(state),pending=state==='cancelling';
  const name=task?.name||(view.loading?'…':'Ciupaga');
  const tip=busy?`Cancel ${task.name}`:task?`Run ${task.name}`:'Ciupaga · run project tasks';
  const run=Button.new('ciupaga-run').h(px(28)).flex_1().min_w(0).px(px(6)).rounded(px(6)).items_center().justify_start().text_size(uiMetrics().control)
    .tab_index(0).accessibility_label(tip).tooltip(tip).disabled(pending).opacity(pending?0.45:1)
    .text_color(t.foreground).bg(t.surface).when(!pending,e=>e.cursor_pointer().hover(s=>s.bg(t.hover)).active(s=>s.bg(t.selected)))
    .on_mouse_down('left',bounds).on_click(()=>task?view.launchQuick(task):view.openPopup())
    .child(h_flex().flex_1().min_w(0).gap(px(6)).items_center().child(busy?icon('loader-circle',14).spin(900):icon('axe',15)).child(div().flex_1().min_w(0).truncate().text_size(uiMetrics().body).text_color(t.foreground).child(name)));
  const items=choices.map(item=>({label:item.name,icon:item.name===task?.name?'check':null,tip:item.description||`Run ${item.name}`,action:cx=>view.chooseLauncher(item,cx)}));
  const chevron=choices.length?menu(view,cx,'launcher',icon('chevron-down',12),items,'Choose a task'):button('ciupaga-tasks',icon('chevron-down',12),()=>view.openPopup(),{tip:'Open Ciupaga'}).w(px(24)).px(0).on_mouse_down('left',bounds);
  return h_flex().id('ciupaga-launcher').w_full().min_w(0).gap(px(2)).items_center().child(run).child(chevron);
}
function taskRow(view,task,cx,source,index) {
  const t=theme(),record=view.record(task,index),state=record.state;
  const starred=(view.sourcePrefs().stars||[]).includes(task.name),expanded=view.detail?.name===task.name;
  const busy=['running','starting','cancelling'].includes(state),pending=state==='cancelling';
  const color=state==='running'?t.working:state==='succeeded'?t.done:['failed','error'].includes(state)?t.ansi1:t.dim;
  const open=record.terminal&&view.consolePane(record.terminal.address);
  const consoleItems=[{label:open?'Focus console':'Open in new tab',icon:'app-window',action:cx=>view.console(task,'tab',cx)}];
  if(!open) {
    consoleItems.push({label:'Open beside',icon:'columns-2',action:cx=>view.console(task,'right',cx)});
    consoleItems.push({label:'Open above',icon:'rows-2',action:cx=>view.console(task,'up',cx)});
    consoleItems.push({label:'Open below',icon:'rows-2',action:cx=>view.console(task,'down',cx)});
  } else consoleItems.push({label:record.terminal.state==='live'?'Hide console · keep running':'Close console',icon:'panel-right',action:cx=>view.console(task,'hide',cx)});
  const row=v_flex().flex_none().rounded(px(7)).border_1().border_color(expanded?t.input:t.border).bg(t.surface)
    .child(h_flex().min_h(px(57)).px(px(6)).gap(px(6)).items_center()
      .child(div().id('star-tip-'+task.name).flex_none().tooltip(starred?'Unstar task':'Star task')
        .child(Toggle.new('star-'+task.name).pressed(starred).w(px(26)).h(px(28)).flex_none().rounded(px(5)).cursor_pointer().tab_index(0)
          .accessibility_label(`${starred?'Unstar':'Star'} ${task.name}`).text_color(starred?t.ansi3:t.dim)
          .hover(e=>e.bg(t.hover)).on_change((_pressed,cx)=>view.toggleStar(task,cx)).child(icon('star').when(starred,e=>e.opacity(1)).when(!starred,e=>e.opacity(0.55)))))
      .child(v_flex().flex_1().min_w(0).gap(px(2)).id('task-detail-'+task.name).cursor_pointer().tooltip(task.description||task.name)
        .on_click((_e,cx)=>view.showDetail(task,cx))
        .child(text(task.name).font_semibold().truncate())
        .child(text(state==='idle'?(task.description||'Ready'):statusText(state,record.terminal),true).text_size(uiMetrics().caption).text_color(color).truncate()))
      .when(Boolean(record.terminal),e=>e.child(menu(view,cx,'console-'+task.name,icon('square-terminal'),consoleItems,'Console placement and output')))
      .child(button('options-'+task.name,icon('ellipsis'),(_e,cx)=>view.showDetail(task,cx),{tip:'Arguments and task details'}).w(px(26)).px(0))
      .child(button('run-'+task.name,busy?h_flex().gap(px(5)).items_center().child(icon('loader-circle',12).spin(900)).child(pending?'Stopping':'Cancel'):'Run',(_e,cx)=>busy?view.cancel(task,cx):view.start(task,cx),{primary:!busy,disabled:pending||Boolean(source.error),tip:busy?`Cancel ${task.name}`:`Run ${task.name}`}).w(px(busy?82:59))));
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
    .child(h_flex().gap(px(8)).items_center().child(text('Arguments',true).w(px(100))).child(field(view.inputs.$extra)))
    .child(text('Literal arguments · quote values containing spaces',true).text_size(uiMetrics().caption))
    .child(text(taskArgv(source,task).join(' '),true).text_size(uiMetrics().code).truncate()));
}
export function render(view,cx) {
  const t=theme(),source=view.source(),query=view.search.value().toLowerCase();
  const index=terminalIndex(terminals());
  const groups=groupTasks(source?.tasks||[],view.sourcePrefs().stars||[]);
  const matches=task=>!query||`${task.name} ${task.description}`.toLowerCase().includes(query);
  const primary=groups.primary.filter(matches),others=groups.others.filter(matches),showOthers=view.others||Boolean(query);
  const quick=view.launcherMode();
  const frame=v_flex().id('ciupaga-root').size_full().when(view.role==='sidebar',e=>e.border_1().border_color(t.border).rounded(px(8))).min_w(0).min_h(0).bg(t.background).text_color(t.foreground).text_size(uiMetrics().body).line_height(uiMetrics().lineHeight).track_focus(view.handle);
  const embedded=view.role==='pane'||view.role==='tab';
  const sourceChoice=view.sources.length>1?menu(view,cx,'sources',h_flex().gap(px(6)).items_center().child(text(source?.file||'Source').truncate()).child(icon('chevron-down',12)),view.sources.map(s=>({label:s.file,action:cx=>view.selectSource(s.file,cx)})),'Choose task source'):text(source?.file||'Tasks',true).truncate();
  return frame
    .when(!embedded,e=>e.child(h_flex().h(px(44)).flex_none().px(px(10)).gap(px(8)).items_center().border_b(1).border_color(t.border)
      .child(icon('axe',19).text_color(t.muted))
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
      .when(embedded,e=>e.child(button('refresh',icon('refresh-cw'),(_e,cx)=>view.reload(cx,true),{tip:'Refresh tasks',disabled:view.loading}).w(px(27)).px(0))))
    .child(text(view.context?.folder?`${view.context.folder.replace(/\\/g,'/').split('/').filter(Boolean).at(-1)}${view.context.machine?' · '+view.context.machine:''}`:'Open a project space to see its tasks',true).px(px(12)).pb(px(7)).truncate().tooltip(view.context?.folder||''))
    .when(Boolean(view.message),e=>e.child(text(view.message).text_color(t.ansi1).px(px(12)).py(px(6))))
    .when(Boolean(source?.error),e=>e.child(text(source.error).text_color(t.ansi1).px(px(12)).py(px(6)).truncate().tooltip(source.error)))
    .child(v_flex().flex_1().min_h(0).min_w(0).overflow_y_scrollbar().px(px(10)).pb(px(10)).gap(px(5))
      .when(view.loading&&!source,e=>e.child(text('Reading project tasks…',true).p(px(12))))
      .when(!view.loading&&!source,e=>e.child(v_flex().gap(px(8)).p(px(12)).child(text('No task files found',true)).child(text('Make · Just · Task · Mise · package.json · Composer · Deno',true))))
      .when(Boolean(source)&&!source.tasks.length&&!source.error,e=>e.child(text('No runnable tasks in this source.',true).p(px(12))))
      .when(Boolean(source),e=>e.children(primary.map(task=>taskRow(view,task,cx,source,index))))
      .when(Boolean(others.length),e=>e.child(button('others',h_flex().gap(px(6)).items_center().child(text(`Others · ${others.length}`,true)).child(icon(showOthers?'chevron-up':'chevron-down')),(_e,cx)=>{view.others=!view.others;cx.notify();},{tip:'Show or hide unstarred tasks'}).w_full()))
      .when(showOthers&&Boolean(source),e=>e.children(others.map(task=>taskRow(view,task,cx,source,index))))
      .when(Boolean(query)&&!primary.length&&!others.length,e=>e.child(text('No matching tasks.',true).p(px(12)))))
    .child(h_flex().min_h(px(29)).px(px(12)).py(px(6)).flex_none().gap(px(8)).items_center().border_t(1).border_color(t.border)
      .child(text(source?`${source.tasks.length} tasks${source.manager?' · '+source.manager:''}`:'Ciupaga',true).text_size(uiMetrics().caption))
      .child(div().flex_1())
      .child(button('launcher-quick',h_flex().gap(px(6)).items_center().child(icon(quick?'check':'square',12)).child(text('Quick run',true).text_size(uiMetrics().caption)),()=>{view.setLauncher(quick===false);},{tip:'The tab bar button runs this task. The arrow lists starred tasks, or every task when none are starred.'}).px(px(6))))
    .when(Boolean(source?.note),e=>e.child(text(source.note,true).text_size(uiMetrics().caption).px(px(12)).pb(px(8))));
}
export function outputView(view) {
  return v_flex().size_full().p(px(10)).gap(px(8)).bg(theme().background).child(text('Open the task output in a console.'))
    .child(button('native-console',h_flex().gap(px(6)).items_center().child(icon('square-terminal')).child('Open console'),(_e,cx)=>view.openOutput({name:view.options.taskName},{address:view.options.address},'tab',cx),{tip:'Open native console'}));
}
