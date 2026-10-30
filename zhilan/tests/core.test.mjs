import {test,after} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'zhilan-test-'));process.env.NODE_ENV='test';
const {server}=await import('../src/server.mjs');const {db,createUser}=await import('../src/db.mjs');const {gradeCode,normalizeCode,createExam,examConfig}=await import('../src/bank.mjs');
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
after(()=>{server.close();db.close();fs.rmSync(process.env.DATA_DIR,{recursive:true,force:true})});
async function account(username,role='user'){const id=createUser(username,'Initial!12345',role);let cookie='',csrf='';async function call(url,method='GET',data){const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json',Cookie:cookie,'x-csrf-token':csrf},body:data?JSON.stringify(data):undefined});const result=await r.json();return {status:r.status,data:result,headers:r.headers}}const login=await call('/api/auth/login','POST',{username,password:'Initial!12345'});cookie=login.headers.get('set-cookie').split(';')[0];csrf=login.data.csrf;await call('/api/auth/password','POST',{current:'Initial!12345',password:'Changed!12345'});return {id,call,get cookie(){return cookie},get csrf(){return csrf}}}
test('strict code preserves quotes internal whitespace and indentation',()=>{const key={items:[{id:'k',expected:"x = 'A'\n    y",points:2}]};assert.equal(gradeCode(key,{k:" \r\nx = 'A'\r\n    y \n"}).score,2);assert.equal(gradeCode(key,{k:'x = "A"\n    y'}).score,0);assert.equal(gradeCode(key,{k:"x = 'A'\ny"}).score,0)});
test('official exam exactly 190, correct distribution and sum',()=>{const qs=createExam('theory','official');assert.equal(qs.length,190);assert.equal(qs.reduce((n,q)=>n+q.points,0),100);assert.deepEqual(Object.fromEntries(['j','s','m'].map(t=>[t,qs.filter(q=>q.type===t).length])),{j:40,s:140,m:10});assert.deepEqual(createExam('practical','official').map(q=>q.id),['1.1.1','2.1.1','2.2.1','3.1.1','3.2.1','4.2.1'])});
test('auth, csrf, isolated progress, exam answer secrecy, revisions and expiration',async()=>{const a=await account('learner_a'),b=await account('learner_b');const anon=await fetch(base+'/api/meta');assert.equal(anon.status,401);const wrongCsrf=await fetch(base+'/api/theory/submit',{method:'POST',headers:{Cookie:a.cookie,'Content-Type':'application/json'},body:JSON.stringify({id:'T3-J001',answer:'T'})});assert.equal(wrongCsrf.status,403);const submit=await a.call('/api/theory/submit','POST',{id:'T3-J001',answer:'T'});assert.equal(submit.data.correct,true);assert.equal((await a.call('/api/meta')).data.stats.answered,1);assert.equal((await b.call('/api/meta')).data.stats.answered,0);assert.equal((await b.call('/api/attempts/'+submit.data.attemptId)).status,404);
 const started=await a.call('/api/exams','POST',{kind:'theory',mode:'official'});assert.equal(started.status,200);const exam=started.data;assert.equal(exam.questions.length,190);assert.equal((await a.call('/api/attempts/'+submit.data.attemptId)).status,403);for(const q of exam.questions){assert.equal(q.answer,undefined);assert.equal(q.answer_values,undefined);assert.equal(q.code_key,undefined)}assert.equal((await a.call('/api/answers/1.1.1')).status,403);assert.equal((await a.call('/api/answer-image/1.1.1/4')).status,403);const save=await a.call('/api/attempts/'+exam.id,'PATCH',{revision:0,answers:{[exam.questions[0].id]:'T'}});assert.equal(save.data.revision,1);assert.equal((await a.call('/api/attempts/'+exam.id,'PATCH',{revision:0,answers:{}})).status,409);assert.equal((await b.call('/api/attempts/'+exam.id,'PATCH',{revision:1,answers:{}})).status,404);db.prepare('UPDATE attempts SET deadline=? WHERE id=?').run(Date.now()-1,exam.id);const expired=await a.call('/api/attempts/'+exam.id);assert.equal(expired.data.status,'submitted');assert.equal((await a.call('/api/attempts/'+exam.id,'PATCH',{revision:1,answers:{}})).status,409);assert.equal((await a.call('/api/attempts/'+exam.id+'/finish','POST',{})).data.score,expired.data.score);
});
test('admin creation, disable and reset revoke sessions',async()=>{const admin=await account('admin_a','admin'),u=await account('disabled_a');assert.equal((await u.call('/api/admin/users')).status,403);assert.equal((await u.call('/api/admin/users/'+u.id+'/progress')).status,403);await u.call('/api/progress','PATCH',{id:'T3-J001',wrong:true});const wrongs=await admin.call('/api/admin/users/'+u.id+'/progress');assert.equal(wrongs.data.questions[0].question_id,'T3-J001');assert.ok(wrongs.data.questions[0].title);assert.equal((await admin.call('/api/admin/users','POST',{username:'new_user',password:'Enough!12345'})).status,200);await admin.call('/api/admin/users/'+u.id,'PATCH',{active:false});assert.equal((await u.call('/api/auth/me')).status,401)});
test('per-blank partial credit and uncertain strings fail closed',()=>{const key={items:[{id:'a',expected:'np.where',points:1,enabled:true},{id:'b',expected:'uncertain',points:2,enabled:false}]};const result=gradeCode(key,{a:' np.where ',b:'uncertain'});assert.equal(result.score,1);assert.equal(result.maxScore,1);assert.equal(result.manualItems.length,1);assert.equal(result.items.length,1)});
test('system theory keeps 70/30 per type and practical uses required groups',()=>{const qs=createExam('theory','system');assert.equal(qs.length,190);assert.equal(qs.reduce((n,q)=>n+q.points,0),100);for(const [type,counts]of Object.entries({j:[28,12],s:[98,42],m:[7,3]})){const group=qs.filter(q=>q.type===type);assert.equal(group.filter(q=>q.origin!=='extension').length,counts[0]);assert.equal(group.filter(q=>q.origin==='extension').length,counts[1])}assert.equal(new Set(qs.map(q=>q.id)).size,190);const practical=createExam('practical','system');practical.forEach((q,i)=>assert.ok(examConfig.practical.groups[i].candidate_ids.includes(q.id)))});
test('practical answers reject malformed payloads and discard client scores',async()=>{const {practicalAnswer}=await import('../src/validation.mjs');for(const bad of [null,[],{code:[]},{code:{a:123}},{notebook:[{}]},{text:'x'.repeat(60001)},{document:{paragraphs:[],tables:[],template:'../x.docx'}}])assert.throws(()=>practicalAnswer(bad));assert.deepEqual(practicalAnswer({code:{a:'x'},text:'hello',selfScore:100,unknown:'x'}),{code:{a:'x'},text:'hello',notebook:[]});const u=await account('validation_a');const draft=await u.call('/api/practice','POST',{id:'1.1.1'});assert.equal(draft.status,200);const id=draft.data.id;assert.equal((await u.call('/api/attempts/'+id,'PATCH',{revision:0,answers:{'1.1.1':{code:{a:123}}}})).status,400)});
test('all historical answer-returning routes are blocked during an active exam',async()=>{const u=await account('history_guard');const old=(await u.call('/api/practice','POST',{id:'1.1.1'})).data;await u.call('/api/attempts/'+old.id+'/finish','POST',{});const active=(await u.call('/api/exams','POST',{kind:'theory',mode:'official'})).data;assert.equal((await u.call('/api/attempts/'+old.id)).status,403);assert.equal((await u.call('/api/attempts/'+old.id+'/finish','POST',{})).status,403);assert.equal((await u.call('/api/attempts/'+old.id+'/self-score','PATCH',{scores:{'1.1.1':1}})).status,403);assert.equal(db.prepare('SELECT self_score FROM attempts WHERE id=?').get(old.id).self_score,0);await u.call('/api/attempts/'+active.id+'/finish','POST',{})});
test('extension wrong answers support review, retry, favorites and admin classification',async()=>{const {extensions}=await import('../src/bank.mjs');const q=extensions[0],u=await account('extension_learner'),admin=await account('extension_admin','admin');assert.equal((await u.call('/api/theory/submit','POST',{id:q.id,answer:'invalid'})).data.correct,false);const wrong=(await u.call('/api/questions?type='+q.type+'&filter=wrong')).data.questions.find(x=>x.id===q.id);assert.equal(wrong.origin,'extension');assert.equal(wrong.question,q.question);assert.equal(wrong.answer,undefined);assert.equal((await u.call('/api/progress','PATCH',{id:q.id,favorite:true})).status,200);const list=(await admin.call('/api/admin/users/'+u.id+'/progress')).data.questions;assert.equal(list[0].kind,'理论');assert.equal(list[0].title,q.question);assert.equal(list[0].type,q.type_label);assert.equal((await u.call('/api/theory/submit','POST',{id:q.id,answer:q.answer})).data.correct,true);const stats=(await u.call('/api/meta')).data.stats;assert.equal(stats.answered,0);assert.equal(stats.extensionAnswered,1)});
test('runtime task list protects privacy and users can release their own running or queued task',async()=>{const http=await import('node:http'),{randomUUID}=await import('node:crypto'),socket=path.join(process.env.DATA_DIR,'runtime-test.sock'),oldSocket=process.env.RUNTIME_SOCKET;const states=new Map();let failClose=false,closeGate=null,notifyClose=null;const control=http.createServer(async(req,res)=>{let text='';for await(const c of req)text+=c;const d=JSON.parse(text);res.setHeader('Content-Type','application/json');if(d.op==='start'){states.set(d.id,{status:'ready',position:0});return res.end(JSON.stringify(states.get(d.id)))}if(d.op==='close'){if(closeGate){notifyClose?.();await closeGate}if(failClose){res.writeHead(400);return res.end(JSON.stringify({error:'temporary deletion failure'}))}states.delete(d.id);return res.end(JSON.stringify({status:'closed'}))}res.end(JSON.stringify(states.get(d.id)||{status:'missing'}))});await new Promise(r=>control.listen(socket,r));process.env.RUNTIME_SOCKET=socket;try{const a=await account('queue_a'),b=await account('queue_b'),admin=await account('queue_admin','admin');async function workspace(u,qid,status){const a=(await u.call('/api/practice','POST',{id:qid})).data,id=randomUUID();db.prepare('INSERT INTO workspaces(id,user_id,attempt_id,question_id,created,touched) VALUES(?,?,?,?,?,?)').run(id,u.id,a.id,qid,Date.now(),Date.now());states.set(id,{status,position:status==='queued'?1:0});return {id,attempt:a.id}}const own=await workspace(a,'1.1.1','queued'),other=await workspace(b,'2.1.1','ready');await a.call('/api/attempts/'+own.attempt,'PATCH',{answers:{'1.1.1':{text:'保存中的答案'}}});const visible=(await a.call('/api/workspaces')).data.workspaces;assert.equal(visible.find(w=>w.own).id,own.id);const anonymous=visible.find(w=>!w.own);assert.equal(anonymous.id,null);assert.equal(anonymous.questionId,null);assert.equal(anonymous.attemptId,null);assert.equal(anonymous.username,'其他用户');assert.equal(anonymous.canStop,false);const adminList=(await admin.call('/api/workspaces')).data.workspaces;assert.equal(adminList.find(w=>w.id===other.id).username,'queue_b');assert.equal((await a.call('/api/workspaces/'+other.id+'/stop','POST',{})).status,403);assert.equal((await a.call('/api/workspaces/'+own.id+'/stop','POST',{})).status,200);assert.equal(db.prepare('SELECT status FROM workspaces WHERE id=?').get(own.id).status,'closed');assert.equal((await a.call('/api/attempts/'+own.attempt)).data.answers['1.1.1'].text,'保存中的答案');failClose=true;assert.equal((await admin.call('/api/workspaces/'+other.id+'/stop','POST',{})).status,503);assert.equal(db.prepare('SELECT status FROM workspaces WHERE id=?').get(other.id).status,'cleanup_pending');failClose=false;assert.equal((await admin.call('/api/workspaces/'+other.id+'/stop','POST',{})).status,200);const race=await workspace(a,'2.1.5','ready');let releaseClose;closeGate=new Promise(r=>releaseClose=r);const entered=new Promise(r=>notifyClose=r);const restarting=a.call('/api/workspaces/'+race.id+'/restart','POST',{questionId:'2.1.5'});await entered;const stopping=a.call('/api/workspaces/'+race.id+'/stop','POST',{});await new Promise(r=>setTimeout(r,30));closeGate=null;releaseClose();assert.equal((await restarting).status,200);assert.equal((await stopping).status,200);assert.equal(states.has(race.id),false);assert.equal(db.prepare('SELECT status FROM workspaces WHERE id=?').get(race.id).status,'closed')}finally{if(oldSocket===undefined)delete process.env.RUNTIME_SOCKET;else process.env.RUNTIME_SOCKET=oldSocket;await new Promise(r=>control.close(r))}});
test('trusted loopback proxy keeps login limits separate per real client',async()=>{const old=process.env.TRUST_PROXY;process.env.TRUST_PROXY='1';try{createUser('proxy_login','Initial!12345');const send=(ip,password)=>fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','x-forwarded-for':ip},body:JSON.stringify({username:'proxy_login',password})});for(let i=0;i<15;i++)assert.equal((await send('198.51.100.11','incorrect')).status,401);assert.equal((await send('198.51.100.11','Initial!12345')).status,429);assert.equal((await send('198.51.100.12','Initial!12345')).status,200)}finally{if(old===undefined)delete process.env.TRUST_PROXY;else process.env.TRUST_PROXY=old}});

test('daily practice persists the same 50 questions, prioritizes wrong originals and isolates accounts',async()=>{
 const {theory}=await import('../src/bank.mjs'),u=await account('daily_a'),other=await account('daily_b');
 for(const q of theory.slice(0,7))await u.call('/api/progress','PATCH',{id:q.id,wrong:true});
 const first=(await u.call('/api/theory/session','POST',{context:'daily'})).data;
 assert.equal(first.questions.length,50);assert.equal(new Set(first.questions.map(q=>q.id)).size,50);
 for(const q of theory.slice(0,7))assert(first.questions.some(v=>v.id===q.id));assert(first.questions.every(q=>q.answer===undefined));
 const q=first.questions[0],full=theory.find(v=>v.id===q.id),payload={context:'daily',sessionId:first.id,id:q.id,answer:full.type==='m'?full.answer.split(''):full.answer};
 assert.equal((await u.call('/api/theory/submit','POST',payload)).status,200);
 const count=db.prepare('SELECT COUNT(*) n FROM attempts WHERE user_id=?').get(u.id).n;
 assert.equal((await u.call('/api/theory/submit','POST',payload)).status,200);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM attempts WHERE user_id=?').get(u.id).n,count);
 const again=(await u.call('/api/theory/session','POST',{context:'daily'})).data;
 assert.deepEqual(again.questions.map(q=>q.id),first.questions.map(q=>q.id));assert.equal(again.index,1);assert.equal(again.completed,1);
 assert.equal((await u.call('/api/theory/session','POST',{context:'daily',restart:true})).status,409);
 assert.equal((await other.call('/api/theory/session','PATCH',{context:'daily',id:first.id,index:2})).status,409);
 for(const q of again.questions.slice(1)){const full=theory.find(v=>v.id===q.id);assert.equal((await u.call('/api/theory/submit','POST',{...payload,id:q.id,answer:full.type==='m'?full.answer.split(''):full.answer})).status,200)}
 assert.equal((await u.call('/api/theory/session','POST',{context:'daily'})).data.completed,50);
 assert.equal((await u.call('/api/theory/session','POST',{context:'daily',restart:true})).status,409);
});

test('theory practice restores selections and position, with stable wrong-review navigation',async()=>{
 const {theory}=await import('../src/bank.mjs'),u=await account('resume_a');
 let s=(await u.call('/api/theory/session','POST',{context:'regular',type:'m'})).data;
 const target=s.questions[5],value=Object.keys(target.options).slice(0,2);
 assert.equal((await u.call('/api/theory/session','PATCH',{context:'regular',id:s.id,index:5,questionId:target.id,answer:value})).status,200);
 s=(await u.call('/api/theory/session','POST',{context:'regular'})).data;assert.equal(s.type,'m');assert.equal(s.index,5);assert.deepEqual(s.answers[target.id].answer,value);
 assert.equal((await u.call('/api/theory/session','PATCH',{context:'regular',id:s.id,index:-1})).status,400);
 assert.equal((await u.call('/api/theory/session','PATCH',{context:'regular',id:s.id,index:999})).status,400);
 const wrongs=theory.filter(q=>q.type==='s').slice(0,2);for(const q of wrongs)await u.call('/api/progress','PATCH',{id:q.id,wrong:true});
 const w=(await u.call('/api/theory/session','POST',{context:'wrong',type:'s',startId:wrongs[0].id})).data;
 await u.call('/api/theory/submit','POST',{context:'wrong',sessionId:w.id,id:wrongs[0].id,answer:wrongs[0].answer});
 const resumed=(await u.call('/api/theory/session','POST',{context:'wrong'})).data;
 assert.equal(resumed.questions.length,2);assert.equal(resumed.index,1);assert.equal(resumed.questions[1].id,wrongs[1].id);
 await u.call('/api/progress','PATCH',{id:wrongs[0].id,wrong:false});assert.equal((await u.call('/api/theory/session','POST',{context:'wrong'})).data.questions.length,2);
 const regular=(await u.call('/api/theory/session','POST',{context:'regular'})).data;assert.equal(regular.index,5);assert.equal(regular.type,'m');
 const exam=(await u.call('/api/exams','POST',{kind:'theory',mode:'official'})).data;
 assert.equal((await u.call('/api/theory/session','POST',{context:'regular'})).status,409);
 assert.equal((await u.call('/api/theory/submit','POST',{context:'wrong',sessionId:w.id,id:wrongs[1].id,answer:wrongs[1].answer})).status,409);
 await u.call('/api/attempts/'+exam.id+'/finish','POST',{});
});

test('existing learners continue after their last submitted original question on first upgrade',async()=>{
 const {theory}=await import('../src/bank.mjs'),u=await account('legacy_learner'),q=theory.filter(q=>q.type==='j')[17];
 await u.call('/api/theory/submit','POST',{id:q.id,answer:q.answer});
 const resumed=(await u.call('/api/theory/session','POST',{context:'regular'})).data;
 assert.equal(resumed.type,'j');assert.equal(resumed.index,18);assert.equal(resumed.questions[18].number,19);
});

test('daily pool contains only wrong originals when more than 50 are available',async()=>{
 const {theory}=await import('../src/bank.mjs'),u=await account('daily_priority');
 const ids=['j','s','m'].flatMap(type=>theory.filter(q=>q.type===type).slice(0,30).map(q=>q.id));for(const id of ids)await u.call('/api/progress','PATCH',{id,wrong:true});
 const daily=(await u.call('/api/theory/session','POST',{context:'daily'})).data;
 assert.equal(daily.questions.length,50);assert(daily.questions.every(q=>ids.includes(q.id)));
 const answer=daily.questions[0].type==='m'?['Z']:'Z';
 assert.equal((await u.call('/api/theory/submit','POST',{context:'daily',sessionId:daily.id,id:daily.questions[0].id,answer})).status,400);
 assert.equal((await u.call('/api/theory/session','POST',{context:'daily'})).data.completed,0);
});

test('unanswered exam questions score zero without inflating practiced questions or wrong book',async()=>{
 const {theoryMap}=await import('../src/bank.mjs'),u=await account('skipped_exam');
 const a=(await u.call('/api/exams','POST',{kind:'theory',mode:'official'})).data;
 const q=a.questions[0],correct=theoryMap.get(q.id).answer;
 await u.call('/api/attempts/'+a.id,'PATCH',{revision:0,answers:{[q.id]:correct,[a.questions[1].id]:'',[a.questions[2].id]:[]}});
 const done=(await u.call('/api/attempts/'+a.id+'/finish','POST',{})).data;
 assert.equal(done.score,q.points);assert.equal(done.questions.length,190);
 let stats=(await u.call('/api/meta')).data.stats;assert.equal(stats.answered,1);assert.equal(stats.wrong,0);assert.equal(stats.submissions,1);
 const second=(await u.call('/api/exams','POST',{kind:'theory',mode:'official'})).data;
 const wrong=correct==='T'?'F':'T';await u.call('/api/attempts/'+second.id,'PATCH',{revision:0,answers:{[q.id]:wrong}});
 await u.call('/api/attempts/'+second.id+'/finish','POST',{});
 stats=(await u.call('/api/meta')).data.stats;assert.equal(stats.answered,1);assert.equal(stats.wrong,1);assert.equal(stats.submissions,2);
 const p=(await u.call('/api/progress')).data.questions;assert.equal(p.length,1);assert.equal(p[0].seen,2);
});

test('runtime transport failures give actionable messages without exposing internal socket paths',async()=>{
 const {runtime}=await import('../src/runtime.mjs'),old=process.env.RUNTIME_SOCKET;
 process.env.RUNTIME_SOCKET=path.join(process.env.DATA_DIR,'internal-runtime-not-running.sock');
 try{await assert.rejects(runtime('status','00000000-0000-4000-8000-000000000001'),e=>e.status===503&&/稍后重试/.test(e.message)&&!e.message.includes('sock')&&!e.message.includes(process.env.DATA_DIR))}finally{if(old===undefined)delete process.env.RUNTIME_SOCKET;else process.env.RUNTIME_SOCKET=old}
});

test('first-login users can sign out without changing their password and cannot bypass the gate',async()=>{
 createUser('password_gate','Initial!12345');
 const first=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'password_gate',password:'Initial!12345'})});
 const data=await first.json(),cookie=first.headers.get('set-cookie').split(';')[0];assert.equal(data.user.mustChange,true);
 const headers={Cookie:cookie,'Content-Type':'application/json','x-csrf-token':data.csrf};
 assert.equal((await fetch(base+'/api/meta',{headers})).status,403);
 const out=await fetch(base+'/api/auth/logout',{method:'POST',headers,body:'{}'});assert.equal(out.status,200);assert.match(out.headers.get('set-cookie'),/Max-Age=0/);
 assert.equal((await fetch(base+'/api/auth/me',{headers})).status,401);
 const again=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'password_gate',password:'Initial!12345'})});assert.equal((await again.json()).user.mustChange,true);
});

test('daily refresh at server midnight resets only daily progress and rejects old submissions',async t=>{
 const {theory}=await import('../src/bank.mjs'),u=await account('midnight_user');
 const boundary=Date.parse('2026-10-30T16:00:00Z');let clock=boundary-1000;
 t.mock.method(Date,'now',()=>clock);
 try{
  // New login expiry must be based on the mocked server clock too.
  db.prepare('UPDATE sessions SET expires=? WHERE user_id=?').run(boundary+86400000,u.id);
  const original=(await u.call('/api/theory/session','POST',{context:'regular',type:'s'})).data;
  await u.call('/api/theory/session','PATCH',{context:'regular',id:original.id,index:7});
  const a=(await u.call('/api/theory/session','POST',{context:'daily'})).data;
  assert.equal(a.dailyDay,'2026-10-30');assert.equal(a.resetsAt,boundary);
  assert.deepEqual(Object.fromEntries(['j','s','m'].map(type=>[type,a.questions.filter(q=>q.type===type).length])),{j:20,s:20,m:10});
  const q=theory.find(q=>q.id===a.questions[0].id),answer=q.type==='m'?q.answer.split(''):q.answer;
  assert.equal((await u.call('/api/theory/submit','POST',{context:'daily',sessionId:a.id,id:q.id,answer})).status,200);
  clock=boundary-1;assert.equal((await u.call('/api/theory/session','POST',{context:'daily'})).data.id,a.id);
  const count=db.prepare('SELECT COUNT(*) n FROM attempts WHERE user_id=?').get(u.id).n;
  clock=boundary;
  assert.equal((await u.call('/api/meta')).data.practice.daily.completed,0);
  assert.equal((await u.call('/api/theory/submit','POST',{context:'daily',sessionId:a.id,id:q.id,answer})).status,409);
  assert.equal((await u.call('/api/theory/session','PATCH',{context:'daily',id:a.id,index:2})).status,409);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM attempts WHERE user_id=?').get(u.id).n,count);
  const b=(await u.call('/api/theory/session','POST',{context:'daily'})).data;
  assert.notEqual(b.id,a.id);assert.equal(b.completed,0);assert.equal(b.index,0);assert.equal(b.dailyDay,'2026-10-31');
  assert.deepEqual(Object.fromEntries(['j','s','m'].map(type=>[type,b.questions.filter(q=>q.type===type).length])),{j:20,s:20,m:10});
  assert.equal((await u.call('/api/theory/session','POST',{context:'daily'})).data.id,b.id);
  assert.equal((await u.call('/api/theory/session','POST',{context:'regular'})).data.index,7);
 }finally{t.mock.restoreAll()}
});

test('notebook blank positions roundtrip with exact code and cannot bypass validation',async()=>{
 const u=await account('notebook_fields'),a=(await u.call('/api/practice','POST',{id:'1.1.1'})).data;
 const text="data = pd.read_csv('sensor_data.csv')\n",notebookBlanks=[[{id:0,from:7,to:text.length-1}]];
 assert.equal((await u.call('/api/attempts/'+a.id,'PATCH',{answers:{'1.1.1':{notebook:[text],notebookBlanks}}})).status,200);
 const saved=(await u.call('/api/attempts/'+a.id)).data.answers['1.1.1'];assert.equal(saved.notebook[0],text);assert.deepEqual(saved.notebookBlanks,notebookBlanks);assert.deepEqual(saved.code,{});
 assert.equal((await u.call('/api/attempts/'+a.id,'PATCH',{answers:{'1.1.1':{notebook:[text],notebookBlanks:[[{id:0,from:7,to:99999}]]}}})).status,400);
 assert.equal((await u.call('/api/attempts/'+a.id)).data.answers['1.1.1'].notebook[0],text);
});
