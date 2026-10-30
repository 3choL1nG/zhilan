// Optional browser regression: PLAYWRIGHT_MODULE and CHROME_BIN point to local tooling.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})});
 const page=await browser.newPage({viewport:{width:375,height:812}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const initial=Date.parse('2026-10-30T15:59:59Z'),boundary=initial+1000;let day=1,opens=0,releaseSubmit;
 const held=new Promise(resolve=>releaseSubmit=resolve),root=path.resolve(__dirname,'../public');
 const questions=Array.from({length:50},(_,i)=>({id:'question-'+i,type:i<20?'s':i<40?'j':'m',type_label:i<20?'单选题':i<40?'判断题':'多选题',question:'day-'+day+' question-'+i,options:{A:'选项A',B:'选项B'}}));
 await page.clock.install({time:new Date(initial)});
 await page.route('http://daily.test/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/api/theory/session'){
   if(route.request().method()==='PATCH')return route.fulfill({json:{ok:true}});
   opens++;return route.fulfill({json:{id:'day-'+day,context:'daily',questions:questions.map(q=>({...q,question:'day-'+day+' '+q.id})),index:0,answers:{},serverTime:day===1?initial:boundary,resetsAt:day===1?boundary:boundary+86400000}});
  }
  if(url.pathname==='/api/theory/submit'){await held;return route.fulfill({json:{correct:true,answer:'A',attemptId:'old-attempt'}})}
  if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<div id="view"></div><dialog id="dialog"><span id="dialog-caption"></span><button id="dialog-close"></button><div id="dialog-content"></div></dialog><script type="module">import {mountTheoryPractice,disposeTheoryPractice} from "/theory-practice.mjs";window.disposePractice=disposeTheoryPractice;await mountTheoryPractice({context:"daily",route:()=>{}});</script>'});
  const file=path.join(root,url.pathname.slice(1));if(fs.existsSync(file))return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(file)});return route.fulfill({status:404,body:''});
 });
 try{
  await page.goto('http://daily.test/');await page.getByRole('heading',{name:'day-1 question-0',exact:true}).waitFor();
  await page.locator('input[name=practice-choice][value=A]').check();const sent=page.waitForRequest('**/api/theory/submit');await page.locator('#practice-primary').click();await sent;
  day=2;await page.clock.fastForward(1100);await page.getByRole('heading',{name:'day-2 question-0',exact:true}).waitFor();
  const response=page.waitForResponse('**/api/theory/submit');releaseSubmit();await response;
  assert.equal(await page.locator('#practice-result .feedback').count(),0,'old in-flight answer must not enter the new batch');
  assert.equal(await page.locator('#practice-primary').textContent(),'提交答案');assert.equal(opens,2);
  await page.evaluate(()=>window.disposePractice());await page.clock.fastForward(86400000);assert.equal(opens,2,'disposed screen must not refresh');
  assert.deepEqual(errors,[]);console.log('Browser midnight switch, in-flight answer isolation and timer disposal passed');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
