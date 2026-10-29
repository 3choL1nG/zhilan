import fs from 'node:fs';import path from 'node:path';import {createHash,randomInt} from 'node:crypto';import {BANK,ROOT} from './config.mjs';
export const manifest=JSON.parse(fs.readFileSync(path.join(BANK,'manifest.json')));
for(const [id,source] of Object.entries(manifest.sources)){if(source.sha256){const actual=createHash('sha256').update(fs.readFileSync(path.join(BANK,source.path))).digest('hex');if(actual!==source.sha256)throw Error('题库来源校验失败：'+id)}}
const read=entry=>JSON.parse(fs.readFileSync(path.join(BANK,manifest.entry_points[entry])));
export const theory=read('theory'),practical=read('practical'),examConfig=read('exam_config'),official=read('official_theory_mock');
export const theoryMap=new Map(theory.map(q=>[q.id,q]));export const practicalMap=new Map(practical.map(q=>[q.id,q]));
if(theory.length!==900||practical.length!==40||official.length!==190||official.some(x=>!theoryMap.has(x.question_id)))throw Error('题库完整性失败');

export const codeKeys=new Map();const keysDir=path.join(ROOT,'verified-answers');if(fs.existsSync(keysDir))for(const f of fs.readdirSync(keysDir).filter(f=>f==='scoring.json')){for(const q of JSON.parse(fs.readFileSync(path.join(keysDir,f)))){if(q.compiled===true&&q.review_method==='visual_pdf'&&q.items.every(i=>typeof i.expected==='string'&&Number.isFinite(i.points)&&Number.isInteger(i.pdf_page)))codeKeys.set(q.question_id,q)}}
export let extensions=[];const extFile=path.join(ROOT,'question-bank/extensions.json');if(fs.existsSync(extFile)){const data=JSON.parse(fs.readFileSync(extFile));if(data.status==='verified'&&data.questions.length===300)extensions=data.questions}
export const learningTheoryMap=new Map([...theory,...extensions].map(q=>[q.id,q]));
const dataLock=JSON.parse(fs.readFileSync(path.join(ROOT,'question-bank/data.lock.json')));
for(const [key,entry] of Object.entries(manifest.entry_points)){const bytes=fs.readFileSync(path.join(BANK,entry));if(createHash('sha256').update(bytes).digest('hex')!==dataLock[key])throw Error('派生题库校验失败：'+key)}
export const bankVersion=createHash('sha256').update(JSON.stringify(manifest)).update(JSON.stringify(dataLock)).update(fs.readFileSync(path.join(keysDir,'scoring.json'))).update(fs.existsSync(extFile)?fs.readFileSync(extFile):'').digest('hex');
export function safeTheory(q){return {id:q.id,type:q.type,type_label:q.type_label,number:q.number,question:q.question,options:q.options,origin:q.origin||'original'}}
export function safePractical(q){return {id:q.id,title:q.title,section:q.section,question_text:q.question_text,original_scoring_rubric_text:q.original_scoring_rubric_text,contains_code_answer:q.contains_code_answer,files:q.material_files.map(f=>({path:f,name:f.split('/').pop()})),fields:((q.code_key||codeKeys.get(q.id))?.items||[]).map(({expected,...item})=>item),autoGradingReady:!!(q.code_key||codeKeys.get(q.id))?.items.some(i=>i.enabled!==false)}}
export function sample(items,count){if(items.length<count)throw Error('题量不足');const a=[...items];for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]]}return a.slice(0,count)}
export function createExam(kind,mode){
 if(!['theory','practical'].includes(kind)||!['official','system'].includes(mode))throw Error('考试类型无效');
 if(kind==='practical'){const ids=mode==='official'?['1.1.1','2.1.1','2.2.1','3.1.1','3.2.1','4.2.1']:examConfig.practical.groups.map(g=>sample(g.candidate_ids,1)[0]);return ids.map((id,i)=>({...practicalMap.get(id),points:[25,15,20,15,20,5][i],code_key:codeKeys.get(id)||null}))}
 if(mode==='official')return official.map(x=>({...theoryMap.get(x.question_id),points:examConfig.theory.points_per_question[x.type]}));
 if(extensions.length!==300)throw Error('扩展题尚未核验完成，系统理论组卷暂不可用');
 return Object.entries({j:[28,12],s:[98,42],m:[7,3]}).flatMap(([type,[a,b]])=>[...sample(theory.filter(q=>q.type===type),a),...sample(extensions.filter(q=>q.type===type),b)].map(q=>({...q,points:examConfig.theory.points_per_question[type]})));
}
export const normalizeCode=s=>String(s??'').replace(/\r\n?/g,'\n').trim();
export function theoryAnswer(q,answer){let values=Array.isArray(answer)?answer:[answer];values=values.filter(v=>typeof v==='string');return [...new Set(values)].sort().join('')===String(q.answer).split('').sort().join('')}
export function gradeCode(key,answers={}){if(!key)return {ready:false,score:0,maxScore:0,items:[]};const items=key.items.filter(i=>i.enabled!==false).map(i=>({id:i.id,label:i.label,points:i.points,pdf_page:i.pdf_page,correct:normalizeCode(answers[i.id])===normalizeCode(i.expected),expected:i.expected}));return {ready:items.length>0,manualItems:key.items.filter(i=>i.enabled===false).map(({expected,...i})=>i),score:items.reduce((s,i)=>s+(i.correct?i.points:0),0),maxScore:items.reduce((s,i)=>s+i.points,0),items}}
