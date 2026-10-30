// Optional: set PLAYWRIGHT_MODULE, CHROME_BIN and SCREENSHOT_DIR for local browser tooling.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));const root=path.resolve(__dirname,'../public'),initial=Date.parse('2026-10-30T04:00:00Z');let userId=1;
 await page.clock.install({time:new Date(initial)});
 await page.route('http://countdown.test/**',async route=>{
  const url=new URL(route.request().url()),user={id:userId,username:'预览账号',role:'user',mustChange:false};
  if(url.pathname==='/api/auth/me')return route.fulfill({json:{user,csrf:'preview'}});
  if(url.pathname==='/api/meta')return route.fulfill({json:{serverTime:initial,theoryCount:900,practicalCount:40,extensionsReady:true,practice:{},active:null,stats:{accuracy:null,answered:0,extensionAnswered:0,submissions:0,wrong:0,favorite:0,byType:{j:0,s:0,m:0}}}});
  const file=path.join(root,url.pathname==='/'?'index.html':url.pathname.slice(1));if(!fs.existsSync(file))return route.fulfill({status:404,body:''});return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':url.pathname==='/'?'text/html':'application/javascript',body:fs.readFileSync(file)});
 });
 try{
  await page.goto('http://countdown.test/#overview');await page.locator('.exam-days').filter({hasText:'15'}).waitFor();
  assert.equal(await page.locator('.ribbon [data-route=practical]').count(),0);assert.equal(await page.locator('.entry [data-route=practical]').count(),1);
  const out=process.env.SCREENSHOT_DIR;if(out){fs.mkdirSync(out,{recursive:true});await page.locator('.ribbon-with-countdown').screenshot({path:path.join(out,'desktop.png')})}
  await page.locator('[data-exam-date="2026-12-27"]').click();assert.equal(await page.locator('.exam-days').textContent(),'58');
  await page.reload();await page.locator('.exam-days').filter({hasText:'58'}).waitFor();
  userId=2;await page.reload();await page.locator('.exam-days').filter({hasText:'15'}).waitFor();
  await page.setViewportSize({width:375,height:812});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),375);
  if(out)await page.locator('.ribbon-with-countdown').screenshot({path:path.join(out,'mobile.png')});
  await page.locator('[data-exam-date="2026-12-27"]').click();assert.equal(await page.locator('.exam-days').textContent(),'58');
  await page.locator('#theme').click();if(out)await page.locator('.ribbon-with-countdown').screenshot({path:path.join(out,'mobile-dark.png')});
  await page.clock.fastForward(12*3600000+1000);assert.equal(await page.locator('.exam-days').textContent(),'57');
  const active=await page.locator('[data-exam-date="2026-12-27"]').getAttribute('aria-pressed');assert.equal(active,'true');
  assert.deepEqual(errors,[]);console.log('Overview placement, 15/58 days, account-scoped selection, mobile/dark layout and midnight update passed');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
