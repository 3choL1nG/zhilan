import {randomUUID} from 'node:crypto';
import {db,now,transaction} from './db.mjs';
import {theory,theoryMap,learningTheoryMap,safeTheory,sample,theoryAnswer,bankVersion} from './bank.mjs';
import {updateProgress} from './attempts.mjs';

const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const contexts=new Set(['regular','wrong','favorite','daily']);
const getRow=(uid,context)=>db.prepare('SELECT * FROM theory_sessions WHERE user_id=? AND context=?').get(uid,context);
function read(uid,context,id){
 if(!contexts.has(context))fail('练习类型无效');
 const row=getRow(uid,context);
 if(!row||row.id!==id)fail('练习已更新，请重新打开页面',409);
 const state=JSON.parse(row.state);
 if(state.bankVersion!==bankVersion)fail('题库已更新，请重新打开练习',409);
 return state;
}
function write(uid,context,id,state){db.prepare('INSERT INTO theory_sessions(user_id,context,id,state,updated) VALUES(?,?,?,?,?) ON CONFLICT(user_id,context) DO UPDATE SET id=excluded.id,state=excluded.state,updated=excluded.updated').run(uid,context,id,JSON.stringify(state),now())}
function output(context,id,state){return {context,id,...state,questions:state.ids.map(id=>safeTheory(learningTheoryMap.get(id))),completed:state.ids.filter(id=>state.answers[id]?.result).length,total:state.ids.length}}
export function practiceSummary(uid){return Object.fromEntries(db.prepare('SELECT context,state FROM theory_sessions WHERE user_id=?').all(uid).map(r=>{const s=JSON.parse(r.state);return [r.context,{completed:s.ids.filter(id=>s.answers[id]?.result).length,total:s.ids.length}]}))}
export function openTheoryPractice(uid,data={}){return transaction(()=>{
 const context=data.context||'regular';if(!contexts.has(context))fail('练习类型无效');
 const row=getRow(uid,context);let s=row?JSON.parse(row.state):null;
 const previous=!row&&context==='regular'?db.prepare('SELECT question_id FROM progress WHERE user_id=? AND seen>0 ORDER BY updated DESC').all(uid).map(r=>theoryMap.get(r.question_id)).find(Boolean):null;
 const type=data.type??s?.type??previous?.type??'s',search=data.search??s?.search??'';
 if(!['j','s','m'].includes(type)||typeof search!=='string'||search.length>100)fail('筛选条件无效');
 if(data.restart&&context==='daily'&&s&&s.ids.some(id=>!s.answers[id]?.result))fail('请先完成当前50题',409);
 const reset=!s||s.bankVersion!==bankVersion||data.restart||context!=='daily'&&(type!==s.type||search!==s.search||data.startId&&!s.ids.includes(data.startId));
 let id=row?.id;
 if(reset){
  let ids;
  if(context==='daily'){
   const wrong=new Set(db.prepare('SELECT question_id FROM progress WHERE user_id=? AND wrong=1').all(uid).map(r=>r.question_id));
   const priority=theory.filter(q=>wrong.has(q.id));const selected=sample(priority,Math.min(50,priority.length));
   const seen=new Set(selected.map(q=>q.id));ids=sample([...selected,...sample(theory.filter(q=>!seen.has(q.id)),50-selected.length)],50).map(q=>q.id);
  }else{
   let qs=(context==='regular'?theory:[...learningTheoryMap.values()]).filter(q=>q.type===type&&q.question.includes(search));
   if(context!=='regular'){const selected=new Set(db.prepare(`SELECT question_id FROM progress WHERE user_id=? AND ${context==='wrong'?'wrong':'favorite'}=1`).all(uid).map(r=>r.question_id));qs=qs.filter(q=>selected.has(q.id))}
   ids=qs.map(q=>q.id);
  }
  const at=previous&&data.type===undefined&&data.search===undefined?ids.indexOf(previous.id):-1;
  s={bankVersion,ids,type,search,index:at>=0?Math.min(at+1,ids.length-1):0,answers:{},created:now()};id=randomUUID();
 }
 if(data.startId){const at=s.ids.indexOf(data.startId);if(at<0)fail('题目不在当前练习中',404);s.index=at}
 write(uid,context,id,s);return output(context,id,s);
})}
export function updateTheoryPractice(uid,data){return transaction(()=>{
 const s=read(uid,data.context,data.id);
 if(data.index!==undefined){if(!Number.isInteger(data.index)||data.index<0||data.index>=s.ids.length)fail('题目位置无效');s.index=data.index}
 if(data.questionId!==undefined){if(!s.ids.includes(data.questionId))fail('题目不在当前练习中');if(!s.answers[data.questionId]?.result)s.answers[data.questionId]={answer:selection(learningTheoryMap.get(data.questionId),data.answer)}}
 write(uid,data.context,data.id,s);return {ok:true};
})}
function selection(q,answer){const values=Array.isArray(answer)?answer:[answer],options=q.type==='j'?['T','F']:Object.keys(q.options);if(values.length>options.length||values.some(v=>typeof v!=='string'||!options.includes(v))||new Set(values).size!==values.length||q.type!=='m'&&values.length>1)fail('所选答案无效');return q.type==='m'?values:values[0]??null}
export function submitTheoryPractice(uid,data){return transaction(()=>{
 const q=learningTheoryMap.get(data.id);if(!q)fail('题目不存在');
 const s=data.sessionId?read(uid,data.context,data.sessionId):null;
 if(s&&!s.ids.includes(q.id))fail('题目不在当前练习中');
 if(s?.answers[q.id]?.result)return s.answers[q.id].result;
 const answer=s?selection(q,data.answer):data.answer;if(s&&(answer===null||Array.isArray(answer)&&!answer.length))fail('请先选择答案');
 const correct=theoryAnswer(q,answer),id=randomUUID(),result={correct,answer:q.answer,explanation:q.explanation||null,attemptId:id};
 updateProgress(uid,q.id,correct,answer);
 db.prepare('INSERT INTO attempts(id,user_id,kind,mode,status,started,snapshot,answers,score,auto_score,self_score,finished) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,uid,'theory','practice','submitted',now(),JSON.stringify({bankVersion,questions:[{...q,points:1}]}),JSON.stringify({[q.id]:answer}),correct?1:0,correct?1:0,0,now());
 if(s){s.answers[q.id]={answer,result};const at=s.ids.indexOf(q.id);const next=s.ids.findIndex((id,i)=>i>at&&!s.answers[id]?.result);const first=s.ids.findIndex(id=>!s.answers[id]?.result);s.index=next>=0?next:first>=0?first:at;write(uid,data.context,data.sessionId,s)}
 return result;
})}
