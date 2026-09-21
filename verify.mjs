import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const q=fs.readFileSync('dist/yokosawa.js','utf8').replaceAll('export ','')+'\n'+fs.readFileSync('dist/questions.js','utf8').replace(/^import .*$/gm,'').replaceAll('export ','');let app=fs.readFileSync('dist/app.js','utf8').replace(/^import .*$/gm,'').replace('export function evaluate','function evaluate').split('\nrender();')[0];
const ctx={console,Math,Date,Map,Set,Array,Number,JSON,localStorage:{getItem:()=>null,setItem:()=>{}},document:{querySelector:()=>({}),querySelectorAll:()=>[]},assert};vm.createContext(ctx);vm.runInContext(q+'\n'+app+`
const e=s=>evaluate(s.split(' '));
assert(e('As Ks Qs Js Ts 2h 3d')>e('Ac Ad Ah As Kd 2h 3d'));
assert(e('Ac Ad Ah Ks Kd 2h 3d')>e('As Js 8s 4s 2s Kd Qd'));
assert(e('As 2d 3h 4s 5c 9h Td')<e('2s 3d 4h 5s 6c 9h Td'));
assert.equal(e('As Kd Qh Js Tc 2c 3c'),e('Ad Kh Qs Jc Td 4c 5c'));
for(let n=4;n<=8;n++)for(let trial=0;trial<150;trial++){
 settings.players=n;newHand();let steps=0;
 while(!session.done&&steps++<100){const s=session,h=s.players.find(p=>p.hero);assert(!h.fold);assert(s.pending.has(s.players.indexOf(h)));act(s.players.indexOf(h),['call','raise','fold'][Math.floor(Math.random()*3)]);runBots();const total=s.players.reduce((v,p)=>v+p.stack,0)+(s.done?0:s.pot);assert(Math.abs(total-n*100)<1e-7,'chip conservation');assert(s.players.every(p=>p.stack>=-1e-8),'negative stack');}
 assert(session.done,'termination');assert(steps<100);assert(!notice,'guard reached');const all=[...session.board,...session.players.flatMap(p=>p.hand),...session.d];assert.equal(new Set(all).size,52,'duplicate cards');
}
assert.equal(questions.length,new Set(questions.map(q=>q.id)).size);for(const q of questions){assert.equal(q.options.length,3);assert(q.options[q.answer]);assert.equal(q.hints.length,3)}
for(const a of ranks)for(const b of ranks){const i=ranks.indexOf(a),j=ranks.indexOf(b),hand=i===j?a+b:i<j?a+b+'s':b+a+'o';assert(rangeWeight(hand,'call')<=rangeWeight(hand,'bb'),'range cannot grow after call')}
settings.players=6;newHand();session.board=session.d.splice(0,3);session.street=1;session.players.forEach(p=>p.fold=false);const originalRandom=Math.random;let seed=123;Math.random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};const eq1=estimatedEquity(40);session.players.filter(p=>!p.hero).forEach(p=>p.hand=['As','Ad']);seed=123;const eq2=estimatedEquity(40);assert.equal(eq1,eq2,'evaluation must not peek at opponents cards');Math.random=originalRandom;assert(eq1>=0&&eq1<=1);assert(assessDecision('call').includes('相手の実際の手札は評価に使っていません'));assert(questions.filter(q=>q.level===2&&q.id!=='actual_hand').length===6);
console.log('PASS: hand rankings, 750 full randomized hands (4–8 players), chip conservation, no duplicates, termination, question structure, monotonic range update, no hidden-card leakage, decision feedback');
`,ctx);
