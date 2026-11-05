// Real parser tests; no production database or network access.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Module } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import * as XLSX from '@e965/xlsx';
function compile(source, fileName) {
  const file = path.resolve(fileName); const m = new Module(file); m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(ts.transpileModule(readFileSync(source, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, file);
  return m.exports;
}
const csv = compile('src/lib/csv.ts', 'scripts/__csv_test.cjs');
const file = path.resolve('scripts/__extract_test.cjs');
const original = Module._load;
Module._load = function(request, parent) {
  if(parent?.filename===file && request==='./csv') return csv;
  return original.apply(this,arguments);
};
const {extractStudentRows} = compile('src/lib/extractServer.ts', file);
const {toCsv} = compile('src/lib/utils.ts', 'scripts/__utils_test.cjs');
let checks=0;
async function test(name, fn) { await fn(); checks++; console.log('  ✓ '+name); }
try {
  for (const format of ['xlsx','xls']) {
    await test(`${format} extraction chooses larger sheet and preserves text identifiers`, async()=>{
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['empty']]), 'Small');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['name','id'],['Ada','0012'],['Béatrice','A,2']]), 'Students');
      const buffer = XLSX.write(wb,{bookType:format==='xls'?'biff8':'xlsx',type:'buffer'});
      const actual = await extractStudentRows('students.'+format,buffer);
      assert.deepEqual(actual.rows,[['name','id'],['Ada','0012'],['Béatrice','A,2']]);
      assert.equal(actual.sheet,'Students'); assert.deepEqual(actual.sheets,['Small','Students']); assert.equal(actual.warnings.length,1);
    });
  }
  await test('spreadsheet extraction enforces output dimensions',async()=>{
    const wb=XLSX.utils.book_new();
    const rows=Array.from({length:5002},(_,i)=>Array.from({length:34},(_,j)=>`${i}-${j}`));
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'Data');
    const result=await extractStudentRows('students.xlsx',XLSX.write(wb,{bookType:'xlsx',type:'buffer'}));
    assert.equal(result.rows.length,5000); assert.equal(result.rows[0].length,32);
  });
  await test('formula-like untrusted text is neutralized while numbers remain numeric',()=>{
    const cells=['=1+1','+cmd','-42','@SUM(A1)','  =1','\tfoo','\rfoo','safe','a,b','a"b',-42,0,null];
    assert.deepEqual(csv.parseCsv(toCsv([cells]))[0],["'=1+1","'+cmd","'-42","'@SUM(A1)","'  =1","'\tfoo","'\rfoo",'safe','a,b','a"b','-42','0','']);
  });
  await test('multiline and carriage returns are quoted and round trip',()=>{
    assert.deepEqual(csv.parseCsv(toCsv([['one\rtwo','three\nfour','"quoted"']]))[0],['one\rtwo','three\nfour','"quoted"']);
  });
  console.log(`\n${checks} spreadsheet import and CSV safety checks passed (real parser).`);
} finally {Module._load=original;}
