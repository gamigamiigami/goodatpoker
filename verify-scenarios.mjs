import assert from 'node:assert/strict';
import {scenarios,scenarioQuestions,scenarioVersion,aggregateRange,scenarioHandValue,estimateRangeEquity} from './dist/scenarios.js';
import {yokosawaAction,handNotation} from './dist/yokosawa.js';

const key=cards=>cards.slice().sort().join('');
const streets=['preflop','flop','turn','river'];
const positions=['UTG','HJ','CO','BTN','SB','BB'];
const total=combos=>combos.reduce((sum,c)=>sum+c.weight,0);
const near=(a,b,message)=>assert(Math.abs(a-b)<1e-6,message+': '+a+' != '+b);

assert.equal(scenarios.length,12);
assert.equal(scenarioQuestions.length,36);
assert.equal(new Set(scenarioQuestions.map(q=>q.id)).size,36);
const formations=['BTN-BB','UTG-BB','CO-BTN'];
for(const formation of formations){
  const group=scenarios.filter(s=>s.opener+'-'+s.caller===formation);
  assert.equal(group.length,4,formation+' has four hands');
  assert.equal(group.filter(s=>s.hero===s.opener).length,2,formation+' opener perspective');
  assert.equal(group.filter(s=>s.hero===s.caller).length,2,formation+' caller perspective');
}
const contrasts=new Map();
for(const s of scenarios){if(!s.contrast)continue;const group=contrasts.get(s.contrast)||[];group.push(s);contrasts.set(s.contrast,group)}
assert(contrasts.size>=2,'at least two same-board/different-action comparisons');
for(const group of contrasts.values()){
  assert.equal(group.length,2);assert.deepEqual(group[0].board,group[1].board);
  assert.notDeepEqual(group[0].questions[1].scenario.actions,group[1].questions[1].scenario.actions);
  assert.notDeepEqual(group[0].questions[1].scenario.ranges.caller.combos,group[1].questions[1].scenario.ranges.caller.combos,'different actions must really change range weights');
}

for(const hand of scenarios){
  assert.equal(hand.questions.length,3,hand.id);
  assert.deepEqual(hand.questions.map(q=>q.scenario.street),['flop','turn','river']);
  assert.deepEqual(hand.questions.map(q=>q.skill).sort(),['action','board','range']);
  assert.equal(new Set([...hand.board,...hand.hand]).size,7,hand.id+' known-card collisions');
  for(const q of hand.questions){
    const s=q.scenario,heroRole=s.roles.hero,otherRole=heroRole==='opener'?'caller':'opener';
    assert.equal(q.version,scenarioVersion);
    assert.equal(s.version,scenarioVersion);
    assert.equal(s.caseId,hand.id);
    assert.equal(q.board.length,s.stepIndex+3);
    assert.equal(q.options.length,3);assert(q.options[q.answer]);assert(q.answers.includes(q.answer));
    assert.equal(q.traps.length,3);q.traps.forEach((trap,i)=>{if(!q.answers.includes(i))assert(trap)});
    assert.equal(q.hints.length,3);assert.equal(q.steps.length,3);
    for(const text of [q.why,q.foundation,q.takeaway,s.decisive,s.goal,s.assumption])assert(text&&typeof text==='string',q.id+' missing explanation');
    assert(s.source.every(source=>source.url.startsWith('https://')));
    assert.equal(s.roles[heroRole].position,q.hero);
    assert.equal(s.roles[heroRole].hero,true);
    assert.equal(s.roles[otherRole].hero,false);
    assert.equal(s.nextActions[0].position,q.hero,'question is at a legal hero decision: '+q.id);
    assert.deepEqual(q.active,[s.opener,s.caller]);
    assert(s.ranges[heroRole].combos.some(c=>key(c.cards)===key(q.hand)),q.id+' actual hand absent from public own range');
    assert(s.cost>=0&&s.pot>0&&Number.isFinite(s.cost));
    const equity=s.comparison.overall.equity;
    assert.equal(equity.trials,1200);assert(equity.opener>=0&&equity.opener<=1);near(equity.opener+equity.caller,1,'split pot credit');
    assert.deepEqual(equity,estimateRangeEquity(s.ranges,q.board),'reproducible public-range estimate');
    assert.equal(s.comparison.overall.side,equity.side);
    if(Math.abs(equity.opener-.5)<=Math.max(.04,equity.margin95))assert.equal(equity.side,'unknown','do not claim advantage near simulation uncertainty');
    else assert.equal(equity.side,equity.opener>.5?'opener':'caller');
    assert(s.comparison.overall.detail.includes('ソルバー'));
    assert(s.comparison.strongest.category>=0&&s.comparison.strongest.category<=8);
    assert(s.rangeKnowledge.includes('公開情報'));

    let pot=0,currentStreet='preflop',bets=Object.fromEntries(positions.map(p=>[p,0]));
    const paid=Object.fromEntries(positions.map(p=>[p,0]));
    for(const a of s.actions){
      assert(streets.indexOf(a.street)<=streets.indexOf(s.street),'no future action');
      if(a.street!==currentStreet){assert(streets.indexOf(a.street)>streets.indexOf(currentStreet));currentStreet=a.street;bets=Object.fromEntries(positions.map(p=>[p,0]))}
      near(a.potBefore,pot,q.id+' pot before action');
      if(a.action!=='blind'){
        const cost=Math.max(...Object.values(bets))-bets[a.position];
        near(a.cost,cost,q.id+' cost before '+a.text);
        if(a.action==='check')near(cost,0,q.id+' cannot check against a bet');
        if(a.action==='call'){assert(cost>0);near(a.amount,cost,q.id+' call amount')}
        if(a.action==='bet')near(Math.max(...Object.values(bets)),0,q.id+' first bet');
        if(a.action==='raise')assert(a.total>Math.max(...Object.values(bets)),q.id+' raise amount');
      }
      bets[a.position]+=a.amount;paid[a.position]+=a.amount;pot+=a.amount;
      near(a.total,bets[a.position],q.id+' action total');near(a.potAfter,pot,q.id+' pot after action');
      assert(paid[a.position]<=100,q.id+' exceeds stack');
      if(a.street!=='preflop')assert(a.policy&&a.assumption,q.id+' action update provenance');
    }
    near(s.pot,pot,q.id+' question pot');
    if(currentStreet!==s.street)bets=Object.fromEntries(positions.map(p=>[p,0]));
    near(s.cost,Math.max(...Object.values(bets))-bets[q.hero],q.id+' hero price');

    assert.deepEqual(s.changes.map(c=>c.street),streets.slice(0,s.stepIndex+2),'only reached snapshots in order');
    for(let i=0;i<s.changes.length;i++){
      const change=s.changes[i];assert(change.summary&&change.reason);
      assert.equal(change.board.length,i===0?0:i+2);
      for(const role of ['opener','caller']){
        const range=change.ranges[role],combos=range.combos;
        assert(combos.length>0);assert.equal(range.knowledge,'public');assert(range.examples.length>=2);
        assert.equal(new Set(combos.map(c=>key(c.cards))).size,combos.length,q.id+' duplicate combo');
        for(const c of combos){
          assert.equal(c.cards.length,2);assert.equal(new Set(c.cards).size,2);
          assert(c.cards.every(card=>/^[AKQJT2-9][shdc]$/.test(card)));
          assert(!c.cards.some(card=>change.board.includes(card)),q.id+' blocked board card');
          assert(Number.isFinite(c.weight)&&c.weight>0&&c.weight<=1);
          const behind=5-positions.indexOf(s.opener),notation=handNotation(c.cards);
          if(role==='opener')assert.equal(yokosawaAction(notation,{behind,ante:false}),'raise',q.id+' off-chart opening combo');
          else assert.notEqual(yokosawaAction(notation,{openerBehind:behind,bb:s.caller==='BB',ante:false,openSize:2.5}),'fold',q.id+' off-chart calling combo');
        }
        for(const ex of range.examples){
          const actual=combos.find(c=>key(c.cards)===key(ex.cards));assert(actual,q.id+' example not in range');
          assert.equal(ex.hand,handNotation(ex.cards));assert(ex.label&&ex.reason);
          if(role===otherRole)assert(!ex.cards.some(card=>q.hand.includes(card)),q.id+' opponent example uses hero card');
          if(change.board.length===5)assert(!/あと1枚/.test(ex.reason),'no future draw on river');
          if(change.board.length)assert(ex.reason.includes(scenarioHandValue([...ex.cards,...change.board]).label),'example role matches actual cards');
        }
        if(i){
          const prior=new Map(s.changes[i-1].ranges[role].combos.map(c=>[key(c.cards),c.weight]));
          for(const c of combos){assert(prior.has(key(c.cards)),q.id+' new candidate appeared');assert(c.weight<=prior.get(key(c.cards))+1e-12,q.id+' raw weight grows after action')}
        }
        const cells=aggregateRange(combos);
        assert(cells.length<=169);assert.equal(cells.reduce((sum,c)=>sum+c.combos,0),combos.length);
        assert(Math.abs(cells.reduce((sum,c)=>sum+c.weight,0)-total(combos))<.02,'169-grid aggregation preserves mass');
      }
    }
    assert.strictEqual(s.changes.at(-1).ranges,s.ranges,'current question and visible snapshot agree');
    const maxCategory=Math.max(...['opener','caller'].flatMap(role=>s.ranges[role].combos.map(c=>scenarioHandValue([...c.cards,...q.board]).category)));
    assert.equal(s.comparison.strongest.category,maxCategory);
    for(const role of ['opener','caller']){
      const combos=s.ranges[role].combos;
      const rate=total(combos.filter(c=>scenarioHandValue([...c.cards,...q.board]).category===maxCategory))/total(combos);
      near(s.comparison.strongest.rates[role],rate,q.id+' strongest category ratio');
    }
  }
}

// Concrete teaching examples are independently checked, including wheel straights.
for(const [cards,category] of [
  ['Js 9s 8h 7d 6c',0],['Js 9s 8h 7d 6c Ts',4],
  ['9s 8s 8h 7d 6c',1],['9s 8s 8h 7d 6c 5s',4],
  ['Qs 9s Ks 8s 3d 2h 5s',5],['Ah 5h Kh 8h 4c 2h Kd',5],
  ['8s 8d Kh 8h 4c 2h Kd',6],['2s 2d As Kd 7c 2h 2c',7],
  ['Ad Qd Ks Kc 2h 9d As',2],['As 2d 3h 4s 5c',4]
])assert.equal(scenarioHandValue(cards.split(' ')).category,category,cards);
assert(scenarioHandValue('As 2d 3h 4s 5c'.split(' ')).score<scenarioHandValue('2s 3d 4h 5s 6c'.split(' ')).score);
assert(scenarioHandValue('As Ks Qs Js Ts'.split(' ')).score>scenarioHandValue('Ac Ad Ah As Kd'.split(' ')).score);
const single=(cards,weight=1)=>({cards:cards.split(' '),weight});
const fixed={opener:{combos:[single('As Ah')]},caller:{combos:[single('Kd Kc')]}};
assert.equal(estimateRangeEquity(fixed,['Ad','7h','4c','2s','9d'],1200).opener,1,'certain winner');
const tied={opener:{combos:[single('2s 3s')]},caller:{combos:[single('4h 5h')]}};
const tiedEquity=estimateRangeEquity(tied,['As','Kd','Qh','Jc','Ts'],1200);assert.equal(tiedEquity.opener,.5);assert.equal(tiedEquity.side,'unknown');
const weighted={opener:{combos:[single('As Ah',.9),single('Qs Qh',.1)]},caller:{combos:[single('Kd Kc')]}};
const weightedEquity=estimateRangeEquity(weighted,['2s','3d','7h','8c','9s'],1200);assert(Math.abs(weightedEquity.opener-.9)<.04,'sample actual weights');
const collision={opener:{combos:[single('As Ah')]},caller:{combos:[single('As Kc',.8),single('Kd Kc',.2)]}};
assert.equal(estimateRangeEquity(collision,['Ad','7h','4c','2s','9d'],1200).opener,1,'overlapping hands rejected');
const probe=scenarioQuestions[0],withSecrets={...probe.scenario.ranges,heroHand:['2s','2h'],futureBoard:['3s','4h']};
assert.deepEqual(estimateRangeEquity(withSecrets,probe.board),estimateRangeEquity({...withSecrets,heroHand:['As','Ah'],futureBoard:['Ks','Kh']},probe.board),'no real-hand or future-board input');
assert(scenarioQuestions.some(q=>q.scenario.comparison.overall.side==='opener'),'supported opener advantage');
assert(scenarioQuestions.some(q=>q.scenario.comparison.overall.side==='caller'),'supported caller advantage');
console.log('PASS: 12 hands / 36 questions; formation and skill coverage; contrasting action paths; legal pot, cost and hero turn; cumulative public combo ranges; blockers, weighted aggregation, exact-card examples, supported category comparison, no future draw claims; deterministic weighted 1,200-trial equity with collision rejection, uncertainty, and no hidden-hand/future-board inputs');
