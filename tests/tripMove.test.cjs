const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
function compile(file, dependencies={}) {
 const output=ts.transpileModule(fs.readFileSync(`${__dirname}/../app/route/_components/${file}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const exports={};new Function('exports','require',output)(exports,name=>dependencies[name]);return exports;
}
const helpers=compile('tripMove.utils',{'./jobAddition.utils':compile('jobAddition.utils')});
const s=(type,time,id=null,extra={})=>({stop_type:type,arrival_time:`2026-09-29T${time}:00`,job_id:id,...extra});
const first=[s('depot_start','22:33'),s('pickup','22:40',1),s('dropoff','23:10',1),s('depot_end','23:17')];
const second=[s('depot_start','23:30'),s('pickup','23:35',2),s('dropoff','23:45',2),s('depot_end','23:55')];
test('home selects one complete trip and preserves the exact original indices, times and order',()=>{
 const route={team_member_id:7,leg:'GO',stops:[...first,...second]};
 const selected=helpers.selectTripToMove(route,8,4);
 assert.deepEqual(selected,{sourceRouteIndex:8,startStopIndex:4,sourceDriverId:7,sourceLeg:'GO',stops:second});
 assert.equal(helpers.selectTripToMove(route,8,1),null);
});
test('incomplete and pending trips cannot be moved through the home handle',()=>{
 for(const route of [{stops:first.slice(0,3)},{stops:[...first.slice(0,3),...second]},{stops:first,needs_optimization:true},{stops:first,is_team_leader:true},
 {stops:[first[0],{...first[1],needs_optimization:true},...first.slice(2)]}]) assert.equal(helpers.selectTripToMove({team_member_id:7,...route},0,0),null);
});
test('optimized NEW and EDITED highlights do not prevent trip reassignment',()=>{
 const highlighted=first.map(stop=>({...stop,is_new:true,is_edited:true,time_edited:true,needs_optimization:false}));
 assert.ok(helpers.selectTripToMove({team_member_id:7,stops:highlighted},0,0));
});

const timelineSource=fs.readFileSync(`${__dirname}/../app/route/_components/TimelineView.tsx`,'utf8');
const timelineTree=ts.createSourceFile('timeline.tsx',timelineSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const declarations=new Map();
(function visit(node){
 if(ts.isVariableDeclaration(node)&&['handleTripDragStart','handleTimelineDrop','handleTimelineTrackDragOver'].includes(node.name.getText(timelineTree))) declarations.set(node.name.getText(timelineTree),node.parent.parent.getText(timelineTree));
 ts.forEachChild(node,visit);
})(timelineTree);
function timelineHandler(name,context){
 assert.ok(declarations.has(name));
 const output=ts.transpileModule(declarations.get(name),{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
 return new Function(...Object.keys(context),output+`;return ${name};`)(...Object.values(context));
}
test('home drag creates a complete-trip payload and drop invokes the move action, not stop transfer',async()=>{
 const routes=[{team_member_id:7,leg:'GO',stops:first},{team_member_id:2,stops:second}];
 const data={},moves=[],dropTargets=[];
 const context={routes,selectTripToMove:helpers.selectTripToMove,onMoveTrip:(...args)=>moves.push(args),
  setOpenStopTooltipKey:()=>{},setDraggedStopInfo:()=>{},setDragOverStopInfo:()=>{},dragOverSlotRef:{current:null},
  setDraggedTrip:()=>{},setTripDropRouteIndex:index=>dropTargets.push(index),message:{warning:()=>assert.fail('Valid trip'),error:()=>assert.fail('Valid drop')}};
 const event={preventDefault(){},stopPropagation(){},dataTransfer:{setData:(kind,value)=>{data[kind]=value},getData:kind=>data[kind],types:['application/x-syncnox-trip']}};
 timelineHandler('handleTripDragStart',context)(event,0,0);
 assert.equal(event.dataTransfer.effectAllowed,'move');
 assert.deepEqual(JSON.parse(data['application/x-syncnox-trip']).stops,first);
 await timelineHandler('handleTimelineDrop',context)(event,1);
 assert.equal(moves.length,1);
 assert.equal(moves[0][1],1);
 assert.deepEqual(moves[0][0].stops,first);
 assert.equal(dropTargets.at(-1),null);
 await timelineHandler('handleTimelineDrop',context)(event,0);
 assert.equal(moves.length,1,'Dropping on the same driver does not move anything');
});
test('trip dragover highlights a recipient row instead of showing a stop insertion guide',()=>{
 const targets=[];
 const selection=helpers.selectTripToMove({team_member_id:7,stops:first},0,0);
 const fn=timelineHandler('handleTimelineTrackDragOver',{draggedTrip:selection,onMoveTrip:()=>{},routes:[{team_member_id:7},{team_member_id:2}],setTripDropRouteIndex:id=>targets.push(id)});
 const event={preventDefault(){},stopPropagation(){},dataTransfer:{types:['application/x-syncnox-trip']}};
 fn(event,1);assert.equal(event.dataTransfer.dropEffect,'move');assert.equal(targets.at(-1),1);
 fn(event,0);assert.equal(event.dataTransfer.dropEffect,'none');assert.equal(targets.at(-1),null);
});
