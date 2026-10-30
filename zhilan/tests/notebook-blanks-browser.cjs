const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const root=path.resolve(__dirname,'../public'),out=process.env.SCREENSHOT_DIR,templates=["import pandas as pd\ndata = __________\n","sensor_stats = ______(______)['Value'].______\nprint(sensor_stats)"],q={id:'1.1.1',title:'传感器数据统计',question_text:'读取数据并按传感器类型统计数量和平均值。',original_scoring_rubric_text:'按要求完成数据统计。',files:[],fields:[{id:'code1',label:'读取数据集',points:2}],contains_code_answer:true};
 let saved={},revision=0,starts=0,executed=[];const user={id:1,username:'测试账号',role:'user',mustChange:false};
 await page.route('http://blank.test/**',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.pathname==='/api/auth/me')return route.fulfill({json:{user,csrf:'test'}});
  if(url.pathname==='/api/meta')return route.fulfill({json:{active:null,extensionsReady:true,stats:{byType:{j:0,s:0,m:0}}}});
  if(url.pathname==='/api/practice')return route.fulfill({json:{id:'test-attempt',questions:[q],answers:{'1.1.1':saved},status:'draft'}});
  if(url.pathname==='/api/notebook')return route.fulfill({json:{notebook:{cells:templates.map(t=>({cell_type:'code',source:[t],metadata:{}})),nbformat:4,nbformat_minor:5,metadata:{}}}});
  if(url.pathname==='/api/attempts/test-attempt'){saved=req.postDataJSON().answers['1.1.1'];return route.fulfill({json:{revision:++revision}})}
  if(url.pathname==='/api/workspaces'){starts++;return route.fulfill({json:{id:'test-workspace',status:'ready'}})}
  if(url.pathname.endsWith('/status'))return route.fulfill({json:{status:'ready'}});
  if(url.pathname.endsWith('/execute')){executed.push(req.postDataJSON().code);return route.fulfill({json:{events:[{type:'stream',text:'运行完成'}]}})}
  if(url.pathname.endsWith('/files'))return route.fulfill({json:{files:[],used:0,quota:268435456}});
  const file=path.join(root,url.pathname==='/'?'index.html':url.pathname.slice(1));if(!fs.existsSync(file))return route.fulfill({status:404,body:''});return route.fulfill({contentType:url.pathname==='/'?'text/html':url.pathname.endsWith('.css')?'text/css':'application/javascript',body:fs.readFileSync(file)});
 });
 const editor=(i,method)=>page.locator('.CodeMirror').nth(i).evaluate((node,method)=>node.CodeMirror[method](),method);
 async function tools(){await page.locator('[data-stage=tools][role=tab]').click();await page.locator('.CodeMirror').first().waitFor({state:'visible'})}
 try{
  await page.goto('http://blank.test/#practical/1.1.1');await tools();assert.equal(await page.locator('.notebook-blank').count(),4);assert.equal(await page.locator('[data-blank-progress]').textContent(),'已填写 0 / 4 空');
  if(out){fs.mkdirSync(out,{recursive:true});await page.locator('#tool-notebook').screenshot({path:path.join(out,'desktop-empty.png')})}
  await page.locator('[data-run-cell="0"]').click();assert.equal(starts,0);assert.equal(await editor(0,'getSelection'),'__________');
  await page.keyboard.type("pd.read_csv('sensor_data.csv')");await page.keyboard.press('Tab');assert.equal(await editor(1,'getSelection'),'______');
  await page.keyboard.type('data.groupby');await page.keyboard.press('Tab');await page.keyboard.type("'SensorType'");await page.keyboard.press('Tab');await page.keyboard.type("agg(['count', 'mean'])");await page.keyboard.press('Tab');
  assert.equal(await page.locator('[data-blank-progress]').textContent(),'已填写 4 / 4 空');assert.equal(await page.locator('[data-run-cell="1"]').evaluate(n=>document.activeElement===n),true);
  const code=[await editor(0,'getValue'),await editor(1,'getValue')];assert.equal(code[0],"import pandas as pd\ndata = pd.read_csv('sensor_data.csv')\n");assert.equal(code[1],"sensor_stats = data.groupby('SensorType')['Value'].agg(['count', 'mean'])\nprint(sensor_stats)");
  await page.locator('[data-run-cell="0"]').click();await page.locator('#output-0').getByText('运行完成').waitFor();assert.equal(executed[0],code[0]);
  await page.locator('[data-stage=answer][role=tab]').click();await page.locator('#save-practical').click();await page.locator('#draft-state').getByText('答案已保存').waitFor();assert.equal(saved.code.code1,'');assert(saved.notebookBlanks[0].length===1&&saved.notebookBlanks[1].length===3);
  await page.reload();await tools();assert.equal(await page.locator('[data-blank-progress]').textContent(),'已填写 4 / 4 空');assert.equal(await editor(1,'getValue'),code[1]);
  await page.locator('[data-cell-blanks="0"] [data-cell-next]').click();await page.keyboard.type('temporary');await page.keyboard.press('Meta+z');assert.equal(await editor(0,'getValue'),code[0]);
  await page.locator('[data-cell-blanks="0"] [data-cell-next]').click();await page.keyboard.press('Backspace');await page.keyboard.press('Tab');assert.equal(await page.locator('[data-blank-progress]').textContent(),'已填写 3 / 4 空');
  await page.setViewportSize({width:375,height:812});await page.locator('[data-pane=lab]').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),375);assert(await page.locator('[data-cell-next]').first().isVisible());
  if(out)await page.locator('#tool-notebook').screenshot({path:path.join(out,'mobile.png')});
  await page.locator('.notebook-blank').first().click();await page.keyboard.type("pd.read_csv('sensor_data.csv')");assert.equal(await page.locator('[data-blank-progress]').textContent(),'已填写 4 / 4 空');
  const download=page.waitForEvent('download');await page.locator('.tool-more summary').click();await page.locator('#download-notebook').click();const file=await (await download).path();const book=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(book.cells[0].source.join(''),code[0]);
  assert.deepEqual(errors,[]);console.log('Click replacement, keyboard/mobile blank navigation, progress, empty/run guard, exact code, undo, save/restore and export passed');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
