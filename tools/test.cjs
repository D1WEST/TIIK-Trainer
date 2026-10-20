const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const E=require('../app/engine.js'),bank=JSON.parse(fs.readFileSync(path.join(__dirname,'../app/bank.json'),'utf8'));
const byId=id=>bank.tasks.find(t=>t.id===id);
assert.equal(bank.tasks.length,529);assert.equal(new Set(bank.tasks.map(t=>t.id)).size,529);
assert.equal(bank.topics.reduce((n,t)=>n+t.count,0),529);
for(const t of bank.tasks){
  assert.ok(t.prompt && t.solution && bank.topics.some(v=>v.id===t.topic),`metadata ${t.id}`);
  assert.ok(E.grade(t,t.answer),`source answer accepted ${t.id}`);
  assert.ok(!E.grade(t,[]),`empty answer rejected ${t.id}`);
  assert.ok(!E.grade(t,t.answer.map(()=> 'not-an-answer')),`wrong answer rejected ${t.id}`);
  const refs=[...JSON.stringify(t).matchAll(/\[IMG:([^\]]+)\]/g)];
  for(const m of refs)assert.ok(fs.existsSync(path.join(__dirname,'../app/assets/tasks',m[1])),`image ${m[1]}`);
  if(t.type==='blanks')assert.equal((t.template.match(/\[(?!IMG:)([^\]]+)\]/g)||[]).length,t.answer.length,`blanks ${t.id}`);
  if(t.type==='number')for(let i=0;i<t.fields.length;i++){
    const f=t.fields[i],atBoundary=[...t.answer];atBoundary[i]=String(f.value+f.tolerance);assert.ok(E.grade(t,atBoundary),`tolerance boundary ${t.id}`);
    const beyond=[...t.answer];beyond[i]=String(f.value+f.tolerance+.01);assert.ok(!E.grade(t,beyond),`beyond tolerance ${t.id}`);
  }
}
assert.ok(E.grade(byId(183),[...byId(183).answer].reverse()));
assert.ok(!E.grade(byId(183),[byId(183).answer[0]]));
assert.ok(E.grade(byId(38),['36.5','32,28']));
assert.ok(!E.grade(byId(38),['36,5','']));
assert.equal(E.normalize(' Ёж  '),E.normalize('еж'));
assert.ok(!E.grade({type:'blanks',answer:['001']},['1']),'leading zeros');
const attempts=[{taskId:1,correct:false,at:'2026-10-01T00:00:00Z'},{taskId:1,correct:true,at:'2026-10-20T00:00:00Z'},{taskId:2,correct:false,at:'2026-10-01T00:00:00Z'}];
const topics=bank.topics.map(t=>t.id),now=Date.parse('2026-10-20T12:00:00Z');
assert.deepEqual(E.pool(bank.tasks,topics,'wrong',attempts).map(t=>t.id),[2]);
assert.ok(!E.pool(bank.tasks,topics,'old',attempts,7,now).some(t=>t.id===1));
assert.ok(E.pool(bank.tasks,topics,'old',attempts,7,now).some(t=>t.id===2));
assert.equal(E.pool(bank.tasks,topics,'new',attempts).length,527);
assert.deepEqual(E.pool(bank.tasks,topics,'saved',attempts,7,now,[5,9]).map(t=>t.id),[5,9]);
assert.deepEqual(E.pool(bank.tasks,[],'all',attempts),[]);
const source=[1,2,3,4,5],shuffled=E.shuffle(source,()=>0);assert.deepEqual(source,[1,2,3,4,5]);assert.deepEqual([...shuffled].sort(),source);assert.notDeepEqual(shuffled,source);
console.log('PASS: 529 task keys; answer formats; tolerance boundaries; media references; repeat filters; shuffle.');
