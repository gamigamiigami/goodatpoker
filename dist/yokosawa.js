// Transcribed from the official 2025-12-06 video, chart at 2:43 and 27:24.
// These are teaching tiers, not equities or solver action frequencies.
export const yokosawaSource={version:'2025-12-06',url:'https://www.youtube.com/watch?v=NDouTGvor-k',title:'ヨコサワ ハンドレンジ表・2025年最新版'};
export const yokosawaColors=['グレー','ピンク','紫枠','白','水色','緑','黄','赤','紫'];
export const yokosawaGroups=[
  '',
  'J5s J4s J3s J2s T6s T5s T4s T3s 95s 85s 74s 63s 53s 43s A5o A4o A3o A2o K8o K7o K6o K5o Q8o Q7o J8o T8o 97o 87o',
  'Q5s Q4s Q3s Q2s J6s T7s 96s 86s 75s 64s 54s A6o 98o',
  'K8s K7s K6s K5s K4s K3s K2s Q8s Q7s Q6s J8s J7s 97s 87s 76s 65s QTo K9o Q9o J9o T9o A8o A7o',
  'Q9s J9s T8s 98s QJo KTo JTo A9o 44 33 22',
  'A9s A8s A7s A6s A5s A4s A3s A2s KTs K9s QTs KJo ATo T9s 66 55',
  'KJs QJs JTs KQo AJo 88 77',
  'AQs AJs ATs AQo KQs JJ TT 99',
  'AA KK QQ AKs AKo'
];
const yokosawaTiers=new Map(yokosawaGroups.flatMap((group,tier)=>group?group.split(' ').map(hand=>[hand,tier]):[]));
export function yokosawaRank(hand,ante=true){const tier=yokosawaTiers.get(hand)||0;return !ante&&tier===1?0:tier}
export function yokosawaThreshold(behind,ante=true){
  if(!Number.isInteger(behind)||behind<2||behind>8)return null;
  return (behind===2?2:behind===3?3:behind<=5?4:behind<=7?5:6)+(ante?0:1);
}
export function yokosawaAction(hand,{behind,ante=true,openerBehind=null,bb=false,openSize=2.5}={}){
  const tier=yokosawaRank(hand,ante),minimum=yokosawaThreshold(openerBehind??behind,ante);
  if(minimum===null)return null; // SB-first-in and heads-up are not specified by these charts.
  if(openerBehind===null)return tier>=minimum?'raise':'fold';
  if(openSize<2||openSize>3)return null; // The video's ordinary open-size examples.
  if(tier>=minimum+2||tier===8)return 'raise';
  if(bb){const floor=(openerBehind===2?1:openerBehind===3?2:3)+(ante?0:1);return tier>=floor?'call':'fold'}
  return tier===minimum+1?'call':'fold';
}
export function handNotation(cards){
  const ranks='AKQJT98765432',sorted=cards.slice().sort((a,b)=>ranks.indexOf(a[0])-ranks.indexOf(b[0]));
  return sorted[0][0]+sorted[1][0]+(sorted[0][0]===sorted[1][0]?'':sorted[0][1]===sorted[1][1]?'s':'o');
}
