/** Deterministic visual gene kit. Appearance is derived from stable actor ID. */
const skins=["#d4aa84","#bd8c65","#e2bb95","#a87e62","#d7b38c","#996f55"];
const fabrics=["#748976","#a28662","#8a6955","#87918c","#8d785b","#6c8589"];
const headPaths=[
"M36 30Q39 9 58 9Q83 11 82 38L78 59Q70 74 52 66L38 56Z",
"M34 34Q35 6 58 8Q82 6 83 34L74 62Q61 78 49 61Z",
"M42 30Q42 12 58 13Q78 13 76 34L80 52Q73 72 54 69Q35 58 42 30Z",
"M33 31Q35 9 59 10Q80 10 84 34L78 56Q64 67 50 63L37 54Z",
"M39 30Q43 8 60 12Q79 8 80 35Q88 60 59 68Q36 61 39 30Z"];
const hairPaths=[
"M37 43Q25 14 48 8Q69 -3 79 13Q90 27 79 43L73 29Q58 30 49 21Q45 38 37 43Z",
"M33 39Q28 11 54 6Q84 6 84 33L76 33L72 21Q55 30 43 24L36 46Z",
"M35 41Q25 9 60 10Q86 7 86 39L76 54L77 32Q57 26 47 20Z",
"M40 30Q46 5 69 12Q85 22 79 37L68 27Q54 33 43 40Z",
"M34 39Q34 12 57 7Q76 11 81 39L77 50Q75 25 57 24L40 43Z",
"M34 43Q22 24 38 12Q63 -3 78 15Q86 30 80 43Q69 26 55 26Q40 31 34 43Z"];
const eyes=[
'<path d="M46 43h7m13 0h7" stroke="#352f29" stroke-width="3" stroke-linecap="round"/>',
'<ellipse cx="49" cy="45" rx="2.4" ry="3.5" fill="#372e2b"/><ellipse cx="69" cy="45" rx="2.4" ry="3.5" fill="#372e2b"/>',
'<path d="M45 43q5 -4 10 0m10 0q5 -4 10 0" stroke="#372e2b" stroke-width="3" fill="none" stroke-linecap="round"/>',
'<path d="M46 45l8 1m12 0 8-1" stroke="#372e2b" stroke-width="2.5" stroke-linecap="round"/>',
'<path d="M45 43q5 5 10 1m10 0q5 5 10-1" fill="none" stroke="#473328" stroke-width="3"/>' ];
const mouths=[
'<path d="M54 58q7 3 13-1" stroke="#804d3f" stroke-width="2" fill="none"/>',
'<path d="M54 56q7 9 15 0" stroke="#874c3b" stroke-width="2" fill="none"/>',
'<path d="M56 60h12" stroke="#764b3f" stroke-width="2.5"/>',
'<path d="M56 57q7-3 13 3" stroke="#815a47" stroke-width="2" fill="none"/>',
'<ellipse cx="61" cy="59" rx="3.5" ry="2.5" fill="#8a5646"/>' ];
const torsos=[
"M38 73Q54 65 77 74L90 95L85 140Q60 150 30 138L28 96Z",
"M40 72Q55 65 73 73L83 94L81 140Q59 147 36 137L32 94Z",
"M34 75Q56 63 79 74L93 101L88 138Q60 153 27 136L25 99Z",
"M40 73Q52 68 73 71L82 89L84 140Q60 146 35 141L33 91Z"];
const armPaths=[
"M35 78Q19 93 20 122L30 132L42 113M81 76Q99 92 95 123L85 130L75 105",
"M34 81Q18 90 19 116L30 129L37 112M80 77Q98 91 95 115L83 131L77 114",
"M34 78Q20 97 24 119L34 133L43 108M80 76Q92 85 93 108L88 133L75 111",
"M34 79Q20 92 18 108L28 127L43 117M82 80Q102 98 99 123L85 132L73 114"];
export function appearanceFor(id, role="") {
 let seed=2166136261;
 for(const ch of String(id)) { seed^=ch.codePointAt(0); seed=Math.imul(seed,16777619)>>>0; }
 const pick=(shift,count)=>Math.floor((seed>>>shift)%count);
 const roleColour=/灶|炊|cook/.test(role)?"#917052":
   /苇|编|水/.test(role)?"#698977":/田|农/.test(role)?"#a28a56":
   /陶|土/.test(role)?"#98745d":null;
 return {id:String(id), head:pick(1,5),eyes:pick(4,5),mouth:pick(7,5),
   hair:pick(10,6),body:pick(13,4),arms:pick(16,4),
   skin:skins[pick(19,skins.length)],fabric:roleColour||fabrics[pick(21,fabrics.length)],
   detail:["#c3a47c","#9db3a0","#cbb889","#d8b997"][pick(8,4)],
   isCook:/灶|炊|cook/.test(role)};
}
export function renderFigure(id,role="") {
 const a=appearanceFor(id,role);
 const apron=a.isCook?'<path d="M35 96Q56 111 82 95L81 135Q60 148 34 136Z" fill="#d7c09a" stroke="#65543e" stroke-width="3"/>':'';
 const braid=a.hair===3?'<path d="M78 33q18 26 4 46" stroke="#362d29" stroke-width="8" fill="none"/>':'';
 return '<svg class="painted-person" viewBox="0 0 116 178" aria-hidden="true" role="presentation"'+
  ' data-head="'+a.head+'" data-eyes="'+a.eyes+'" data-mouth="'+a.mouth+'" data-body="'+a.body+'"'+
  ' style="--skin:'+a.skin+';--fabric:'+a.fabric+';--fabric-deep:#3c574e">'+
  '<ellipse cx="58" cy="169" rx="40" ry="8" fill="#13221d" opacity=".3"/>'+
  '<path d="M41 132l-5 30q3 8 16 5l8-31m9-3 3 29q3 8 15 5l-6-34" fill="#4b463d" stroke="#35322d" stroke-width="5"/>'+
  '<path d="M34 160l20 0 7 11-29 0zm37 0 16 0 10 11-30 0z" fill="#39372f"/>'+
  '<path d="'+armPaths[a.arms]+'" fill="none" stroke="'+a.skin+'" stroke-width="'+(a.body===2?15:11)+'" stroke-linecap="round"/>'+
  '<path d="'+torsos[a.body]+'" fill="'+a.fabric+'" stroke="#344739" stroke-width="4"/>'+
  '<path d="M42 83Q59 93 78 80L84 117 32 120Z" fill="'+a.detail+'" opacity=".18"/>'+
  '<path d="M29 105q28 15 57 0" stroke="'+a.detail+'" stroke-width="6" fill="none"/>'+apron+
  '<path d="M54 60v14q8 9 15 0V60" fill="'+a.skin+'" stroke="#684938" stroke-width="3"/>'+
  '<path d="'+headPaths[a.head]+'" fill="'+a.skin+'" stroke="#5d4434" stroke-width="3.5"/>'+
  '<path d="'+hairPaths[a.hair]+'" fill="#322f2a" stroke="#34342d" stroke-width="3"/>'+braid+
  eyes[a.eyes]+mouths[a.mouth]+
  '<path d="M39 142q21 8 43 0" stroke="'+a.detail+'" stroke-width="3" opacity=".65" stroke-dasharray="7 6"/></svg>';
}
