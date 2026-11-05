// Exercise the real LiveKit token endpoint with mocked DB, auth, flags and JWT boundary.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Module,createRequire} from 'node:module';
import path from 'node:path';
import ts from 'typescript';
const f=path.resolve('scripts/__livekit_route.cjs');
const ids={exam:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',attempt:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',token:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',candidate:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'};
let session, attemptCtx, exam, setting, settingError, entitlement, flag, grant, opts, bypasses, now;
let useRealSdk=false;const realSdk=createRequire(import.meta.url)('livekit-server-sdk');
function setup(){now=Date.now();session=null;exam={id:ids.exam,organization_id:'org-a',duration_minutes:60,ends_at:null,settings:{proctoring:true}};attemptCtx={attempt:{id:ids.attempt,exam_id:ids.exam,candidate_id:ids.candidate,status:'in_progress',started_at:new Date(now).toISOString(),extension_minutes:0},candidate:{id:ids.candidate,exam_id:ids.exam,full_name:'Test'}};setting=null;settingError=null;entitlement=false;flag=true;grant=null;opts=null;bypasses=[];}
const db={from(table){const q={select(){return q;},eq(){return q;},async maybeSingle(){if(table==='exams')return {data:exam};if(table==='platform_settings')return {data:setting,error:settingError};throw Error('unexpected '+table);}};return q;}};
class Token{constructor(_key,_secret,options){if(useRealSdk)return new realSdk.AccessToken(_key,_secret,options);opts=options;}addGrant(g){grant=g;}async toJwt(){return 'mock.jwt';}}
const original=Module._load;Module._load=function(req,parent){if(parent?.filename===f){
 if(req==='@/lib/auth')return {getSessionContext:async()=>session,activeOrg:c=>c.org,can:c=>c.allowed,PROCTOR_ROLES:[]};
 if(req==='@/lib/entitlements')return {getEntitlement:async(_db,_org,o)=>{bypasses.push(o.ownerBypass);return {limits:{proctoring:o.ownerBypass||entitlement}};},getEntitlementFor:async()=>({limits:{proctoring:entitlement||session?.profile.platform_role==='super_admin'}})};
 if(req==='@/lib/platform')return {isFeatureEnabled:async(_key,o)=>flag||o.ownerBypass};
 if(req==='@/lib/exam')return {loadAttemptContext:async()=>attemptCtx,attemptDeadline:(_e,started,ext)=>new Date(new Date(started).getTime()+(60+ext)*60000)};
 if(req==='@/lib/supabase/server')return {createAdminClient:()=>db,createClient:async()=>db};
 if(req==='livekit-server-sdk')return {AccessToken:Token};
 if(req==='next/server')return {NextResponse:{json:(body,o)=>({status:o?.status??200,body})}};
}return original.apply(this,arguments);};
const m=new Module(f);m.filename=f;m.paths=Module._nodeModulePaths(path.dirname(f));m._compile(ts.transpileModule(readFileSync('src/app/api/livekit/token/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);Module._load=original;
process.env.LIVEKIT_API_KEY='test-key';process.env.LIVEKIT_API_SECRET='test-secret';process.env.NEXT_PUBLIC_LIVEKIT_URL='wss://example.invalid';
const req=(override={})=>({json:async()=>({exam_id:ids.exam,attempt_id:ids.attempt,token:ids.token,role:'candidate',...override})});
const active=(role='user')=>({profile:{platform_role:role,status:'active',email:'staff@example.invalid'},user:{id:'staff'},org:{id:'org-a'},allowed:true});
let n=0;async function test(name,fn){setup();await fn();n++;console.log('  ✓ '+name);}
await test('candidate can publish but cannot subscribe to other candidates',async()=>{entitlement=true;assert.equal((await m.exports.POST(req())).status,200);assert.equal(grant.canPublish,true);assert.equal(grant.canSubscribe,false);assert.ok(opts.ttl>0&&opts.ttl<=3600);});
await test('supervisor can subscribe but cannot publish',async()=>{session=active();entitlement=true;assert.equal((await m.exports.POST(req({role:'supervisor'}))).status,200);assert.equal(grant.canPublish,false);assert.equal(grant.canSubscribe,true);});
await test('suspended Super Admin and supervisor rejected',async()=>{session=active('super_admin');session.profile.status='suspended';flag=false;assert.equal((await m.exports.POST(req({role:'supervisor'}))).status,403);assert.equal(grant,null);});
await test('wrong-tenant or unprivileged supervisor rejected',async()=>{session=active();session.org.id='org-b';assert.equal((await m.exports.POST(req({role:'supervisor'}))).status,403);session.org.id='org-a';session.allowed=false;assert.equal((await m.exports.POST(req({role:'supervisor'}))).status,403);});
await test('unpaid tenant cannot bypass by editable organization flag',async()=>{entitlement=false;assert.equal((await m.exports.POST(req())).status,403);assert.deepEqual(bypasses,[false]);});
await test('trusted platform setting grants owner workspace only',async()=>{setting={value:{organization_id:'org-a'}};assert.equal((await m.exports.POST(req())).status,200);assert.deepEqual(bypasses,[true]);setup();setting={value:{organization_id:'org-b'}};assert.equal((await m.exports.POST(req())).status,403);});
await test('trusted setting read error fails closed',async()=>{setting={value:{organization_id:'org-a'}};settingError={message:'failure'};assert.equal((await m.exports.POST(req())).status,403);assert.deepEqual(bypasses,[false]);});
await test('expired, invalid, foreign, and submitted attempts rejected',async()=>{entitlement=true;attemptCtx.attempt.started_at=new Date(now-61*60000).toISOString();assert.equal((await m.exports.POST(req())).status,403);attemptCtx.attempt.started_at=new Date(now).toISOString();attemptCtx.attempt.status='submitted';assert.equal((await m.exports.POST(req())).status,403);attemptCtx.attempt.status='in_progress';attemptCtx.attempt.exam_id='foreign';assert.equal((await m.exports.POST(req())).status,403);attemptCtx=null;assert.equal((await m.exports.POST(req())).status,403);});
await test('candidate identity must belong to examination and attempt',async()=>{entitlement=true;attemptCtx.candidate.exam_id='foreign';assert.equal((await m.exports.POST(req())).status,403);attemptCtx.candidate.exam_id=ids.exam;attemptCtx.candidate.id='other';assert.equal((await m.exports.POST(req())).status,403);});
await test('global toggle applies to customers but not active Super Admin',async()=>{flag=false;entitlement=true;assert.equal((await m.exports.POST(req())).status,503);session=active('super_admin');assert.equal((await m.exports.POST(req({role:'supervisor'}))).status,200);});
await test('missing credentials or disabled examination denied',async()=>{assert.equal((await m.exports.POST(req({token:undefined}))).status,400);exam.settings.proctoring=false;assert.equal((await m.exports.POST(req())).status,403);});
useRealSdk=true;await test('actual LiveKit SDK signs a candidate JWT with room and subscription permissions',async()=>{entitlement=true;const r=await m.exports.POST(req());assert.equal(r.status,200);const payload=await new realSdk.TokenVerifier(process.env.LIVEKIT_API_KEY,process.env.LIVEKIT_API_SECRET).verify(r.body.token);assert.equal(payload.sub,`candidate-${ids.candidate}`);assert.equal(payload.video.room,`exam-${ids.exam}`);assert.equal(payload.video.canSubscribe,false);assert.equal(payload.video.canPublish,true);assert.ok(payload.exp<=Math.floor(now/1000)+3601);});
console.log(`\n${n} LiveKit token security checks passed (actual route; mocked DB/auth; final check uses actual LiveKit SDK).`);
