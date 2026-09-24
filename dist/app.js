import {yokosawaSource,yokosawaColors,yokosawaRank,yokosawaThreshold,yokosawaAction,handNotation} from './yokosawa.js';
import {questions,courses,learningKinds,levelNames,ranks,rangeWeight} from './questions.js';
const $=s=>document.querySelector(s),root=$('#app');
const defaults={players:6,unit:'bb',mode:'learn',level:1};
let saved={};try{saved=JSON.parse(localStorage.getItem('range-room-v1')||'{}')||{}}catch{}
let settings={...defaults,...saved.settings};if(![4,5,6,7,8].includes(settings.players))settings.players=6;if(![1,2,3,4,5].includes(settings.level))settings.level=1;
let records=Array.isArray(saved.records)?saved.records.filter(r=>questions.some(q=>q.id===r.id)&&typeof r.correct==='boolean'&&Number.isInteger(r.hints)).slice(-500):[];
let flashStats={attempts:0,correct:0,sessions:0};if(saved.flashStats&&['attempts','correct','sessions'].every(key=>Number.isInteger(saved.flashStats[key])&&saved.flashStats[key]>=0))flashStats=saved.flashStats;
let drill=null;
let page='home',filter='all',index=0,selected=null,answered=false,hints=0,rangeMode='after',notice='',session=null;
function persist(){try{localStorage.setItem('range-room-v1',JSON.stringify({settings,records,flashStats}))}catch{notice='このブラウザでは保存できません。現在の練習は続けられます。'}}

function latestRecords(){return new Map(records.map(r=>[r.id,r]))}
function mastered(id){const r=latestRecords().get(id),q=questions.find(q=>q.id===id);return !!r?.correct&&r.hints===0&&(q?.source!=='yokosawa'||r.edition===yokosawaSource.version)}
function reviewQuestions(){const latest=latestRecords();return questions.filter(q=>latest.has(q.id)&&!mastered(q.id))}
const list=()=>drill?drill.ids.map(id=>questions.find(q=>q.id===id)):filter==='board'?questions.filter(q=>q.level===2&&q.id!=='actual_hand'):filter==='review'?reviewQuestions():questions.filter(q=>q.level===(filter==='pre'?1:settings.level));
function startDrill(ids,title,courseId=null){
  drill={ids:[...ids],title,courseId,results:[],finished:false};
  page='practice';filter='course';resetQuestion();render();window.scrollTo({top:0});
}
function startCourse(id){
  const course=courses.find(c=>c.id===id);if(!course)return;
  const pending=course.questions.filter(id=>!mastered(id));
  startDrill((pending.length?pending:course.questions).slice(0,5),course.title,id);
}
function startReview(){const ids=reviewQuestions().map(q=>q.id).slice(0,5);if(ids.length)startDrill(ids,'苦手をもう一度');else navigate('stats')}
function startBeginnerTen(){
  const latest=latestRecords(),basics=courses[0].questions,rest=questions.map(q=>q.id).filter(id=>!basics.includes(id));
  const basicPending=basics.filter(id=>!mastered(id)),basicDone=basics.filter(id=>mastered(id));
  const unseen=rest.filter(id=>!latest.has(id)),seen=rest.filter(id=>latest.has(id)),follow=[...unseen,...seen];
  const offset=unseen.length?0:records.length%Math.max(follow.length,1);
  const rotated=[...follow.slice(offset),...follow.slice(0,offset)];
  startDrill([...basicPending,...basicDone,...rotated].slice(0,10),'初心者10問トレーニング');
}
function submitAnswer(){
  if(answered||selected===null)return;
  const q=current();if(!q)return;
  answered=true;
  const result={id:q.id,level:q.level,correct:selected===q.answer,hints,at:Date.now(),edition:q.source==='yokosawa'?yokosawaSource.version:null};
  records.push(result);records=records.slice(-500);
  if(drill)drill.results.push({...result,choice:selected});
  persist();render();
}
function nextQuestion(){
  if(!answered)return;
  if(drill&&index+1>=drill.ids.length){drill.finished=true;render();window.scrollTo({top:0});return}
  index++;selected=null;answered=false;hints=0;rangeMode='after';render();
  window.scrollTo({top:0,behavior:'smooth'});
}

const current=()=>list()[index%Math.max(list().length,1)];
const money=n=>settings.unit==='points'?`${Math.round(n*200).toLocaleString()}点`:`${Number(n.toFixed(1))}BB`;
function cards(cs){return `<div class="cards">${cs.map(c=>c==='?'?'<span class="card back" aria-label="伏せたカード"></span>':`<span class="card ${/[hd]/.test(c)?'red':''}">${c[0]}${{s:'♠',h:'♥',d:'♦',c:'♣'}[c[1]]}</span>`).join('')}</div>`}

function seatLayout(hero,players=['UTG','HJ','CO','BTN','SB','BB']){
  const start=players.indexOf(hero);
  return players.map((pos,i)=>({pos,slot:(i-start+players.length)%players.length}));
}
function table(q,custom){
  const hero=q.hero||(q.id==='mirror'?'BTN':q.id==='multi'?'SB':'BB');
  const active=q.active||(q.id==='multi'?['BTN','SB','BB']:['BTN','BB']);
  const seats=seatLayout(hero,q.positions);
  return '<div class="table-wrap"><div class="poker-table training-table"><div class="table-center"><div class="table-logo">RANGE ROOM</div>'+
    cards(q.board.length?q.board:['?','?','?'])+'<div class="pot">'+(custom||(q.ante?'ANTEあり · 最新版':'100BB · ANTEなし'))+'</div></div>'+
    seats.map(({pos,slot})=>'<div class="seat seat-'+slot+' '+(pos===hero?'hero':!active.includes(pos)?'folded':'')+'" style="'+(seats.length!==6&&slot!==0?'left:'+(50+48*Math.cos(Math.PI/2+2*Math.PI*slot/seats.length))+'%;top:'+(50+47*Math.sin(Math.PI/2+2*Math.PI*slot/seats.length))+'%;bottom:auto;right:auto;transform:translate(-50%,-50%)':'')+'" data-position="'+pos+'" aria-label="'+pos+(pos===hero?' あなたの席':' 相手の席')+'">'+
      (pos===hero&&q.hand?'<div class="hero-cards"><small>あなたの手札</small>'+cards(q.hand)+'</div>':'')+
      '<span>'+pos+(pos===hero?' · YOU':'')+'</span><small>'+(pos===hero?'あなた':active.includes(pos)?'相手':'fold')+'</small></div>').join('')+
    '</div><p class="table-caption">あなたは '+hero+'。画面の手前に固定して表示しています。</p></div>';
}
function learningIntro(q){
  const kind=learningKinds[q.learningKind];
  return '<div class="learning-intro '+q.learningKind+'"><span class="learning-badge">'+kind.title+'</span><p>'+kind.prompt+'</p></div>';
}

function learningFeedback(q){
  const kind=learningKinds[q.learningKind];
  return '<div class="lesson-foundation"><b>覚えておく基準</b><p>'+q.foundation+'</p></div>'+
    '<h4>'+kind.reasonTitle+'</h4><p>'+q.why+'</p>'+
    (q.source==='yokosawa'?'<p class="notice">基準：ヨコサワ2025年最新版・アンティ'+(q.ante?'あり':'なし')+'。'+yokosawaLink(q.ante?163:1644)+'</p><details><summary>最新版の色を表で確かめる</summary>'+yokoGrid(q.ante,null,q.hand?handNotation(q.hand):'')+'</details>':'<p class="notice">ここからは一般的な考え方を使う本アプリの教材です。相手の継続範囲や頻度は問題の仮定で、ヨコサワ表の指定ではありません。</p>')+
    (q.id==='hero_btn'?'<details open class="chart-explainer"><summary>勝率表で決まる？ 暗記する？</summary><p><b>覚える基準：</b>K9sは緑。アンティなしのBTNは白以上。色と条件を対応させてレイズを選びます。</p><p><b>なぜ位置が関係する？</b>後ろに相手が少なく、フロップ以降も相手を見てから動けるためです。ただし、この理由だけで参加範囲の正確な境界までは導けません。</p><p><b>勝率と参加表は別：</b>勝率は指定した相手の範囲に対して勝つ割合。レイズの損得には相手が降りる可能性や、その後の支払いも関係します。このアプリはその計算をしていません。公式の入門用の参加基準を採用しています。</p><p><b>読む部分：</b>相手が参加したら、位置・コールかリレイズか・ボードから候補を更新します。参加表はその出発点です。</p></details>':'');
}
function friendlyWords(text){
  return text
    .replace('レンジ','持っていそうな手札の候補（レンジ）')
    .replace('スーテッド','同じマークの手（スーテッド）')
    .replace('オフスート','違うマークの手（オフスート）')
    .replace('リレイズ','相手のレイズに、さらにレイズ（リレイズ）')
    .replace('セット','手札のペアから作るスリーカード（セット）')
    .replace('ドロー','あと1枚で強い役になる手（ドロー）');
}
function rangeStory(q){
  const history=q.history.join(' '),position=q.hero||(q.id==='mirror'?'BTN':q.id==='multi'?'SB':'BB');
  if(q.source==='yokosawa'&&(/全員フォールド|参加者なし|未参加/.test(history))&&!/が2\.5BBにレイズ/.test(history))return {
    focus:'自分が最初に参加するときの手札候補',
    start:'まだ誰も参加していないので、まず「この位置から参加してよい手」を表で探します。',
    change:'後ろに残る人数とアンティの有無で、参加できる色の下限が変わります。手札の色が下限に届かなければ候補から外します。',
    because:'後ろの人数が多いほど、誰かに強い手を持たれている可能性が上がるためです。'
  };
  if(q.source==='yokosawa')return {
    focus:'先にレイズした相手の手札候補と、それに対する自分の手札',
    start:'相手が最初にレイズした位置から、相手が参加しそうな色の範囲を置きます。相手の手札を1つに決めません。',
    change:'レイズしたことで、最初から降りる弱い手は候補から減りました。自分は相手の参加下限と、自分の色の差を比べます。',
    because:'同じレイズでも強い手だけでなく、その位置から参加できる複数の手で行うからです。'
  };
  if(q.range==='call')return {
    focus:'BBがコールしたあとに残る手札候補',
    start:'BBはプリフロップでコールしたので、中小ペア・同じマークの連続した手・一部のAなどが候補です。',
    change:'フロップでもコールすると、何も役がなく今後も強くなりにくい手は減ります。ペア、強くなる可能性のある手、一部の強い手が残ります。',
    because:'追加のお金を払うには、今勝っているか、次のカードで強くなる見込みが必要だからです。'
  };
  if(q.range==='river')return {
    focus:'リバーまで大きくベットし続けた相手の手札候補',
    start:'最初の参加位置から、相手が持ち得る手を広く置きます。',
    change:'大きなベットを3回続けたため、中くらいの強さの手は減り、とても強い完成ハンドと一部のブラフが中心になります。',
    because:'中くらいの手は、弱い手に降りられ、強い手にだけコールされやすいので、何度も大きく打ちにくいからです。'
  };
  if(q.range==='bb')return {
    focus:'BBがプリフロップでコールしたあとに残る手札候補',
    start:'BBはすでに1BBを払っているので、追加額が小さく、ほかの位置より広い手でコールできます。',
    change:history.includes('コール')?'その後のコールで、完全に弱い手は減り、ペア・つながった手・強くなる可能性のある手が残ります。':'強いAA・KK・AKなどをリレイズに回す設定なら、それらはコール側から少し減ります。',
    because:'同じ「参加」でも、コールとリレイズでは使う手札のグループが違うからです。'
  };
  if(q.range==='utg')return {
    focus:'早い位置から参加するプレイヤーの手札候補',
    start:'早い位置では後ろに多くの相手が残るため、強めの手から参加します。',
    change:'レイズした時点で、表の参加下限より弱い手は候補から大きく減ります。',
    because:'後ろの誰かがさらに強い手を持つ可能性が、遅い位置より高いからです。'
  };
  if(q.range==='btn')return {
    focus:(position==='BTN'?'BTN':'レイズした側')+'が持っていそうな手札候補',
    start:'BTNは後ろにSBとBBしかいないため、強い手に加えて弱めの同じマークの手でも参加できます。',
    change:history.includes('ベット')?'ボードが出てベットしたあとも、強い手だけでなく、同じ小さな額を使う弱い手が残ります。':'レイズしたことで、参加表の外にある弱い手は候補から減ります。',
    because:'BTNは後ろの人数が少なく、フロップ以降も相手の行動を見てから動きやすい位置だからです。'
  };
  return {
    focus:q.view==='自分の行動'?'相手が持っていそうな手札候補':'この問題文で指定された相手の手札候補',
    start:'まず位置と、それまでの行動から、相手が最初に持ち得た手を広く考えます。',
    change:'新しいベットやコールがあるたびに、その行動を取りにくい手を減らします。候補をいきなり1つにはしません。',
    because:'同じ行動を取る手札は複数あり、強い手も弱い手も混ざることがあるからです。'
  };
}
function rangePrimer(q){const s=rangeStory(q);return '<section class="range-primer"><span>この問題で見るレンジ</span><b>'+s.focus+'</b><small>レンジ＝その人が持っていそうな手札の候補全部</small></section>'}
function rangeWalkthrough(q){const s=rangeStory(q);return '<section class="range-walkthrough"><h3>レンジはどう変わった？</h3><div><b>① 最初の候補</b><p>'+s.start+'</p></div><div><b>② 行動のあと</b><p>'+s.change+'</p></div><div><b>③ なぜそう言える？</b><p>'+s.because+'</p></div></section>'}
function learningGuide(){
  return '<section class="panel learning-guide"><h2>覚えることと、読むことを分けよう。</h2><div class="learning-guide-grid">'+Object.values(learningKinds).map(k=>'<div><span class="learning-badge">'+k.title+'</span><p>'+k.description+'</p></div>').join('')+'</div><p class="notice">基準は理由とセットで覚える。相手の手札は、位置・アクション・ボードから候補を更新する。各問題で、どちらを練習するかを表示します。</p></section>';
}

function grid(type){if(type==='utg'||type==='btn')return '<p class="range-kind">ヨコサワ最新版・アンティなし（勝率表ではありません）</p><p>'+ (type==='utg'?'6人卓UTG：後ろ5人・緑以上。':'BTN：後ろ2人・白以上。')+'</p>'+yokoGrid(false,yokosawaThreshold(type==='utg'?5:2,false))+'<small>薄いマスは参加範囲の外。'+yokosawaLink(1644)+'</small>';if(type==='river')return '<p>強い役の例：QQ・88・33のフルハウス、22のフォーカード。ブラフ候補の例：A♠J♠・J♠T♠などの未完成ドローの一部。</p><small>同じランクでもマークによって意味が変わるため、この問題は具体的なカードで示します。</small>';return `<p class="range-kind">本アプリが仮定した継続レンジ（勝率表ではありません）</p><div class="range-scroll"><div class="range-grid" aria-label="教材の参加・継続レンジ表">${[...ranks].flatMap((a,i)=>[...ranks].map((b,j)=>{const h=i===j?a+b:i<j?a+b+'s':b+a+'o',v=rangeWeight(h,type);return `<span title="${h}：${v>=.75?'多く含む':v?'一部含む':'基本含まない'}" class="range-cell ${v>=.75?'on':v?'low':''}">${h}</span>`})).join('')}</div></div><div class="legend"><span><i></i>多く含む</span><span><i class="low"></i>一部含む</span><span>暗色：基本含まない</span></div><small>${type==='call'?'コール前の範囲に継続の重みを掛けた説明図。':'ヨコサワ最新版・アンティなしのBB継続基準を出発点とし、リレイズ対象の手も一部コールすると仮定した説明図。'}重みは本アプリの仮定で、ヨコサワ表の指定ではありません。色は、その手を範囲に含める重みの代表例です。ソルバー出力・正確な行動頻度・勝率・公開カードを除いたコンボ数ではありません。</small>`}

function yokosawaLink(time=1644){return '<a href="'+yokosawaSource.url+'&t='+time+'s" target="_blank" rel="noreferrer">公式動画で確認（2025年12月6日） ↗</a>'}
function yokoGrid(ante=true,minimum=null,selectedHand=''){
  return '<div class="range-scroll"><div class="range-grid yoko-grid" aria-label="ヨコサワ最新版のハンド分類">'+[...ranks].flatMap((a,i)=>[...ranks].map((b,j)=>{
    const h=i===j?a+b:i<j?a+b+'s':b+a+'o',tier=yokosawaRank(h,ante);
    return '<span class="range-cell yoko-tier-'+tier+(minimum!==null&&tier<minimum?' outside':'')+(h===selectedHand?' selected-hand':'')+'" title="'+h+'：'+yokosawaColors[tier]+(minimum!==null?'・'+(tier>=minimum?'オープン対象':'フォールド'):'')+'">'+h+'</span>';
  })).join('')+'</div></div><div class="yoko-legend">'+yokosawaColors.map((name,tier)=>!ante&&tier===1?'':'<span><i class="yoko-tier-'+tier+'"></i>'+tier+' '+name+'</span>').join('')+'</div>';
}
function openChartOverlay(ante=false,hand=''){
  const old=document.querySelector('#chart-overlay-host');if(old)old.remove();
  const host=document.createElement('div');host.id='chart-overlay-host';
  host.innerHTML='<div class="chart-overlay" role="dialog" aria-modal="true" aria-labelledby="chart-overlay-title"><div class="chart-overlay-card"><div class="row between"><div><span class="eyebrow">プレイを止めずに確認</span><h2 id="chart-overlay-title">ヨコサワ表</h2></div><button id="chart-overlay-close" aria-label="表を閉じる">閉じる ×</button></div><p class="notice">練習中の状態はそのまま残ります。右上は同じマーク（s）、左下は違うマーク（o）、対角線はペアです。</p><div class="chart-overlay-tabs"><button data-overlay-ante="no" class="'+(!ante?'primary':'')+'">キャッシュ・アンティなし</button><button data-overlay-ante="yes" class="'+(ante?'primary':'')+'">アンティあり</button></div>'+yokoGrid(ante,null,hand)+'<p class="notice">'+(hand?hand+'を白枠で表示しています。':'')+'色は勝率ではなく、参加基準の段階です。</p></div></div>';
  document.body.appendChild(host);
  host.querySelector('#chart-overlay-close').onclick=()=>host.remove();
  host.querySelector('.chart-overlay').onclick=e=>{if(e.target===e.currentTarget)host.remove()};
  host.querySelectorAll('[data-overlay-ante]').forEach(button=>button.onclick=()=>{host.remove();openChartOverlay(button.dataset.overlayAnte==='yes',hand)});
}
let bibleState={ante:false,behind:2,hand:'K9s',spot:'open',openerBehind:3};
let flash=null;
function flashSeats(behind){return behind<=5?positions(6):behind===6?positions(7):behind===7?positions(8):['UTG','UTG+1','UTG+2','UTG+3','HJ','CO','BTN','SB','BB']}
function startFlash(){
  const b=bibleState,config={ante:b.ante,spot:b.spot,behind:b.behind,openerBehind:b.openerBehind};
  const minimum=yokosawaThreshold(b.spot==='open'?b.behind:b.openerBehind,b.ante);
  const all=[...ranks].flatMap((a,i)=>[...ranks].map((c,j)=>i===j?a+c:i<j?a+c+'s':c+a+'o'));
  const pool=all.filter(hand=>Math.abs(yokosawaRank(hand,b.ante)-minimum)<=2);
  flash={config,hands:[b.hand,...shuffle(pool.filter(hand=>hand!==b.hand)).slice(0,9)],index:0,correct:0,selected:null};
  drill=null;page='flash';render();window.scrollTo({top:0});
}
function renderFlash(){
  const f=flash,b=f.config,done=f.index===f.hands.length;
  if(done){shell('<div class="eyebrow">RAPID PRACTICE COMPLETE</div><h1>色と条件の10問、完了。</h1><section class="panel"><strong class="flash-score">'+f.correct+' / 10</strong><p>迷った境界は表で確かめ、条件を変えてもう一度練習しましょう。</p><div class="row"><button class="primary" id="flash-again">同じ条件でもう10問</button><button id="flash-back">表に戻る</button></div></section>');$('#flash-again').onclick=startFlash;$('#flash-back').onclick=()=>navigate('bible');return}
  const hand=f.hands[f.index],behind=b.spot==='open'?b.behind:b.openerBehind,seats=flashSeats(behind);
  const hero=b.spot==='open'?seats.at(-1-behind):b.spot==='bb'?'BB':behind===2?'SB':'BTN';
  const opener=b.spot==='open'?null:seats.at(-1-behind);
  const cards=hand[0]+'s',second=hand[1]+(hand.length===2||hand.endsWith('o')?'h':'s');
  const correct=yokosawaAction(hand,{ante:b.ante,behind:b.behind,openerBehind:opener?b.openerBehind:null,bb:b.spot==='bb'});
  const tier=yokosawaRank(hand,b.ante),minimum=yokosawaThreshold(behind,b.ante);
  const actions=b.spot==='open'?['fold','raise']:['fold','call','raise'];
  const names={fold:'フォールド',call:'コール',raise:b.spot==='open'?'レイズ':'リレイズ'};
  const prompt=b.spot==='open'?'あなたの後ろに'+behind+'人。全員フォールドで回ってきました。':opener+'が2.5BBにレイズ。'+(b.spot==='bb'?'あなたはBB。':'あなたは'+hero+'。');
  shell('<div class="eyebrow">YOKOSAWA · QUICK DRILL</div><h1>違う手札でも、同じ順番で。</h1><p>アンティ'+(b.ante?'あり':'なし')+' · '+(f.index+1)+' / 10問 · 正解'+f.correct+'問</p><div class="workspace"><section class="panel">'+table({positions:seats,hero,hand:[cards,second],board:[],active:opener?[opener,hero]:seats.slice(seats.indexOf(hero)),ante:b.ante})+'<div class="history">'+prompt+'</div></section><section class="panel"><span class="learning-badge">覚える基準を使う</span><h2 class="question">'+hand+'なら、基本行動は？</h2><div class="flash-choices">'+actions.map(action=>'<button data-flash="'+action+'" class="'+(f.selected!==null&&action===correct?'correct':'')+'" '+(f.selected!==null?'disabled':'')+'>'+names[action]+'</button>').join('')+'</div>'+
    (f.selected!==null?'<div class="bible-answer" aria-live="polite"><b>'+(f.selected===correct?'✓ 正解':'もう一度、境界を確認')+'</b><h3>'+hand+'は'+yokosawaColors[tier]+'。基本は'+names[correct]+'。</h3><p>アンティ'+(b.ante?'あり':'なし')+'・後ろ'+behind+'人の参加下限は'+yokosawaColors[minimum]+'。'+(b.spot==='open'?'手札の色が下限以上ならレイズ。':b.spot==='bb'?'BBでは既に払った1BBを踏まえた専用の継続範囲を使います。':'初回レイズへの応答は下限との差で決めます。')+'</p></div><button class="primary" id="flash-next">'+(f.index===9?'結果を見る':'次の手札へ')+' →</button>':'<p class="notice">先に判断してから、色と下限を確かめよう。</p>')+'<p class="notice">'+yokosawaLink(b.ante?163:1644)+'</p><button id="flash-back">表に戻る</button></section></div>');
  document.querySelectorAll('[data-flash]').forEach(button=>button.onclick=()=>{if(f.selected!==null)return;f.selected=button.dataset.flash;flashStats.attempts++;if(f.selected===correct){f.correct++;flashStats.correct++}persist();renderFlash()});
  if($('#flash-next'))$('#flash-next').onclick=()=>{f.index++;if(f.index===f.hands.length){flashStats.sessions++;persist()}f.selected=null;renderFlash();window.scrollTo({top:0})};
  $('#flash-back').onclick=()=>navigate('bible');
}
function renderBible(){
  const b=bibleState,minimum=yokosawaThreshold(b.spot==='open'?b.behind:b.openerBehind,b.ante),tier=yokosawaRank(b.hand,b.ante);
  const action=yokosawaAction(b.hand,{ante:b.ante,behind:b.behind,openerBehind:b.spot==='open'?null:b.openerBehind,bb:b.spot==='bb'});
  const actionNames={raise:b.spot==='open'?'レイズ':'リレイズ',call:'コール',fold:'フォールド'};
  const hands=[...ranks].flatMap((a,i)=>[...ranks].map((c,j)=>i===j?a+c:i<j?a+c+'s':c+a+'o'));
  const select=(id,label,values,value)=>'<label>'+label+'<select id="'+id+'">'+values.map(([v,t])=>'<option value="'+v+'" '+(String(v)===String(value)?'selected':'')+'>'+t+'</option>').join('')+'</select></label>';
  shell('<div class="heading"><div><div class="eyebrow">YOUR PREFLOP BIBLE · 2025</div><h1>ヨコサワの表を、判断の基準に。</h1><p>色を覚える → 条件に当てはめる → 相手を読む。</p></div></div>'+
    '<section class="panel"><div class="row between"><span class="badge">'+yokosawaSource.title+'</span>'+yokosawaLink(b.ante?163:1644)+'</div><p class="notice">アンティはブラインドとは別の強制支払い。最新版は、その有無で表を使い分けます。これは参加・応答の基準で、勝率表ではありません。</p><p class="notice">表の反復：'+flashStats.attempts+'問回答 · 10問セット完了 '+flashStats.sessions+'回'+(flashStats.attempts?' · 正答率 '+Math.round(flashStats.correct/flashStats.attempts*100)+'%':'')+'</p>'+
    '<div class="bible-controls">'+select('bible-ante','① アンティ',[['yes','あり（動画のトーナメント用）'],['no','なし（動画のリング用）']],b.ante?'yes':'no')+
    select('bible-spot','② 今の場面',[['open','全員フォールドで自分から参加'],['response','前から1回レイズ（BB以外）'],['bb','BBで前から1回レイズ']],b.spot)+
    select('bible-behind',b.spot==='open'?'③ 自分の後ろの人数':'③ レイズした相手の後ろの人数',(b.spot==='response'?[3,4,5,6,7,8]:[2,3,4,5,6,7,8]).map(n=>[n,n+'人'+(n===2?'（BTN）':n===3?'（CO）':'')]),b.spot==='open'?b.behind:b.openerBehind)+
    select('bible-hand','④ 自分のハンド',hands.map(h=>[h,h]),b.hand)+'</div>'+
    '<div class="bible-answer" aria-live="polite"><span class="badge">この条件で覚える基本</span><h2>'+b.hand+'（'+yokosawaColors[tier]+'） → '+actionNames[action]+'</h2><p>'+
    (b.spot==='open'?'後ろ'+b.behind+'人・アンティ'+(b.ante?'あり':'なし')+'の下限は'+yokosawaColors[minimum]+'。'+b.hand+'は'+yokosawaColors[tier]+'なので、'+(action==='raise'?'下限以上です。':'下限に届きません。'):
      '相手の参加下限は'+yokosawaColors[minimum]+'。'+(b.spot==='bb'?'BBの継続下限は'+yokosawaColors[(b.openerBehind===2?1:b.openerBehind===3?2:3)+(b.ante?0:1)]+'。強い手のリレイズも合わせて判定します。':'同じ色以下はフォールド、1段上はコール、2段上以上はリレイズ。最上位の紫はリレイズ。'))+'</p></div>'+
    yokoGrid(b.ante,b.spot==='open'?minimum:null,b.hand)+'<p class="notice">数字は色の段階を表します。'+(b.spot==='open'?'薄いマスは、この条件のオープン範囲の外。':'応答では全色を表示しています。')+'右上は同じマーク（s）、左下は違うマーク（o）、対角線はペア。</p></section>'+
    '<section class="panel"><h2>最初に身につける3つの使い方</h2><div class="learning-guide-grid"><div><h3>1. 自分から参加</h3><p>全員フォールドなら、後ろの人数から下限の色を確認。下限以上をレイズに使います。</p></div><div><h3>2. レイズへの応答</h3><p>相手の参加下限と自分の色を比較。相手の実際の2枚が、その下限の手だと決めつけないこと。</p></div><div><h3>3. BBの例外</h3><p>既に1BB払っているので、専用の広い継続範囲を使います。アンティと相手の位置を確認。</p></div></div><div class="row"><button class="primary" id="bible-flash">この条件で手札を変えて10問 →</button><button id="bible-drill">最新版の基本を5問で特訓</button></div>'+
    '<details><summary>表で覚えること・情報から読むこと</summary><p><b>覚える：</b>ハンドの色、人数・アンティの条件、初回レイズへの応答。丸暗記を急がず、判断して表で振り返る反復から。</p><p><b>読む：</b>相手が実際にどの範囲で参加しているか、ボードやアクションでどの候補が残るか。相手全員がこの表どおりとは限りません。</p><p><b>考えて調整する：</b>持ち点、サイズ、複数人、追加のリレイズ。表は入門用に簡略化された基準で、あらゆる状況の最適解ではありません。</p></details>'+
    '<p class="notice">この照合は全員フォールドでの参加、または通常2〜3BBの初回オープンへの応答用です。オープン練習は2.5BBを採用（動画23:44〜24:08）。SBから最初に参加する場合、特殊な持ち点・賞金条件、3ベット以降の自動判定は対象外。追加リレイズの考え方は'+yokosawaLink(983)+'。</p><p class="notice">公式動画の表・説明をもとにアプリ独自の表示で再構成しています。本アプリは非公式の学習ツールです。</p></section>');
  $('#bible-ante').onchange=e=>{b.ante=e.target.value==='yes';renderBible()};
  $('#bible-spot').onchange=e=>{b.spot=e.target.value;if(b.spot==='response'&&b.openerBehind===2)b.openerBehind=3;renderBible()};
  $('#bible-behind').onchange=e=>{b[b.spot==='open'?'behind':'openerBehind']=+e.target.value;renderBible()};
  $('#bible-hand').onchange=e=>{b.hand=e.target.value;renderBible()};
  $('#bible-drill').onclick=()=>startCourse(b.ante?'yokosawa':'entry');
  $('#bible-flash').onclick=startFlash;
}

function glossary(){return `<details><summary>表・用語の読み方</summary><p class="notice">AA＝Aのペア。AKs＝同じマークのAK、AKo＝異なるマークのAK。22+＝22以上のペア。ATs+＝ATs・AJs・AQs・AKs。BBはブラインドの単位で、この設定では1BB＝200点。BTNは最後に行動しやすいボタンの席。レンジは「持ち得る手札の範囲」です。</p></details>`}
function recommendation(){const latest=new Map();records.filter(r=>r.level===settings.level).forEach(r=>latest.set(r.id,r));const a=[...latest.values()];if(a.length>=Math.min(4,questions.filter(q=>q.level===settings.level).length)&&a.every(r=>r.correct&&r.hints===0)&&settings.level<5)return {level:settings.level+1,text:'このレベルの異なる問題を自力で正解。ひとつ上に挑戦してみよう。'};if(a.length>=2&&a.filter(r=>!r.correct).length>=2&&settings.level>1)return {level:settings.level-1,text:'ひとつ前を復習すると、今のテーマも考えやすくなります。'};return {level:settings.level,text:records.length?'ヒントを使いながら、同じテーマをもう少し練習しよう。':'まずは相手が参加する手札の範囲から。'};}
function shell(content){root.innerHTML=`<div class="shell"><aside class="sidebar"><div class="brand">♠ RANGE<br>ROOM<span>BEGINNER POKER TRAINING</span></div><nav class="nav" aria-label="メインメニュー">${[['home','ホーム'],['bible','ヨコサワ表'],['practice','問題を解く'],['stats','復習']].map(([p,t])=>`<button data-nav="${p}" class="${(drill?p==='practice':page===p||p==='bible'&&page==='flash'||p==='practice'&&page==='pre')?'active':''}">${t}</button>`).join('')}</nav><footer>YOKOSAWA · 2025<br>迷わず、すぐ練習。</footer></aside><main><div class="topbar"><span class="desktop-title eyebrow">BEGINNER RANGE TRAINER</span><span class="mobile-brand">♠ RANGE ROOM</span><button class="top-bible-link" data-nav="bible">表を開く</button></div>${notice?`<p role="status" class="notice">${notice}</p>`:''}${content}</main></div>`;document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>navigate(b.dataset.nav));}
function navigate(p){drill=null;page=p;filter=p==='pre'?'pre':'all';resetQuestion();render();window.scrollTo({top:0})}
function resetQuestion(){index=0;selected=null;answered=false;hints=0;rangeMode='after'}
function render(){if(page==='home')return renderHome();if(page==='bible')return renderBible();if(page==='flash')return renderFlash();if(drill?.finished)return renderDrillResult();if(page==='play')return renderPlay();if(page==='stats')return renderStats();if(page==='settings')return renderSettings();renderPractice()}

function renderHome(){
  const done=questions.filter(q=>mastered(q.id)).length,weak=reviewQuestions().length;
  shell('<section class="simple-hero"><span class="eyebrow">はじめてのレンジ練習</span><h1>表を見る。問題を解く。<br>理由を覚える。</h1><p>まずはキャッシュゲームの基本から。迷ったら、いつでもヨコサワ表に戻れます。</p></section>'+
    '<div class="home-actions"><section class="panel home-action bible"><span class="home-action-number">01</span><h2>ヨコサワ表をすぐ見る</h2><p>ポジションと手札を選ぶだけ。基本の行動がすぐ分かります。</p><button class="primary" id="open-bible">表を開く →</button></section>'+
    '<section class="panel home-action quiz"><span class="home-action-number">02</span><h2>まず10問解く</h2><p>ポジションと周りの動きを見て判断。答えた直後に理由を確認できます。</p><button class="primary" id="start-ten">10問トレーニング →</button></section></div>'+
    '<div class="simple-stats"><span><b>'+records.length+'</b> 回答</span><span><b>'+done+'</b> / '+questions.length+' 習得</span><button id="quick-review" '+(weak?'':'disabled')+'>間違えた問題を復習 '+weak+'問</button></div>'+
    '<details class="more-training"><summary>コースを選んで練習</summary><div class="course-grid">'+courses.map((c,i)=>{const n=c.questions.filter(id=>mastered(id)).length;return '<section class="panel course-card"><span class="eyebrow">STEP '+(i+1)+'</span><h3>'+c.title+'</h3><p>'+c.description+'</p><progress value="'+n+'" max="'+c.questions.length+'" aria-label="'+c.title+'の自力正解数"></progress><button data-course="'+c.id+'">'+c.questions.length+'問を練習</button></section>'}).join('')+'</div></details>'+
    '<details class="more-training"><summary>模擬対戦・設定・用語</summary><section class="panel compact-menu"><button id="quick-play">模擬対戦</button><button id="open-settings">設定</button><p><b>レンジ</b>：相手が持っていそうな手札の候補全体。<b>BB</b>：大きい方の強制ベットの単位です。</p></section></details>');
  $('#open-bible').onclick=()=>navigate('bible');$('#start-ten').onclick=startBeginnerTen;
  $('#quick-review').onclick=startReview;$('#quick-play').onclick=()=>navigate('play');$('#open-settings').onclick=()=>navigate('settings');
  document.querySelectorAll('[data-course]').forEach(b=>b.onclick=()=>startCourse(b.dataset.course));
}
function renderDrillResult(){
  const d=drill,solo=d.results.filter(r=>r.correct&&!r.hints).length;
  const retry=d.results.filter(r=>!r.correct||r.hints).map(r=>r.id);
  shell('<div class="eyebrow">10問完了</div><h1>おつかれさま！</h1><p class="muted">'+d.title+'</p><section class="panel session-summary"><strong>'+solo+' / '+d.ids.length+'</strong><h2>ヒントなしで正解</h2><p>'+(retry.length?'間違えた問題は、理由を確認してもう一度。':'すべて自力で正解できました。')+'</p><div class="row">'+(retry.length?'<button class="primary" id="retry-drill">間違えた'+retry.length+'問をやり直す</button>':'')+(d.title.includes('初心者10問')?'<button id="more-ten">さらに10問解く</button>':'')+'<button id="course-home">ホームへ</button></div></section>'+
  '<details class="more-training"><summary>今回の答えを一覧で見る</summary><section class="panel">'+d.results.map(r=>{const q=questions.find(q=>q.id===r.id);return '<details><summary>'+(r.correct?(r.hints?'ヒントで正解':'✓ 自力で正解'):'もう一度')+' · '+q.title+'</summary><p>あなたの回答：'+q.options[r.choice]+'</p><p><b>教材の答え：'+q.options[q.answer]+'</b></p>'+learningFeedback(q)+'</details>'}).join('')+'</section></details>');
  if($('#retry-drill'))$('#retry-drill').onclick=()=>startDrill(retry,d.title,d.courseId);
  if($('#more-ten'))$('#more-ten').onclick=startBeginnerTen;
  $('#course-home').onclick=()=>navigate('home');
}
function renderPractice(){
  const q=current();
  if(!q){shell('<h1>復習する問題はありません</h1><p>間違えた問題は、ここに自動で集まります。</p><button id="back">ホームへ</button>');$('#back').onclick=()=>navigate('home');return}
  const hero=q.hero||(q.id==='mirror'?'BTN':q.id==='multi'?'SB':'BB'),hand=q.hand?handNotation(q.hand):'手札なし';
  shell('<div class="practice-head"><div><span class="eyebrow">'+(drill?drill.title:'問題トレーニング')+'</span><h1>'+q.title+'</h1></div><button id="practice-bible">ヨコサワ表を見る</button></div>'+
    (drill?'<div class="session-progress"><span>今回の特訓　'+(index+1)+' / '+list().length+'問</span><progress value="'+drill.results.length+'" max="'+list().length+'" aria-label="今回の特訓の回答数"></progress><button id="exit-drill" class="ghost">ホームへ</button></div>':
    page!=='pre'?'<details class="practice-filter"><summary>問題の種類を変える</summary><div class="row"><button id="board-focus" class="'+(filter==='board'?'primary':'ghost')+'">ボード判断</button><button id="all-focus" class="'+(filter==='all'?'primary':'ghost')+'">レベル別</button><button id="pre-focus" class="ghost">プリフロップ</button></div>'+
    (filter!=='board'?'<div class="levelbar" aria-label="難易度">'+levelNames.map((n,i)=>'<button data-level="'+(i+1)+'" class="'+(settings.level===i+1?'active':'')+'" title="'+n+'">Lv.'+(i+1)+'</button>').join('')+'<span class="pill">'+levelNames[settings.level-1]+'</span></div>':'')+'</details>':'')+
    '<div class="situation-strip" aria-label="今の状況"><div><small>あなたの位置</small><b>'+hero+'</b></div><div><small>あなたの手札</small><b>'+hand+'</b></div><div><small>ゲーム</small><b>'+(q.ante?'アンティあり':'キャッシュ · アンティなし')+'</b></div></div>'+
    '<div class="workspace beginner-workspace"><section class="panel situation-panel">'+table(q)+
    '<h2 class="section-label">周りのアクション</h2><div class="action-timeline">'+q.history.map(h=>'<div>'+h+'</div>').join('')+'</div>'+
    (q.board.length?'<details><summary>ボードの見方を確認</summary>'+boardChecklist(q.board)+'</details>':'')+'</section><section class="panel answer-panel"><div class="row between"><span class="learning-badge">'+learningKinds[q.learningKind].title+'</span><small>'+(index%list().length+1)+' / '+list().length+'</small></div>'+rangePrimer(q)+'<h2 class="question">'+q.ask+'</h2>'+
    '<div>'+q.options.map((o,i)=>'<button class="option '+(selected===i?'selected ':'')+(answered&&i===q.answer?'correct ':'')+(answered&&selected===i&&i!==q.answer?'wrong':'')+'" data-choice="'+i+'" aria-pressed="'+(selected===i)+'" '+(answered?'disabled':'')+'><span class="letter">'+(answered&&i===q.answer?'✓':String.fromCharCode(65+i))+'</span><span>'+o+'</span></button>').join('')+'</div>'+
    (hints?'<div class="hint" role="status">ヒント '+hints+'/3：'+q.hints[hints-1]+'</div>':'')+
    (!answered?'<div class="actions"><button id="hint" '+(hints>=3?'disabled':'')+'>ヒント '+hints+'/3</button><button class="primary" id="answer" '+(selected===null?'disabled':'')+'>答えを見る</button></div>':
    '<div class="feedback '+(selected===q.answer?'feedback-correct':'feedback-wrong')+'" aria-live="polite"><span class="result-label">'+(selected===q.answer?'✓ 正解':'× ここを直そう')+'</span><h3>正解：'+q.options[q.answer]+'</h3>'+
    (selected!==q.answer?'<div class="mistake-reason"><b>なぜ違った？</b><p>'+(q.traps?.[selected]||q.hints.at(-1))+'</p></div>':'')+
    rangeWalkthrough(q)+'<div class="quick-why"><b>④ 今回の判断</b><p>'+friendlyWords(q.why)+'</p></div>'+
    (q.takeaway?'<div class="takeaway"><b>これだけ覚える</b><p>'+q.takeaway+'</p></div>':'')+
    '<details><summary>詳しい解説と表を見る</summary>'+learningFeedback(q)+explainSteps(q)+
    (q.range?'<details><summary>'+(q.range==='call'?'アクション前後のレンジ':q.range==='river'?'具体的なカードの候補':'プリフロップの出発点を見る')+'</summary>'+
    (q.range==='call'?'<div class="row"><button id="before">コール前</button><button id="after">コール後</button><span class="badge">'+(rangeMode==='before'?'コール前':'コール後')+'</span></div>':'')+grid(q.range==='call'&&rangeMode==='before'?'bb':q.range)+'</details>':'')+
    '</details><div class="actions"><button class="primary" id="next">'+(drill&&index+1===list().length?'結果を見る':'次の問題へ →')+'</button></div></div>')+'</section></div>');
  $('#practice-bible').onclick=()=>openChartOverlay(q.ante,q.hand?handNotation(q.hand):'');
  if($('#exit-drill'))$('#exit-drill').onclick=()=>navigate('home');
  if($('#board-focus'))$('#board-focus').onclick=()=>{filter='board';resetQuestion();render()};
  if($('#all-focus'))$('#all-focus').onclick=()=>{filter='all';resetQuestion();render()};
  if($('#pre-focus'))$('#pre-focus').onclick=()=>navigate('pre');
  document.querySelectorAll('[data-level]').forEach(b=>b.onclick=()=>{filter='all';settings.level=+b.dataset.level;persist();resetQuestion();render()});
  document.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>{if(answered)return;selected=+b.dataset.choice;render()});
  if($('#hint'))$('#hint').onclick=()=>{hints=Math.min(3,hints+1);render()};
  if($('#answer'))$('#answer').onclick=submitAnswer;
  if($('#next'))$('#next').onclick=nextQuestion;
  if($('#before'))$('#before').onclick=()=>{rangeMode='before';render()};
  if($('#after'))$('#after').onclick=()=>{rangeMode='after';render()};
}

function renderStats(){const r=recommendation(),correct=records.filter(x=>x.correct).length,solo=records.filter(x=>x.correct&&!x.hints).length;shell(`<div class="eyebrow">YOUR PROGRESS</div><h1>読みの積み重ね。</h1><p class="muted">速さよりも、理由を考えられること。</p><div class="stat-grid"><div class="stat"><strong>${records.length}</strong>回答数</div><div class="stat"><strong>${records.length?Math.round(correct/records.length*100):0}%</strong>ヒント込み正答率</div><div class="stat"><strong>${solo}</strong>自力で正解</div></div><section class="panel"><h2>次のおすすめ · Lv.${r.level}</h2><p>${r.text}</p><button class="primary" id="recommend">${levelNames[r.level-1]}を練習</button> <button id="review">苦手な問題を復習（${reviewQuestions().length}問）</button></section><section class="panel"><h2>テーマ別の記録</h2>${levelNames.map((n,i)=>{const a=records.filter(x=>x.level===i+1);return `<div class="list-item row between"><span>Lv.${i+1}　${n}</span><span class="muted">${a.length?`${a.filter(x=>x.correct).length} / ${a.length} 正解`:'まだ記録なし'}</span></div>`}).join('')}<p class="notice">おすすめは異なる問題の最新回答で判断します。同じ問題の連続正解だけでは昇級を勧めません。端末内に直近500件まで保存します。</p></section>`);$('#recommend').onclick=()=>{settings.level=r.level;persist();navigate('practice')};$('#review').onclick=startReview;}
function renderSettings(){shell(`<div class="eyebrow">ROOM SETTINGS</div><h1>あなたの練習環境</h1><section class="panel settings"><label>模擬対戦の人数<select id="players">${[4,5,6,7,8].map(n=>`<option value="${n}" ${settings.players===n?'selected':''}>${n}人</option>`).join('')}</select></label><label>模擬対戦の金額表示<select id="unit"><option value="bb" ${settings.unit==='bb'?'selected':''}>BB（1BB＝200点）</option><option value="points" ${settings.unit==='points'?'selected':''}>点数</option></select></label><label>対戦中の補助<select id="mode"><option value="learn" ${settings.mode==='learn'?'selected':''}>学習モード · ヒントあり</option><option value="real" ${settings.mode==='real'?'selected':''}>実戦モード · 終了後に振り返る</option></select></label><p class="notice">持ち点20,000・100/200・アンティなし。各ハンド100BBから開始します。教材問題の人数とアンティは各問題に表示します。設定変更は次のハンドから反映されます。</p></section><section class="panel"><h2>iPhoneのホーム画面に追加</h2><p>Safariの共有メニューから「ホーム画面に追加」を選択すると、アプリのように開けます。</p><p class="notice">成績はこのブラウザ・端末に保存されます。閲覧データの削除で記録も消えます。ログインや有料APIは使いません。</p><details><summary>教材の考え方</summary><p>参加・初回レイズへの応答はヨコサワ2025年最新版が主な基準です。アンティの有無で表を使い分けます。ポストフロップは本アプリの仮定に基づく教材です。</p><p>${yokosawaLink()}</p><p>ソルバー解析結果ではありません。</p><a href="https://www.pokerstars.com/poker/learn/lesson/position/" target="_blank" rel="noreferrer">PokerStars Learn：ポジション</a><br><a href="https://blog.gtowizard.com/the-mechanics-of-c-bet-sizing/" target="_blank" rel="noreferrer">GTO Wizard：ベットサイズの考え方</a><br><a href="https://www.pokerstars.com/poker/learn/lesson/pot-odds/" target="_blank" rel="noreferrer">PokerStars Learn：ポットオッズ</a><br><a href="https://blog.gtowizard.com/reasons-for-value-betting-in-poker/" target="_blank" rel="noreferrer">GTO Wizard：バリューベットの理由</a></details></section>`);for(const key of ['players','unit','mode'])$('#'+key).onchange=e=>{settings[key]=key==='players'?+e.target.value:e.target.value;persist()};}
// A local, complete hand engine. Betting is capped by the shorter stack; no side pots.
function deck(){return [...ranks].flatMap(r=>[...'shdc'].map(s=>r+s)).sort(()=>0);}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a;}
function score5(cs){const ns=cs.map(c=>14-ranks.indexOf(c[0])).sort((a,b)=>b-a),counts=[...new Set(ns)].map(n=>[ns.filter(v=>v===n).length,n]).sort((a,b)=>b[0]-a[0]||b[1]-a[1]),flush=cs.every(c=>c[1]===cs[0][1]),unique=[...new Set(ns)],straight=unique.length===5?(ns[0]-ns[4]===4?ns[0]:ns.join()==='14,5,4,3,2'?5:0):0;let a;if(flush&&straight)a=[8,straight];else if(counts[0][0]===4)a=[7,counts[0][1],counts[1][1]];else if(counts[0][0]===3&&counts[1][0]===2)a=[6,counts[0][1],counts[1][1]];else if(flush)a=[5,...ns];else if(straight)a=[4,straight];else if(counts[0][0]===3)a=[3,...counts.map(x=>x[1])];else if(counts[0][0]===2&&counts[1][0]===2)a=[2,...counts.map(x=>x[1])];else if(counts[0][0]===2)a=[1,...counts.map(x=>x[1])];else a=[0,...ns];return [...a,...Array(6-a.length).fill(0)].reduce((v,x)=>v*15+x,0)}
export function evaluate(cs){let best=0;for(let a=0;a<cs.length-4;a++)for(let b=a+1;b<cs.length-3;b++)for(let c=b+1;c<cs.length-2;c++)for(let d=c+1;d<cs.length-1;d++)for(let e=d+1;e<cs.length;e++)best=Math.max(best,score5([cs[a],cs[b],cs[c],cs[d],cs[e]]));return best}
function category(cards){return Math.floor(evaluate(cards)/15**5)}
function positions(n){return n===4?['CO','BTN','SB','BB']:n===5?['HJ','CO','BTN','SB','BB']:n===6?['UTG','HJ','CO','BTN','SB','BB']:n===7?['UTG','UTG+1','HJ','CO','BTN','SB','BB']:['UTG','UTG+1','UTG+2','HJ','CO','BTN','SB','BB']}
function newHand(){const d=shuffle(deck()),p=positions(settings.players);session={d,board:[],players:p.map((pos,i)=>({pos,hand:[d.pop(),d.pop()],stack:100,bet:0,fold:false,hero:i===p.length-1})),street:0,pot:0,current:1,log:[],review:[],done:false,hint:0,mode:settings.mode};const s=session;s.players.at(-2).stack-=.5;s.players.at(-2).bet=.5;s.players.at(-1).stack--;s.players.at(-1).bet=1;s.pot=1.5;s.pending=new Set(s.players.map((_,i)=>i));s.turn=0;runBots();}
function strength(p){const [a,b]=p.hand.map(c=>14-ranks.indexOf(c[0]));if(session.board.length){const all=[...p.hand,...session.board],cat=category(all),br=session.board.map(c=>14-ranks.indexOf(c[0])),top=Math.max(...br),pairRank=a===b?a:Math.max(br.includes(a)?a:0,br.includes(b)?b:0),draw=session.board.length<5&&[...'shdc'].some(s=>all.filter(c=>c[1]===s).length===4),values=[...new Set(all.map(c=>14-ranks.indexOf(c[0])))];if(values.includes(14))values.push(1);const straightDraw=session.board.length<5&&Array.from({length:10},(_,i)=>i+1).some(low=>values.filter(v=>v>=low&&v<low+5).length===4);return Math.min(.98,cat>=3?.8+(cat-3)*.035:cat===2?.72:cat===1?(pairRank>=top?.62:pairRank?.40:.25):.15+(draw?.25:0)+(straightDraw?.16:0));}return Math.min(1,(a+b)/32+(a===b?.35:0)+(p.hand[0][1]===p.hand[1][1]?.08:0));}
function pay(p,amount){const a=Math.min(p.stack,Math.max(0,amount));p.stack-=a;p.bet+=a;session.pot+=a;}
function act(i,action){const s=session,p=s.players[i],cost=s.current-p.bet;if(action==='fold'){p.fold=true;s.log.push(`${p.pos} フォールド`)}else if(action==='raise'){const other=s.players.filter(x=>x!==p&&!x.fold).map(x=>x.stack+x.bet),cap=Math.min(p.stack+p.bet,Math.max(...other)),target=Math.min(cap,s.street===0?(s.current===1?2.5:s.current*3):s.current===0?Math.max(1,s.pot/2):s.current+Math.max(s.current,1));if(target<=s.current){pay(p,cost);s.log.push(`${p.pos} コール ${money(cost)}`)}else{pay(p,target-p.bet);s.current=target;s.pending=new Set(s.players.map((x,j)=>!x.fold&&x.stack>0&&j!==i?j:-1).filter(j=>j>=0));s.log.push(`${p.pos} ${s.current===target?'ベット / レイズ':''} 合計${money(target)}`)}}else{pay(p,cost);s.log.push(`${p.pos} ${cost>0?'コール '+money(Math.min(cost,p.bet)):'チェック'}`)}s.events??=[];s.events.push({pos:p.pos,action,street:s.street,cost});s.pending.delete(i);s.turn=(i+1)%s.players.length;}
function settle(){const s=session,alive=s.players.filter(p=>!p.fold);let winners;if(alive.length===1)winners=alive;else{const high=Math.max(...alive.map(p=>evaluate([...p.hand,...s.board])));winners=alive.filter(p=>evaluate([...p.hand,...s.board])===high)}winners.forEach(p=>p.stack+=s.pot/winners.length);s.result=`${winners.map(p=>p.hero?'あなた':p.pos).join('・')} ${winners.length>1?'で分配':'が獲得'} · ${money(s.pot)}`;s.done=true;}
function refundUncalled(){const s=session, bets=s.players.map(p=>p.bet).sort((a,b)=>b-a);if(bets[0]>bets[1]){const p=s.players.find(p=>p.bet===bets[0]),refund=bets[0]-bets[1];p.bet-=refund;p.stack+=refund;s.pot-=refund;}}
function nextStreet(){const s=session;refundUncalled();if(s.street===3){settle();return}s.street++;s.board.push(...Array.from({length:s.street===1?3:1},()=>s.d.pop()));s.current=0;s.players.forEach(p=>p.bet=0);s.pending=new Set(s.players.map((p,i)=>!p.fold&&p.stack>0?i:-1).filter(i=>i>=0));s.turn=s.players.length-2;s.log.push(['','— フロップ —','— ターン —','— リバー —'][s.street]);}

function preflopBaseline(p){
  const s=session,events=(s.events||[]).filter(e=>e.street===0),raises=events.filter(e=>e.action==='raise'),limp=events.some(e=>e.action==='call'&&e.cost>0)&&!raises.length;
  if(raises.length>1||limp)return null;
  const first=raises[0],behind=s.players.length-1-s.players.indexOf(p);
  if(!first)return p.pos==='BB'?'call':yokosawaAction(handNotation(p.hand),{behind,ante:false});
  const openerIndex=s.players.findIndex(x=>x.pos===first.pos);
  if(first.pos===p.pos)return null;
  return yokosawaAction(handNotation(p.hand),{ante:false,openerBehind:s.players.length-1-openerIndex,bb:p.pos==='BB',openSize:s.current});
}

function runBots(){const s=session;let guard=0;while(!s.done&&guard++<300){if(s.players.filter(p=>!p.fold).length===1){refundUncalled();settle();break}for(const i of s.pending)if(s.players[i].fold||s.players[i].stack===0)s.pending.delete(i);if(!s.pending.size){nextStreet();continue}if(s.players.filter(p=>!p.fold&&p.stack>0).length<=1&&s.players.filter(p=>!p.fold&&p.stack>0).every(p=>p.bet>=s.current)){s.pending.clear();continue}if(!s.pending.has(s.turn)){s.turn=(s.turn+1)%s.players.length;continue}const p=s.players[s.turn];if(p.hero)break;const cost=s.current-p.bet,st=strength(p),late=['BTN','CO','SB'].includes(p.pos);let choice='call';const baseline=s.street===0?preflopBaseline(p):null;if(baseline)choice=baseline;else if(s.street===0&&s.current===1&&p.pos!=='BB'){const threshold=late?.53:.60+(s.players.length-6)*.012;choice=st>=threshold?'raise':'fold'}else if(cost>0&&st<(s.street===0?(late?.51:.60):.28)&&Math.random()>.22)choice='fold';else if(st>.7&&Math.random()<.25&&s.current<15)choice='raise';act(s.turn,choice)}if(guard>=300){notice='ハンドを進行できませんでした。新しいハンドを開始してください。';s.done=true;s.result='進行を停止しました';}}
function playRangeGuide(s){
  const hero=s.players.find(p=>p.hero),last=[...(s.events||[])].reverse().find(e=>e.pos!==hero.pos);
  if(!last)return 'まだ相手のアクションが少ないので、位置から参加しそうな手を広く考えます。';
  if(s.street===0&&last.action==='raise')return last.pos+'がレイズ。'+last.pos+'の位置から参加できる手のうち、弱すぎる手は減り、表の参加範囲が残ります。';
  if(s.street===0&&last.action==='call')return last.pos+'がコール。最強クラスはリレイズに回ることがあるため、中くらいのペアや同じマークのつながった手も残ります。';
  if(last.action==='raise')return last.pos+'がベット／レイズ。強い完成ハンドに加え、あと1枚で強くなる手や一部のブラフが残ります。';
  if(last.action==='call')return last.pos+'がコール。完全に弱い手は減り、ペア、あと1枚で強くなる手、一部の強い手が残ります。';
  return last.pos+'がチェック。弱い手だけとは限りません。コールを狙う強い手も少し残します。';
}
function renderPlay(){if(!session)newHand();const s=session,hero=s.players.find(p=>p.hero),cost=Math.min(hero.stack,Math.max(0,s.current-hero.bet));shell(`<div class="heading"><div><div class="eyebrow">PRACTICE TABLE</div><h1>一手ずつ、考える。</h1><p>${s.players.length}人卓 · ${s.mode==='learn'?'ヒント付き学習':'実戦モード'} · ローカル対戦</p></div><div class="row"><span class="pill">${['プリフロップ','フロップ','ターン','リバー'][s.street]}</span><button id="play-bible">ヨコサワ表を見る</button></div></div><div class="workspace"><section class="panel"><div class="row between"><span>ポット <b>${money(s.pot)}</b></span><span>持ち点 ${money(hero.stack)}</span></div>${table({hero:hero.pos,board:s.board,hand:hero.hand,positions:s.players.map(p=>p.pos),active:s.players.filter(p=>!p.fold).map(p=>p.pos)},'ポット '+money(s.pot))}<div class="row">${s.players.map(p=>`<span class="pill">${p.pos}${p.hero?' / YOU':''} · ${p.fold?'fold':money(p.stack)}</span>`).join('')}</div><details open><summary>アクション履歴</summary><div class="history">${s.log.map(l=>`<div>${l}</div>`).join('')}</div></details></section><section class="panel">${s.lastFeedback&&!s.done&&s.mode==='learn'?`<div class="reviewline"><b>前の選択の振り返り</b><br>${s.lastFeedback}</div>`:''}${s.done?`<div class="eyebrow">HAND REVIEW</div><h2>${s.result}</h2><p>あなたの増減：${money(hero.stack-100)}</p>${s.players.filter(p=>!p.fold).map(p=>`<div class="list-item"><span>${p.pos} ${p.hero?'あなた':''}</span>${cards(p.hand)}</div>`).join('')}<div class="reviewline">結果と判断は別です。相手の実際の手札だけでなく、同じアクションを取る別の手も考えましょう。</div>${s.review.map(r=>`<div class="reviewline">${r}</div>`).join('')}<button class="primary" id="newhand">次のハンド</button>`:`<span class="eyebrow">YOUR ACTION</span><div class="play-range-guide"><b>今、考える相手のレンジ</b><p>${playRangeGuide(s)}</p><small>相手の手札は1つに決めず、今の行動を取りそうな候補をまとめて考えます。</small></div><h2 class="question">${cost?`${money(cost)}を払って続ける？`:'チェックか、ベットか。'}</h2><div class="actions"><button data-act="fold">フォールド</button><button class="primary" data-act="call">${cost?'コール '+money(cost):'チェック'}</button></div><button data-act="raise" style="width:100%;margin-top:12px" ${hero.stack<=cost?'disabled':''}>${s.street===0?(s.current===1?'レイズ（合計2.5BB）':'リレイズ（原則3倍）'):s.current?'レイズ（原則2倍）':'ベット（約1/2ポット）'}</button>${s.mode==='learn'?`<details><summary>相手のレンジを考える</summary><p>直前の相手のアクションに残るのは？</p><div class="row"><button data-think="強い手に集中">強い手に集中</button><button data-think="中くらいの手も残る">中くらいも残る</button><button data-think="ブラフも残る">ブラフも残る</button></div><p id="thought" class="notice">予想を振り返りに残せます。自由対戦の読みは自動採点しません。</p></details><details><summary>相手から見た自分を考える</summary><p>自分の手札が見えない相手は、あなたの履歴から何を想定するでしょう？</p><button id="mirror-note">この視点を振り返りに残す</button></details><button id="playhint">ヒントを見る ${s.hint}/3</button>${s.hint?`<div class="hint">${['位置とそこまでの参加人数を確認しましょう。','チェック・コールにも強い手は残ります。ひとつの手に決めつけないで。','自分の実際の手札と、相手から見た自分のレンジは分けて考えましょう。'][s.hint-1]}</div>`:''}`:''}` }<p class="notice">模擬対戦はアンティなし・BB固定。通常のオープンと初回応答は最新版の基準を使い、SBの特殊な参加・追加リレイズ・ポストフロップは本アプリの簡易戦略です。GTO評価ではありません。</p></section></div>`);$('#play-bible').onclick=()=>openChartOverlay(false,handNotation(hero.hand));document.querySelectorAll('[data-act]').forEach(b=>b.onclick=()=>{if(s.done)return;s.lastFeedback=assessDecision(b.dataset.act);s.review.push(s.lastFeedback);act(s.players.indexOf(hero),b.dataset.act);runBots();renderPlay()});if($('#newhand'))$('#newhand').onclick=()=>{newHand();renderPlay()};if($('#playhint'))$('#playhint').onclick=()=>{s.hint=Math.min(3,s.hint+1);renderPlay()};document.querySelectorAll('[data-think]').forEach(b=>b.onclick=()=>{s.review.push(`${['プリフロップ','フロップ','ターン','リバー'][s.street]}の予想：${b.dataset.think}`);$('#thought').textContent='予想を記録しました。ハンド終了後に見直せます。'});if($('#mirror-note'))$('#mirror-note').onclick=()=>{s.review.push('相手から見た自分：実際の手札を隠して、同じアクションを取れる手を確認。');$('#mirror-note').textContent='振り返りに記録しました'};}
function boardChecklist(board){const ns=board.slice(0,3).map(c=>14-ranks.indexOf(c[0])).sort((a,b)=>b-a),suits=new Set(board.slice(0,3).map(c=>c[1])).size;return `<details><summary>ボードを見る3つの手がかり</summary><div class="reviewline"><b>① 高さ</b>　${ns[0]>=12?'高いカードあり。強いA・絵札・オーバーペアはどちらに残る？':'中低カード中心。中小ペアやつながった手はどちらに残る？'}</div><div class="reviewline"><b>② つながり</b>　${new Set(ns).size<3?'同じ数字あり。トリップスやフルハウスの候補も確認。':ns[0]-ns[2]<=5?'近い数字あり。ストレート・2ペアになる候補を双方で探そう。':'数字が離れ気味。トップペアとセットの分布から確認。'}</div><div class="reviewline"><b>③ マーク</b>　${suits===3?'3種類。フロップ時点で通常のフラッシュドローはない。':suits===2?'2枚が同じマーク。そのマークを手札に2枚持つドローを確認。':'3枚が同じマーク。完成フラッシュと、1枚持ちのドローを区別。'}</div><small>見た目だけで有利な側を決めず、参加レンジに戻って確かめよう。</small></details>`}
function explainSteps(q){const steps=q.steps|| (q.id==='river'?['相手は大きなベットを3回続けた。','強い完成ハンドと、ブラフに回る未完成ドローを分ける。','全ドローが打つとはせず、一部だけを候補に残す。']:q.id==='loose'?['参加が広くコールが多い、という観察を使う。','標準相手なら降りる弱いペア・ドローも残す。','コールの傾向からベットのブラフ頻度までは決めない。']:q.id==='multi'?['BBのベット範囲とBTNのコール範囲を別々に置く。','両者に勝てる手・改善する手を考える。','自分がレイズした場合は、両者の応答も考慮する。']:q.id==='mirror'?['相手に見えるのは、あなたの位置・ベット・ボードだけ。','同じ小額ベットを、強い手でも弱い手でも使う設定。','実際の手札ではなく、そのアクションを取る範囲を残す。']:q.range==='call'?['BBのプリフロップコール範囲を出発点にする。','小額ベットにも降りやすい役なしの重みを下げる。','ペア・一部のドロー・スロープレイした強い手を残す。']:q.board.length?['BTNのレイズ範囲と、BBのコール範囲を別々に置く。','ボードに当たるペア・強い役・ドローを双方で探す。','レンジ全体の強さと、最強クラスの手の多さを分けて考える。']:['位置と、後ろに残る人数を確認する。','参加額に加え、レイズかコールかを確認する。','強い手だけに絞らず、その位置で使う中くらいの手も検討する。']);return `<div class="explain"><h3>判断を組み立てる3ステップ</h3>${steps.map((t,i)=>`<div class="reviewline"><b>${i+1}</b>　${t}</div>`).join('')}</div>`}
function estimatedEquity(trials=160){const s=session,hero=s.players.find(p=>p.hero),opponents=s.players.filter(p=>!p.hero&&!p.fold),known=new Set([...hero.hand,...s.board]);let win=0;for(let n=0;n<trials;n++){let pool=shuffle(deck().filter(c=>!known.has(c))),hands=[];for(const p of opponents){let candidate;for(let k=0;k<60;k++){candidate=[pool[0],pool[1]];const vals=candidate.map(c=>ranks.indexOf(c[0])),hi=Math.min(...vals),lo=Math.max(...vals),h=ranks[hi]+ranks[lo]+(hi===lo?'':candidate[0][1]===candidate[1][1]?'s':'o'),type=p.pos==='BB'?'bb':['BTN','CO','SB'].includes(p.pos)?'btn':'utg',prior=rangeWeight(h,type),last=(s.events||[]).filter(e=>e.pos===p.pos&&e.street===s.street).at(-1),str=strength({hand:candidate});let weight=prior;if(last?.action==='raise')weight*=str>.6?.9:.2;else if(last?.action==='call'&&last.cost>0&&s.street>0)weight*=str>.35?1:.3;if(Math.random()<weight)break;shuffle(pool)}hands.push(candidate);pool=pool.filter(c=>!candidate.includes(c))}const board=[...s.board,...pool.slice(0,5-s.board.length)],mine=evaluate([...hero.hand,...board]),scores=hands.map(h=>evaluate([...h,...board])),best=Math.max(mine,...scores);if(mine===best)win+=1/(1+scores.filter(v=>v===mine).length)}return win/trials;}
function assessDecision(action){const s=session,h=s.players.find(p=>p.hero),cost=Math.min(h.stack,Math.max(0,s.current-h.bet)),name=action==='fold'?'フォールド':action==='raise'?(s.current?'レイズ':'ベット'):(cost?'コール':'チェック'),street=['プリフロップ','フロップ','ターン','リバー'][s.street];if(!cost&&action==='fold')return `${street} · ${name}：見直し候補。追加支払いなしでチェックできるので、手札を残す選択を優先できます。`;if(s.street===0){
  if(!cost&&action==='call')return street+' · チェック：追加で払わずフロップを見られます。';
  const baseline=preflopBaseline(h),hand=handNotation(h);
  if(!baseline)return street+' · '+name+'：この局面はヨコサワ表の基本照合の対象外です。リンプ、追加のリレイズ、通常と異なる額、SBの特殊な参加などでは、表だけで正誤を断定しません。相手の位置・参加者・持ち点を確認しましょう。';
  const expected={fold:'フォールド',call:'コール',raise:'リレイズ'}[baseline];
  return street+' · '+name+'：'+(action===baseline?'最新版の基本に沿う選択。':'基本と照合：この条件では'+expected+'。')+' '+hand+'は'+yokosawaColors[yokosawaRank(hand,false)]+'。アンティなしの表とBBの例外で判定しています。相手が表に従う仮定であり、勝率だけで決めた答えではありません。';
}const eq=estimatedEquity(),pct=Math.round(eq*100),odds=cost/(s.pot+cost),base=`仮定レンジへの推定勝率 約${pct}%（160回の試行でぶれます）。`,closed=s.street===3&&s.pending.size===1;let advice;if(action==='call'&&cost)advice=closed?(eq>odds+.1?'この仮定ではコールを支持。':eq<odds-.1?'この仮定ではフォールドを検討。':'推定の幅に近く、どちらとも断定しません。'):'必要勝率だけでは正解と断定できません。今後のベットと残る相手の行動も考えましょう。';else if(action==='fold')advice=eq<odds-.1?'仮定レンジに対して降りる理由があります。':'継続候補も確認しましょう。ただし将来の追加支払いはこの勝率に含まれません。';else if(action==='raise')advice='選択肢あり。勝率だけで最善とは判定できません。弱い手がコールするか、強い手を降ろせるかが理由になります。';else advice='選択肢あり。ポットを抑え、弱い手にも次のカードを見る機会を与える選択です。';return `${street} · ${name}：${advice} ${base}${cost?` 今のコールに必要な勝率 ${Math.round(odds*100)}%。`:''} 相手の実際の手札は評価に使っていません。`;}
render();
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
if(document.modelContext?.registerTool){try{Promise.resolve(document.modelContext.registerTool({name:'start_range_practice',description:'指定レベルのレンジ練習を開く。回答や採点は行わない。',inputSchema:{type:'object',properties:{level:{type:'integer',minimum:1,maximum:5}},required:['level'],additionalProperties:false},annotations:{readOnlyHint:false},execute(input){if(!input||!Number.isInteger(input.level)||input.level<1||input.level>5)throw Error('level must be 1–5');settings.level=input.level;persist();navigate('practice');return {level:settings.level,question:current().ask}}})).catch(()=>{})}catch{}}

