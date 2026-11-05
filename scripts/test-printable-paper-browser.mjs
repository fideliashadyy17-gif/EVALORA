// Optional: run after production build and test-printable-paper-page.mjs with
// PAPER_TEST_HTML=/tmp/evalora-paper.html. Requires temporary playwright-core
// and @sparticuz/chromium. The rendered page uses mocked auth/database.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {chromium as playwright} from 'playwright-core';
import chromium from '@sparticuz/chromium';
const dir='.next/static/chunks';
const css=readdirSync(dir).filter(n=>n.endsWith('.css')).map(n=>readFileSync(`${dir}/${n}`,'utf8')).find(s=>s.includes('paper-print'));
assert.ok(css,'build CSS with print styles must exist');
const paper=readFileSync('/tmp/evalora-paper.html','utf8');
const executablePath=await chromium.executablePath();
process.env.LD_LIBRARY_PATH=['/tmp/al2023/lib',process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
const browser=await playwright.launch({headless:true,executablePath,args:chromium.args});
try {
 const page=await browser.newPage({viewport:{width:1200,height:900}});
 await page.setContent(`<html><head><style>${css}</style></head><body><div class="demo-banner">PRIVATE BANNER</div><div class="dashboard-chrome"><aside>NAVIGATION</aside><div><header>TOPBAR</header><main>${paper}</main></div></div></body></html>`);
 await page.emulateMedia({media:'print'});
 for (const selector of ['aside','body > .demo-banner','header:not(.paper-cover)']) assert.equal(await page.locator(selector).first().evaluate(e=>getComputedStyle(e).display),'none',selector);
 assert.equal(await page.locator('button').first().isVisible(),false);
 assert.equal(await page.locator('.dashboard-chrome').evaluate(e=>getComputedStyle(e).display),'block');
 assert.notEqual(await page.locator('.paper-cover').evaluate(e=>getComputedStyle(e).display),'none');
 const pdf=await page.pdf({format:'A4',printBackground:true});assert.ok(pdf.length>1000);assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
 console.log('PASS: Chromium print-media layout hides dashboard controls and creates an A4 PDF from the mocked server-rendered paper.');
} finally {await browser.close();}
