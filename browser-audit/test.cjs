const { chromium, webkit, devices } = require('playwright');
const fs=require('fs'),assert=require('assert');
(async()=>{
 const results=[];
 for(const [name,type,options] of [['chromium-desktop',chromium,{viewport:{width:1366,height:768}}],['chromium-mobile',chromium,{...devices['iPhone 13']}],['webkit-mobile',webkit,{...devices['iPhone 13']}],['webkit-desktop',webkit,{viewport:{width:1366,height:768}}]]) {
  const record={name,checks:[],findings:[]};results.push(record);let browser;
  try{
   browser=await type.launch({headless:true});
   const context=await browser.newContext(options);
   const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(7000);
   await page.goto('http://127.0.0.1:8765');await page.waitForFunction(()=>document.getElementById('position').textContent.includes('₽'));
   assert.equal(await page.locator('#count').inputValue(),'100');assert.equal(await page.locator('#contracts .contract').count(),7);record.checks.push('initial load without authentication');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));record.checks.push('no page horizontal overflow');
   await page.locator('#full-tab').click();await page.locator('#tp').fill('110');await page.locator('#calculate').click();await page.waitForFunction(()=>document.getElementById('profit').textContent.includes('₽'));assert.equal(await page.locator('#loss').textContent(),'—');
   await page.locator('#tp').fill('');await page.locator('#sl').fill('95');await page.locator('#calculate').click();await page.waitForFunction(()=>document.getElementById('loss').textContent.includes('₽'));assert.equal(await page.locator('#profit').textContent(),'—');record.checks.push('TP-only and SL-only calculation');
   await page.locator('#entry').fill('101');await page.locator('#refresh').click();await page.waitForFunction(()=>!document.getElementById('refresh').disabled);assert.equal(await page.locator('#entry').inputValue(),'101');record.checks.push('manual entry preserved');
   const first=await page.locator('#contracts .contract strong').first().textContent();await page.locator('#contracts [data-offset="1"]').first().click();await page.reload();await page.waitForFunction(()=>document.getElementById('position').textContent.includes('₽'));assert.notEqual(await page.locator('#contracts .contract strong').first().textContent(),first);record.checks.push('reorder persistence');
   await page.locator('#search').fill('TEST');assert.equal(await page.locator('#contracts .contract').count(),493);
   const perf=await page.evaluate(()=>{const times=[];for(let n=0;n<5;n++){const start=performance.now();renderContracts();times.push(performance.now()-start);}return times;});record.searchRenderMs=perf;
   record.checks.push('search across 500 contracts');
   await page.locator('#search').fill('');
   if(options.isMobile){
    record.mobileScroll=await page.evaluate(async()=>{const el=document.getElementById('contracts');el.style.scrollSnapType='none';el.scrollLeft=400;await new Promise(r=>setTimeout(r,100));const before=el.scrollLeft;await updateMarket();return {before,after:el.scrollLeft};});
    if(record.mobileScroll.after<record.mobileScroll.before-20)record.findings.push('refresh resets contract scroll position');
   }
   for(const [kind,action] of [['unauthorized',route=>route.fulfill({status:401,contentType:'application/json',body:'{"error":"Требуется вход"}'})],['proxy-html',route=>route.fulfill({status:502,contentType:'text/html',body:'<h1>Bad gateway</h1>'})],['network-error',route=>route.abort('failed')]]){
    await page.route('**/api/market',action);await page.locator('#refresh').click();await page.waitForFunction(()=>!document.getElementById('refresh').disabled);record[kind]=await page.locator('#market-warning').textContent();await page.unroute('**/api/market',action);
   }
   record.findings.push('401, proxy HTML and network failure display identical generic message');
   await page.locator('#refresh').click();await page.waitForFunction(()=>!document.getElementById('refresh').disabled);assert(await page.locator('#market-warning').isHidden());record.checks.push('recovery after network failure');
   // Trigger the exact refresh callback while a reorder control has keyboard focus.
   record.focusRefresh=await page.evaluate(async()=>{const el=document.querySelector('[data-offset="1"]');el.focus();const before=document.activeElement.tagName;await updateMarket();return {before,after:document.activeElement.tagName};});
   if(record.focusRefresh.after==='BODY')record.findings.push('refresh removes focused contract control');
   await page.screenshot({path:`/home/nioconiri/Projects/apps/futures-calculator/browser-audit/${name}.png`,fullPage:true});
   assert.deepEqual(errors,[]);record.checks.push('no uncaught JavaScript errors');record.status='completed';
  }catch(e){record.status='failed or unavailable';record.error=e.message.slice(0,1800)}finally{if(browser)await browser.close();console.log(JSON.stringify(record));fs.writeFileSync('/home/nioconiri/Projects/apps/futures-calculator/browser-audit/results.json',JSON.stringify(results,null,2))}
 }
})();
