import {state,$,$$,esc,api,dialog,toast,busy} from './api.mjs';
let generation=0,pending=Promise.resolve(),saveError=null,dayTimer=null,removeDayListener=null;
export function disposeTheoryPractice(){generation++;clearTimeout(dayTimer);removeDayListener?.();removeDayListener=null;document.body.classList.remove('theory-practice')}
export async function mountTheoryPractice({context='regular',startId,type,route}){
 const token=++generation;let session,refreshingDay=false;
 const alive=()=>token===generation;
 const title=()=>context==='daily'?'每日50题':context==='wrong'?'错题重练':context==='favorite'?'收藏练习':'理论练习';
 const error=e=>{if(alive()&&$('#practice-error'))$('#practice-error').textContent=e.message};
 async function load(options={}){await pending;const data=await api('/theory/session','POST',{context,...options});if(!alive())return;session=data;saveError=null;document.body.classList.add('theory-practice');render();scheduleDay()}
 async function refreshDay(){if(!alive()||refreshingDay)return;refreshingDay=true;try{const before=session?.id;await load();if(alive()&&before!==session.id){if($('#dialog').open)$('#dialog').close();toast('每日50题已更新','今天是判断20题、单选20题、多选10题。');focusQuestion()}}catch(e){error(e);if(alive())dayTimer=setTimeout(refreshDay,5000)}finally{refreshingDay=false}}
 function scheduleDay(){clearTimeout(dayTimer);removeDayListener?.();removeDayListener=null;if(context!=='daily')return;const deadline=Date.now()+Math.max(0,session.resetsAt-session.serverTime),check=()=>{if(document.visibilityState==='visible'&&Date.now()>=deadline)void refreshDay()};document.addEventListener('visibilitychange',check);window.addEventListener('focus',check);removeDayListener=()=>{document.removeEventListener('visibilitychange',check);window.removeEventListener('focus',check)};dayTimer=setTimeout(refreshDay,Math.max(100,deadline-Date.now()+50))}
 function persist(payload){const data={context,id:session.id,...payload};pending=pending.then(()=>api('/theory/session','PATCH',data)).then(()=>{saveError=null;if(alive()&&$('#practice-save'))$('#practice-save').textContent='进度已保存'},e=>{saveError=e;error(e);if(context==='daily'&&e.status===409)void refreshDay();if(alive()&&$('#practice-save'))$('#practice-save').textContent='保存未完成，请重试'});return pending}
 function focusQuestion(){const h=$('#practice-question');h?.focus({preventScroll:true});h?.scrollIntoView({block:'start',behavior:'instant'})}
 async function change(index){const workingId=session.id;await pending;if(saveError)throw saveError;await persist({index});if(saveError)throw saveError;if(!alive()||session.id!==workingId)return;session.index=index;render();focusQuestion()}
 function resultHtml(result){return `<div class="feedback" data-kind="${result.correct?'success':'error'}"><b>${result.correct?'回答正确':'回答有误'} · 标准答案 ${esc(result.answer)}</b>${result.explanation?'<p>'+esc(result.explanation)+'</p>':''}${result.correct?'':'<p>已加入错题本。</p>'}</div>`}
 function render(){
  if(!alive())return;
  const all=session.questions,index=session.index,q=all[index],complete=all.length>0&&all.every(q=>session.answers[q.id]?.result);
  const heading=`<div class="page-head"><div><div class="eyebrow">${title()}</div><h1>${title()}</h1><p>${all.length?`已完成 ${all.filter(q=>session.answers[q.id]?.result).length} / ${all.length} 题 · ${context==='daily'?'每天0点更新 · 判断20 / 单选20 / 多选10':'进度自动保存，下次继续'}`:'当前没有待练习的题目'}</p></div><button class="btn" id="practice-home">返回概览</button></div>`;
  const filter=context==='daily'?'':`<div class="toolbar practice-filters"><label>题型<select class="control" id="practice-type">${[['j','判断题'],['s','单选题'],['m','多选题']].map(([v,t])=>`<option value="${v}" ${session.type===v?'selected':''}>${t}</option>`).join('')}</select></label><label class="search">搜索题干<input class="control" id="practice-search" type="search" value="${esc(session.search)}" placeholder="输入知识点或题干"></label><button class="btn" id="practice-search-go">搜索</button></div>`;
  if(!q){$('#view').innerHTML=heading+filter+'<div class="card empty-state"><h2>没有找到题目</h2><p>可以更换题型或清空搜索条件。</p><button class="btn" id="practice-clear">查看全部题目</button></div>';bindFilters();$('#practice-clear').onclick=busy($('#practice-clear'),()=>load({search:'',type:'s',restart:true}));return}
  const saved=session.answers[q.id],result=saved?.result,selected=saved?.answer,opts=q.type==='j'?{T:'正确',F:'错误'}:q.options;
  const after=all.findIndex((v,i)=>i>index&&!session.answers[v.id]?.result),first=all.findIndex(v=>!session.answers[v.id]?.result);
  const next=after>=0?after:first>=0?first:index+1<all.length?index+1:-1;
  $('#view').innerHTML=heading+filter+`<div class="theory-grid"><article class="card question practice-question"><div class="question-meta"><span class="tag">${esc(q.type_label)}</span><span>第 ${index+1} / ${all.length} 题</span></div><h2 id="practice-question" tabindex="-1">${esc(q.question)}</h2><form id="practice-form"><div class="options" role="${q.type==='m'?'group':'radiogroup'}" aria-labelledby="practice-question">${Object.entries(opts).map(([key,value])=>`<label class="option ${result?.answer.includes(key)?'is-correct':result&&(Array.isArray(selected)?selected.includes(key):selected===key)?'is-wrong':''}"><input type="${q.type==='m'?'checkbox':'radio'}" name="practice-choice" value="${esc(key)}" ${(Array.isArray(selected)?selected.includes(key):selected===key)?'checked':''} ${result?'disabled':''}><b>${esc(key)}</b><span>${esc(value)}</span><span class="option-state">${result?.answer.includes(key)?'正确答案':''}</span></label>`).join('')}</div><div class="practice-secondary"><button type="button" class="textbtn" id="practice-favorite">收藏本题</button><button type="button" class="textbtn" id="practice-wrong">加入错题本</button><button type="button" class="textbtn" id="practice-card">答题卡</button></div><div id="practice-error" class="error" role="alert"></div><div id="practice-result" aria-live="polite">${result?resultHtml(result):''}</div><div class="practice-actions"><div class="practice-status" aria-live="polite"><strong>${result?`${result.correct?'回答正确':'回答有误'} · 答案 ${esc(result.answer)}`:q.type==='m'?'请选择全部正确选项':'请选择一个答案'}</strong><span id="practice-save">进度已保存</span></div><div class="practice-buttons"><button type="button" class="btn" id="practice-previous" ${index===0?'disabled':''}>上一题</button><button type="submit" class="btn primary" id="practice-primary">${!result?'提交答案':complete?(context==='daily'?'完成50题':'完成练习'):next>=0?'下一题 →':'完成练习'}</button></div></div></form></article><aside class="card answer-card"><div class="card-title"><h3>答题卡</h3><span class="small">${all.length}题</span></div><div class="answer-grid">${all.map((v,i)=>`<button data-practice-index="${i}" class="${i===index?'current':session.answers[v.id]?.result?'done':''}" aria-label="第${i+1}题${session.answers[v.id]?.result?'已作答':''}">${i+1}</button>`).join('')}</div><p class="hint">蓝色题号表示已作答，点击题号可回看本组题目。</p></aside></div>`;
  bindFilters();
  $$('input[name=practice-choice]').forEach(input=>input.onchange=()=>{const values=$$('input[name=practice-choice]:checked').map(i=>i.value),answer=q.type==='m'?values:values[0]??null;session.answers[q.id]={answer};$('#practice-save').textContent='正在保存…';persist({questionId:q.id,answer})});
  $('#practice-previous').onclick=busy($('#practice-previous'),()=>change(index-1));
  $$('[data-practice-index]').forEach(b=>b.onclick=busy(b,()=>change(Number(b.dataset.practiceIndex))));
  $('#practice-card').onclick=()=>{dialog('<h2>答题卡</h2><div class="answer-grid">'+all.map((v,i)=>`<button data-practice-jump="${i}" class="${i===index?'current':session.answers[v.id]?.result?'done':''}">${i+1}</button>`).join('')+'</div>');$$('[data-practice-jump]').forEach(b=>b.onclick=busy(b,async()=>{await change(Number(b.dataset.practiceJump));$('#dialog').close()}))};
  $('#practice-favorite').onclick=busy($('#practice-favorite'),async()=>{await api('/progress','PATCH',{id:q.id,favorite:true});if(alive())$('#practice-favorite').textContent='已收藏'});
  $('#practice-wrong').onclick=busy($('#practice-wrong'),async()=>{await api('/progress','PATCH',{id:q.id,wrong:true});toast('已加入错题本')});
  $('#practice-form').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{
   if(result){if(complete||next<0)return showComplete();await change(next);return}
   const values=$$('input[name=practice-choice]:checked').map(i=>i.value);if(!values.length)throw Error('请先选择答案');await pending;
   const workingId=session.id,answer=q.type==='m'?values:values[0],checked=await api('/theory/submit','POST',{id:q.id,answer,sessionId:workingId,context});
   if(!alive()||session.id!==workingId)return;
   session.answers[q.id]={answer,result:checked};saveError=null;
   if(alive()){render();$('#practice-primary')?.focus({preventScroll:true})}
  }catch(e){error(e);if(context==='daily'&&e.status===409)void refreshDay()}finally{if(button.isConnected)button.disabled=false}};
 }
 function bindFilters(){
  $('#practice-home').onclick=busy($('#practice-home'),async()=>{await pending;if(saveError)throw saveError;route('overview')});
  if(context==='daily')return;
  $('#practice-type').onchange=async e=>{try{await load({type:e.target.value,search:session.search})}catch(e){error(e);toast(e.message,'','err')}};
  $('#practice-search-go').onclick=busy($('#practice-search-go'),()=>load({search:$('#practice-search').value}));
  $('#practice-search').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#practice-search-go').click()}};
 }
 function showComplete(){
  const done=session.questions.filter(q=>session.answers[q.id]?.result),correct=done.filter(q=>session.answers[q.id].result.correct).length;
  dialog(`<h2>${context==='daily'?'每日50题已完成':'本组练习已完成'}</h2><p>已完成 ${done.length} 题，答对 ${correct} 题。错题已保存在错题本中。</p>${context==='daily'?'<p>今天的题组已完成，明日0点更新。</p>':''}<div class="dialog-actions"><button class="btn" id="practice-complete-home">返回概览</button><button class="btn primary" id="practice-new">${context==='daily'?'查看本组作答':'重新练习本组'}</button></div>`);
  $('#practice-complete-home').onclick=()=>{$('#dialog').close();route('overview')};
  $('#practice-new').onclick=busy($('#practice-new'),async()=>{if(context!=='daily')await load({restart:true});$('#dialog').close();focusQuestion()});
 }
 await load(startId?{startId,type}:{});
}
