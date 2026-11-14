// Optional isolated browser smoke test. Install temporary test-only dependencies:
// npm install --no-save --package-lock=false --ignore-scripts @sparticuz/chromium@153.0.0 playwright-core@1.64.1
// Run a local Next server on port 3101 with mock.invalid Supabase environment values,
// then run this script. All /api/exam requests are intercepted; never use real data.
import assert from 'node:assert/strict';
import { chromium as playwright } from 'playwright-core';
import chromium from '@sparticuz/chromium';
const executablePath=await chromium.executablePath();
process.env.LD_LIBRARY_PATH=['/tmp/al2023/lib', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
const browser=await playwright.launch({headless:true,executablePath,args:chromium.args});
const context=await browser.newContext();const page=await context.newPage();
const aid='00000000-0000-4000-8000-000000000001',token='00000000-0000-4000-8000-000000000002',qids=['00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004'];
const server={online:false,answers:{},status:'in_progress',submits:0,saves:0};
const responseState=()=>({server_now:new Date().toISOString(),exam:{id:'exam',title:'Mock Examination',description:null,instructions:null,proctoring:false,require_screen_share:false,pass_mark_percent:50},candidate:{name:'Test Candidate',ref:null},attempt:{id:aid,status:server.status,deadline:new Date(Date.now()+3600000).toISOString(),flagged:[],score:null,max_score:null,results_published:false},questions:qids.map((id,i)=>({question_id:id,quiz_question_id:`quiz-${i}`,type:'short_answer',prompt:`Question ${i+1}`,points:1,media_url:null,media_type:null,options:[],saved_answer:server.answers[id]??null,result:null}))});
let requests=0;
await page.addInitScript(({id,t})=>{if(!localStorage.getItem(`evalora-attempt-${id}`))localStorage.setItem(`evalora-attempt-${id}`,JSON.stringify({token:t}));},{id:aid,t:token});
await page.route('**/api/exam/**',async route=>{const request=route.request();const url=new URL(request.url());
 if(url.pathname==='/api/exam/state'){assert.equal(url.searchParams.has('token'),false);assert.equal(request.headers().authorization,`Bearer ${token}`);requests++;return route.fulfill({status:200,json:responseState()});}
 if(url.pathname==='/api/exam/save'){server.saves++;if(!server.online)return route.fulfill({status:503,json:{error:'offline'}});const payload=request.postDataJSON();server.answers[payload.question_id]=payload.answer;return route.fulfill({status:200,json:{ok:true}});}
 if(url.pathname==='/api/exam/submit'){server.submits++;server.status='submitted';return route.fulfill({status:200,json:{ok:true}});}
 // The integrity monitor reports page_leave when the page unloads (the reload below). Accept it.
 if(url.pathname==='/api/exam/integrity'){return route.fulfill({status:200,json:{ok:true,recorded:false,count:0,level:'none',reason:'duplicate'}});}
 // Candidate messenger (ExamMessenger): an empty thread and an accepted heartbeat.
 if(url.pathname==='/api/exam/messages'){return route.fulfill({status:200,json:{server_now:new Date().toISOString(),messages:[],unread_from_teacher:0}});}
 if(url.pathname==='/api/exam/presence'){return route.fulfill({status:200,json:{ok:true}});}
 if(url.pathname==='/api/exam/retake') return route.fulfill({status:200,json:{attempt_number:1,attempt_label:'First attempt',submitted:true,can_request:false,can_start:false,message:'No retake requested.',pending:null,decision:null,grant:null,history:[]}});
 throw Error('Unexpected request '+url.pathname);
});
try {
 await page.goto(`http://127.0.0.1:3101/take-exam/${aid}`,{waitUntil:'domcontentloaded',timeout:120000});
 await page.getByText('Mock Examination').waitFor({timeout:120000});
 const text=page.getByPlaceholder('Type your answer…');await text.fill('draft value');
 await page.getByRole('button',{name:'Submit examination'}).click();await page.getByText('Save this answer or discard the changes before submitting.').waitFor();assert.equal(server.submits,0);
 page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Next →'}).click();assert.equal(await text.inputValue(),'draft value');
 await page.getByRole('button',{name:'Save answer'}).click();await page.getByText(/1 answer\(s\) awaiting confirmation/).waitFor();await page.getByText(/answer could not be confirmed/).waitFor();
 await page.reload({waitUntil:'domcontentloaded'});await page.getByText('Mock Examination').waitFor();await page.getByText(/1 answer\(s\) awaiting confirmation/).waitFor();assert.equal(await page.getByPlaceholder('Type your answer…').inputValue(),'draft value');
 server.online=true;await page.getByRole('button',{name:'Retry saving'}).click();await page.getByText('1 of 2 answers confirmed by the server.').waitFor();assert.equal(server.answers[qids[0]].text,'draft value');
 await page.getByRole('button',{name:'Next →'}).click();await page.getByPlaceholder('Type your answer…').fill('temporary');page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Discard unsaved changes'}).click();assert.equal(await page.getByPlaceholder('Type your answer…').inputValue(),'');
 await page.getByRole('button',{name:'Submit examination'}).click();await page.getByRole('button',{name:'Yes, submit now'}).click();await page.getByText('Your paper has been submitted').waitFor();assert.equal(server.submits,1);assert.ok(requests>=3);
 console.log('PASS: real Chromium examination flow using mocked API: draft guard, navigation, failed save, same-tab reload recovery, retry, discard, submit, header token.');console.log(`state requests=${requests}, save attempts=${server.saves}, submissions=${server.submits}`);
}finally {await context.close();await browser.close()}
