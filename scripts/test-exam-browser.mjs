// Optional isolated browser smoke test. Install temporary test-only dependencies:
// npm install --no-save --package-lock=false --ignore-scripts @sparticuz/chromium@153.0.0 playwright-core@1.64.1
// Run a local Next server on port 3101 with mock.invalid Supabase environment values,
// then run this script. All /api/exam requests are intercepted; never use real data.
import assert from 'node:assert/strict';
import { existsSync, unlinkSync } from 'node:fs';
process.env.AWS_LAMBDA_JS_RUNTIME ??= 'nodejs22.x';
const { chromium: playwright } = await import('playwright-core');
const { default: chromium } = await import('@sparticuz/chromium');
if (existsSync('/tmp/chromium') && !existsSync('/tmp/al2023/lib/libnspr4.so')) unlinkSync('/tmp/chromium');
const executablePath=await chromium.executablePath();
process.env.LD_LIBRARY_PATH=['/tmp/al2023/lib', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
const browser=await playwright.launch({headless:true,executablePath,args:chromium.args});
const context=await browser.newContext();const page=await context.newPage();
const aid='00000000-0000-4000-8000-000000000001',token='00000000-0000-4000-8000-000000000002',qids=['00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004'];
const server={online:false,answers:{},status:'in_progress',submits:0,saves:0,incidents:[],deadlineMode:false,resultsPublished:false,correctionsPublished:true,score:4,maxScore:5,pendingManualCount:0,gradingStatus:'graded'};
const responseState=()=>({server_now:new Date().toISOString(),exam:{id:'exam',title:'Mock Examination',description:null,instructions:null,proctoring:false,require_screen_share:false,pass_mark_percent:50,integrity:{enabled:true,tabSwitch:true,focusLoss:true,fullscreen:true,clipboard:true,sound:false,warnAfter:3,reviewAfter:5}},candidate:{name:'Test Candidate',ref:null},attempt:{id:aid,status:server.status,submission_reason:server.status==='auto_submitted'?'deadline':server.status==='submitted'?'candidate_confirmed':null,deadline:new Date(Date.now()+(server.deadlineMode?-1000:3600000)).toISOString(),flagged:[],score:server.resultsPublished?server.score:null,max_score:server.resultsPublished?server.maxScore:null,results_published:server.resultsPublished,corrections_published:server.resultsPublished&&server.correctionsPublished,grading_status:server.gradingStatus,pending_manual_count:server.pendingManualCount,result_channel:server.resultsPublished?null:'mock-channel'},questions:qids.map((id,i)=>({question_id:id,quiz_question_id:`quiz-${i}`,type:'short_answer',prompt:`Question ${i+1}`,points:1,media_url:null,media_type:null,options:[],saved_answer:server.answers[id]??null,result:null}))});
let requests=0;
await page.addInitScript(({id,t})=>{if(!localStorage.getItem(`evalora-attempt-${id}`))localStorage.setItem(`evalora-attempt-${id}`,JSON.stringify({token:t}));},{id:aid,t:token});
await page.route('**/api/exam/**',async route=>{const request=route.request();const url=new URL(request.url());
 if(url.pathname==='/api/exam/state'){assert.equal(url.searchParams.has('token'),false);assert.equal(request.headers().authorization,`Bearer ${token}`);requests++;return route.fulfill({status:200,json:responseState()});}
 if(url.pathname==='/api/exam/save'){server.saves++;if(!server.online)return route.fulfill({status:503,json:{error:'offline'}});const payload=request.postDataJSON();server.answers[payload.question_id]=payload.answer;return route.fulfill({status:200,json:{ok:true}});}
 if(url.pathname==='/api/exam/integrity'){const payload=request.postDataJSON();server.incidents.push(payload);const count=server.incidents.filter(x=>!['tab_visible','focus_back','online'].includes(x.event)).length;return route.fulfill({status:200,json:{ok:true,count,level:count>=5?'review':count>=3?'strong':count?'warn':'none'}});}
 if(url.pathname==='/api/exam/submit'){assert.equal(request.postDataJSON().confirmation,'candidate_confirmed');server.submits++;server.status=server.deadlineMode?'auto_submitted':'submitted';return route.fulfill({status:200,json:{ok:true,status:server.status,submission_reason:server.deadlineMode?'deadline':'candidate_confirmed'}});}
 throw Error('Unexpected request '+url.pathname);
});
try {
 await page.goto(`http://127.0.0.1:3101/take-exam/${aid}`,{waitUntil:'domcontentloaded',timeout:120000});
 await page.getByText('Mock Examination').waitFor({timeout:120000});
 await page.evaluate(()=>{window.dispatchEvent(new Event('blur'));window.dispatchEvent(new KeyboardEvent('keydown',{key:'Meta',bubbles:true}));document.dispatchEvent(new Event('fullscreenchange'));});
 await page.getByText('Repeated activity recorded').waitFor({timeout:15000});
 assert.equal(server.incidents.length,3);assert.equal(server.status,'in_progress');assert.equal(server.submits,0);
 await page.getByText(/does not submit or stop your work/i).waitFor();
 const text=page.getByPlaceholder('Type your answer…');await text.fill('draft value');
 await page.getByRole('button',{name:'Submit examination'}).click();await page.getByRole('button',{name:'Yes, submit now'}).click();await page.getByText(/Some answers are not confirmed/).waitFor();assert.equal(server.submits,0);await page.getByRole('button',{name:'Keep working'}).click();
 await page.getByRole('button',{name:'Next →'}).click();await page.getByRole('button',{name:'← Previous'}).click();assert.equal(await text.inputValue(),'draft value');
 await page.getByRole('button',{name:'Save answer'}).click();await page.getByText(/1 answer\(s\) awaiting confirmation/).waitFor();await page.getByText(/answer could not be confirmed/).waitFor();
 await page.reload({waitUntil:'domcontentloaded'});await page.getByText('Mock Examination').waitFor();await page.getByText(/1 answer\(s\) awaiting confirmation/).waitFor();assert.equal(await page.getByPlaceholder('Type your answer…').inputValue(),'draft value');
 server.online=true;await page.getByRole('button',{name:'Retry saving'}).click();await page.getByText('1 of 2 answers confirmed by the server.').waitFor();assert.equal(server.answers[qids[0]].text,'draft value');
 await page.getByRole('button',{name:'Next →'}).click();await page.getByPlaceholder('Type your answer…').fill('temporary');await page.getByRole('button',{name:'Save answer'}).click();await page.getByText('2 of 2 answers confirmed by the server.').waitFor();assert.equal(server.answers[qids[1]].text,'temporary');
 await page.getByRole('button',{name:'Submit examination'}).click();await page.getByRole('button',{name:'Yes, submit now'}).click();await page.getByText('Your paper has been submitted').waitFor();assert.equal(server.submits,1);assert.ok(requests>=3);
 await page.getByText(/Results will appear here once your institution validates and publishes them/i).waitFor();
 assert.equal(await page.getByText(/Score: 4 \/ 5/).count(),0,'manual-mode score is withheld before publication');
 server.resultsPublished=true;const publicationStarted=Date.now();
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await page.getByText('Your result is now available!').waitFor({timeout:10000});
 await page.getByText(/Score: 4 \/ 5/).waitFor();
 const displayMs=Date.now()-publicationStarted;
 assert.ok(displayMs<10000,`online recovery reveals a newly published result without page reload (${displayMs} ms)`);
 server.resultsPublished=false;server.status='in_progress';server.deadlineMode=true;server.submits=0;
 await page.reload({waitUntil:'domcontentloaded'});await page.getByText('Mock Examination').waitFor();
 await page.getByRole('button',{name:'Submit examination'}).click();await page.getByRole('button',{name:'Yes, submit now'}).click();
 await page.getByText('Time expired — paper submitted automatically').waitFor();assert.equal(server.status,'auto_submitted');assert.equal(server.submits,1);
 console.log('PASS: real Chromium examination flow with mocked API: focus/Meta/fullscreen warnings do not close the attempt; answer recovery, manual result withholding, newly published result recovery without page reload, and deadline outcome.');console.log(`state requests=${requests}, incident events=${server.incidents.length}, save attempts=${server.saves}, publication display via reconnect=${displayMs} ms`);
}finally {await context.close();await browser.close()}
