import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import * as yokosawa from './dist/yokosawa.js';
import {questions as legacyQuestions,courses as legacyCourses,learningKinds,levelNames,ranks,rangeWeight} from './dist/questions.js';
import {scenarioQuestions} from './dist/scenarios.js';
import {scenarioFeedback} from './dist/scenario-feedback.js';
import {renderLesson} from './dist/training-ui.js';

// Keep module-local names isolated; evaluate only the browser entrypoint in the DOM harness.
const source=fs.readFileSync('dist/app.js','utf8').replace(/^import .*$/gm,'').replace('export function evaluate','function evaluate').split('\nrender();')[0];
function harness(stored=null,failSave=false){
  const elements=new Map(),listeners=new Map(),storage={value:stored};let scopeId=0,document;
  const matches=(tag,attrs,selector)=>{
    selector=selector.trim().split(/\s+/).at(-1);
    if(selector.startsWith('#'))return attrs.id===selector.slice(1);
    if(selector.startsWith('.'))return (attrs.class||'').split(/\s+/).includes(selector.slice(1));
    const attribute=selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    if(attribute)return attribute[1] in attrs&&(attribute[2]===undefined||attrs[attribute[1]]===attribute[2]);
    const tagged=selector.match(/^([\w-]+)(?:\[([^\]]+)\])?$/);return !!tagged&&tag===tagged[1]&&(!tagged[2]||tagged[2] in attrs);
  };
  const node=(tag='div')=>{
    const id=scopeId++;
    return {tagName:tag.toUpperCase(),innerHTML:'',style:{},inert:false,isConnected:true,
      focus(){document.activeElement=this},getClientRects(){return [{}]},contains(item){return item===this||[...elements.values()].includes(item)},
      remove(){this.isConnected=false;document.body.children=document.body.children.filter(c=>c!==this)},
      querySelectorAll(selector){
        const found=[],counts=new Map();
        const tabsStart=selector.startsWith('.lesson-tabs ')?this.innerHTML.indexOf('class="lesson-tabs"'):-1;
        const tabsEnd=tabsStart>=0?this.innerHTML.indexOf('</div>',tabsStart):-1;
        for(const match of this.innerHTML.matchAll(/<([\w-]+)\b([^>]*)>/g)){
          const [,childTag,raw]=match;
          if(tabsStart>=0&&(match.index<tabsStart||match.index>=tabsEnd))continue;
          const attrs={};for(const [,key,value] of raw.matchAll(/([\w-]+)(?:="([^"]*)")?/g))attrs[key]=value??'';
          if(!selector.split(',').some(part=>matches(childTag,attrs,part)))continue;
          const base=attrs.id?'#'+attrs.id:childTag+' '+raw,ordinal=counts.get(base)||0;counts.set(base,ordinal+1);const key=id+':'+base+':'+ordinal;
          if(!elements.has(key))elements.set(key,{focus(){document.activeElement=this},getClientRects(){return [{}]},isConnected:true});
          const el=elements.get(key);el.dataset={};for(const [name,value] of Object.entries(attrs))if(name.startsWith('data-'))el.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;
          const content=this.innerHTML.slice(match.index+match[0].length),summary=content.match(/<summary[^>]*>(.*?)<\/summary>/s)?.[1]?.replace(/<[^>]*>/g,'')||'';
          Object.assign(el,{id:attrs.id,className:attrs.class||'',disabled:'disabled' in attrs,open:'open' in attrs,attributes:attrs,querySelector(selector){return selector==='summary'?{textContent:summary}:null}});found.push(el);
        }return found;
      },querySelector(selector){return this.querySelectorAll(selector)[0]||null}
    };
  };
  const root=node();
  document={activeElement:null,body:{style:{},children:[],appendChild(child){this.children.push(child)}},createElement:node,
    querySelector(selector){if(selector==='#app')return root;for(const child of this.body.children){if(selector==='#'+child.id)return child;const found=child.querySelector(selector);if(found)return found}return root.querySelector(selector)},
    querySelectorAll(selector){return [...root.querySelectorAll(selector),...this.body.children.flatMap(child=>child.querySelectorAll(selector))]},
    addEventListener(name,listener){listeners.set(name,listener)},removeEventListener(name,listener){if(listeners.get(name)===listener)listeners.delete(name)}
  };
  const context=vm.createContext({console,document,window:{scrollTo(){},scrollY:0},assert,...yokosawa,legacyQuestions,legacyCourses,learningKinds,levelNames,ranks,rangeWeight,scenarioQuestions,scenarioFeedback,renderLesson,
    localStorage:{getItem:()=>storage.value,setItem:(key,value)=>{if(failSave)throw Error('blocked');storage.value=value}}});
  vm.runInContext(source,context);return {root,storage,run:code=>vm.runInContext(code,context)};
}
const h=harness();
h.run(`
render();assert.equal(page,'home');assert(root.innerHTML.includes('まず10問解く'));assert.equal(questions.length,66);assert.equal(courses.length,9);
const ids=courses.flatMap(c=>c.questions);assert.equal(new Set(ids).size,questions.length);assert.equal(ids.length,questions.length);
for(const q of questions){
  assert(ids.includes(q.id));assert(q.version,q.id+' version');const cards=[...q.board,...(q.hand||[])];assert.equal(new Set(cards).size,cards.length,q.id+' collision');assert(cards.every(c=>/^[AKQJT2-9][shdc]$/.test(c)));
  assert.equal(q.options.length,3);assert(q.options[q.answer]);assert.equal(q.hints.length,3);assert(q.shortReason||q.scenario?.decisive,q.id+' decisive');assert(q.goal||q.scenario?.goal,q.id+' goal');assert(q.assumption||q.scenario?.assumption,q.id+' assumption');
  assert.equal(q.traps.length,3);q.traps.forEach((t,i)=>{if(!(q.answers||[q.answer]).includes(i))assert(t,q.id+' trap')});
}
startBeginnerTen();assert.equal(drill.ids.length,10);assert.equal(current().board.length,0);
for(let start=1;start<10;start+=3){const trio=drill.ids.slice(start,start+3).map(id=>questions.find(q=>q.id===id));assert.equal(new Set(trio.map(q=>q.scenario.caseId)).size,1);assert.equal(trio.map(q=>q.board.length).join(),'3,4,5');assert.equal(trio[0].scenario.roles.opener.position,['BTN','UTG','CO'][(start-1)/3])}
navigate('home');startCourse('entry');assert.equal(drill.ids.length,5);assert.equal(current().id,'hero_utg');nextQuestion();assert.equal(index,0);submitAnswer();assert.equal(records.length,0);
for(let i=0;i<5;i++){const id=current().id;selected=i===0?(current().answer+1)%3:current().answer;hints=i===1?1:0;submitAnswer();const count=records.length;submitAnswer();assert.equal(records.length,count);assert.equal(current().id,id);assert.equal(records.at(-1).questionVersion,current().version);assert(root.innerHTML.includes(current().shortReason));assert(!root.innerHTML.includes('class="lesson-detail-panel"'));nextQuestion()}
assert(drill.finished);assert.equal(drill.results.length,5);assert(root.innerHTML.includes('おつかれさま！'));assert(root.innerHTML.includes('復習する2問をやり直す'));assert.equal(reviewQuestions().length,2);
const retryIds=drill.results.filter(r=>!r.correct||r.hints).map(r=>r.id);$('#retry-drill').onclick();assert.equal(JSON.stringify(drill.ids),JSON.stringify(retryIds));
for(let i=0;i<2;i++){const id=current().id;selected=current().answer;submitAnswer();assert.equal(current().id,id);assert(!reviewQuestions().some(q=>q.id===id));assert.equal(list().length,2);nextQuestion()}
assert(drill.finished);assert.equal(reviewQuestions().length,0);navigate('home');assert(root.innerHTML.includes('<b>5</b> / 66'));
startCourse('board');assert.equal(drill.ids.length,5);for(let i=0;i<5;i++){selected=current().answer;submitAnswer();nextQuestion()}
startCourse('board');assert.equal(drill.ids.join(),'kk2,a54');selected=current().answer;submitAnswer();navigate('home');assert.equal(drill,null);assert(mastered('kk2'));startCourse('board');assert.equal(drill.ids.join(),'a54');
navigate('practice');filter='board';resetQuestion();assert(list().every(q=>q.level===2&&q.id!=='actual_hand'));navigate('pre');assert(list().every(q=>q.level===1));navigate('settings');assert(root.innerHTML.includes('ROOM SETTINGS'));navigate('stats');assert(root.innerHTML.includes('YOUR PROGRESS'));startReview();assert.equal(page,'stats');
startDrill(['premium'],'誤答');selected=0;submitAnswer();assert(root.innerHTML.includes(current().traps[0]));navigate('home');startDrill(['premium'],'再確認');selected=current().answer;submitAnswer();assert(mastered('premium'));navigate('home');startDrill(['premium'],'失敗');selected=0;submitAnswer();assert(!mastered('premium'));assert(reviewQuestions().some(q=>q.id==='premium'));
`);
harness(h.storage.value).run("assert.equal(page,'home');assert(!mastered('premium'));assert(mastered('hero_utg'));render();assert(root.innerHTML.includes('まず10問解く'))");
for(const stored of ['null','{broken','[]','{"settings":{"level":99,"players":0},"records":[{"id":"missing","correct":true,"hints":0}]}'])harness(stored).run("render();assert.equal(settings.players,6);assert.equal(settings.level,1);assert.equal(records.length,0)");
harness(null,true).run("startCourse('entry');selected=current().answer;submitAnswer();assert.equal(records.length,1);assert(notice.includes('保存できません'));assert(root.innerHTML.includes('保存できません'));nextQuestion();assert.equal(index,1)");
console.log('PASS: 66 lessons, nine courses, ten-question stories, guards, mastery, stable review, persistence and storage failures');

h.run(`
for(const q of questions){
  startDrill([q.id],'閉じた解説');assert.equal(lessonView.activeTab,null);assert(!root.innerHTML.includes('class="lesson-detail-panel"'));assert(!root.innerHTML.includes('class="lesson-feedback'));assert(!root.innerHTML.includes(q.why),'hidden explanation '+q.id);
  const choices=document.querySelectorAll('[data-choice]');assert.equal(choices.length,3);choices[q.answer].onclick();assert.equal(selected,q.answer);$('#answer').onclick();assert(root.innerHTML.includes(q.shortReason||q.scenario.decisive));assert(!root.innerHTML.includes('class="lesson-detail-panel"'));
  document.querySelector('[data-lesson-tab="reason"]').onclick();assert.equal(lessonView.activeTab,'reason');assert(root.innerHTML.includes('id="lesson-panel-reason"'));assert(root.innerHTML.includes(q.why));assert(!root.innerHTML.includes('id="lesson-panel-ranges"'));
  document.querySelector('[data-lesson-tab="reason"]').onclick();assert.equal(lessonView.activeTab,null);document.querySelector('[data-lesson-tab="changes"]').onclick();assert.equal(lessonView.activeTab,'changes');
  if(q.scenario){const max=q.board.length===3?1:q.board.length===4?2:3;assert(document.querySelectorAll('[data-street]').every(b=>+b.dataset.street<=max),'future streets hidden');document.querySelector('[data-lesson-tab="ranges"]').onclick();assert.equal(lessonView.activeTab,'ranges');document.querySelector('[data-range-side="caller"]').onclick();assert.equal(lessonView.rangeSide,'caller');document.querySelector('[data-range-side="opener"]').onclick();assert.equal(lessonView.rangeSide,'opener')}
}
startBeginnerTen();selected=current().answer;submitAnswer();lessonView.activeTab='ranges';lessonView.rangeSide='caller';nextQuestion();assert.equal(lessonView.activeTab,null);assert.equal(lessonView.rangeSide,'opener');assert.equal(lessonView.streetIndex,null);
startDrill(['premium'],'ヒントとキーボード');for(let i=0;i<5;i++)$('#hint').onclick();assert.equal(hints,3);selected=current().answer;submitAnswer();assert(!mastered('premium'));
document.querySelector('#lesson-tab-reason').onkeydown({key:'ArrowRight',preventDefault(){}});assert.equal(lessonView.activeTab,'ranges');document.querySelector('#lesson-tab-ranges').onkeydown({key:'End',preventDefault(){}});assert.equal(lessonView.activeTab,'changes');document.querySelector('#lesson-tab-changes').onkeydown({key:'Home',preventDefault(){}});assert.equal(lessonView.activeTab,'reason');
startDrill(['hero_btn'],'表の状態');document.querySelector('[data-choice="2"]').onclick();const before={id:current().id,index,selected,hints};document.querySelector('[data-lesson-chart]').onclick();assert(chartUsed);assert(root.inert);assert.equal(document.body.style.overflow,'hidden');assert.equal(document.body.children.length,1);
document.querySelector('[data-overlay-ante="yes"]').onclick();assert.equal(current().id,before.id);assert.equal(selected,before.selected);assert.equal(index,before.index);assert.equal(hints,before.hints);document.querySelector('#chart-overlay-close').onclick();assert(!root.inert);assert.equal(document.body.children.length,0);assert(!answered);
submitAnswer();assert(records.at(-1).chartUsed);assert(!mastered('hero_btn'));lessonView.activeTab='reason';render();openCurrentChart();closeChart();assert.equal(lessonView.activeTab,'reason');assert.equal(selected,2);assert(answered);
const riverLesson=scenarioQuestions.find(q=>q.board.length===5);startDrill([riverLesson.id],'レンジと変化の状態');selected=current().answer;submitAnswer();document.querySelector('[data-lesson-tab="ranges"]').onclick();document.querySelector('[data-range-side="caller"]').onclick();openCurrentChart();closeChart();assert.equal(lessonView.activeTab,'ranges');assert.equal(lessonView.rangeSide,'caller');assert(answered);assert.equal(selected,riverLesson.answer);
document.querySelector('[data-lesson-tab="changes"]').onclick();const firstStreet=document.querySelectorAll('[data-street]')[0];firstStreet.onclick();const snapshot=lessonView.streetIndex;openCurrentChart();closeChart();assert.equal(lessonView.activeTab,'changes');assert.equal(lessonView.streetIndex,snapshot);
startDrill(['hero_btn'],'自力');selected=current().answer;submitAnswer();assert(mastered('hero_btn'));const correctRecord={...records.at(-1)};records=[{...correctRecord,questionVersion:'old'}];assert(!mastered('hero_btn'));assert.equal(reviewQuestions().length,1);records=[{...correctRecord,edition:'old'}];assert(!mastered('hero_btn'));records=[correctRecord];assert(mastered('hero_btn'));
for(const q of scenarioQuestions.filter(q=>q.answers?.length>1))for(const answer of q.answers){startDrill([q.id],'複数の妥当な答え');selected=answer;submitAnswer();assert(records.at(-1).correct)}
`);
console.log('PASS: answer/tab/side handlers, closed initial details, one active panel, no future controls, chart state, assistance and version migration');

h.run(`
for(const hero of ['UTG','HJ','CO','BTN','SB','BB']){const layout=seatLayout(hero);assert.equal(layout.find(p=>p.pos===hero).slot,0);assert.equal(new Set(layout.map(p=>p.slot)).size,6);const html=table({hero,board:[],hand:['As','Kh']});assert(html.includes('seat seat-0 hero'));assert(html.includes('hero-cards'))}
for(let n=4;n<=8;n++){navigate('home');settings.players=n;newHand();renderPlay();assert.equal(seatLayout('BB',positions(n)).find(p=>p.pos==='BB').slot,0);assert(root.innerHTML.includes('seat seat-0 hero'));const hand=session.players.find(p=>p.hero).hand.join(),round=session.street;$('#play-bible').onclick();closeChart();assert.equal(session.street,round);assert.equal(session.players.find(p=>p.hero).hand.join(),hand)}
const chartHands=yokosawaGroups.flatMap(g=>g?g.split(' '):[]);assert.equal(new Set(chartHands).size,chartHands.length);assert(chartHands.every(hand=>/^[AKQJT98765432]{2}[so]?$/.test(hand)));
assert.equal(yokosawaRank('K9s'),5);assert.equal(yokosawaRank('J6s'),2);assert.equal(yokosawaRank('J5s'),1);assert.equal(yokosawaRank('J5s',false),0);assert.equal(yokosawaRank('87o'),1);assert.equal(yokosawaRank('86o'),0);
assert.equal(yokosawaThreshold(2,true),2);assert.equal(yokosawaThreshold(2,false),3);assert.equal(yokosawaThreshold(5,false),5);assert.equal(yokosawaThreshold(7,true),5);
assert.equal(yokosawaAction('K9s',{behind:7,ante:true}),'raise');assert.equal(yokosawaAction('K9s',{behind:7,ante:false}),'fold');assert.equal(yokosawaAction('K9s',{behind:5,ante:false}),'raise');assert.equal(yokosawaAction('A7o',{behind:5,ante:false}),'fold');assert.equal(yokosawaAction('J6s',{behind:2,ante:true}),'raise');assert.equal(yokosawaAction('J5s',{behind:2,ante:true}),'fold');
assert.equal(yokosawaAction('Q9s',{openerBehind:3,ante:true}),'call');assert.equal(yokosawaAction('QTs',{openerBehind:3,ante:true}),'raise');assert.equal(yokosawaAction('87o',{openerBehind:2,ante:true,bb:true}),'call');assert.equal(yokosawaAction('86o',{openerBehind:2,ante:true,bb:true}),'fold');assert.equal(yokosawaAction('J5s',{behind:1,ante:true}),null);assert.equal(yokosawaAction('QTs',{openerBehind:3,ante:true,openSize:8}),null);assert.equal(handNotation(['9s','Ks']),'K9s');
bibleState.ante=false;navigate('bible');assert(root.innerHTML.includes('K9s（緑） → レイズ'));$('#bible-drill').onclick();assert.equal(drill.courseId,'entry');navigate('bible');bibleState.spot='response';bibleState.openerBehind=3;bibleState.ante=true;bibleState.hand='Q9s';renderBible();assert(root.innerHTML.includes('Q9s（水色） → コール'));bibleState.spot='bb';bibleState.openerBehind=2;bibleState.hand='87o';renderBible();assert(root.innerHTML.includes('87o（ピンク） → コール'));
`);
console.log('PASS: hero-front rotation, play chart state, chart tiers, ante boundaries and bible');
const flashHarness=harness();
flashHarness.run(`
bibleState={ante:true,behind:2,hand:'K9s',spot:'open',openerBehind:3};startFlash();assert.equal(page,'flash');assert.equal(flash.hands.length,10);assert.equal(new Set(flash.hands).size,10);assert.equal(flash.hands[0],'K9s');
for(let i=0;i<10;i++){const answer=yokosawaAction(flash.hands[i],{behind:2,ante:true}),button=document.querySelectorAll('[data-flash]').find(b=>b.dataset.flash===answer);assert(button?.onclick);button.onclick();assert.equal(flashStats.attempts,i+1);assert.equal(flashStats.correct,i+1);$('#flash-next').onclick()}assert(root.innerHTML.includes('10 / 10'));assert.equal(flashStats.sessions,1);
`);
harness(flashHarness.storage.value).run('assert.equal(flashStats.attempts,10);assert.equal(flashStats.correct,10);assert.equal(flashStats.sessions,1);assert.equal(records.length,0)');
console.log('PASS: ten unique flash hands, handlers, completion and saved statistics');
