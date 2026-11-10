export function normalizePeek(text,lines){
  if(!lines)return '';
  return String(text||'').replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g,'').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').replace(/\r\n/g,'\n').split('\n').map(line=>line.split('\r').at(-1).replace(/[\x00-\x08\x0b-\x1f\x7f]/g,'').trimEnd()).join('\n').trimEnd().split('\n').slice(-Math.min(50,lines)).join('\n');
}
// Share the coordinator across visible copies; never retain view contexts here.
export class PeekCoordinator {
  constructor(limit=100){this.entries=new Map();this.limit=limit;}
  read(key,{lines,finished=false},loader,now=Date.now()){
    if(!lines)return Promise.resolve({text:''});
    let entry=this.entries.get(key);
    if(entry?.promise)return entry.promise.then(()=>this.snapshot(entry,lines));
    if(entry&&entry.lines>=lines&&((entry.finished&&finished)||now-entry.at<1000))return Promise.resolve(this.snapshot(entry,lines));
    if(!entry){entry={};this.entries.set(key,entry);}
    entry.at=now;entry.lines=lines;
    // Invoke loader synchronously to reserve a single pending request before returning.
    let pending;try{pending=loader();}catch(error){pending=Promise.reject(error);}
    entry.promise=Promise.resolve(pending).then(raw=>{entry.raw=raw;entry.unavailable=false;entry.finished=finished;},()=>{entry.unavailable=true;entry.finished=false;}).finally(()=>{
      entry.promise=null;
      for(const [old,value] of this.entries){if(this.entries.size<=this.limit)break;if(!value.promise)this.entries.delete(old);}
    }).then(()=>this.snapshot(entry,lines));
    return entry.promise;
  }
  snapshot(entry,lines){return {text:normalizePeek(entry.raw,lines),unavailable:Boolean(entry.unavailable)};}
}
