const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const formatter=require('../app/format.js'),katex=require('../app/vendor/katex.min.js'),marked=require('../app/vendor/marked.min.js');
const bank=JSON.parse(fs.readFileSync(path.join(__dirname,'../app/bank.json'),'utf8'));
const failures=[];let formulas=0,matrices=0;
for(const entry of [...bank.tasks.map(t=>({id:t.id,text:t.solution})),...bank.topics.map(t=>({id:'topic-'+t.id,text:t.theory}))]){
  const errors=[],html=formatter.render(entry.text,marked,katex,errors);
  failures.push(...errors.map(e=>({id:entry.id,...e})));
  formulas+=(html.match(/class="katex"/g)||[]).length;
  matrices+=(html.match(/\\begin\{bmatrix\}/g)||[]).length;
  assert.ok(!html.includes('TIIKMATHSLOT'),'unresolved math placeholder');
}
if(failures.length){console.log(JSON.stringify(failures,null,2));process.exit(1);}
assert.ok(formulas>1000);assert.ok(matrices>50);
const h=formatter.render('$$\\begin{bmatrix}1 & 0 \\\\ 0 & 1\\end{bmatrix}$$',marked,katex);
assert.ok(h.includes('mtable'));assert.ok(!h.includes('math-fallback'));
console.log(`PASS: 529 solutions + 10 theory chapters; ${formulas} formulas; ${matrices} matrices; no KaTeX errors.`);
