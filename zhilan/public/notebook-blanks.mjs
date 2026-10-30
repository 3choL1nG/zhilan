// Decorations only: placeholders and answers remain plain code in the editor.
export function blankRanges(source){
 const ranges=[];for(const match of source.matchAll(/(?<![\p{L}\p{N}_])_{3,}(?![\p{L}\p{N}_])/gu)){
  const start=source.lastIndexOf('\n',match.index-1)+1;if(source.slice(start,match.index).trimStart().startsWith('#'))continue;
  ranges.push({id:ranges.length,from:match.index,to:match.index+match[0].length});
 }return ranges;
}
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function restoreBlankRanges(template,code,saved){
 const original=blankRanges(template);
 if(Array.isArray(saved)&&saved.length&&saved.every(f=>Number.isInteger(f.id)&&f.id>=0&&f.id<original.length&&Number.isInteger(f.from)&&Number.isInteger(f.to)&&f.from>=0&&f.to>=f.from&&f.to<=code.length)&&new Set(saved.map(f=>f.id)).size===saved.length)return saved;
 if(!original.length)return [];
 let pattern='^',offset=0;for(const r of original){pattern+=escape(template.slice(offset,r.from))+'([\\s\\S]*?)';offset=r.to}pattern+=escape(template.slice(offset))+'$';
 const match=new RegExp(pattern,'d').exec(code);if(match)return original.map((r,i)=>({id:r.id,from:match.indices[i+1][0],to:match.indices[i+1][1]}));
 return blankRanges(code).map((r,i)=>({...r,id:Math.min(i,original.length-1)})).slice(0,original.length);
}
export function attachNotebookBlanks({editors,templates,saved=[],root,nav,onChange=()=>{}}){
 let fields=[],active=null,disposed=false;const cleanups=[];
 const missing=value=>!value.trim()||/^_{3,}$/.test(value.trim());
 function position(field){return field.marker.find()}
 function value(field){const pos=position(field);return pos?field.editor.getRange(pos.from,pos.to):''}
 function current(){return fields.filter(position).sort((a,b)=>a.cell-b.cell||a.editor.indexFromPos(position(a).from)-b.editor.indexFromPos(position(b).from))}
 function focus(field){
  if(!field)return;const pos=position(field);if(!pos)return;active=field;field.decoration?.clear();field.decoration=null;
  field.editor.focus();field.editor.setSelection(pos.from,pos.to);field.editor.scrollIntoView({from:pos.from,to:pos.to},65);
  const node=field.editor.getWrapperElement(),box=node.getBoundingClientRect();if(box.top<90||box.bottom>window.innerHeight-90)node.scrollIntoView({block:'center',behavior:'instant'});
 }
 function move(direction,keyboard=false){
  const all=current();if(!all.length)return;const at=all.indexOf(active);
  if(keyboard&&(direction>0&&at===all.length-1||direction<0&&at===0)){const cell=active.cell;active=null;root.querySelector(`[data-run-cell="${cell}"]`)?.focus();refresh();return}
  const target=at<0?(direction>0?all.find(f=>missing(value(f)))||all[0]:all[all.length-1]):all[(at+direction+all.length)%all.length];focus(target);
 }
 function refresh(){
  if(disposed)return;const all=current(),done=all.filter(f=>!missing(value(f))).length;
  nav.hidden=!all.length;nav.querySelector('[data-blank-progress]').textContent=`已填写 ${done} / ${all.length} 空`;
  for(let cell=0;cell<editors.length;cell++){const own=all.filter(f=>f.cell===cell),bar=root.querySelector(`[data-cell-blanks="${cell}"]`);if(bar){bar.hidden=!own.length;bar.querySelector('[data-cell-progress]').textContent=`已填写 ${own.filter(f=>!missing(value(f))).length} / ${own.length} 空`}}
  for(const field of all){
   const pos=position(field),empty=missing(value(field));if(!empty){field.decoration?.clear();field.decoration=null;continue}
   if(field===active&&field.editor.hasFocus())continue;if(field.decoration)continue;
   const widget=document.createElement('span');widget.className='notebook-blank';widget.tabIndex=0;widget.setAttribute('role','button');widget.setAttribute('aria-label',`填写代码单元${field.cell+1}第${field.id+1}空`);widget.textContent='填写代码';widget.title='点击直接填写，Tab跳到下一空';
   widget.addEventListener('mousedown',e=>{e.preventDefault();focus(field)});widget.addEventListener('click',e=>{e.preventDefault();focus(field)});widget.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();focus(field)}});
   field.decoration=pos.from.line===pos.to.line&&pos.from.ch===pos.to.ch?field.editor.setBookmark(pos.from,{widget,insertLeft:true}):field.editor.markText(pos.from,pos.to,{replacedWith:widget,clearWhenEmpty:false});
  }
 }
 editors.forEach((editor,cell)=>{
  const code=editor.getValue(),ranges=restoreBlankRanges(templates[cell],code,saved[cell]);
  ranges.forEach(r=>{const marker=editor.markText(editor.posFromIndex(r.from),editor.posFromIndex(r.to),{clearWhenEmpty:false,inclusiveLeft:true,inclusiveRight:true,className:'cm-notebook-field'});fields.push({cell,id:r.id,editor,marker,decoration:null})});
  const changed=()=>{refresh();onChange()},cursor=()=>{const pos=editor.getCursor(),inside=f=>{const p=position(f);return p&&editor.indexFromPos(pos)>=editor.indexFromPos(p.from)&&editor.indexFromPos(pos)<=editor.indexFromPos(p.to)};active=fields.find(f=>f.editor===editor&&inside(f))||null;refresh()};
  const keymap={Tab:cm=>{if(active?.editor===cm){move(1,true);return}return CodeMirror.Pass},'Shift-Tab':cm=>{if(active?.editor===cm){move(-1,true);return}return CodeMirror.Pass},Esc:cm=>{active=null;root.querySelector(`[data-run-cell="${cell}"]`)?.focus();refresh()}};
  editor.on('change',changed);editor.on('cursorActivity',cursor);editor.addKeyMap(keymap);cleanups.push(()=>{editor.off('change',changed);editor.off('cursorActivity',cursor);editor.removeKeyMap(keymap)});
 });
 nav.querySelector('[data-blank-prev]').onclick=()=>move(-1);nav.querySelector('[data-blank-next]').onclick=()=>move(1);
 root.querySelectorAll('[data-cell-blanks]').forEach(bar=>{bar.querySelector('[data-cell-prev]').onclick=()=>{if(active?.cell!==Number(bar.dataset.cellBlanks))active=current().find(f=>f.cell===Number(bar.dataset.cellBlanks));move(-1)};bar.querySelector('[data-cell-next]').onclick=()=>{if(active?.cell!==Number(bar.dataset.cellBlanks)){focus(current().find(f=>f.cell===Number(bar.dataset.cellBlanks)));return}move(1)}});
 refresh();return {
  snapshot:()=>editors.map((editor,cell)=>current().filter(f=>f.cell===cell).map(f=>{const p=position(f);return {id:f.id,from:editor.indexFromPos(p.from),to:editor.indexFromPos(p.to)}})),
  firstMissing(cells){const f=current().find(f=>cells.includes(f.cell)&&missing(value(f)));if(f){focus(f);return f.cell}return null},
  dispose(){disposed=true;cleanups.forEach(fn=>fn());fields.forEach(f=>{f.decoration?.clear();f.marker.clear()});fields=[]}
 };
}
