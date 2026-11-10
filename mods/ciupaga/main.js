import {View,div} from 'gpui-kit';
import {InputState} from 'gpui-base';
import {focused,spaces,terminals,panes,theme,window,props,shared,setShared,exec,hc,readTextFile,run,layout,openOverlay,closeOverlay,nextCommand,notify} from 'herdr';
import {discover} from './discovery.js';
import {sourceKey,sourceIdentity,taskContext,taskKey,taskArgv,platformArgv,platformFromUname,collectArguments,migrateKeys,quickLaunchCatalog,quickLaunchPick,argumentsReady} from './model.js';
import {contextFrom,launchArgs,reserveRun,resolveRecord,viewAction,consoleDestination} from './runtime.js';
import {render,launcher,outputView,launchView,taskMenu,uiMetrics} from './ui.js';
import {cacheKey,metadataContext,sessionServices} from './cache.js';
import {MANUAL_FILE,manualActionsFor,actionSettings,actionIdentity,manualArgv,manualContext,validateManualAction,launcherPreferenceKey} from './actions.js';

const PREFS='ciupaga.v1.preferences',RUNS='ciupaga.v1.runs',FORMS='ciupaga.v1.forms',CACHE='ciupaga.v2.metadata',CONSOLES='ciupaga.v2.consoles',LAUNCH='ciupaga.v1.launch',LAUNCHER='ciupaga.v1.launcher';
const folderKey=folder=>String(folder||'').replace(/\\/g,'/').replace(/\/+$/,'').toLowerCase();
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2);

export default class Ciupaga extends View {
  init(initial,cx) {
    this.options=props()||initial||{};this.role=this.options.role||'popup';
    if(!shared('ciupaga.v2.keysMigrated')){for(const key of [PREFS,RUNS,FORMS])setShared(key,migrateKeys(shared(key)||{}));setShared('ciupaga.v2.keysMigrated',true);}
    this.context=null;this.discoveredSources=[];this.loading=false;this.message='';this.openMenu=null;this.detail=null;this.others=false;this.generation=0;this.inputs={};this.editorInputs={};this.services=sessionServices();
    if(this.role==='output')this.context=this.options.context||this.currentContext();
    this.search=InputState.new({placeholder:'Find a task…'});
    this.search.on('change',(_e,cx)=>cx.notify());
    this.handle=cx.focus_handle();this.menuFocus=cx.focus_handle();
    if(this.needsTasks())this.activate(cx);
    cx.timer.every(1000,cx=>{this.reconcile(cx);if(this.needsTasks())this.activate(cx);if(this.role==='button'){this.syncLauncher();cx.notify();}});
    if(this.role!=='output')cx.timer.every(200,cx=>{this.consumeLaunch(cx);this.publishLauncher();this.maybeLaunch(cx);});
    cx.spawn(async cx=>{for(;;){const command=await nextCommand();const name=typeof command==='string'?command:command.name;
      if(name==='focus')this.handle.focus();
      if(name==='open')this.openPopup();
      if(name==='refresh'&&this.role!=='button')this.reload(cx,true);
      if(name==='tab')this.present('tab',cx);
      if(name==='sidebar')this.present('sidebar',cx);
      if(name==='beside')this.present('right',cx);
      if(name==='below')this.present('down',cx);
      if(name==='sources')this.openMenu=this.openMenu==='sources'?null:'sources';
      if(name==='views')this.openMenu=this.openMenu==='presentation'?null:'presentation';
      const colon=name.indexOf(':');
      if(colon>0) {
        const action=name.slice(0,colon),value=name.slice(colon+1),task=this.source()?.tasks.find(t=>t.name===value);
        if(action==='source'&&this.sources.some(s=>s.file===value))this.selectSource(value,cx);
        if(task&&action==='run')this.start(task,cx);
        if(task&&action==='cancel')this.cancel(task,cx);
        if(task&&action==='star')this.toggleStar(task,cx);
        if(task&&action==='details')this.showDetail(task,cx);
        if(task&&action==='console')this.console(task,'tab',cx);
        if(task&&action==='console-right')this.console(task,'right',cx);
        if(task&&action==='console-up')this.console(task,'up',cx);
        if(task&&action==='console-down')this.console(task,'down',cx);
        if(task&&action==='hide-console')this.console(task,'hide',cx);
      }
      cx.notify();
    }});
  }
  close() {this.closed=true;this.search.release();for(const input of [...Object.values(this.inputs),...Object.values(this.editorInputs)])input.release();}
  currentContext(){return contextFrom(this.options,focused(),spaces());}
  activate(cx) {
    const context=this.currentContext();
    if(JSON.stringify(context)===JSON.stringify(this.requestContext))return;
    this.requestContext=context;
    this.context=context;this.discoveredSources=[];this.detail=null;this.loading=false;this.others=false;this.generation++;
    const cached=this.services.metadata.peek(cacheKey(context))||shared(CACHE)?.[cacheKey(context)];
    if(cached){this.seenCheckedAt=cached.checkedAt;this.services.metadata.seed(cacheKey(context),cached);this.applyMetadata(cached);}
    this.reload(cx);
  }
  async platform(context) {
    if(!context.machine)return window().platform;
    if(this.remotePlatform?.machine===context.machine)return this.remotePlatform.platform;
    let platform;
    try {const r=await exec('uname',['-s'],{on:context.machine});if(r.code!==0)throw new Error(r.stderr);platform=platformFromUname(r.stdout);}
    catch {const r=await exec('cmd.exe',['/d','/c','ver'],{on:context.machine});if(r.code!==0)throw new Error('Cannot determine the task machine platform');platform='windows';}
    this.remotePlatform={machine:context.machine,platform};return platform;
  }
  applyMetadata(value) {
    if(this.context?.folder!==value.context.folder){this.detail=null;this.others=false;}
    this.context=metadataContext(this.requestContext,value.context);this.discoveredSources=value.sources;this.platformName=value.platform;
    if(this.detail){const fresh=this.source()?.tasks.find(t=>t.name===this.detail.name);if(!fresh||JSON.stringify(fresh.parameters)!==JSON.stringify(this.detail.parameters))this.detail=null;else this.detail=fresh;}
  }
  reload(cx,force=false) {
    if(!this.context?.folder||this.loading)return;
    const request={...(this.requestContext||this.context)},key=cacheKey(request);
    const generation=++this.generation;this.loading=true;this.message='';
    cx.spawn(async cx=>{
      try {
        const value=await this.services.metadata.load(key,async(previous)=>{
        const now=Date.now();
        let context={...(previous&&!force?previous.context:request)};
        const platform=previous?.platform||await this.platform(context);
        const same=previous?.context.folder===context.folder;
        let sources=await discover(context,readTextFile,exec,platform,same?previous:null,{force,now});
        if(!sources.length) {
          if(!previous||force){
          try {
            const root=await exec('git',['rev-parse','--show-toplevel'],{cwd:context.folder,on:context.machine});
            const folder=root.stdout.trim();
            if(root.code===0&&folder&&folder.replace(/\\/g,'/')!==context.folder.replace(/\\/g,'/')) {
              const fallback={...context,folder};
              const found=await discover(fallback,readTextFile,exec,platform,previous?.context.folder===folder?previous:null,{force,now});
              if(found.length){sources=found;context=fallback;}
            }
          } catch {} // A folder without Git remains a valid task project.
          }
        }
        return {context,sources,platform,fingerprints:sources.fingerprints,packages:sources.packages};
        },Date.now(),force);
        if(shared(CACHE)?.[key]?.checkedAt!==value.checkedAt){const stored={...(shared(CACHE)||{}),[key]:{context:value.context,sources:value.sources,platform:value.platform,packages:value.packages,checkedAt:value.checkedAt}};const keys=Object.keys(stored).sort((a,b)=>stored[b].checkedAt-stored[a].checkedAt);setShared(CACHE,Object.fromEntries(keys.slice(0,12).map(k=>[k,stored[k]])));}
        if(generation!==this.generation)return;
        this.applyMetadata(value);this.seenCheckedAt=value.checkedAt;this.revealFocus(cx);this.maybeLaunch(cx);
      } catch(error) {if(generation===this.generation)this.message=String(error.message||error);}
      if(generation===this.generation){this.loading=false;cx.notify();}
    });
  }
  needsTasks(){return this.role==='output'?false:this.role!=='button'||this.launcherMode();}
  syncLauncher(){
    if(this.role!=='button'||!this.launcherMode()||!this.context?.folder)return;
    const cached=shared(CACHE)?.[cacheKey(this.context)];
    if(!cached||cached.checkedAt===this.seenCheckedAt)return;
    this.seenCheckedAt=cached.checkedAt;this.applyMetadata(cached);
  }
  prefs(){return shared(PREFS)||{};}
  get sources(){
    const tasks=manualActionsFor(this.prefs().manualActions||[],this.context||{}).map(action=>({...action,file:MANUAL_FILE,parameters:[]}));
    return [...(tasks.length?[{kind:'manual',file:MANUAL_FILE,label:'Custom actions',tasks}]:[]),...(this.discoveredSources||[])];
  }
  settingsFor(task){const saved=task.id?(this.prefs().manualActions||[]).find(a=>a.id===task.id)||task:this.prefs().actionSettings?.[this.formKey(task)]||{};try{return actionSettings(saved);}catch{return actionSettings({});}}
  setActionSettings(task,patch,cx){
    const value={...this.settingsFor(task),...patch};
    try{actionSettings(value);
      if(task.id){setShared(PREFS,{...this.prefs(),manualActions:(this.prefs().manualActions||[]).map(a=>a.id===task.id?{...a,...value}:a)});}
      else setShared(PREFS,{...this.prefs(),actionSettings:{...(this.prefs().actionSettings||{}),[this.formKey(task)]:value}});
      this.message='';
    }catch(error){this.message=error.message;}
    cx.notify();
  }
  editManual(id,cx){
    for(const input of Object.values(this.editorInputs))input.release();
    const action=(this.prefs().manualActions||[]).find(a=>a.id===id);
    this.editor={...(action||{id:uid(),scope:'space',shell:(this.platformName||window().platform)==='windows'?'powershell':'sh'}),space:action?.space||this.context?.space,machine:action?.machine||this.context?.machine||null};
    this.editorInputs={};
    for(const name of ['name','description','command','cwd']){const input=InputState.new({value:action?.[name]||'',placeholder:({name:'Action name',description:'Optional description',command:'Command interpreted by the selected shell',cwd:'Active space folder'})[name]});input.on('change',(_e,cx)=>cx.notify());this.editorInputs[name]=input;}
    this.message='';cx.notify();
  }
  closeEditor(cx){for(const input of Object.values(this.editorInputs))input.release();this.editorInputs={};this.editor=null;cx.notify();}
  saveManual(cx){
    try{
      const action=validateManualAction({...this.editor,...Object.fromEntries(Object.entries(this.editorInputs).map(([k,input])=>[k,input.value()]))});
      const actions=this.prefs().manualActions||[],exists=actions.some(a=>a.id===action.id);
      setShared(PREFS,{...this.prefs(),manualActions:exists?actions.map(a=>a.id===action.id?action:a):[...actions,action]});
      this.patchPrefs(this.contextKey(),{file:MANUAL_FILE});this.detail=null;this.message='';this.closeEditor(cx);
    }catch(error){this.message=error.message;cx.notify();}
  }
  deleteManual(id,cx){setShared(PREFS,{...this.prefs(),manualActions:(this.prefs().manualActions||[]).filter(a=>a.id!==id)});this.detail=null;this.closeEditor(cx);}
  launcherMode(){return this.prefs().launcher?.quick===true;}
  setLauncher(quick,cx){
    this.patchPrefs('launcher',{quick:Boolean(quick)});
    this.publishLauncher();
    if(cx)cx.notify();
  }
  launcherChoices(){return quickLaunchCatalog(this.sources||[],source=>this.prefs()[sourceIdentity(this.context,source)]?.stars||[]);}
  launcherTask(){
    const pin=this.prefs()[launcherPreferenceKey(this.context)]||this.prefs().launcher||{},choices=this.launcherChoices();
    if(pin.id)return choices.find(task=>task.id===pin.id)||choices[0]||null;
    if(pin.file||pin.task)return quickLaunchPick(choices,{file:pin.file,task:pin.task});
    for(const source of this.sources||[]){const name=this.prefs()[sourceIdentity(this.context,source)]?.launcher;const found=typeof name==='string'&&choices.find(task=>task.file===source.file&&task.name===name);if(found)return found;}
    return choices[0]||null;
  }
  sourceOf(task){return (task?.file&&this.sources.find(source=>source.file===task.file))||this.source();}
  chooseLauncher(task,cx){
    const source=this.sourceOf(task);if(!source)return;
    this.patchPrefs(launcherPreferenceKey(this.context),{file:source.file,task:task.name,id:task.id||null});
    this.openMenu=null;this.launchQuick({...task,file:source.file},cx);
  }
  launchQuick(task,cx){
    const state=this.record(task).state;
    if(state==='cancelling'){this.finishLaunch();return;}
    if(state==='starting'||state==='running'){this.cancel(task,cx);this.finishLaunch();return;}
    if(!argumentsReady(task,shared(FORMS)?.[this.formKey(task)]||{})){this.openPopup(task.name,task.file);this.finishLaunch();return;}
    this.start(task,cx,true);
  }
  // The tab bar button lives in another mod. It reads this snapshot and posts a launch request.
  publishLauncher(){
    if(this.role==='output'||!this.context)return;
    const task=this.launcherTask(),record=task?this.record(task):null;
    const snapshot={folder:this.context?.folder||'',space:this.context?.space,machine:this.context?.machine||null,quick:this.launcherMode(),task:task?.name||null,id:task?.id||null,icon:task?this.settingsFor(task).icon:'ciupaga',file:task?.file||null,state:record?.state||'idle',choices:this.launcherChoices().map(item=>({id:item.id||null,name:item.name,file:item.file,icon:this.settingsFor(item).icon,description:item.description||''}))};
    const prev=shared(LAUNCHER);
    if(JSON.stringify(prev)===JSON.stringify(snapshot))return;
    setShared(LAUNCHER,snapshot);
  }
  maybeLaunch(cx){
    if(this.role!=='launch'||this.launched)return;
    const task=this.launcherChoices().find(item=>this.options.id?item.id===this.options.id:item.name===this.options.task&&(!this.options.file||item.file===this.options.file));
    if(!task)return;
    this.launched=true;this.launchQuick(task,cx);
  }
  finishLaunch(){if(this.role==='menu'||this.role==='launch')this.dismiss();}
  consumeLaunch(cx){
    const request=shared(LAUNCH);
    if(!request||request.claimed||this.role==='launch'||this.role==='menu')return;
    if(Date.now()-request.at>5000){setShared(LAUNCH,{...request,claimed:true});return;}
    const folder=folderKey(this.context?.folder),want=folderKey(request.folder);
    if(!folder||(want&&folder!==want))return;
    if(request.space&&request.space!==this.context?.space)return;
    const task=this.launcherChoices().find(item=>request.id?item.id===request.id:item.name===request.task&&(!request.file||item.file===request.file));
    if(!task)return;
    setShared(LAUNCH,{...request,claimed:true});
    if(request.pin)this.chooseLauncher(task,cx);else this.launchQuick(task,cx);
  }
  revealFocus(cx){
    const name=this.options.focusTask;
    if(!name||this.revealed||this.role==='button'||this.role==='output')return;
    const source=this.options.focusFile&&this.sources.find(item=>item.file===this.options.focusFile);
    if(source&&this.source()?.file!==source.file)this.patchPrefs(this.contextKey(),{file:source.file});
    const task=(source||this.source())?.tasks.find(t=>t.name===name);if(!task)return;
    this.revealed=true;this.showDetail(task,cx);
  }
  contextKey(){return sourceKey(this.context||{},'');}
  source(){const file=this.prefs()[this.contextKey()]?.file;return this.sources.find(s=>s.file===file)||this.sources[0]||null;}
  sourcePrefs(){const s=this.source();return s?this.prefs()[sourceIdentity(this.context,s)]||{}:{};}
  patchPrefs(key,patch){setShared(PREFS,{...this.prefs(),[key]:{...this.prefs()[key],...patch}});}
  selectSource(file,cx){this.patchPrefs(this.contextKey(),{file});this.detail=null;this.openMenu=null;this.others=false;cx.notify();}
  toggleStar(task,cx){const stars=new Set(this.sourcePrefs().stars||[]);stars.has(task.name)?stars.delete(task.name):stars.add(task.name);this.patchPrefs(sourceIdentity(this.context,this.source()),{stars:[...stars]});cx.notify();}
  formKey(task){return actionIdentity(this.context,this.sourceOf(task),task);}
  showDetail(task,cx) {
    if(this.detail?.name===task.name){this.detail=null;cx.notify();return;}
    for(const input of Object.values(this.inputs))input.release();this.inputs={};this.detail=task;
    if(!(this.sourcePrefs().stars||[]).includes(task.name))this.others=true;
    const key=this.formKey(task),saved=shared(FORMS)?.[key]||{};
    this.flags=Object.fromEntries(task.parameters.filter(p=>p.boolean).map(p=>[p.name,saved.flags?.[p.name]??(saved[p.name]==='true'?true:saved[p.name]==='false'?false:Boolean(p.defaultBoolean))]));
    for(const p of [...task.parameters,{name:'$extra'}]) {
      if(p.boolean)continue;
      const input=InputState.new({value:saved[p.name]||'',placeholder:p.hint|| (p.required?'Required':'Optional')});
      input.on('change',(_e,cx)=>{this.saveForm(key);cx.notify();});
      input.on('submit',(_e,cx)=>this.start(task,cx));this.inputs[p.name]=input;
    }
    cx.notify();
  }
  saveForm(key=this.detail&&this.formKey(this.detail)) {
    if(!key)return;
    const values=Object.fromEntries(Object.entries(this.inputs).map(([name,input])=>[name,input.value()]));
    setShared(FORMS,{...(shared(FORMS)||{}),[key]:{...values,flags:this.flags||{}}});
  }
  record(task,index) {
    const key=this.formKey(task);return resolveRecord(key,shared(RUNS)?.[key],index||terminals());
  }
  patchRun(key,id,patch) {const all=shared(RUNS)||{};if(all[key]?.id===id)setShared(RUNS,{...all,[key]:{...all[key],...patch}});}
  start(task,cx,ready=false) {
    const current=this.record(task);
    if(['starting','running','cancelling'].includes(current.state))return;
    if(!ready&&task.parameters.some(p=>p.required)&&this.detail?.name!==task.name){if(this.role==='button')this.openPopup(task.name);else this.showDetail(task,cx);return;}
    const source={...this.sourceOf(task)},key=this.formKey(task),id=uid();
    let context;
    let argv;
    try {
      const saved=shared(FORMS)?.[key]||{};
      const args=collectArguments(task.parameters,{...saved,...(saved.flags||{})},saved.$extra||'');
      const space=spaces().find(s=>s.id===this.context?.space);
      context=source.kind==='manual'?manualContext(this.context,space,task):taskContext(this.context,source);
      argv=source.kind==='manual'?manualArgv(task,this.platformName||(!context.machine?window().platform:null)):platformArgv(taskArgv(source,task,args),this.platformName);
      const reserved=reserveRun(shared(RUNS)||{},key,id);
      Object.assign(reserved[key],{machine:context.machine,context,task:{...task,file:source.file},destination:consoleDestination(this.settingsFor(task).console,{...focused(),space:context.space})});
      setShared(RUNS,reserved);
    } catch(error) {this.message=String(error.message||error);cx.notify();return;}
    this.message='';cx.notify();
    cx.spawn(async cx=>{
      try {
        const result=await hc(launchArgs(context,key,id,argv));
        if(result.code!==0)throw new Error((result.stderr||result.stdout).trim()||'Could not start task');
        const started=JSON.parse(result.stdout),address=started.address||started.terminal?.address;
        this.patchRun(key,id,{phase:'launched',address});
        if(shared(RUNS)?.[key]?.cancel&&address)this.killOnce(id,address);
        if(!this.closed)this.reconcile(cx);
      } catch(error) {this.patchRun(key,id,{phase:'error',error:String(error.message||error)});}
      this.finishLaunch();cx.notify();
    });
  }
  cancel(task,cx) {
    const record=this.record(task);
    if(record.entry)this.patchRun(record.key,record.entry.id,{cancel:true});
    if(record.terminal)this.killOnce(record.entry?.id||record.terminal.address,record.terminal.address);
    cx.notify();
  }
  killOnce(id,address){const now=Date.now(),last=this.services.cancellations.get(id);if(last!=null&&now-last<5000)return;this.services.cancellations.set(id,now);run('terminal.kill',{terminal:address});}
  reconcile(cx) {
    // Recovers starts even if their popup closed before hc's response arrived.
    const live=new Map(terminals().filter(t=>t.labels?.['ciupaga.run']).map(t=>[t.labels['ciupaga.run'],t]));
    for(const [key,entry] of Object.entries(shared(RUNS)||{})) {
      const terminal=live.get(entry.id);
      const output=terminal||entry.final;
      if(output&&entry.destination&&!entry.consoleDone&&!entry.cancel&&!this.services.autoConsoles?.has(entry.id)){
        (this.services.autoConsoles??=new Set()).add(entry.id);
        try{this.console(entry.task,entry.destination.place,cx,{origin:entry.destination,context:entry.context,terminal:output,done:success=>{if(success)this.patchRun(key,entry.id,{consoleDone:true});this.services.autoConsoles.delete(entry.id);}});}
        catch(error){this.message=error.message;this.patchRun(key,entry.id,{consoleDone:true});this.services.autoConsoles.delete(entry.id);}
      }
      if(entry.final||entry.error)continue;
      if(terminal&&terminal.state!=='live'){this.patchRun(key,entry.id,{phase:'finished',final:terminal});continue;}
      if(terminal&&entry.cancel)this.killOnce(entry.id,terminal.address);
      if(terminal||this.services.checks.has(entry.id))continue;
      if(!entry.address&&Date.now()-entry.at<3000)continue;
      this.services.checks.add(entry.id);
      cx.spawn(async cx=>{
        try {
          let address=entry.address;
          if(!address) {
            const r=await exec('hc',['ls','--all','--json','--label',`ciupaga.run=${entry.id}`],{on:entry.machine});
            if(r.code!==0)throw new Error(r.stderr||'Cannot recover task');
            const candidate=JSON.parse(r.stdout).terminals?.[0];
            address=candidate?.address;
            if(address&&entry.machine&&!address.includes('/'))address=entry.machine+'/'+address;
            if(!address){if(Date.now()-entry.at>35000)this.patchRun(key,entry.id,{phase:'error',error:'Task did not appear in herdr-core. Refresh and try again.'});return;}
            this.patchRun(key,entry.id,{address,phase:'launched'});
          }
          const result=await hc(['get',address,'--json']);
          if(result.code!==0)throw new Error(result.stderr||'Task terminal is unavailable');
          const snapshot=JSON.parse(result.stdout);
          if(snapshot.labels?.['ciupaga.run']!==entry.id)throw new Error('Task terminal identity changed');
          if(snapshot.state!=='live')this.patchRun(key,entry.id,{phase:'finished',final:{...snapshot,address}});
          else if(entry.cancel)this.killOnce(entry.id,address);
        } catch(error) {this.patchRun(key,entry.id,{phase:'error',error:String(error.message||error)});}
        finally {this.services.checks.delete(entry.id);}
        cx.notify();
      });
    }
  }
  openPopup(focusTask,focusFile) {
    const bounds=this.buttonBounds,task=typeof focusTask==='string'?focusTask:undefined,file=typeof focusFile==='string'?focusFile:undefined;
    openOverlay({mod:'ciupaga',kind:'popup',width:uiMetrics().px(520),height:uiMetrics().px(520),props:{role:'popup',context:this.currentContext(),...(task?{focusTask:task}:{}),...(file?{focusFile:file}:{})},...(bounds?{at:{x:bounds.x,y:bounds.y+bounds.height+4}}:{})});
  }
  present(place,cx) {
    try {
      const action=viewAction(place,layout(),focused());
      if(action.name==='layout.show') {
        for(let i=0;i<action.path.length;i++) {
          const node=action.path[i];
          if(node.id&&node.hidden)run('layout.show',{id:node.id});
          if(node.id&&node.type==='stack'&&action.path[i+1]?.id)run('layout.select',{stack:node.id,child:action.path[i+1].id});
        }
        run(action.name,action.args);
      } else run(action.name,{...action.args,...(action.name==='tab.new'?{space:this.context.space}:{}),props:{role:place==='sidebar'?'sidebar':'pane',context:this.context}});
      if(this.options.overlay)closeOverlay(this.options.overlay);
    } catch(error) {this.message=String(error.message||error);cx.notify();}
  }
  console(task,place,cx,automatic) {
    const terminal=automatic?.terminal||this.record(task).terminal,context=automatic?.context||this.context;
    if(!terminal)return;
    this.openMenu=null;
    const existing=this.consolePane(terminal.address);
    if(place==='hide'){if(existing?.terminal===terminal.address)run('terminal.park',{terminal:terminal.address});else if(existing)run('pane.close',{pane:existing.pane});return;}
    if(existing){run('tab.select',{id:existing.tab});run('pane.focus',{pane:existing.pane});automatic?.done(true);this.dismiss();return;}
    const origin={...(automatic?.origin||focused())};
    if(automatic&&place!=='tab'&&!panes().some(p=>p.pane===origin.pane)){place='tab';this.message='Split unavailable; opened console in a new tab';}
    if(place!=='tab'&&!origin?.pane){this.message='Focus a terminal pane before opening a split';cx.notify();return;}
    if(terminal.state!=='live'){this.openOutput(task,terminal,place,cx,{...automatic,origin,context});return;}
    if(this.services.opening.has(terminal.address))return;
    this.services.opening.add(terminal.address);
    // terminal.keep uses the selected pane; select the captured destination synchronously.
    if(origin.space)run('space.select',{id:origin.space});
    if(place!=='tab'){if(origin.tab)run('tab.select',{id:origin.tab});run('pane.focus',{pane:origin.pane});}
    run('terminal.keep',{terminal:terminal.address,place:place==='up'?'down':place==='left'?'right':place});
    cx.spawn(async cx=>{
      try {for(let i=0;i<50;i++) {
        const pane=panes().find(p=>p.terminal===terminal.address);
        if(pane){
          if(place==='tab')run('tab.rename',{id:pane.tab,name:task.name});
          run('tab.select',{id:pane.tab});run('pane.focus',{pane:pane.pane});
          if(place==='up'||place==='left')run('pane.swap',{pane:pane.pane,direction:place});
          automatic?.done(true);this.dismiss();return;
        }
        await cx.sleep(100);
      }
      this.message='The console did not open. Try again.';automatic?.done(true);cx.notify();
      } catch(error){this.message=error.message;automatic?.done(true);cx.notify();}
      finally {this.services.opening.delete(terminal.address);}
    });
  }
  consolePane(address){const all=panes(),direct=all.find(p=>p.terminal===address),viewer=shared(CONSOLES)?.[address];return direct||all.find(p=>p.pane===viewer?.pane&&p.terminal===viewer?.terminal)||null;}
  openOutput(task,terminal,place,cx,automatic) {
    if(this.services.opening.has(terminal.address))return;
    const origin=automatic?.origin||focused(),context=automatic?.context||this.context,before=new Set(panes().map(p=>p.pane)),name=`Ciupaga ${uid()}`;
    const target=context?.machine?terminal.address.split('/').at(-1):terminal.address;
    const argv=['hc','read',target,'--lines','10000'];
    if(place==='tab')run('tab.new',{space:context?.space,folder:terminal.cwd||context?.folder,name,argv});
    else if(origin?.pane)run('pane.split',{argv,pane:origin.pane,direction:place==='right'||place==='left'?'right':'down'});
    else {notify({title:'Ciupaga',body:'Focus a terminal pane before opening a split'});return;}
    this.services.opening.add(terminal.address);
    cx.spawn(async cx=>{
      try {for(let attempt=0;attempt<50;attempt++) {
        const tab=place==='tab'?spaces().flatMap(s=>s.tabs).find(t=>t.name===name):null;
        const candidate=panes().find(p=>!before.has(p.pane)&&p.terminal&&(place==='tab'?p.tab===tab?.id:p.tab===origin.tab&&JSON.stringify(terminals().find(t=>t.address===p.terminal)?.argv||[]).includes(target)));
        if(candidate){
          setShared(CONSOLES,{...(shared(CONSOLES)||{}),[terminal.address]:{pane:candidate.pane,terminal:candidate.terminal}});
          if(place==='tab')run('tab.rename',{id:candidate.tab,name:task.name});
          run('tab.select',{id:candidate.tab});run('pane.focus',{pane:candidate.pane});
          if(place==='up'||place==='left')run('pane.swap',{pane:candidate.pane,direction:place});
          automatic?.done?.(true);this.dismiss();return;
        }
        await cx.sleep(100);
      }this.message='The console did not open. Try again.';automatic?.done?.(true);cx.notify();
      }catch(error){this.message=error.message;automatic?.done?.(true);cx.notify();}
      finally {this.services.opening.delete(terminal.address);}
    });
  }
  dismiss(){if(this.options.overlay)closeOverlay(this.options.overlay);}
  menuHandle(){return this.menuFocus;}
  render(cx) {
    if(this.role==='launch')return launchView(this);
    if(this.role==='menu')return taskMenu(this,cx);
    if(this.options.runner)return div().id('ciupaga-runner');
    if(this.role==='button')return launcher(this,cx);
    if(this.role==='output')return outputView(this,cx);
    return render(this,cx);
  }
}
