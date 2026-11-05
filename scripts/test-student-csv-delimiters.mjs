// Actual import extractor and CSV parser; verifies delimited text avoids xlsx.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Module} from 'node:module';
import path from 'node:path';
import ts from 'typescript';
function compile(source, target){const file=path.resolve(target);const m=new Module(file);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(ts.transpileModule(readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);return m.exports;}
const csv=compile('src/lib/csv.ts','scripts/__virtual_csv.cjs');
const file=path.resolve('scripts/__virtual_extract.cjs');const original=Module._load;let spreadsheetLoaded=false;
Module._load=function(request,parent){if(parent?.filename===file&&request==='./csv')return csv;if(parent?.filename===file&&request==='xlsx'){spreadsheetLoaded=true;throw Error('CSV must not invoke spreadsheet parser');}return original.apply(this,arguments);};
const {extractStudentRows}=compile('src/lib/extractServer.ts','scripts/__virtual_extract.cjs');
let checks=0;
async function test(name,fn){await fn();checks++;console.log(`  ✓ ${name}`);}
try {
 for(const [name,sep] of [['comma',','],['semicolon',';'],['tab','\t'],['pipe','|']]) await test(`${name} delimiter, quoted separator, escapes and CRLF`,async()=>{
  const text=`\uFEFFname${sep}ref${sep}notes\r\n"Doe${sep} Jane"${sep}0012${sep}"said ""hello"""\r\n`;
  const result=await extractStudentRows('students.csv',Buffer.from(text));assert.deepEqual(result.rows,[['name','ref','notes'],[`Doe${sep} Jane`.replace(/\s+/g,' '),'0012','said "hello"']]);assert.equal(result.method,`csv (${name}-separated)`);
 });
 await test('quoted commas do not misidentify semicolon separator',async()=>{const r=await extractStudentRows('students.csv',Buffer.from('"name, family, and first";email\n"Doe, Jane";jane@example.com'));assert.equal(r.method,'csv (semicolon-separated)');assert.deepEqual(r.rows[1],['Doe, Jane','jane@example.com']);});
 await test('quoted newline does not end delimiter detection',async()=>{const r=await extractStudentRows('students.csv',Buffer.from('"name\nand surname"|email\nAda|ada@example.com'));assert.equal(r.method,'csv (pipe-separated)');assert.deepEqual(r.rows[1],['Ada','ada@example.com']);});
 await test('blank lines and embedded line breaks remain compatible',async()=>{const r=await extractStudentRows('students.csv',Buffer.from('\n\nname;notes\nAda;"first\nsecond"'));assert.deepEqual(r.rows,[['name','notes'],['Ada','first second']]);});
 await test('legacy parser default remains comma-separated',async()=>{assert.deepEqual(csv.parseCsv('a,b\n"x,y",z'),[['a','b'],['x,y','z']]);assert.throws(()=>csv.parseCsv('a:b',':'),/Unsupported delimiter/);});
 assert.equal(spreadsheetLoaded,false);
 console.log(`\n${checks} student delimited-text checks passed (actual parser and extractor).`);
} finally {Module._load=original;}
