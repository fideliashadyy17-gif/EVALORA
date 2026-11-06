// Exercises the real server action with mocked authorization and database.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Module} from 'node:module';
import path from 'node:path';
import ts from 'typescript';
const file=path.resolve('scripts/__virtual_publication_action.cjs');
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
let ctx, rows, fail, writes;
const publisher='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function setup(){ctx={org:{id:'a'},allowed:true,user:{id:publisher,email:'marker@example.com'}};rows=[{id,organization_id:'a',settings:{proctoring:true,results_published:false}}];fail={};writes=[];}
const db={from(table){assert.equal(table,'exams');const filters=[];let patch;const q={select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},update(p){patch=p;return q;},async maybeSingle(){if(fail[patch?'write':'read'])return {data:null,error:{message:'failure'}};const found=rows.find(r=>filters.every(f=>f(r)));if(!found)return {data:null,error:null};if(patch){Object.assign(found,patch);writes.push(patch);}return {data:{...found},error:null};}};return q;}};
const load=Module._load;Module._load=function(request,parent){if(parent?.filename===file){
 if(request==='@/lib/auth')return {requireUser:async()=>ctx,activeOrg:c=>c.org,can:c=>c.allowed,CREATOR_ROLES:[],MARKER_ROLES:[],PROCTOR_ROLES:[]};
 if(request==='@/lib/entitlements'||request==='@/lib/capabilities'||request==='@/lib/utils'||request==='@/lib/ai-marking')return {};
 if(request==='@/lib/supabase/server')return {createClient:async()=>db};
 if(request==='next/cache')return {revalidatePath:()=>{}};
 if(request==='next/navigation')return {redirect:url=>{let e=Error(url);e.url=url;throw e;}};
}return load.apply(this,arguments);};
const m=new Module(file);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(ts.transpileModule(readFileSync('src/app/dashboard/exams/actions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);Module._load=load;
async function run(exam=id,publish='1'){const fd=new FormData();fd.set('exam_id',exam);fd.set('publish',publish);try{await m.exports.publishResults(fd);throw Error('redirect expected');}catch(e){if(!e.url)throw e;return e.url;}}
let count=0;async function test(name,fn){setup();await fn();count++;console.log('  ✓ '+name);}
await test('publishes and preserves other settings',async()=>{assert.match(await run(),/publish_ok=1/);assert.deepEqual(rows[0].settings,{proctoring:true,results_published:true});});
await test('publishing stamps who released the marks',async()=>{assert.match(await run(),/publish_ok=1/);assert.equal(writes.length,1);assert.equal(writes[0].grades_published_by,publisher);assert.ok(writes[0].grades_published_at);});
await test('unpublishes and clears the release stamp',async()=>{rows[0].settings.results_published=true;assert.match(await run(id,'0'),/publish_ok=1/);assert.equal(rows[0].settings.results_published,false);assert.equal(writes[0].grades_published_at,null);assert.equal(writes[0].grades_published_by,null);});
await test('wrong tenant denied without write',async()=>{ctx.org.id='b';assert.match(await run(),/publish_error/);assert.equal(writes.length,0);});
await test('missing workspace or insufficient role denied',async()=>{ctx.org=null;assert.equal(await run(),'/dashboard/exams');ctx.org={id:'a'};ctx.allowed=false;assert.equal(await run(),'/dashboard/exams');assert.equal(writes.length,0);});
await test('invalid input and path rejected',async()=>{assert.equal(await run('../other'),'/dashboard/exams');assert.match(await run(id,'yes'),/publish_error/);assert.equal(writes.length,0);});
await test('database read and update failures are not success',async()=>{fail.read=true;assert.match(await run(),/publish_error/);assert.equal(writes.length,0);fail.read=false;fail.write=true;assert.match(await run(),/publish_error/);assert.equal(writes.length,0);});
console.log(`\n${count} result publication action checks passed (mocked auth/database).`);
