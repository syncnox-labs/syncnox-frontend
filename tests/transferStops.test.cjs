const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync(`${__dirname}/../app/route/_components/transferStops.utils.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const helpers={};new Function('exports',code)(helpers);
const jobs=[{id:1,job_type:'one_way'},{id:2,job_type:'return_only'},{id:3,job_type:'one_way'}];
const route={leg:'COMBINED',stops:[{stop_type:'depot_start'},{job_id:1,stop_type:'pickup'},{job_id:3,stop_type:'pickup'},{job_id:1,stop_type:'dropoff'},{job_id:3,stop_type:'dropoff'},{job_id:2,stop_type:'pickup'},{job_id:2,stop_type:'dropoff'},{stop_type:'depot_end'}]};
test('whole-leg selection includes every candidate once and excludes the other leg and depots',()=>{
 assert.deepEqual(helpers.legJobIds(route,jobs,'GO'),[1,3]);
 assert.deepEqual(helpers.legJobIds(route,jobs,'RETURN'),[2]);
});
test('stop direction can identify the leg while the job list is loading',()=>{
 assert.deepEqual(helpers.legJobIds({leg:'COMBINED',stops:[{job_id:1,leg:'GO'},{job_id:2,leg:'RETURN'}]},[],'RETURN'),[2]);
 assert.deepEqual(helpers.legJobIds({leg:'GO',stops:[{job_id:1},{job_id:1}]},[],'GO'),[1]);
});
