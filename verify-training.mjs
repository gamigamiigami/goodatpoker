import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync('dist/yokosawa.js','utf8').replaceAll('export ','')+'\n'+fs.readFileSync('dist/questions.js','utf8').replace(/^import .*$/gm,'').replaceAll('export ','')+'\n'+
  fs.readFileSync('dist/app.js','utf8').replace(/^import .*$/gm,'').replace('export function evaluate','function evaluate').split('\nrender();')[0];
function harness(stored=null,failSave=false){
  const elements=new Map(),root={innerHTML:''},storage={value:stored};
  const document={
    querySelector(selector){
      if(selector==='#app')return root;
      if(!selector.startsWith('#')||!root.innerHTML.includes('id="'+selector.slice(1)+'"'))return null;
      if(!elements.has(selector))elements.set(selector,{});
      return elements.get(selector);
    },querySelectorAll(selector){
      if(selector!=='[data-flash]')return [];
      return [...root.innerHTML.matchAll(/data-flash="([^"]+)"/g)].map(([,action])=>{
        const key=selector+action;
        if(!elements.has(key))elements.set(key,{dataset:{flash:action}});
        return elements.get(key);
      });
    }
  };
  const context=vm.createContext({console,document,window:{scrollTo(){}},assert,
    localStorage:{getItem:()=>storage.value,setItem:(key,value)=>{if(failSave)throw Error('blocked');storage.value=value}}});
  vm.runInContext(source,context);
  return {root,storage,run:code=>vm.runInContext(code,context)};
}
const h=harness();

h.run(`
assert.equal(page,'home');render();
assert(root.innerHTML.includes('はじめての特訓を始める'));
assert.equal(questions.length,30);
const courseIds=courses.flatMap(c=>c.questions);
assert.equal(new Set(courseIds).size,questions.length);
assert.equal(courseIds.length,questions.length);
for(const q of questions){
  assert(courseIds.includes(q.id));
  const cards=[...q.board,...(q.hand||[])];
  assert.equal(new Set(cards).size,cards.length,'exercise card collision: '+q.id);
  assert(cards.every(c=>/^[AKQJT2-9][shdc]$/.test(c)));
  if(q.traps){assert.equal(q.traps.length,3);assert.equal(q.steps.length,3);assert(q.takeaway);q.traps.forEach((t,i)=>{if(i!==q.answer)assert(t)})}
}
startCourse('entry');
assert.equal(drill.ids.length,5);assert.equal(current().id,'hero_utg');
nextQuestion();assert.equal(index,0,'cannot skip unanswered');
submitAnswer();assert.equal(records.length,0,'no unselected submission');
for(let i=0;i<5;i++){
  const id=current().id;
  selected=i===0?(current().answer+1)%3:current().answer;hints=i===1?1:0;
  submitAnswer();
  const count=records.length;submitAnswer();assert.equal(records.length,count,'double submission');
  assert.equal(current().id,id,'feedback stays on answered exercise');
  assert(root.innerHTML.includes(questions.find(q=>q.id===id).why));
  nextQuestion();
}
assert(drill.finished);assert.equal(drill.results.length,5);
assert(root.innerHTML.includes('SESSION COMPLETE'));
assert(root.innerHTML.includes('迷った2問をやり直す'));
assert.equal(reviewQuestions().length,2);
const oldIds=drill.results.filter(r=>!r.correct||r.hints).map(r=>r.id);
$('#retry-drill').onclick();
assert.deepEqual(drill.ids,oldIds);assert.equal(drill.results.length,0);
for(let i=0;i<2;i++){
  const id=current().id;
  selected=current().answer;submitAnswer();
  assert.equal(current().id,id);
  assert(!reviewQuestions().some(q=>q.id===id));
  assert.equal(list().length,2,'review queue must not shrink during feedback');
  nextQuestion();
}
assert(drill.finished);assert.equal(reviewQuestions().length,0);
navigate('home');assert(root.innerHTML.includes('自力でクリア'));
startCourse('board');assert.equal(drill.ids.length,5);
for(let i=0;i<5;i++){selected=current().answer;submitAnswer();nextQuestion()}
startCourse('board');
assert.equal(drill.ids.length,2,'remaining course exercises');
assert.deepEqual(drill.ids,['kk2','a54']);
selected=current().answer;submitAnswer();navigate('home');
assert.equal(drill,null);assert(mastered('kk2'),'leaving retains completed answers');
startCourse('board');assert.deepEqual(drill.ids,['a54']);
navigate('practice');filter='board';resetQuestion();assert.equal(list().length,6);
navigate('pre');assert(list().every(q=>q.level===1));
navigate('settings');assert(root.innerHTML.includes('ROOM SETTINGS'));
navigate('stats');assert(root.innerHTML.includes('YOUR PROGRESS'));
startReview();assert.equal(page,'stats','empty review stays on stats');
startDrill(['premium'],'誤答の説明');selected=0;submitAnswer();
assert(root.innerHTML.includes(current().traps[0]));assert(root.innerHTML.includes('持ち帰る定石'));
navigate('home');startDrill(['premium'],'再確認');selected=current().answer;submitAnswer();
assert(mastered('premium'));
navigate('home');startDrill(['premium'],'失敗したら復習に戻す');selected=0;submitAnswer();
assert(!mastered('premium'));assert(reviewQuestions().some(q=>q.id==='premium'));
`);
const reload=harness(h.storage.value);
reload.run("assert.equal(page,'home');assert(!mastered('premium'));assert(mastered('hero_utg'));render();assert(root.innerHTML.includes('続きから特訓する'))");
for(const stored of ["null","{broken","[]","{\"settings\":{\"level\":99,\"players\":0},\"records\":[{\"id\":\"missing\",\"correct\":true,\"hints\":0}]}"]){harness(stored).run("render();assert.equal(settings.players,6);assert.equal(settings.level,1);assert.equal(records.length,0)")}
harness(null,true).run("startCourse('entry');selected=current().answer;submitAnswer();assert.equal(records.length,1);assert(notice.includes('保存できません'));assert(root.innerHTML.includes('保存できません'));nextQuestion();assert.equal(index,1)");
console.log('PASS: course coverage, card validity, guided completion, answer guard, stable review queue, mastery, retries, continuation, saved progress, navigation, malformed storage, unavailable storage');

h.run(`
for(const hero of ['UTG','HJ','CO','BTN','SB','BB']){
  const layout=seatLayout(hero);
  assert.equal(layout.find(p=>p.pos===hero).slot,0);
  assert.equal(new Set(layout.map(p=>p.slot)).size,6);
  const ordered=layout.slice().sort((a,b)=>a.slot-b.slot).map(p=>p.pos);
  assert.equal(ordered[0],hero);
  const positions=['UTG','HJ','CO','BTN','SB','BB'],start=positions.indexOf(hero);
  assert.deepEqual(ordered,positions.slice(start).concat(positions.slice(0,start)));
  const html=table({hero,board:[],hand:['As','Kh']});
  const heroSeat=html.slice(html.indexOf('seat seat-0 hero'));
  assert(heroSeat.includes('data-position="'+hero+'"'));
  assert(heroSeat.includes('hero-cards'));
}
for(const q of questions){
  assert(learningKinds[q.learningKind],q.id+' learning kind');
  assert(q.foundation,q.id+' foundation');
  startDrill([q.id],'分類の確認');
  assert(root.innerHTML.includes(learningKinds[q.learningKind].title));
  assert(!root.innerHTML.includes(q.why),'do not reveal explanation before answering');
  selected=q.answer;submitAnswer();
  assert(root.innerHTML.includes('覚えておく基準'));
  assert(root.innerHTML.includes(q.foundation));
}
assert.equal(questions.find(q=>q.id==='hero_btn').learningKind,'memory');
assert.equal(questions.find(q=>q.id==='call').learningKind,'read');
assert.equal(questions.find(q=>q.id==='bluff_catcher').learningKind,'apply');
assert(grid('btn').includes('勝率表ではありません'));
assert(learningFeedback(questions.find(q=>q.id==='hero_btn')).includes('このアプリはその計算をしていません'));
for(let n=4;n<=8;n++){
  navigate('home');settings.players=n;newHand();renderPlay();
  assert.equal(seatLayout('BB',positions(n)).find(p=>p.pos==='BB').slot,0);
  assert(root.innerHTML.includes('seat seat-0 hero'));
  assert(root.innerHTML.includes('BB あなたの席'));
}
`);
console.log('PASS: hero-front rotation at every seat, 4–8 player rendering, teaching classification, explanation separation, chart provenance');

h.run(`
const chartHands=yokosawaGroups.flatMap(g=>g?g.split(' '):[]);
assert.equal(new Set(chartHands).size,chartHands.length,'no duplicate chart assignments');
assert(chartHands.every(hand=>/^[AKQJT98765432]{2}[so]?$/.test(hand)));
assert.equal(yokosawaRank('K9s'),5);
assert.equal(yokosawaRank('J6s'),2);
assert.equal(yokosawaRank('J5s'),1);
assert.equal(yokosawaRank('J5s',false),0);
assert.equal(yokosawaRank('87o'),1);
assert.equal(yokosawaRank('86o'),0);
assert.equal(yokosawaThreshold(2,true),2);
assert.equal(yokosawaThreshold(2,false),3);
assert.equal(yokosawaThreshold(5,false),5);
assert.equal(yokosawaThreshold(7,true),5);
assert.equal(yokosawaAction('K9s',{behind:7,ante:true}),'raise');
assert.equal(yokosawaAction('K9s',{behind:7,ante:false}),'fold');
assert.equal(yokosawaAction('K9s',{behind:5,ante:false}),'raise');
assert.equal(yokosawaAction('A7o',{behind:5,ante:false}),'fold');
assert.equal(yokosawaAction('J6s',{behind:2,ante:true}),'raise');
assert.equal(yokosawaAction('J5s',{behind:2,ante:true}),'fold');
assert.equal(yokosawaAction('Q9s',{openerBehind:3,ante:true}),'call');
assert.equal(yokosawaAction('QTs',{openerBehind:3,ante:true}),'raise');
assert.equal(yokosawaAction('87o',{openerBehind:2,ante:true,bb:true}),'call');
assert.equal(yokosawaAction('86o',{openerBehind:2,ante:true,bb:true}),'fold');
assert.equal(yokosawaAction('A6o',{openerBehind:3,ante:true,bb:true}),'call');
assert.equal(yokosawaAction('J5s',{behind:1,ante:true}),null);
assert.equal(yokosawaAction('QTs',{openerBehind:3,ante:true,openSize:8}),null);
assert.equal(handNotation(['9s','Ks']),'K9s');
assert.equal(courses[0].id,'entry');
assert(courses[0].rule.includes('アンティなし'));
assert.equal(bibleState.ante,false);
navigate('bible');assert(root.innerHTML.includes('K9s（緑） → レイズ'));
document.querySelector('#bible-drill').onclick();assert.equal(drill.courseId,'entry');
navigate('bible');
bibleState.ante=false;renderBible();assert(root.innerHTML.includes('下限は白'));
bibleState.spot='response';bibleState.openerBehind=3;bibleState.ante=true;bibleState.hand='Q9s';renderBible();assert(root.innerHTML.includes('Q9s（水色） → コール'));
bibleState.spot='bb';bibleState.openerBehind=2;bibleState.hand='87o';renderBible();assert(root.innerHTML.includes('87o（ピンク） → コール'));
const oldRecord={id:'hero_btn',level:1,correct:true,hints:0,at:1};records=[oldRecord];
assert(!mastered('hero_btn'),'old answer must not master new chart edition');
records=[{...oldRecord,edition:yokosawaSource.version}];assert(mastered('hero_btn'));
`);
console.log('PASS: 2025 chart tiers, ante boundaries, open and response actions, BB exceptions, unsupported spots, bible UI, old-score migration');

const flashHarness=harness();
flashHarness.run(`
bibleState={ante:true,behind:2,hand:'K9s',spot:'open',openerBehind:3};
startFlash();assert.equal(page,'flash');assert.equal(flash.hands.length,10);
assert.equal(new Set(flash.hands).size,10);assert.equal(flash.hands[0],'K9s');
assert(root.innerHTML.includes('K9sなら、基本行動は？'));
for(let i=0;i<10;i++){
  const hand=flash.hands[i],answer=yokosawaAction(hand,{behind:2,ante:true});
  const button=document.querySelectorAll('[data-flash]').find(b=>b.dataset.flash===answer);
  assert(button?.onclick,'answer button exists');button.onclick();
  assert.equal(flashStats.attempts,i+1);assert.equal(flashStats.correct,i+1);
  assert(root.innerHTML.includes('基本は'+(answer==='raise'?'レイズ':'フォールド')));
  $('#flash-next').onclick();
}
assert(root.innerHTML.includes('10 / 10'));assert.equal(flashStats.sessions,1);
`);
harness(flashHarness.storage.value).run("assert.equal(flashStats.attempts,10);assert.equal(flashStats.correct,10);assert.equal(flashStats.sessions,1);assert.equal(records.length,0)");
console.log('PASS: ten unique chart hands, answer feedback, completed session, persistent flash statistics');
