const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
const source=fs.readFileSync(`${__dirname}/../app/route/_components/OptimizationView.tsx`,'utf8');
const tree=ts.createSourceFile('view.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let declaration;
(function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(tree)==='handleTransferStops')declaration=node.parent.parent.getText(tree);ts.forEachChild(node,visit)})(tree);
assert.ok(declaration,'Actual transfer callback exists');
const compiled=ts.transpileModule(declaration,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
function setup({saveError,completionError,refreshError}={}){
 const calls=[],messages=[],refreshed=[];
 const context={useCallback:fn=>fn,route:{id:47,job_ids:[1,2],result:{routes:[{team_member_id:10,leg:'GO'},{team_member_id:20,team_member_name:'Destination',leg:'RETURN'}]}},
 transferRouteStops:async(...args)=>{calls.push(args);if(saveError)throw saveError;return{success:true,is_async:true,message:'Saved'}},
 message:Object.fromEntries(['loading','success','error','warning'].map(kind=>[kind,value=>messages.push([kind,value])])),
 fetchOptimization:async id=>{refreshed.push(['plan',id]);if(refreshError)throw refreshError},fetchJobsByIds:async ids=>refreshed.push(['jobs',ids]),refreshUndoHistory:async()=>refreshed.push(['undo']),
 setOptimizationResult:()=>{},setHasUnsavedJobEdits:()=>{},waitUntilComplete:async()=>{if(completionError)throw completionError},useJobsStore:{getState:()=>({error:null})}};
 const fn=new Function(...Object.keys(context),compiled+';return handleTransferStops;')(...Object.values(context));
 return{fn,calls,messages,refreshed};
}
test('a rejected transfer rejects the callback so the dialog stays open',async()=>{
 const rejection=new Error('Capacity exceeded');const ctx=setup({saveError:rejection});
 await assert.rejects(ctx.fn(0,1,[1]),/Capacity exceeded/);assert.equal(ctx.calls.length,1);assert.equal(ctx.refreshed.length,0);
});
test('whole-leg requests include source and destination identity and refresh current plan jobs',async()=>{
 const ctx=setup();await ctx.fn(0,1,[1],undefined,false,{scope:'leg',leg:'GO'});
 assert.deepEqual(ctx.calls[0][6],{scope:'leg',leg:'GO',expected_source_driver_id:10,expected_target_driver_id:20,expected_source_leg:'GO',expected_target_leg:'RETURN'});
 assert.ok(ctx.refreshed.some(([kind,ids])=>kind==='jobs'&&JSON.stringify(ids)==='[1,2]'));
});
test('post-save refresh and optimizer failures do not report the saved transfer as rejected',async()=>{
 for(const failure of [{refreshError:new Error('Refresh failed')},{completionError:new Error('Optimization failed')}]){
  const ctx=setup(failure);await ctx.fn(0,1,[1],undefined,true);
  assert.equal(ctx.calls.length,1);assert.ok(ctx.messages.some(([kind])=>kind==='warning'));
  assert.ok(!ctx.messages.some(([kind])=>kind==='error'));
 }
});
