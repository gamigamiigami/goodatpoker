import {yokosawaAction,yokosawaSource,handNotation} from './yokosawa.js';

// These are explicit teaching models. The weights below are assumptions, not
// solver frequencies. Every later range is a subset of its earlier range.
export const scenarioVersion='2026-10-12';
const cardRanks='AKQJT98765432',suits='shdc';
const deck=[...cardRanks].flatMap(rank=>[...suits].map(suit=>rank+suit));
const allCombos=deck.flatMap((card,i)=>deck.slice(i+1).map(other=>({cards:[card,other],weight:1})));
const streets=['flop','turn','river'];
const streetNames={preflop:'プリフロップ',flop:'フロップ',turn:'ターン',river:'リバー'};
const rankNames=['役なし','ワンペア','2ペア','スリーカード','ストレート','フラッシュ','フルハウス','フォーカード','ストレートフラッシュ'];
const positions=['UTG','HJ','CO','BTN','SB','BB'];
const sourceLinks=[
  {label:'ヨコサワ2025年最新版（参加基準）',url:yokosawaSource.url+'&t=1644s'},
  {label:'ターンのカードと、それまでの行動を比べる考え方',url:'https://blog.gtowizard.com/how-to-analyze-turn-textures-in-poker/'}
];
const round=n=>Math.round(n*10000)/10000;
const comboKey=cards=>cards.slice().sort().join('');
const weightTotal=combos=>combos.reduce((sum,c)=>sum+c.weight,0);
const symbols={s:'♠',h:'♥',d:'♦',c:'♣'};
export const cardText=cards=>cards.map(c=>c[0]+symbols[c[1]]).join(' ');

function straightHigh(values){
  const set=new Set(values);if(set.has(14))set.add(1);
  for(let high=14;high>=5;high--)if([0,1,2,3,4].every(n=>set.has(high-n)))return high;
  return 0;
}
// Best five-card value from five to seven cards; also used to validate examples.
export function scenarioHandValue(cards){
  const values=cards.map(c=>14-cardRanks.indexOf(c[0]));
  const counts=new Map();for(const value of values)counts.set(value,(counts.get(value)||0)+1);
  const groups=[...counts].sort((a,b)=>b[1]-a[1]||b[0]-a[0]);
  const flushSuit=[...suits].find(s=>cards.filter(c=>c[1]===s).length>=5);
  const flush=flushSuit?cards.filter(c=>c[1]===flushSuit).map(c=>14-cardRanks.indexOf(c[0])).sort((a,b)=>b-a):[];
  const sf=straightHigh(flush),straight=straightHigh(values),triples=groups.filter(g=>g[1]>=3),pairs=groups.filter(g=>g[1]>=2);
  let category=0,kickers=[];
  if(sf){category=8;kickers=[sf]}
  else if(groups[0]?.[1]===4){category=7;kickers=[groups[0][0],Math.max(...values.filter(v=>v!==groups[0][0]))]}
  else if(triples.length&&pairs.some(g=>g[0]!==triples[0][0])){category=6;kickers=[triples[0][0],Math.max(...pairs.filter(g=>g[0]!==triples[0][0]).map(g=>g[0]))]}
  else if(flush.length){category=5;kickers=flush.slice(0,5)}
  else if(straight){category=4;kickers=[straight]}
  else if(triples.length){category=3;kickers=[triples[0][0],...[...new Set(values)].filter(v=>v!==triples[0][0]).sort((a,b)=>b-a).slice(0,2)]}
  else if(pairs.length>=2){const pairValues=pairs.map(g=>g[0]).sort((a,b)=>b-a).slice(0,2);category=2;kickers=[...pairValues,Math.max(...values.filter(v=>!pairValues.includes(v)))]}
  else if(pairs.length){category=1;kickers=[pairs[0][0],...[...new Set(values)].filter(v=>v!==pairs[0][0]).sort((a,b)=>b-a).slice(0,3)]}
  else kickers=[...new Set(values)].sort((a,b)=>b-a).slice(0,5);
  const score=[category,...kickers,...Array(5-kickers.length).fill(0)].reduce((n,v)=>n*15+v,0);
  return {category,kickers,score,label:rankNames[category]};
}
const featureCache=new Map();
function features(cards,board){
  const key=cards.join('')+':'+board.join('');
  if(featureCache.has(key))return featureCache.get(key);
  const all=[...cards,...board],value=scenarioHandValue(all),values=all.map(c=>14-cardRanks.indexOf(c[0]));
  const flushDraw=board.length<5&&[...suits].some(s=>all.filter(c=>c[1]===s).length===4);
  const set=new Set(values);if(set.has(14))set.add(1);
  const straightDraw=board.length<5&&!straightHigh(values)&&Array.from({length:10},(_,i)=>i+5).some(high=>[0,1,2,3,4].filter(n=>set.has(high-n)).length===4);
  const top=Math.max(...board.map(c=>14-cardRanks.indexOf(c[0])));
  const topPair=value.category===1&&value.kickers[0]>=top;
  const result={...value,flushDraw,straightDraw,draw:flushDraw||straightDraw,topPair,aceHigh:value.category===0&&values.includes(14)};
  featureCache.set(key,result);return result;
}
const policyDescriptions={
  check_all:'この場面では全候補をチェックする設定。チェックだけでは候補を減らしません。',
  check_back:'強い役やドローの一部をベットへ回し、中くらいの役・役なしをチェックに多く残す設定。強い手をゼロにはしません。',
  small_bet:'小さなベットを強い役にも、弱いペア・役なしの一部にも使う設定。金額だけで強い手に決めません。',
  value_bet:'強い役・強いワンペアを多めに、ドローやブラフを一部混ぜてベットする設定。',
  polar_bet:'強い役と一部のブラフを多めに、大きくベットする設定。中くらいの手は減らします。',
  call_small:'小額に対し、ペア・ドロー・一部の強い役を残し、改善しにくい役なしを減らす設定。',
  call_large:'大きな額に対し、強い役・強いペアを中心に残し、弱い手をさらに減らす設定。',
  value_raise:'強い役を主に、一部のドローやブラフを混ぜてレイズする設定。',
  call_raise:'レイズに対し、強い役と一部のドローを主に残す設定。役なしはここで除外します。'
};
function actionFactor(policy,hand,board,previousBoard){
  const f=features(hand,board),strong=f.category>=2,pair=f.category===1;
  const missed=board.length===5&&f.category===0&&previousBoard.length===4&&features(hand,previousBoard).draw;
  switch(policy){
    case 'check_all':return 1;
    case 'check_back':return strong?.35:f.topPair?.75:pair?1:f.draw?.5:1;
    case 'small_bet':return strong?.95:f.topPair?.9:pair?.65:f.draw?.7:.45;
    case 'value_bet':return strong?1:f.topPair?.8:pair?.25:f.draw?.45:.1;
    case 'polar_bet':return strong?1:f.topPair?.3:pair?.1:f.draw?.7:missed?.35:.08;
    case 'call_small':return strong?.75:f.topPair?1:pair?.7:f.draw?.9:f.aceHigh?.3:.08;
    case 'call_large':return strong?.95:f.topPair?.65:pair?.28:f.draw?.55:.01;
    case 'value_raise':return strong?1:f.draw?.6:f.topPair?.25:.02;
    case 'call_raise':return strong?1:f.draw?.45:f.topPair?.25:pair?.1:0;
    default:throw Error('Unknown teaching policy: '+policy);
  }
}
function initialRanges(opener,caller){
  const behind=5-positions.indexOf(opener);
  return {
    opener:allCombos.filter(c=>yokosawaAction(handNotation(c.cards),{behind,ante:false})==='raise'),
    caller:allCombos.flatMap(c=>{const action=yokosawaAction(handNotation(c.cards),{openerBehind:behind,bb:caller==='BB',ante:false,openSize:2.5});return action==='call'?[c]:action==='raise'?[{cards:c.cards,weight:.12}]:[]})
  };
}
function removeBoard(combos,board){return combos.filter(c=>!c.cards.some(card=>board.includes(card)))}
function updateRange(combos,policy,board,previousBoard){return combos.map(c=>({cards:c.cards,weight:c.weight*actionFactor(policy,c.cards,board,previousBoard)})).filter(c=>c.weight>0)}
export function aggregateRange(combos){
  const cells=new Map();
  for(const c of combos){const hand=handNotation(c.cards),entry=cells.get(hand)||{hand,weight:0,combos:0,maxWeight:0};entry.weight+=c.weight;entry.combos++;entry.maxWeight=Math.max(entry.maxWeight,c.weight);cells.set(hand,entry)}
  return [...cells.values()].map(c=>({...c,weight:round(c.weight)}));
}
function describeExample(cards,board){
  if(!board.length)return handNotation(cards)+'：この位置・参加方法の出発点に含める手。';
  const f=features(cards,board);
  return f.label+(f.flushDraw?' ＋ フラッシュまであと1枚':f.straightDraw?' ＋ ストレートまであと1枚':'')+'。これまでの行動でも候補に残る手。';
}
function rangeView(combos,board,heroHand,isHero){
  const permitted=combos.filter(c=>isHero||!c.cards.some(card=>heroHand.includes(card)));
  const sorted=permitted.slice().sort((a,b)=>{
    const aValue=board.length?features(a.cards,board):{category:0,draw:false},bValue=board.length?features(b.cards,board):{category:0,draw:false};
    return (bValue.category+(bValue.draw?.6:0)+Math.log10(b.weight+1))-(aValue.category+(aValue.draw?.6:0)+Math.log10(a.weight+1));
  });
  const picked=[],seen=new Set();
  for(const c of sorted){const hand=handNotation(c.cards);if(seen.has(hand))continue;seen.add(hand);picked.push(c);if(picked.length===2)break}
  const draw=permitted.find(c=>board.length>0&&features(c.cards,board).draw&&!seen.has(handNotation(c.cards)));
  const middle=permitted.slice().sort((a,b)=>b.weight-a.weight).find(c=>!seen.has(handNotation(c.cards))&&(!board.length||features(c.cards,board).category<=1));
  if(draw)picked.push(draw);else if(middle)picked.push(middle);
  const examples=picked.map(c=>({hand:handNotation(c.cards),cards:c.cards,label:cardText(c.cards),reason:describeExample(c.cards,board),weight:round(c.weight)}));
  return {combos,examples,totalWeight:round(weightTotal(combos)),comboCount:combos.length,knowledge:'public',summary:'両者のアクションから見える候補。公開された共通カードを除外した、教材の仮定レンジです。'};
}
const equityCache=new Map();
function weightedPicker(combos){
  let sum=0;const cumulative=combos.map(c=>{sum+=c.weight;return sum});
  return random=>{const target=random()*sum;let low=0,high=combos.length-1;while(low<high){const mid=(low+high)>>1;if(cumulative[mid]>target)high=mid;else low=mid+1}return combos[low].cards};
}
// Inputs intentionally exclude the player's real hand, example text and future
// board cards. Both hands are sampled independently by weight; if they overlap,
// BOTH are resampled, preserving the joint distribution conditioned on legality.
export function estimateRangeEquity(ranges,board,trials=1200){
  if(!Number.isInteger(trials)||trials<2)throw Error('At least two equity trials are required');
  if(board.length<3||board.length>5||new Set(board).size!==board.length)throw Error('A legal flop, turn or river is required');
  const input=Object.fromEntries(['opener','caller'].map(role=>[role,removeBoard(ranges[role].combos,board).filter(c=>c.weight>0)]));
  if(!input.opener.length||!input.caller.length)throw Error('Both public ranges must contain legal combos');
  const signature=board.join('')+'|'+trials+'|'+['opener','caller'].map(role=>input[role].map(c=>comboKey(c.cards)+':'+c.weight.toPrecision(12)).join(',')).join('|');
  if(equityCache.has(signature))return equityCache.get(signature);
  let seed=2166136261;for(let i=0;i<signature.length;i++){seed^=signature.charCodeAt(i);seed=Math.imul(seed,16777619)>>>0}if(!seed)seed=1;
  const initialSeed=seed;
  const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296};
  const pickOpen=weightedPicker(input.opener),pickCall=weightedPicker(input.caller);
  let sum=0,squares=0,accepted=0,attempts=0;
  while(accepted<trials&&attempts<trials*200){
    attempts++;const a=pickOpen(random),b=pickCall(random);if(a.some(card=>b.includes(card)))continue;
    const known=new Set([...board,...a,...b]),pool=deck.filter(card=>!known.has(card)),runout=[...board];
    for(let i=0;i<5-board.length;i++){const index=i+Math.floor(random()*(pool.length-i));[pool[i],pool[index]]=[pool[index],pool[i]];runout.push(pool[i])}
    const av=scenarioHandValue([...a,...runout]).score,bv=scenarioHandValue([...b,...runout]).score,value=av>bv?1:av===bv?.5:0;
    sum+=value;squares+=value*value;accepted++;
  }
  if(accepted!==trials)throw Error('The two ranges do not provide enough non-overlapping hands');
  const opener=sum/trials,variance=Math.max(0,(squares-trials*opener*opener)/(trials-1));
  const margin95=1.96*Math.sqrt(variance/trials),threshold=Math.max(.04,margin95);
  const side=Math.abs(opener-.5)<=threshold?'unknown':opener>.5?'opener':'caller';
  const result={opener,caller:1-opener,trials,margin95,interval:[Math.max(0,opener-margin95),Math.min(1,opener+margin95)],side,seed:initialSeed,method:'fixed-seed-weighted-public-ranges'};
  equityCache.set(signature,result);return result;
}
function compareRanges(ranges,board,opener,caller,logic=''){
  if(!board.length)return {overall:{label:'出発点を比べる',detail:'参加位置と、レイズ／コールの違いを確認します。',side:'unknown'},strongest:{label:'まだ共通カードはありません',detail:'プリフロップの参加表を出発点にします。',side:'unknown'},summary:'参加位置と参加方法が違うため、同じ範囲にはなりません。',rangeAdvantage:'全体の優勢は未判定',nutAdvantage:'共通カードが出てから比較',reason:'勝率を計算していないため、全体の優勢を断定しません。'};
  const classified={opener:ranges.opener.combos.map(c=>({...c,category:features(c.cards,board).category})),caller:ranges.caller.combos.map(c=>({...c,category:features(c.cards,board).category}))};
  const highest=Math.max(...classified.opener.map(c=>c.category),...classified.caller.map(c=>c.category));
  const rates=Object.fromEntries(['opener','caller'].map(role=>[role,weightTotal(classified[role].filter(c=>c.category===highest))/Math.max(.00001,weightTotal(classified[role]))]));
  const side=Math.abs(rates.opener-rates.caller)<.005?'similar':rates.opener>rates.caller?'opener':'caller';
  const sideLabel=side==='similar'?'両者で近い割合':(side==='opener'?opener:caller)+'側に多い割合';
  const label=rankNames[highest]+'の候補';
  const equity=estimateRangeEquity(ranges,board),winner=equity.side==='opener'?opener:caller;
  const reason=`${opener}のレイズ範囲にはAAなどを多く置き、${caller}のコール範囲ではその多くをリレイズに回す設定です。 `+logic;
  const wholeLabel=equity.side==='unknown'?'差が小さく、全体の優勢は断定しない':'この教材の仮定では'+winner+'側が勝ちやすい';
  const estimateText=`両者の公開情報から置いた範囲同士の推定：${opener} 約${Math.round(equity.opener*100)}%／${caller} 約${Math.round(equity.caller*100)}%。固定seedの${equity.trials}回試行、試行による約95%の誤差幅は±${(equity.margin95*100).toFixed(1)}ポイント。引き分けは半分ずつ。`;
  return {
    overall:{label:wholeLabel,detail:reason+' '+estimateText+' 現在の共通カードだけで残りのカードを公平に抽選しています。相手の行動モデル自体の誤差はこの幅に含まれず、ソルバーの最適行動やベットの利益を表す数字ではありません。',side:equity.side,equity,reason},
    strongest:{label,detail:`この局面で両者に残る最上位の役の種類は${rankNames[highest]}。仮定の重みで比べると${sideLabel}です。同じ役の中の強弱や全体勝率をまとめた判定ではありません。`,side,rates,category:highest},
    summary:wholeLabel+'。'+`${rankNames[highest]}になる候補の多さも、全体とは別に比べます。`,
    rangeAdvantage:wholeLabel,nutAdvantage:label+'を比較（全体の優勢とは別）',reason:'全体は仮定レンジ同士の推定勝率、最上位の役は仮定の重み付き割合です。最適行動・厳密なナッツ優勢・ソルバー評価ではありません。'
  };
}
function makeActions(opener,caller){
  let pot=0;const bets={UTG:0,HJ:0,CO:0,BTN:0,SB:0,BB:0};
  const result=[];
  for(const [position,amount] of [['SB',.5],['BB',1]]){const before=pot;bets[position]=amount;pot+=amount;result.push({street:'preflop',position,actor:null,action:'blind',amount,total:amount,cost:amount,potBefore:before,potAfter:pot,text:position+' '+amount+'BBを支払い'})}
  const before=pot,amount=2.5-bets[opener];bets[opener]=2.5;pot+=amount;
  result.push({street:'preflop',position:opener,actor:'opener',action:'raise',amount,total:2.5,cost:1,potBefore:before,potAfter:pot,text:opener+'が最初に2.5BBへレイズ'});
  const cost=2.5-bets[caller],callerBefore=pot;pot+=cost;bets[caller]=2.5;
  result.push({street:'preflop',position:caller,actor:'caller',action:'call',amount:cost,total:2.5,cost,potBefore:callerBefore,potAfter:pot,text:caller+'が'+cost+'BB追加してコール。ほかの席はフォールド'});
  return {actions:result,pot};
}
function event(actor,action,amount=0,policy='check_all'){return {actor,action,amount,policy}}
const ck=(actor,policy='check_all')=>event(actor,'check',0,policy),bet=(actor,amount,policy='small_bet')=>event(actor,'bet',amount,policy),call=(actor,policy='call_small')=>event(actor,'call',0,policy),raise=(actor,amount,policy='value_raise')=>event(actor,'raise',amount,policy);
const item=(skill,ask,options,answer,decisive,why,changes,goal)=>({skill,ask,options,answer,decisive,why,changes,goal});

const definitions=[
  {id:'btn_high_bet',title:'高いボードで、小さく打ったあと',opener:'BTN',caller:'BB',hero:'BTN',hand:['Ah','Qh'],board:['As','Kd','7c','2h','2c'],contrast:'btn_high',
    lines:[[ck('caller'),bet('opener',1.8),call('caller')],[ck('caller'),bet('opener',6,'value_bet'),call('caller','call_large')],[ck('caller'),ck('opener','check_back')]],decisions:[1,1,1],
    prompts:[
      item('action','AQで小さくベットするなら、今回の狙いは？',['弱いAなどからコールをもらう','自分より強い手を必ず降ろす','先にレイズした人は必ず打つ'],0,'自分より弱いAが支払うなら、利益を得るベットになります。','AQはAのペアです。相手の弱いAに勝っていますが、セットやAKには負けます。小さなベットで弱いAがコールする設定を根拠にします。レイズした側だから自動で打つわけではありません。','まだフロップで相手はチェックしただけ。この設定ではBBは広くチェックし、強い手も残します。','弱い手から支払いを得る'),
      item('range','小さなベットをBBがコールしたあと、どう更新する？',['Aのトップペアだけにする','役なしを減らし、ペア・一部のドロー・強い役を残す','コールしたのでセットを全部消す'],1,'お金を払って続けた行動を根拠に、続けにくい役なしを減らします。','フロップのコールは、無料のチェックより多くの情報があります。Kや7のペア、QJ・QT・JTなどの一部も残せます。強い役を必ずレイズする設定ではないので、セットをゼロにはしません。','2♥は新しいストレートやフラッシュを完成させません。カードの見た目より、フロップのコールを先に反映します。','行動に合う候補へ更新する'),
      item('board','リバーの2♣で、まず比べ直すものは？',['QJのストレートが完成したか','スペードのフラッシュが完成したか','22・77などの強い役と、残ったAのペアの分布'],2,'2がペアになると、22やセットの役が変わります。','22はフォーカード、77はフルハウスになります。AQはボードの2のペアも使って2ペアですが、フルハウスには負けます。QJなどはストレートになっていません。相手のコールを経て残った候補だけを比べます。','同じ2でも、自分の手だけでなく両者の22・セット・Aの候補にどう働くかを確認します。','新しいカードと残る候補を照合する')]
  },
  {id:'btn_high_check',title:'同じボードでも、チェックで進むと',opener:'BTN',caller:'BB',hero:'BTN',hand:['Ah','Qh'],board:['As','Kd','7c','2h','2c'],contrast:'btn_high',
    lines:[[ck('caller'),ck('opener','check_back')],[ck('caller'),ck('opener','check_back')],[ck('caller'),bet('opener',1.8,'value_bet'),call('caller')]],decisions:[1,1,1],
    prompts:[
      item('range','BBのチェックだけで、何が分かる？',['この設定では、弱い手も強い手もまだ残る','Aを持つ手はすべて消える','BBは必ず役なし'],0,'全候補をチェックする相手なら、チェックだけで強さは絞れません。','この問題のBBは最初に全候補をチェックする設定です。小さなベットにコールした場面と違い、支払いによる選別はまだありません。AQで勝てる手も、AQに勝つ手も残ります。','相手はまだ追加で支払っていません。「コール後の範囲」を先回りして使わないようにします。','観察できた行動だけを使う'),
      item('board','フロップが両者チェックのあとに2♥。何を優先する？',['フロップでBBがコールした前提で考える','参加範囲に戻り、チェックで残った候補に2♥を重ねる','低いカードなので必ずBBが全体で有利'],1,'同じカードでも、前のアクションが違えば比べる候補が違います。','今回はBBがフロップで支払っていないため、弱い候補も広く残ります。BTNは強い役の一部をベットへ回す設定なので、チェック側の強い役の割合が下がります。2♥だけで有利な側は決めません。','ベット→コールで進んだ例より、BBの役なしが多く残る経路です。','行動の違いを先に比較する'),
      item('action','AQでリバーに小さく打つ理由として合うのは？',['チェックが続いたので、相手に強い手は絶対ない','弱いAが小額にコールする設定なので、その支払いを狙う','AQはプリフロップで強いから、どんな額でもよい'],1,'弱いAが払うという相手の応答を根拠にします。','この固定例ではBBは弱いAでも小さなベットにコールします。そこから支払いを得るのが目的です。チェックが続いても22や77が完全に消えたわけではなく、どんな大きさでも打てるという意味ではありません。','ベットした例と最終ボードは同じですが、途中でお金を払った回数が違います。','相手の継続する手に合わせて目的を決める')]
  },
  {id:'btn_low_straight',title:'低い連続ボードで、コール側が改善',opener:'BTN',caller:'BB',hero:'BB',hand:['Js','9s'],board:['8h','7d','6c','Ts','2c'],
    lines:[[ck('caller'),bet('opener',1.8),call('caller')],[ck('caller'),bet('opener',6,'value_bet'),raise('caller',18),call('opener','call_raise')],[ck('caller'),ck('opener','check_back')]],decisions:[2,2,0],
    prompts:[
      item('board','8・7・6では、双方の何を比較する？',['高いポケットペアだけ','先にレイズした人の強いAだけ','T9・54・87など、参加範囲にある連続ハンドや2ペア'],2,'低い連続カードに当たる候補を、両者の参加範囲から探します。','T9はストレート、87は2ペアです。ただし、その手が今回の参加範囲に残っていることが条件です。BTNにも中低カードがあるため、BBに候補があるだけで全体優位とは言えません。','J9は現時点では完成ストレートではありません。Tが来たときに強くなる候補です。','完成役と改善する候補を分ける'),
      item('action','T♠でJ9がストレート。レイズを考える主な理由は？',['弱いストレート・セットなどから、さらに支払いをもらう','役ができたら相手を必ず降ろすため','BBがコールした側なのでレイズしてはいけない'],0,'役が改善したら、以前コールした側でも利益を得るレイズを検討できます。','J9は7〜Jのストレートになりました。相手には9を含む低いストレートやセットなどが残り得ます。この固定例ではその一部がレイズにもコールするので、支払いを増やすのが狙いです。','Tは自分のJ9を強くしました。相手のT9・9xなどにも影響するため、自分だけが改善したと決めません。','改善した強い役で利益を狙う'),
      item('range','ターンのレイズにBTNがコール。残る候補は？',['必ず役なしのブラフだけ','強い役と一部の継続ハンドが中心。全部を同じ強さにしない','BTNが最初にレイズしたので、プリフロップの範囲のまま'],1,'最初のレイズより後の、ターンで支払った行動を反映します。','プリフロップの参加範囲に、フロップのベット、ターンのベット、レイズへのコールを順番に重ねます。ストレートなどは残りやすく、役なしはこのレイズへの応答設定で除外されています。','2♣は新しいストレートやフラッシュを作りません。ターンまでのレイズとコールが絞り込みの中心です。','複数の行動を累積して読む')]
  },
  {id:'btn_flush',title:'フラッシュができるまでを追う',opener:'BTN',caller:'BB',hero:'BB',hand:['Qs','9s'],board:['Ks','8s','3d','2h','5s'],
    lines:[[ck('caller'),bet('opener',1.8),call('caller')],[ck('caller'),bet('opener',6,'value_bet'),call('caller','call_large')],[ck('caller'),bet('opener',12,'polar_bet'),call('caller','call_large')]],decisions:[2,0,2],
    prompts:[
      item('range','BBでコールしてきた自分の範囲にも、何が残る？',['役なしなので、スペード2枚は全部消える','ペアに加え、Q♠9♠のようなフラッシュを待つ手','相手からは自分のQ♠9♠が見えている'],1,'完成した役だけでなく、あと1枚で強くなる手もコール候補です。','Q♠9♠はスペードを合計4枚使える状態です。相手は実際の2枚を知らないので、同じ行動を取るペアや他のスペード2枚も候補として考えます。','相手の目から見える自分の範囲と、実際のQ♠9♠を分けます。','完成前の手も範囲に残す'),
      item('action','このドローでベット／レイズを検討するなら、どんな狙い？',['必ずフラッシュが完成するから打つ','相手の強い役が全部降りるから打つ','一部の弱いペアを降ろし、続けられても改善する可能性を使う'],2,'今は未完成でも、相手が降りる可能性と改善の見込みを合わせて考えます。','これはセミブラフの目的を考える問題です。相手がどの手を降ろすかが重要で、ドローがあるだけで必ずレイズするわけではありません。この固定例ではチェックからコールで進みます。','2♥ではフラッシュはまだ未完成。残りはリバー1枚なので、フロップと同じ期待では扱いません。','行動の目的を言葉にする'),
      item('board','リバーの5♠で、どの見直しが必要？',['スペード2枚の候補がフラッシュに変わる。上のフラッシュも確認','どちらかがスペード1枚なら、必ずフラッシュ','自分にフラッシュができたので、相手の範囲はもう不要'],0,'同じマークの完成は、残っていたスート付き候補に当てはめます。','Q♠9♠はフラッシュですが、相手のA♠を含むスペード2枚には負けます。ボードにはスペードが3枚なので、手札に1枚だけではフラッシュになりません。候補のランクとスートの両方を見ます。','リバーではもう次のカードは来ません。完成したフラッシュと、完成しなかった別のドローを分けます。','スートと強さを具体的に確認する')]
  },
  {id:'utg_high_bet',title:'早い位置のレイズ範囲から始める',opener:'UTG',caller:'BB',hero:'UTG',hand:['Ah','Qh'],board:['As','Kd','7c','2h','2c'],contrast:'utg_high',
    lines:[[ck('caller'),bet('opener',1.8),call('caller')],[ck('caller'),bet('opener',6,'value_bet'),call('caller','call_large')],[ck('caller'),bet('opener',8,'value_bet'),call('caller','call_large')]],decisions:[1,1,1],
    prompts:[
      item('board','UTG対BBのA・K・7。何から比べ始める？',['BBにも手があるのでBBが必ず全体で有利','UTGのAA・KK・AKと、BBにコールで残る強い役の量','UTGは後で行動するので必ず勝っている'],1,'早い位置の参加範囲と、コールで残る強い手の量を比べます。','UTGは後ろに5人いる位置から参加しています。AA・KK・AKを含みますが、BBは強い手の多くをリレイズに使う設定です。ボードに当たる具体的候補を比較し、席名だけで勝敗を決めません。','BTNからのレイズと、UTGからのレイズでは出発点が違います。','位置と参加方法を組み合わせる'),
      item('range','フロップに小さくベットしてコールされたら、どう考える？',['UTGの参加範囲が強いので、相手のコールは無視する','BBは必ず弱いKだけになった','BBの弱い役なしが減り、こちらへの抵抗力が上がる'],2,'相手が弱い手を降ろすほど、残る相手の範囲は手強くなります。','BBはフロップで追加の支払いをしています。AやKのペア、一部のドロー、強い役が残り、改善しにくい役なしが減ります。最初にUTGが強い範囲だったことだけを根拠に、次も無条件でベットできるとは言えません。','2♥が大きな役を完成させなくても、コールという選別はすでに起きています。','出発点の優位を固定しない'),
      item('action','AQで再びベットするなら、何を確認する？',['相手の弱いAが、この額にもコールするか','UTGという名前だけ','相手がチェックしたので強い手はないこと'],0,'支払いを得る相手の具体的な手を挙げます。','弱いAから十分に支払いを得る見込みが、利益を狙うベットの根拠です。フルハウスなどの強い候補も残るので、トップペアだった手を見ただけで自動的に大きく打つ問題ではありません。','途中でコールを重ねた相手は、最初より弱い手が少なくなっています。','ベット額と相手の応答を対応させる')]
  },
  {id:'utg_high_check',title:'同じA・K・7でも、打たなかった側',opener:'UTG',caller:'BB',hero:'BB',hand:['Qs','Js'],board:['As','Kd','7c','2h','2c'],contrast:'utg_high',
    lines:[[ck('caller'),ck('opener','check_back')],[bet('caller',3.5,'polar_bet'),call('opener','call_small')],[ck('caller'),ck('opener','check_back')]],decisions:[0,0,0],
    prompts:[
      item('range','フロップでBBの自分がチェックするとき、相手は何を持ち得る？',['UTGの参加範囲。まだベットもチェックバックも観察していない','強い役は全部ない','必ず自分より弱いQハイ'],0,'まだ起きていない相手の行動を根拠に絞りません。','今見えているのはUTGのプリフロップレイズです。フロップではまだ相手は行動していません。UTGの参加範囲を出発点に、AA・KK・AKなども残して考えます。','自分のチェックと、相手がその後チェックすることは別の情報です。','観察の順番を守る'),
      item('action','UTGがチェックして回したあと、QJで打つ狙いとして合うのは？',['Qハイより弱い手だけからコールをもらう','相手の中小ペアの一部を降ろし、Tでの改善も残す','チェックしたUTGに強い手は絶対ないので必ず成功'],1,'今負けている一部の手を降ろすのがブラフの目的です。','QJは現時点では役なしですが、Tが来ればストレートになります。この教材ではUTGが中小ペアの一部を降ろす設定で、そのフォールドが狙いです。強い手も一部チェックに残るため、成功は保証されません。','UTGのチェックバックにより、ベットへ回す強い役の割合が下がった経路です。','相手が降りる候補を挙げる'),
      item('board','2♣が落ちてQJは未完成。ここで何を分ける？',['リバー後もTを引く可能性と、今の役','同じマークなら全部フラッシュになる手','完成しなかった自分の手と、相手のペア・強い役'],2,'リバーでは改善の余地がなくなったので、未完成ドローをそのまま強い手扱いしません。','QJのストレートは完成していません。ターンのベットに相手がコールしたので、そのペアや強い役が残ります。ブラフを続けるなら別途、相手がどの手を降ろすかが必要で、ドローだったことだけでは理由になりません。','同じ最終ボードでも、ターンにBBが打ってUTGが払った経路です。','未完成とブラフの可能性を分ける')]
  },
  {id:'utg_low_straight',title:'低いカードがコール側に当たる例',opener:'UTG',caller:'BB',hero:'BB',hand:['9s','8s'],board:['8h','7d','6c','5s','2c'],
    lines:[[ck('caller'),bet('opener',1.8),call('caller')],[ck('caller'),ck('opener','check_back')],[ck('caller'),bet('opener',6,'value_bet'),call('caller','call_large')]],decisions:[2,0,2],
    prompts:[
      item('action','98でコールを検討する理由は？',['UTGにレイズされたので必ず降りる','8のペアとストレートへの改善を、支払額と比べる','ドローがあれば、どんな額でも払う'],1,'今の役と改善する見込みを、要求された額に結びつけます。','98は8のペアで、5やTによってストレートに改善します。ただし相手には強い役もあり、ドローの存在だけであらゆる額へコールできません。この固定例では小さなベットにコールして進みます。','UTGの高いカードが多い出発点でも、低いボードへの当たり方は別に確認します。','役・改善・価格をまとめて考える'),
      item('board','5♠で、レンジの中のどの候補が強くなる？',['残っていた9x・4xなど、ストレートを作る候補','すべてのAハイ','プリフロップで降りた32を新しく追加した候補'],0,'新しいカードで改善するのは、すでに候補として残っていた手です。','98は5〜9のストレートになりました。候補に残る9や4を持つ手を探し、UTGとBBでどれくらい違うかを比較します。最初に参加しないと置いた手を、都合よく追加してはいけません。','低いカードが役に立つかは、両者の位置だけでなく、残っている実際の候補次第です。','元の範囲から改善した手を探す'),
      item('range','リバーにUTGがベット。何を残して考える？',['最初のUTGオープン範囲を、そのまま全部同じ重みで使う','強い役しかないと決める','過去のチェックを反映したうえで、今回打つ強い役と一部のブラフ'],2,'レイズした側という名前より、これまでの行動の組合せを使います。','UTGはフロップでベットし、ターンでチェックしました。強い手が全部なくなったわけではありませんが、そのチェックを経た範囲にリバーのベットを重ねます。新しいベットだけで過去の情報をリセットしません。','2♣では新しいフラッシュはできません。ターンから残るストレートなどを中心に照合します。','候補の重みを段階的に更新する')]
  },
  {id:'utg_paired',title:'ペアボードのあとに高いカード',opener:'UTG',caller:'BB',hero:'UTG',hand:['Ad','Qd'],board:['Ks','Kc','2h','9d','As'],
    lines:[[ck('caller'),bet('opener',1.8),call('caller')],[ck('caller'),ck('opener','check_back')],[ck('caller'),bet('opener',4,'value_bet'),call('caller')]],decisions:[1,1,1],
    prompts:[
      item('range','Kが2枚のフロップでも、BBのコール範囲に何が残る？',['Kは先にレイズしたUTGにしかない','Kを持つ手、ポケットペア、一部のAハイなど','BBは最初にコールしたので必ず弱いペア'],1,'コールした側にもKの候補が残ります。','BBはKQ・KJなどの一部で参加できます。UTGにもAKなどがあり、同じKのスリーカードでもキッカーが違います。Kを持たないポケットペアやAハイも別のグループとして比較します。','ボードに高いカードがあるだけでは、相手の強い役を消せません。','同じ役の中でも違いを確認する'),
      item('board','ターンの9♦で、どの変化を見る？',['Kを持つ手がすべて弱いワンペアになった','QJにストレートが完成した','99のフルハウスや、残っていた9を持つ手の改善'],2,'新しい9が、どの残存候補に当たったかを確認します。','99はフルハウスになります。9を持つ手もボードのKのペアと合わせた役が変わります。ただし99がどれくらい残るかは、プリフロップの参加とフロップの応答から確認します。','役が変わる候補と、AKなど変わらず強い候補を分けて見ます。','役が変わる具体的候補を比べる'),
      item('action','A♦Q♦でリバーに打つなら、何が根拠になる？',['弱いAから支払いを得られるか。Kやフルハウスには負けることも確認','Aが落ちたので相手のKは全部なくなった','2ペアになったので必ず最大額を打つ'],0,'自分の改善と、相手に残るさらに強い手を同時に確認します。','AQはAとKの2ペアになりました。弱いAから支払いを狙えますが、Kのスリーカードやフルハウスには負けます。この固定例では小さなベットで弱いAが応じるかを考えます。','Aは自分を改善させますが、相手のAKにも働きます。自分に良いカードと、自分だけに良いカードは違います。','改善しても相手の強い候補を残す')]
  },
  {id:'co_queen_bet',title:'後で動くコール側を相手に打つ',opener:'CO',caller:'BTN',hero:'CO',hand:['Qs','Js'],board:['Qh','7d','2c','4s','9c'],contrast:'co_queen',
    lines:[[bet('opener',2.2),call('caller')],[bet('opener',6,'value_bet'),call('caller','call_large')],[ck('opener','check_back'),ck('caller','check_back')]],decisions:[0,0,0],
    prompts:[
      item('action','COのQJで小さく打つ目的は？',['最初にレイズした側だから、目的なしに毎回打つ','QTなど、弱いQの一部からコールをもらう','BTNの強いQを必ず降ろす'],1,'相手に残る弱いQが支払うなら、利益を狙うベットになります。','BTNはコールで参加した側ですが、フロップ以降は自分より後に動きます。QTなどには勝ち、AQ・KQの一部には負けます。相手の位置と、具体的なコール候補を両方確認します。','先行レイズした役割と、毎ストリート先に行動する位置は別の情報です。','位置と役割を分けて判断する'),
      item('range','BTNがフロップでコールしたあと、何が変わる？',['役なしの割合が減り、Q・ペア・一部の強い役が残る','BTNは後で動くので、どんな手でも同じ割合でコールする','BTNはQJとまったく同じ手だけになる'],0,'ポジションがあっても、支払いを続ける手には偏りが生まれます。','BTNのプリフロップコール範囲に、フロップのコールを重ねます。弱い役なしは減らしますが、セットの一部はコールで残る設定です。相手の手を1つに決めるのではなく、グループを更新します。','4♠で新しいフラッシュは完成しません。フロップのコールによる絞り込みが先です。','コール側の構成を更新する'),
      item('board','リバーの9♣で、比較し直す候補は？',['プリフロップで除外した手を、9があるので全部戻す','全ての役なしがストレートになった','99のセットやA9など、ここまで残った9関連の手'],2,'候補にあった9関連の手がどう改善するかを見ます。','99はセットになります。A9の一部も9のペアへ改善しますが、ターンの大きめのベットへのコールで重みは下がっています。ボードだけでなく、その前に支払った行動も条件です。','9が来た事実だけで、相手に9がたくさんあるとは言えません。','新カードと過去の絞り込みを両方使う')]
  },
  {id:'co_queen_check',title:'同じQ・7・2でも、両者チェック',opener:'CO',caller:'BTN',hero:'CO',hand:['Qs','Js'],board:['Qh','7d','2c','4s','9c'],contrast:'co_queen',
    lines:[[ck('opener','check_back'),ck('caller','check_back')],[ck('opener','check_back'),ck('caller','check_back')],[bet('opener',2.2,'value_bet'),call('caller')]],decisions:[0,0,0],
    prompts:[
      item('range','COとBTNの出発点について、正しいのは？',['どちらも参加したので同じ範囲','後で動くBTNにだけAAがある','COのレイズ範囲と、BTNのコール範囲は別に置く'],2,'参加位置だけでなく、レイズとコールの違いを使います。','COは最初にレイズし、BTNはそれにコールしました。この教材では強い手の多くはリレイズへ回し、一部だけコールに残します。後で動く位置だから、強い手だけに決まるわけではありません。','まだフロップで支払いは起きていません。両者のプリフロップの違いから始めます。','出発点を2つ並べる'),
      item('board','両者チェックのあとに4♠。ベット→コールの例と何が違う？',['ボードが同じなら範囲も同じ','BTNが支払っていないので、弱い候補も多く残る経路','COがチェックしたので、Qは必ずなくなった'],1,'同じカードでも、途中の行動がレンジを変えます。','BTNはフロップで追加の支払いを求められていません。そのためベットへコールした経路とは範囲が違います。両者とも強い役の一部をチェックに残す設定なので、強い手をすべて消しません。','コールによる選別がない経路と、コールした経路を区別します。','同ボード・違う行動を比較する'),
      item('action','QJでリバーに小さく打つとしたら、必要な読みは？',['QTなどの弱い手がこの額にコールする、という読み','チェックが続いたので絶対に勝っている、という読み','ボードにQがあるから誰でも払う、という読み'],0,'ベットの理由を、相手が何で応じるかに結びつけます。','この教材では弱いQの一部が小さなベットへコールします。その支払いを狙います。99・77などの強い役も一部残っているので、チェックの回数だけで相手を役なしと決めません。','同じQJ・同じ最終ボードでも、ベットが続いた例より相手の弱い候補が多く残ります。','チェック後にも範囲を保つ')]
  },
  {id:'co_connected',title:'つながるターンは両者に働く',opener:'CO',caller:'BTN',hero:'BTN',hand:['Ks','Ts'],board:['Jd','Th','9c','Qd','2h'],
    lines:[[ck('opener','check_back'),ck('caller','check_back')],[ck('opener','check_back'),bet('caller',4,'value_bet'),call('opener','call_small')],[ck('opener'),ck('caller','check_back')]],decisions:[1,1,1],
    prompts:[
      item('board','J・T・9では、まず何を並べる？',['COのAAだけ','完成ストレート・2ペア・ストレート待ちの候補を両者で並べる','BTNはコール側なので、ストレートはない'],1,'高いペアの多さだけでなく、ボードに直接つながる候補を比べます。','KQはストレート、JTやT9は2ペアです。KTはTのペアとストレートへの改善を持ちます。どの手が両者の参加範囲に残るかを確かめてから比較します。','同じ連続ボードでも、初期範囲に含まれない候補は足しません。','ボードに当たる役を分類する'),
      item('action','Q♦でKTがストレート。ベットの狙いとして合うのは？',['必ず相手のAKを降ろす','ストレートなら相手の範囲は不要','弱いストレート・セットなどからコールをもらう'],2,'強くなった手で、さらに弱い継続ハンドから支払いを狙います。','KTは9〜Kのストレートです。8を持つ低いストレートやセットの一部がコールする固定例です。一方、AKはAまでのストレートで自分より強く、相手の範囲から消せません。','Qは自分のKTだけでなく、相手のAKやKx・8xにも働きます。','改善の恩恵を両者で比べる'),
      item('range','ターンでCOがコールしたあと、どう更新する？',['ストレートや一部の強い役を残し、弱い役なしを減らす','COは必ずAKだけ','最初にレイズしたCOは、コールしても範囲が変わらない'],0,'後からコールした事実も、最初のレイズと同じように根拠にします。','COはプリフロップのレイズ側ですが、ターンではこちらのベットへコールした側です。役割の名前に縛られず、ストレートなどの継続候補を残し、弱い役なしの重みを下げます。','リバーの2♥で新しいフラッシュは完成しません。残っているストレート同士の強さも比べます。','アクションごとに読みを更新する')]
  },
  {id:'co_flush_pair',title:'フラッシュ完成のあと、リバーでペア',opener:'CO',caller:'BTN',hero:'BTN',hand:['Ah','5h'],board:['Kh','8h','4c','2h','Kd'],
    lines:[[bet('opener',2.2),call('caller')],[ck('opener'),bet('caller',6,'value_bet'),call('opener','call_small')],[bet('opener',16,'polar_bet'),call('caller','call_large')]],decisions:[1,1,1],
    prompts:[
      item('range','A♥5♥を持つ自分と、相手から見た自分をどう分ける？',['相手もA♥5♥だと分かっている','相手にはA5以外のペアやハート2枚も候補として見える','実際の手がドローなので、自分の範囲も全てドロー'],1,'本当の2枚と、同じ行動をする候補全体を分けます。','自分はA♥5♥を知っていますが、相手は参加位置とコールする行動から読みます。自分の範囲には中小ペアや他の同じマークの手も含まれます。実際の2枚だけで相手の目線を説明しません。','A♥5♥はハートが合計4枚。完成フラッシュではなく、あと1枚を待つ状態です。','自分の手札と自分の範囲を分ける'),
      item('board','2♥でフラッシュが完成。どの比較が必要？',['ハート2枚の候補と、その中でA♥を含む強さを比べる','ハート1枚を持つ全員がフラッシュ','フラッシュができたら、相手のセットはなくなる'],0,'同じフラッシュでも、手札のハートの高さが違います。','A♥5♥はAを一番上に使うフラッシュです。相手のハート2枚や、セットなどの候補も残ります。相手のセットはリバーでフルハウスへ改善する可能性があるため、消しません。','ランクだけの169マスから、実際のマーク付き2枚へ掘り下げる場面です。','スートと強さ、次の改善を比較する'),
      item('action','リバーのベットに、コールかフォールドをどう決める？',['フラッシュなのでどんな額でも払う','Kがペアになったので必ず降りる','残る相手候補に勝つ割合を、この額の必要勝率と比べる'],2,'強い役の名前だけでなく、相手の範囲と支払額を比較します。','Kがペアになり、KK・88・44などからフルハウス以上の候補ができます。一方で、弱いフラッシュやKのスリーカード、一部のブラフも考えます。この問題では追加レイズを選ばず、コール後の追加支払いもありません。','リバーのペア化で、自分のフラッシュに勝つ役の候補が増えました。完成フラッシュのまま自動判断しません。','最後の支払いを候補と価格で決める')]
  }
];

function buildCase(def){
  let weights=initialRanges(def.opener,def.caller);
  const initial=makeActions(def.opener,def.caller),actions=[...initial.actions];
  let pot=initial.pot;const completed=[];let previousBoard=[];
  const heroRole=def.hero===def.opener?'opener':'caller';
  const roles={hero:heroRole,opener:{position:def.opener,label:'最初にレイズした側',hero:heroRole==='opener'},caller:{position:def.caller,label:'コールで参加した側',hero:heroRole==='caller'}};
  function views(board){return Object.fromEntries(['opener','caller'].map(role=>[role,rangeView(weights[role],board,def.hand,role===heroRole)]))}
  const preViews=views([]);
  completed.push({street:'preflop',board:[],summary:`${def.opener}が2.5BBへレイズ、${def.caller}がコール。`,removed:['参加しないハンドは出発点から除外'],retained:['位置ごとの参加手','リレイズに回す強い手のうち、教材設定の一部だけコール'],reason:'ヨコサワ最新版・アンティなしの基準を出発点に、リレイズ対象の手も12%の重みでコールへ残す教材モデル。',advantage:'位置と、レイズ／コールの違いから始める',ranges:preViews,actions:[...actions]});
  const questions=[];
  for(let step=0;step<3;step++){
    const street=streets[step],board=def.board.slice(0,step+3),line=def.lines[step],decision=def.decisions[step],prompt=def.prompts[step],bets={opener:0,caller:0};
    const beforeStreet={opener:weights.opener,caller:weights.caller};
    weights={opener:removeBoard(weights.opener,board),caller:removeBoard(weights.caller,board)};
    const currentActions=[];
    function apply(e){
      const position=def[e.actor],current=Math.max(bets.opener,bets.caller),cost=round(current-bets[e.actor]),potBefore=pot;
      let amount=0;
      if(e.action==='check'){if(cost!==0)throw Error(def.id+': cannot check facing a bet')}
      else if(e.action==='call'){if(cost<=0)throw Error(def.id+': cannot call without a bet');amount=cost}
      else if(e.action==='bet'){if(current!==0)throw Error(def.id+': bet must open the street');amount=e.amount}
      else if(e.action==='raise'){if(e.amount<=current)throw Error(def.id+': raise must exceed current bet');amount=e.amount-bets[e.actor]}
      bets[e.actor]=round(bets[e.actor]+amount);pot=round(pot+amount);
      const label={check:'チェック',call:'コール',bet:'ベット',raise:'レイズ'}[e.action];
      const text=position+' '+label+(amount?' '+(e.action==='raise'?'合計'+bets[e.actor]:amount)+'BB':'');
      const item={street,position,actor:e.actor,action:e.action,amount:round(amount),total:bets[e.actor],cost,potBefore,potAfter:pot,text,policy:e.policy,assumption:policyDescriptions[e.policy]};
      actions.push(item);currentActions.push(item);
      weights={...weights,[e.actor]:updateRange(weights[e.actor],e.policy,board,previousBoard)};
    }
    for(const e of line.slice(0,decision))apply(e);
    const ranges=views(board),comparison=compareRanges(ranges,board,def.opener,def.caller,prompt.changes);
    const cost=round(Math.max(bets.opener,bets.caller)-bets[heroRole]);
    const snapshot={street,board:[...board],summary:prompt.changes,removed:['公開カードと重なる2枚の組合せ',...currentActions.filter(e=>e.policy!=='check_all').map(e=>e.position+'：'+e.assumption)],retained: [...ranges.opener.examples,...ranges.caller.examples].map(e=>e.label+'（'+e.reason+'）'),reason:prompt.why,advantage:comparison.summary,ranges,actions:[...currentActions],beforeCounts:{opener:beforeStreet.opener.length,caller:beforeStreet.caller.length}};
    const scenario={caseId:def.id,stepIndex:step,street,roles,opener:def.opener,caller:def.caller,pot,cost,actions:[...actions],ranges,changes:[...completed,snapshot],comparison,decisive:prompt.decisive,goal:prompt.goal,
      assumption:'6人卓・100BB・アンティなし。相手の参加基準はヨコサワ最新版。強い手の一部もコールに残す教材設定で、その後の行動ごとの重みも仮定です。ソルバーの最適解ではありません。',
      source:sourceLinks,skill:prompt.skill,version:scenarioVersion,rangeKnowledge:'両者のアクションから見える候補（公開情報）。共通カードを除外。相手の例示は自分の手札と重ならないものを表示。',
      continuation:'次の問題では、この教材で決めたアクション例の続きへ進みます。あなたの回答で実際の対戦を分岐させるものではありません。',
      nextActions:line.slice(decision).map(e=>({position:def[e.actor],action:e.action,amount:e.amount})),contrast:def.contrast||null,tableSize:6,effectiveStack:100,ante:false,openSize:2.5};
    const traps=prompt.options.map((_,i)=>i===prompt.answer?'':prompt.skill==='action'?'行動の名前や自分の役だけで決めず、相手が何で続ける／降りるかを確認しよう。':prompt.skill==='board'?'新しいカードだけでは決まりません。ここまで残った具体的な候補に重ねよう。':'実際に起きた位置・行動の順番から更新し、強い手や弱い手を一度に全部消さないようにしよう。');
    questions.push({id:'story_'+def.id+'_'+street,level:prompt.skill==='board'?2:prompt.skill==='range'?3:4,title:def.title+' · '+streetNames[street],board,history:[`${def.opener}：最初にレイズ ／ ${def.caller}：コールで参加`,...actions.filter(a=>a.action!=='blind').map(a=>streetNames[a.street]+'：'+a.text)],ask:prompt.ask,options:prompt.options,answer:prompt.answer,answers:[prompt.answer],why:prompt.why,hints:['最初にレイズした側と、コールで参加した側を確認。','前のストリートまでの行動を順番に重ねて考えよう。',prompt.decisive],range:null,view:'両者のレンジと自分の判断',hero:def.hero,hand:def.hand,active:[def.opener,def.caller],positions,foundation:'参加表は候補の出発点。位置・アクション・新しい共通カードで、両者の範囲を更新する。',learningKind:prompt.skill==='action'?'apply':'read',takeaway:prompt.decisive,traps,steps:['出発点：位置とレイズ／コールで、両者の候補を置く。','変化：これまでの行動と、新しいカードを候補に重ねる。',prompt.decisive],source:'scenario',ante:false,skill:prompt.skill,version:scenarioVersion,scenario});
    for(const e of line.slice(decision))apply(e);
    const endRanges=views(board),endComparison=compareRanges(endRanges,board,def.opener,def.caller,prompt.changes);
    completed.push({...snapshot,summary:prompt.changes+' 教材の固定例として '+currentActions.map(a=>a.text).join(' → ')+' で進みました。',ranges:endRanges,actions:[...currentActions],advantage:endComparison.summary});
    previousBoard=board;
  }
  return {id:def.id,title:def.title,opener:def.opener,caller:def.caller,hero:def.hero,hand:def.hand,board:def.board,contrast:def.contrast||null,version:scenarioVersion,questions};
}

// Generated once per module load. UI navigation reuses these immutable snapshots.
export const scenarios=definitions.map(buildCase);
export const scenarioQuestions=scenarios.flatMap(s=>s.questions);
