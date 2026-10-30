const DAY=86400000,OFFSET=8*3600000;
export const EXAM_SESSIONS=Object.freeze([
 Object.freeze({date:'2026-11-14',label:'11月14日',weekday:'星期六'}),
 Object.freeze({date:'2026-12-27',label:'12月27日',weekday:'星期日'})
]);
const dayOf=date=>Math.floor(Date.parse(date+'T00:00:00Z')/DAY);
export function countdownState(timestamp,preferred){
 const today=Math.floor((timestamp+OFFSET)/DAY),available=EXAM_SESSIONS.filter(s=>dayOf(s.date)>=today);
 const selected=available.find(s=>s.date===preferred)||available[0]||null;
 return {selected,nearest:available[0]?.date||null,days:selected?dayOf(selected.date)-today:null,resetsAt:(today+1)*DAY-OFFSET,available:available.map(s=>s.date)};
}
let dispose=null;
export function disposeExamCountdown(){dispose?.();dispose=null}
export function mountExamCountdown(element,{serverTime=Date.now(),userId,syncTime}={}){
 disposeExamCountdown();let timer=null,closed=false,reference=serverTime,localReference=Date.now();
 const key='zhilan-exam-date-'+userId;let selected;try{selected=localStorage.getItem(key)}catch{}
 const currentTime=()=>reference+(Date.now()-localReference);
 const save=()=>{try{if(selected)localStorage.setItem(key,selected);else localStorage.removeItem(key)}catch{}};
 element.innerHTML=`<div class="exam-countdown-head"><span class="exam-eyebrow">考试倒计时</span><span class="exam-calendar" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 10h16m-11 4h1m4 0h1m-6 3h1"/></svg></span></div><div class="exam-count-label">距离考试还有</div><div class="exam-count-value" aria-live="polite" aria-atomic="true"><span class="exam-days"></span><span class="exam-day-unit">天</span></div><div class="exam-date-line"><time></time><span class="exam-date-dot" aria-hidden="true"></span><span class="exam-weekday"></span></div><div class="exam-session-tabs" role="group" aria-label="选择考试场次">${EXAM_SESSIONS.map(s=>`<button class="exam-session-tab" type="button" aria-pressed="false" data-exam-date="${s.date}">${s.label}<span class="exam-nearest"></span></button>`).join('')}</div>`;
 function render(){
  if(closed)return;clearTimeout(timer);const info=countdownState(currentTime(),selected);selected=info.selected?.date;save();
  element.querySelector('.exam-count-label').textContent=info.days===null?'本年度场次已结束':info.days===0?'今天考试':'距离考试还有';
  element.querySelector('.exam-days').textContent=info.days===null?'—':String(info.days);element.querySelector('.exam-day-unit').textContent=info.days===null?'':'天';
  const time=element.querySelector('time');time.textContent=info.selected?info.selected.date.replace(/^(\d+)-(\d+)-(\d+)$/,'$1年$2月$3日'):'等待新场次安排';if(info.selected)time.dateTime=info.selected.date;else time.removeAttribute('datetime');
  element.querySelector('.exam-weekday').textContent=info.selected?.weekday||'';element.querySelector('.exam-date-dot').hidden=!info.selected;
  element.querySelectorAll('[data-exam-date]').forEach(b=>{b.disabled=!info.available.includes(b.dataset.examDate);b.setAttribute('aria-pressed',String(b.dataset.examDate===selected));b.querySelector('.exam-nearest').textContent=b.dataset.examDate===info.nearest?'最近场次':''});
  timer=setTimeout(render,Math.max(100,info.resetsAt-currentTime()+50));
 }
 async function resume(){if(document.visibilityState!=='visible'||closed)return;try{if(syncTime){const time=await syncTime();if(closed)return;if(Number.isFinite(time)){reference=time;localReference=Date.now()}}}catch{}render()}
 element.querySelectorAll('[data-exam-date]').forEach(b=>b.onclick=()=>{selected=b.dataset.examDate;render()});
 document.addEventListener('visibilitychange',resume);window.addEventListener('focus',resume);
 dispose=()=>{closed=true;clearTimeout(timer);document.removeEventListener('visibilitychange',resume);window.removeEventListener('focus',resume)};
 render();
}
