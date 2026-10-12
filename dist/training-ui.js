// Pure presentation helpers. Answer, tab and chart state are owned by app.js.
const RANKS = 'AKQJT98765432';
const STREETS = ['preflop', 'flop', 'turn', 'river'];
const STREET_NAMES = ['プリフロップ', 'フロップ', 'ターン', 'リバー'];
const SIDE_NAMES = {opener: '最初にレイズした側', caller: 'コールした側'};
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sentence = value => String(value || '').split('。').filter(Boolean)[0] + (value ? '。' : '');
const position = value => typeof value === 'string' ? value : value?.position || value?.pos || '';
const streetIndex = value => Number.isInteger(value) ? Math.max(0, Math.min(3, value)) : Math.max(0, STREETS.indexOf(value));
const currentStreet = q => q.scenario ? streetIndex(q.scenario.street) : q.board?.length === 5 ? 3 : q.board?.length === 4 ? 2 : q.board?.length === 3 ? 1 : 0;
const bb = value => Number.isFinite(value) ? `${Number(value.toFixed(1))} BB` : '';
const textList = (items, className='') => Array.isArray(items) && items.length ? `<ul class="${className}">${items.map(item=>`<li>${escape(typeof item === 'string' ? item : item.text || item.label || item.summary || '')}</li>`).join('')}</ul>` : '';

export function lessonCards(cards = [], label = '') {
  return `<div class="lesson-cards"${label ? ` aria-label="${escape(label)}"` : ''}>${cards.map(card => {
    const suit = {s:'♠',h:'♥',d:'♦',c:'♣'}[card?.[1]];
    return suit ? `<span class="lesson-card${/[hd]/.test(card[1]) ? ' lesson-card-red' : ''}" aria-label="${escape(card[0]+suit)}">${escape(card[0])}<small>${suit}</small></span>` : '<span class="lesson-card lesson-card-back" aria-label="まだ配られていないカード"></span>';
  }).join('')}</div>`;
}

function roleInfo(q) {
  const s = q.scenario;
  const hero = q.hero || (q.id === 'mirror' ? 'BTN' : q.id === 'multi' ? 'SB' : 'BB');
  if (s) {
    const heroSide = s.roles?.hero === 'caller' ? 'caller' : s.roles?.hero === 'opener' ? 'opener' : position(s.opener) === hero ? 'opener' : 'caller';
    const otherSide = heroSide === 'opener' ? 'caller' : 'opener';
    return {hero, heroSide, heroRole:SIDE_NAMES[heroSide], opponent:position(s[otherSide]), opponentRole:SIDE_NAMES[otherSide]};
  }
  if (q.roles) {
    const entries=Object.entries(q.roles).filter(([,entry])=>entry && typeof entry==='object' && position(entry));
    const heroEntry=entries.find(([,entry])=>position(entry)===hero);
    if (q.roles.caller===null) {
      const seats=q.positions||['UTG','HJ','CO','BTN','SB','BB'],heroIndex=seats.indexOf(hero),behind=heroIndex<0?null:seats.length-heroIndex-1;
      return {hero,heroSide:heroEntry?.[0]||null,heroRole:heroEntry?.[1].label||'最初に参加する人',opponent:behind===null?'相手はまだ未参加':`後ろに ${behind} 人`,opponentRole:'ここまで全員未参加'};
    }
    const opponents=entries.filter(([,entry])=>position(entry)!==hero).map(([,entry])=>({position:position(entry),label:entry.label||'相手'}));
    return {hero,heroSide:heroEntry?.[0]||null,heroRole:heroEntry?.[1].label||'あなた',opponents};
  }
  const active = q.active || (q.id === 'multi' ? ['BTN','SB','BB'] : ['BTN','BB']);
  return {hero, heroSide:null, heroRole:'あなた', opponent:active.filter(p=>p!==hero).join('・'), opponentRole:'相手'};
}

function recentActions(q) {
  const actions = q.scenario?.actions;
  if (!Array.isArray(actions) || !actions.length) return (q.history || []).slice(-2);
  const current = actions.filter(a=>streetIndex(a.street) === currentStreet(q));
  return (current.length ? current : actions).slice(-2).map(a => a.text || `${a.position || ''} ${a.action || ''}${Number.isFinite(a.amount) ? ' '+bb(a.amount) : ''}`);
}

export function compactSituation(q, cardsHtml = lessonCards) {
  const renderCards = typeof cardsHtml === 'function' ? cardsHtml : lessonCards;
  const role = roleInfo(q), s = q.scenario, board = q.board || [];
  const money = [Number.isFinite(s?.pot) ? `ポット <b>${bb(s.pot)}</b>` : '', Number.isFinite(s?.cost) ? s.cost > 0 ? `コール額 <b>${bb(s.cost)}</b>` : '追加支払いなし' : ''].filter(Boolean);
  return `<section class="lesson-situation" aria-label="いまの状況">
    <div class="lesson-situation-meta"><span>${STREET_NAMES[currentStreet(q)]}</span><span>${q.ante ? 'アンティあり' : 'キャッシュ・アンティなし'}${s || !q.ante ? ' · 100 BB' : ''}</span></div>
    <div class="lesson-mini-table">
      <div class="lesson-opponents">${(role.opponents||[{position:role.opponent||'相手',label:role.opponentRole}]).map(opponent=>`<div class="lesson-opponent"><b>${escape(opponent.position)}</b><span>${escape(opponent.label)}</span></div>`).join('')}</div>
      <div class="lesson-board">${board.length ? renderCards(board, '共通カード') : '<span class="lesson-no-board">共通カードはまだありません</span>'}${money.length ? `<div class="lesson-pot">${money.join('<span aria-hidden="true"> · </span>')}</div>` : ''}</div>
      <div class="lesson-hero"><div class="lesson-hero-label"><span>あなた</span><b>${escape(role.hero)}</b><small>${escape(role.heroRole === 'あなた' ? '' : role.heroRole)}</small></div>${q.hand?.length ? renderCards(q.hand, 'あなたの手札') : '<span class="lesson-observer">手札を特定せず考える問題</span>'}</div>
    </div>
    <div class="lesson-recent" aria-label="直近のアクション">${recentActions(q).map(line=>`<p>${escape(line)}</p>`).join('')}</div>
  </section>`;
}

export function lessonFeedback(q, {selected} = {}) {
  const correct = (q.answers || [q.answer]).includes(selected), s = q.scenario;
  const decisive = s?.decisive || q.shortReason || q.takeaway || sentence(q.why);
  const trap = !correct ? q.traps?.[selected] : '';
  const answerLabel = (q.answers || [q.answer]).map(answer=>q.options?.[answer] || '').join(' ／ ');
  return `<section class="lesson-feedback${correct ? ' is-correct' : ' is-wrong'}" aria-live="polite" aria-label="回答の振り返り">
    <div class="lesson-feedback-heading"><span>${correct ? '✓ 正解' : 'もう一度、根拠を確認'}</span><small>あなたの回答：${escape(q.options?.[selected] || '')}</small></div>
    <h2>${escape(answerLabel)}</h2>
    <p class="lesson-decisive"><b>決め手</b>${escape(decisive)}</p>
    ${trap ? `<p class="lesson-correction"><b>見直すところ</b>${escape(trap)}</p>` : ''}
  </section>`;
}

function handClass(cards) {
  if (!Array.isArray(cards) || cards.length !== 2) return '';
  const [a,b] = [...cards].sort((x,y)=>RANKS.indexOf(x[0])-RANKS.indexOf(y[0]));
  return a[0]+b[0]+(a[0]===b[0] ? '' : a[1]===b[1] ? 's' : 'o');
}

function rangeGrid(range) {
  const weights = new Map();
  for (const combo of range?.combos || []) {
    const hand = handClass(combo.cards), weight = Number(combo.weight);
    if (!hand || !Number.isFinite(weight) || weight <= 0) continue;
    weights.set(hand, (weights.get(hand)||0)+weight);
  }
  if (!weights.size) return '';
  return `<details class="lesson-full-grid"><summary>169種類の表で確認する</summary><div class="lesson-grid-scroll"><div class="lesson-range-grid" aria-label="この局面に残る候補の表">${[...RANKS].flatMap((a,i)=>[...RANKS].map((b,j)=>{
    const hand = i===j ? a+b : i<j ? a+b+'s' : b+a+'o';
    const weight = weights.get(hand)||0, max = i===j ? 6 : i<j ? 4 : 12, intensity = Math.min(1,weight/max);
    return `<span class="lesson-range-cell${weight ? ' is-included' : ''}" style="--range-weight:${intensity.toFixed(3)}" title="${hand}：${weight ? '残る候補' : '今回の候補に含めない'}">${hand}</span>`;
  })).join('')}</div></div><p class="lesson-note">濃さは、この教材で候補に残す組み合わせの重みです。勝率や実戦の正確な行動頻度ではありません。s＝同じマーク、o＝違うマーク。</p></details>`;
}

function representatives(range) {
  const live = (range?.combos || []).filter(c=>Number(c.weight)>0 && Array.isArray(c.cards) && c.cards.length===2);
  const selected = [], used = new Set();
  for (const example of range?.examples || []) {
    const e = typeof example === 'string' ? {hand:example} : example;
    const match = live.find(c=>e.cards ? [...c.cards].sort().join() === [...e.cards].sort().join() : handClass(c.cards) === e.hand);
    if (!match) continue;
    const key = [...match.cards].sort().join();
    if (used.has(key)) continue;
    used.add(key);selected.push({...e,cards:match.cards});
    if (selected.length===5) break;
  }
  if (selected.length<3) for (const combo of [...live].sort((a,b)=>b.weight-a.weight)) {
    const key=[...combo.cards].sort().join(), name=handClass(combo.cards);
    if(used.has(key)||selected.some(e=>handClass(e.cards)===name))continue;
    used.add(key);selected.push({cards:combo.cards,hand:name});
    if(selected.length===3)break;
  }
  return selected;
}

function comparisonHTML(comparison) {
  if (!comparison) return '';
  const whole=comparison.overall,strong=comparison.strongest;
  return `<div class="lesson-comparison">${whole?`<div><b>レンジ全体の比較</b><p>${escape(whole.label)}</p>${whole.reason?`<p class="lesson-note">${escape(whole.reason)}</p>`:''}<details class="lesson-comparison-math"><summary>推定値と前提を確認する</summary><p>${escape(whole.detail)}</p></details></div>`:''}${strong?`<div><b>とても強い役の候補</b><p>${escape(strong.detail || strong.label)}</p></div>`:''}</div>`;
}

function reasoningPanel(q) {
  const s=q.scenario,goal=s?.goal||q.goal,assumption=s?.assumption||q.assumption;
  return `<div class="lesson-reasoning">${goal ? `<div class="lesson-reason-goal"><b>この行動で狙うこと</b><p>${escape(goal)}</p></div>` : ''}<p>${escape(q.why || q.foundation || '')}</p>${q.steps?.length ? textList(q.steps,'lesson-reason-steps') : ''}${comparisonHTML(s?.comparison)}${q.foundation && !s ? `<details class="lesson-premise"><summary>覚える基準を確認する</summary><p>${escape(q.foundation)}</p></details>` : ''}${assumption ? `<details class="lesson-premise"><summary>この問題の前提</summary><p>${escape(assumption)}</p></details>` : ''}</div>`;
}

function rangePanel(q,{rangeSide='opener'}={}) {
  const s=q.scenario;
  if(!s?.ranges)return `<div class="lesson-range-fallback"><h3>判断に使う基準</h3><p>${escape(q.foundation || q.why || '')}</p>${q.steps?.length ? textList(q.steps,'lesson-reason-steps') : ''}<button type="button" data-lesson-chart>ヨコサワ表で確認する</button></div>`;
  const side=rangeSide==='caller'?'caller':'opener',source=s.ranges[side],heroSide=roleInfo(q).heroSide;
  const blocked=new Set([...(q.board||[]),...(side===heroSide?[]:q.hand||[])]);
  const range=source?{...source,combos:(source.combos||[]).filter(combo=>combo.cards?.every(card=>!blocked.has(card)))}:null;
  return `<div class="lesson-range-panel">${comparisonHTML(s.comparison)}<div class="lesson-side-switch" role="group" aria-label="レンジを確認する側">${['opener','caller'].map(key=>`<button type="button" data-range-side="${key}" aria-pressed="${side===key}" class="${side===key?'is-active':''}"><b>${escape(position(s[key]))}${key===heroSide?'（あなた）':''}</b><span>${SIDE_NAMES[key]}</span></button>`).join('')}</div><p>${escape(range?.summary || '')}</p>${side===heroSide?'<p class="lesson-note">相手から見たあなたの候補です。本当の手札2枚だけには絞りません。</p>':''}<h3>たとえば、こんな手が残る</h3><div class="lesson-examples">${representatives(range).map(e=>`<div class="lesson-example">${lessonCards(e.cards)}<div><b>${escape(e.label || e.hand || handClass(e.cards))}</b>${e.reason ? `<small>${escape(e.reason)}</small>` : ''}</div></div>`).join('')}</div>${rangeGrid(range)}<p class="lesson-note">参加した位置と行動から置いた候補です。相手の実際の手札が分かったわけではありません。</p></div>`;
}

function changesPanel(q,{streetIndex:selectedStreet}={}) {
  const s=q.scenario, changes=Array.isArray(s?.changes)?s.changes.filter(change=>streetIndex(change.street)<=currentStreet(q)):[];
  if(!changes.length)return `<div><h3>この問題でたどる順番</h3>${q.steps?.length?textList(q.steps,'lesson-reason-steps'):`<p>${escape(q.why || '')}</p>`}</div>`;
  const target=Number.isInteger(selectedStreet)?selectedStreet:currentStreet(q), snapshot=changes.find(c=>streetIndex(c.street)===target)||changes.at(-1);
  return `<div class="lesson-changes"><div class="lesson-street-switch" role="group" aria-label="ここまでの変化を振り返る">${changes.map(change=>`<button type="button" data-street="${streetIndex(change.street)}" aria-pressed="${change===snapshot}" class="${change===snapshot?'is-active':''}">${STREET_NAMES[streetIndex(change.street)]}</button>`).join('')}</div><div class="lesson-snapshot">${snapshot.board?.length?lessonCards(snapshot.board):'<span class="lesson-note">共通カードが出る前</span>'}<h3>${escape(snapshot.summary||'')}</h3>${snapshot.actions?.length?`<div class="lesson-snapshot-actions">${snapshot.actions.map(a=>`<p>${escape(typeof a==='string'?a:a.text||'')}</p>`).join('')}</div>`:''}<div class="lesson-range-delta">${snapshot.retained?.length?`<div><b>残りやすい手</b>${textList(snapshot.retained)}</div>`:''}${snapshot.removed?.length?`<div><b>減りやすい手</b>${textList(snapshot.removed)}</div>`:''}</div>${snapshot.reason?`<p class="lesson-snapshot-reason"><b>なぜ？</b>${escape(snapshot.reason)}</p>`:''}${snapshot.advantage?`<p class="lesson-snapshot-advantage"><b>このカードとの相性</b>${escape(typeof snapshot.advantage==='string'?snapshot.advantage:snapshot.advantage.detail||snapshot.advantage.summary||'')}</p>`:''}</div></div>`;
}

export function lessonDetails(q,state={}) {
  const tabs=[['reason','理由'],['ranges','両者のレンジ'],['changes','変化を追う']],active=tabs.some(([key])=>key===state.activeTab)?state.activeTab:null;
  return `<section class="lesson-details" aria-label="詳しく確かめる"><div class="lesson-details-label"><span>もっと知りたいときに</span>${active?'<button type="button" data-lesson-tab="" class="lesson-close-detail" aria-label="詳しい解説を閉じる">閉じる ×</button>':''}</div><div class="lesson-tabs" role="tablist" aria-label="解説の切り替え">${tabs.map(([key,label])=>`<button type="button" id="lesson-tab-${key}" data-lesson-tab="${key}" role="tab" aria-controls="lesson-panel-${key}" aria-selected="${active===key}" class="${active===key?'is-active':''}">${label}</button>`).join('')}</div>${active?`<div class="lesson-detail-panel" id="lesson-panel-${active}" role="tabpanel" aria-labelledby="lesson-tab-${active}">${active==='reason'?reasoningPanel(q):active==='ranges'?rangePanel(q,state):changesPanel(q,state)}</div>`:''}</section>`;
}

export function renderLesson(q,state={}) {
  const {selected=null,answered=false,hints=0,index=0,total=1,sessionTitle='レンジを読んで判断',hasDrill=false,isLast=false,tableHtml=''}=state;
  const history=q.history||[],fullTable=tableHtml?`<details class="lesson-full-table"><summary>卓全体を見る</summary>${tableHtml}</details>`:'';
  const continuation=q.scenario?.stepIndex>0?'<p class="lesson-continuation">教材の続き：前の場面は、指定のアクションで進んだものとして考えます。</p>':'';
  return `<div class="lesson-screen${answered?' lesson-answered':''}"><header class="lesson-header"><div><span>${escape(sessionTitle)}</span><b>${index+1} <small>/ ${total}問</small></b></div><div class="lesson-header-actions"><button type="button" id="practice-bible" data-lesson-chart>表を見る</button>${hasDrill?'<button type="button" id="exit-drill" class="lesson-exit" aria-label="練習を終了してホームへ">終了</button>':'<button type="button" data-nav="home" class="lesson-exit">ホーム</button>'}</div></header>${continuation}<div class="lesson-layout"><div class="lesson-context">${compactSituation(q)}<div class="lesson-context-extras">${fullTable}${history.length?`<details class="lesson-full-history"><summary>ここまでの全アクション</summary>${textList(history,'lesson-history-list')}</details>`:''}</div></div><section class="lesson-decision" aria-label="判断する">${answered?lessonFeedback(q,{selected})+lessonDetails(q,state):`<span class="lesson-question-label"><span class="lesson-kind">${escape(({memory:"覚える基準",read:"情報から読む",apply:"基準を使って判断"})[q.learningKind]||"情報から読む")}</span></span><h1 class="lesson-question">${escape(q.ask)}</h1><div class="lesson-choices">${(q.options||[]).map((option,i)=>`<button type="button" class="lesson-choice${selected===i?' is-selected':''}" data-choice="${i}" aria-pressed="${selected===i}"><span class="lesson-choice-letter">${String.fromCharCode(65+i)}</span><span>${escape(option)}</span></button>`).join('')}</div>${hints?`<div class="lesson-hint" role="status"><b>ヒント ${hints}/3</b><p>${escape(q.hints?.[hints-1]||'')}</p></div>`:''}`}</section></div><div class="lesson-controls">${answered?`<span class="lesson-control-note">考え方を確かめたら、次へ</span><button type="button" class="primary" id="next">${isLast?'結果を見る':'次の問題へ'} →</button>`:`<button type="button" id="hint" ${hints>=3?'disabled':''}>ヒント${hints?' '+hints+'/3':''}</button><button type="button" class="primary" id="answer" ${selected===null?'disabled':''}>この答えに決める</button>`}</div></div>`;
}
