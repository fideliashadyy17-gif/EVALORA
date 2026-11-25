// Deterministic TypeScript AST inventory. No runtime/remote calls.
// node scripts/audit-authorization.mjs [output.json]
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
const files=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(/\.tsx?$/.test(p))files.push(p);}}
walk('src');
const rows=[];
const entrypoints=[];
const roleBranches=[];
for(const file of files.sort()){
 const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 function visit(node,owner='<module>'){
  if(ts.isFunctionDeclaration(node)||ts.isMethodDeclaration(node)||ts.isArrowFunction(node)||ts.isFunctionExpression(node)){
   owner=node.name?.getText(source) ?? (ts.isVariableDeclaration(node.parent)?node.parent.name.getText(source):owner);
  }
  if(ts.isFunctionDeclaration(node) && node.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)) {
   const name=node.name?.text ?? 'default';
   if(file.endsWith('/route.ts') || source.text.includes('"use server"') || source.text.includes("'use server'"))
    entrypoints.push({file,line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1,operation:name});
  }
  if(ts.isIfStatement(node) && /platform_role|host_id|owner_id|created_by|organization_id/.test(node.expression.getText(source)))
   roleBranches.push({file,line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1,operation:owner,condition:node.expression.getText(source)});
  if(ts.isCallExpression(node)){
   const callee=node.expression.getText(source);
   let kind=null;
   if(['can','canOperate','requireSuperAdmin','requireUser','getSessionContext','hasPermission','requirePermission','resolvePermission','getCapabilities','requireCapability','requireModule','isFeatureEnabledFor'].includes(callee))kind=callee;
   else if(callee.endsWith('.rpc'))kind='rpc';
   if(kind)rows.push({file,line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1,operation:owner,guard:kind,arguments:node.arguments.map(a=>a.getText(source))});
  }
  ts.forEachChild(node,child=>visit(child,owner));
 }
 visit(source);
}
const result={version:2,notice:'Static call-site inventory, not proof of enforcement. Inspect ownership/token checks, raw platform_role branches, SQL policies and service-role queries independently.',counts:Object.fromEntries([...new Set(rows.map(r=>r.guard))].sort().map(k=>[k,rows.filter(r=>r.guard===k).length])),sites:rows,entrypoints,roleBranches};
const json=JSON.stringify(result,null,2)+'\n';
if(process.argv[2])fs.writeFileSync(process.argv[2],json);else process.stdout.write(json);
