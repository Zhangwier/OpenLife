/** Visual-only representations of real world objects and local resources. */
const floor='<ellipse cx="65" cy="108" rx="48" ry="9" fill="#3a332c" opacity=".2" filter="url(#propSoft)"/>';
const line=(path,stroke,width=4)=>'<path d="'+path+'" stroke="'+stroke+'" stroke-width="'+width+'" fill="none" stroke-linecap="round"/>';
const shapes={
 jar:n=>floor+'<path d="M47 24Q25 47 34 78Q35 110 65 109Q99 107 98 78Q101 43 82 24Z" fill="#b88d68" stroke="#2f2a26" stroke-width="2.2" stroke-opacity=".8" stroke-linejoin="round"/>'+line("M40 59q22 10 49 0m-48 22q23 11 47-1","#d8c3a6",3)+'<path d="M44 50q-6 18 0 36" stroke="#fff" stroke-opacity=".35" stroke-width="6" fill="none" stroke-linecap="round"/><ellipse cx="65" cy="23" rx="24" ry="10" fill="#cdb08c" stroke="#2f2a26" stroke-width="2.2" stroke-opacity=".8" stroke-linejoin="round"/><ellipse cx="65" cy="22" rx="19" ry="6" fill="'+(n?"#93aab0":"#453c30")+'"/>',
 cistern:n=>'<ellipse cx="65" cy="83" rx="58" ry="27" fill="#8f8571" stroke="#2f2a26" stroke-width="2.2" stroke-opacity=".8" stroke-linejoin="round"/><ellipse cx="65" cy="78" rx="49" ry="18" fill="'+(n?"#7f9fa3":"#3e332e")+'"/><ellipse cx="63" cy="77" rx="'+(n?34:14)+'" ry="7" fill="'+(n?"#b4c6c2":"#514337")+'"/>'+line("M16 89q13 7 26 1m33 3q17 3 29-5","#d2c8b0",3),
 hearth:n=>'<path d="M9 97L22 31L42 22L99 30L121 99L105 112L20 113Z" fill="#ab9177" stroke="#2f2a26" stroke-width="2.2" stroke-opacity=".8" stroke-linejoin="round"/><path d="M25 93Q23 45 65 45Q102 45 105 94Z" fill="#3a332d"/>'+(n?'<path d="M37 95Q44 67 54 73Q50 55 63 46Q76 68 69 77Q87 68 90 95Z" fill="#f0a85a"/><path d="M58 82l7-19" stroke="#2f2a26" stroke-width="2.2" stroke-opacity=".8" stroke-linejoin="round"/>':'<path d="M39 89q28-12 51 4" stroke="#8a847a" fill="none" stroke-width="3"/>'),
 fuel:n=>floor+Array.from({length:Math.max(1,Math.round(2+n*6))},(_,i)=>line("M"+(12+i*11)+" "+(104-i*6)+"l57 "+(12-i*2),i%2?"#a68a6a":"#6f5e4c",9)).join(""),
 reed:n=>floor+Array.from({length:Math.max(2,Math.round(2+n*8))},(_,i)=>line("M"+(10+i*12)+" 105q"+((i%2?1:-1)*15)+" -43 0 -75",i%2?"#a9b48e":"#6f7d62",4)+'<ellipse cx="'+(10+i*12)+'" cy="32" rx="3.5" ry="12" fill="#8a8064"/>').join(""),
 grain:n=>floor+Array.from({length:Math.max(3,Math.round(3+n*9))},(_,i)=>line("M"+(10+i*10)+" 106q-10 -41 -3 -65","#ab9f80",3)+line("M"+(7+i*10)+" 78l-10 -9m10 -2 9-14","#cfc39f",4)).join(""),
 river:n=>'<ellipse cx="65" cy="85" rx="55" ry="19" fill="#b6ded0" opacity=".08" stroke="#e0eacb" stroke-width="2"/>'+line("M18 79q18-10 33 0m20 5q16-9 35-1M40 98q31-8 49-1","#d9e9d8",3),
 clay:n=>floor+'<path d="M8 101l16-37 26-14 16 19 27-22 27 54-23 13H27Z" fill="#ae8a6c" stroke="#2f2a26" stroke-width="2.2" stroke-opacity=".8" stroke-linejoin="round"/>'+line("M26 85l37 17 33-24","#cbbba3",4),
 basket:n=>floor+'<path d="M19 45Q65 19 111 46L101 104Q65 120 30 103Z" fill="#c7b088" stroke="#2f2a26" stroke-width="2.2" stroke-opacity=".8" stroke-linejoin="round"/>'+line("M24 62q44 15 83-2M29 83q37 13 71-2","#d6c8a8",5)+'<ellipse cx="65" cy="44" rx="46" ry="15" fill="'+(n?"#bfae86":"#6e6250")+'" stroke="#2f2a26" stroke-width="2.2" stroke-opacity=".8" stroke-linejoin="round"/>',
 pot:n=>floor+'<path d="M35 29L23 83Q30 115 65 116Q104 115 107 83L95 29Z" fill="#b98f6c" stroke="#2f2a26" stroke-width="2.2" stroke-opacity=".8" stroke-linejoin="round"/>'+line("M33 51q34 16 63-1","#dccab0",4)+line("M38 62q-4 20 4 38","rgba(255,255,255,.32)",6)+'<ellipse cx="65" cy="30" rx="34" ry="11" fill="#4a4038" stroke="#2f2a26" stroke-width="2.2" stroke-opacity=".8" stroke-linejoin="round"/>',
 kiln:n=>'<path d="M9 109Q13 23 65 15Q118 23 121 108Z" fill="#b8977a" stroke="#2f2a26" stroke-width="2.2" stroke-opacity=".8" stroke-linejoin="round"/><path d="M40 106V77Q39 45 65 45Q96 45 96 78V106Z" fill="#3a332d"/><path d="M47 102q9-29 18-12q8-37 17 0l7 12Z" fill="#eaa05a"/>',
 tool:n=>floor+line("M23 108L97 19","#9a8064",11)+'<path d="M80 20q30-17 34 16L88 49Z" fill="#9eaaa3" stroke="#2f2a26" stroke-width="2.2" stroke-opacity=".8" stroke-linejoin="round"/>',
 mat:n=>floor+'<path d="M8 102L44 64L125 82L87 120Z" fill="#d6c6a0" stroke="#2f2a26" stroke-width="2.2" stroke-opacity=".8" stroke-linejoin="round"/>'+Array.from({length:5},(_,i)=>line("M"+(20+i*17)+" "+(102+i*3)+"l35-37","#e0d4b6",3)).join(""),
 rope:n=>floor+'<ellipse cx="65" cy="88" rx="42" ry="17" fill="none" stroke="#a88c5e" stroke-width="9"/><ellipse cx="65" cy="80" rx="34" ry="13" fill="none" stroke="#bea170" stroke-width="9"/><ellipse cx="65" cy="72" rx="25" ry="10" fill="none" stroke="#cbb07e" stroke-width="8"/>'+line("M86 70q22 4 30 28","#a88c5e",7)+line("M30 86q35 14 70 0M38 76q27 10 54 0","#5c4a33",1.4),
 net:n=>floor+'<path d="M14 100Q20 40 65 30Q112 40 116 100Q65 116 14 100Z" fill="#d9ccae" fill-opacity=".35" stroke="#2f2a26" stroke-width="2.2" stroke-opacity=".8" stroke-linejoin="round"/>'+Array.from({length:6},(_,i)=>line("M"+(20+i*18)+" 102Q"+(40+i*8)+" 60 "+(52+i*5)+" 32","#5c4a33",1.6)).join("")+Array.from({length:4},(_,i)=>line("M"+(18+i*3)+" "+(48+i*15)+"Q65 "+(56+i*15)+" "+(112-i*3)+" "+(48+i*15),"#5c4a33",1.6)).join("")+'<circle cx="24" cy="100" r="4" fill="#8a7a66"/><circle cx="106" cy="100" r="4" fill="#8a7a66"/>',
 fish:n=>floor+'<path d="M18 78Q50 46 92 72L116 54L112 78L118 100L92 86Q52 108 18 78Z" fill="#9fb0ac" stroke="#2f2a26" stroke-width="2.2" stroke-opacity=".8" stroke-linejoin="round"/>'+line("M40 70q6 9 0 18M60 66q7 12 0 24","#4a5a58",1.6)+'<circle cx="30" cy="74" r="3" fill="#2f2a26"/>'+line("M50 60q14-10 26 2","#7b8d89",3),
 roast:n=>floor+'<ellipse cx="65" cy="96" rx="50" ry="14" fill="#b98f6c" stroke="#2f2a26" stroke-width="2.2" stroke-opacity=".8" stroke-linejoin="round"/>'+'<path d="M24 82Q52 58 88 78L108 66L104 84L110 98L88 90Q52 104 24 82Z" fill="#a8743f" stroke="#2f2a26" stroke-width="2.2" stroke-opacity=".8" stroke-linejoin="round"/>'+line("M44 76l6 10M58 72l6 13M72 74l6 12","#5a3a1c",2.5)+line("M50 50q-8-12 0-24M68 46q-8-12 0-24","#cfc6b4",2.4),
 greenware:n=>floor+'<path d="M45 30Q28 52 35 80Q38 108 65 108Q93 107 95 80Q101 50 84 30Z" fill="#c9b08f" stroke="#2f2a26" stroke-width="2.2" stroke-opacity=".8" stroke-linejoin="round" stroke-dasharray="5 3"/>'+line("M42 62q22 6 46 0","#9f8668",2)+'<ellipse cx="65" cy="30" rx="20" ry="5" fill="#d8c3a2" stroke="#2f2a26" stroke-width="2.2" stroke-opacity=".8" stroke-linejoin="round"/>',
 fiber:n=>floor+Array.from({length:9},(_,i)=>line("M"+(14+i*4)+" "+(98-i)+"Q65 "+(70+i*2)+" "+(112-i*3)+" "+(52+i*3),i%2?"#d9cfa9":"#b9ad86",2.6)).join("")+line("M58 90l10-18","#7a6a4a",6),
 cloth:n=>floor+'<path d="M16 92L34 52L98 46L116 86L96 104L32 106Z" fill="#cdbf9d" stroke="#2f2a26" stroke-width="2.2" stroke-opacity=".8" stroke-linejoin="round"/>'+'<path d="M34 52L46 80L98 76L98 46" fill="none" stroke="#2f2a26" stroke-width="2.2" stroke-opacity=".8" stroke-linejoin="round"/>'+line("M24 96l80-4M30 86l76-4","#9d8e6c",1.6),
 bag:n=>floor+'<path d="M28 50Q26 104 40 108L92 108Q106 104 102 50Z" fill="#c4a979" stroke="#2f2a26" stroke-width="2.2" stroke-opacity=".8" stroke-linejoin="round"/>'+line("M38 50Q65 0 92 50","#7c6447",4)+Array.from({length:4},(_,i)=>line("M30 "+(62+i*12)+"q35 8 72 0","#8d744f",1.6)).join(""),
 knife:n=>floor+'<path d="M18 92Q48 54 104 44Q92 72 30 102Z" fill="#9eaaa3" stroke="#2f2a26" stroke-width="2.2" stroke-opacity=".8" stroke-linejoin="round"/>'+line("M30 96q40-30 68-46","#d7ddd6",2)+'<path d="M14 96l10 12 14-10-10-10z" fill="#8a6c4d" stroke="#2f2a26" stroke-width="2.2" stroke-opacity=".8" stroke-linejoin="round"/>',
 stick:n=>floor+line("M26 112L100 16","#8f714f",10)+line("M30 108L98 20","#b39470",3)+'<path d="M94 22l14-10 4 14z" fill="#8f714f" stroke="#2f2a26" stroke-width="2.2" stroke-opacity=".8" stroke-linejoin="round"/>',
 needle:n=>floor+line("M22 100L108 30","#e6dcc4",6)+line("M22 100L108 30","#2f2a26",1)+'<ellipse cx="100" cy="37" rx="4" ry="2" fill="none" stroke="#2f2a26" stroke-width="1.5"/>'+line("M100 37q14 20-10 50q-20 20-50 8","#a88c5e",1.6),
 stone:n=>floor+'<path d="M10 96Q14 70 52 66L112 72Q124 86 112 104L24 108Z" fill="#a7a296" stroke="#2f2a26" stroke-width="2.2" stroke-opacity=".8" stroke-linejoin="round"/>'+'<ellipse cx="66" cy="62" rx="30" ry="10" fill="#bdb8ab" stroke="#2f2a26" stroke-width="2.2" stroke-opacity=".8" stroke-linejoin="round"/>',
 default:n=>floor+'<path d="M27 99L40 46L76 30L110 93L90 112L40 112Z" fill="#bba486" stroke="#2f2a26" stroke-width="2.2" stroke-opacity=".8" stroke-linejoin="round"/>'
};
export function objectKind(obj){
 const p=String(obj.prototypeId||""), name=String(obj.name||"");
 if(p.includes("water-cache"))return "cistern";
 if(p==="prototype:water")return "river";
 if(p==="prototype:greenware")return "greenware";
 if(p.includes("jar")||p.includes("urn"))return "jar";
 if(p.includes("cooking-pot")||p.includes("bowl")||p.includes("sieve"))return "pot";
 if(p.includes("shared-kiln"))return "kiln";
 if(p.includes("hearth"))return "hearth";
 if(p.includes("fuel-bundle"))return "fuel";
 if(p.includes("reed-bundle"))return "reed";
 if(p.includes("carrying-bag"))return "bag";
 if(p.includes("basket")||p.includes("fish-trap"))return "basket";
 if(p==="prototype:fish")return "fish";
 if(p==="prototype:cooked-food")return name.includes("鱼")?"roast":"pot";
 if(p==="prototype:net")return "net";
 if(p==="prototype:rope")return "rope";
 if(p.includes("fiber-bundle"))return "fiber";
 if(p.includes("fiber-wrap")||p.includes("cloak"))return "cloth";
 if(p.includes("grain"))return "grain";
 if(p.includes("clay"))return "clay";
 if(p.includes("mat"))return "mat";
 if(p.includes("stone-knife"))return "knife";
 if(p.includes("needle"))return "needle";
 if(p.includes("grinding"))return "stone";
 if(p.includes("digging")||p.includes("paddle")||p.includes("fence-post"))return "stick";
 return "default";
}
export function resourceKind(id){
 return {"resource:water":"river","resource:grain":"grain","resource:cooked":"pot",
 "resource:reed":"reed","resource:fuel":"fuel","resource:clay":"clay",
 "resource:fish":"fish","resource:rope":"rope","resource:fiber":"fiber","resource:net":"net","resource:greenware":"greenware","resource:bag":"bag","resource:cloth":"cloth","resource:jar":"jar","resource:bowl":"pot","resource:mat":"mat","resource:tool":"stick","resource:basket":"basket"}[id]||"default";
}
export function fillRatio(obj){
 const cap=Math.max(0,Number(obj.capacity||0));
 return cap>0?Math.max(0,Math.min(1,Math.max(Number(obj.contentsCount||0),Number(obj.quantity||0))/cap)):0;
}
export function propSvg(kind,level=0){
 return '<svg class="prop-illustration" viewBox="0 0 130 125" aria-hidden="true" focusable="false"><defs><filter id="propSoft" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="3.5"/></filter></defs>'+(shapes[kind]||shapes.default)(Math.max(0,Math.min(1,level)))+'</svg>';
}
const slots={
 "place:yard":{object:[[30,77],[47,78],[66,82],[82,73]],yield:[[50,71]]},
 "place:hearth-yard":{object:[[58,74],[76,78],[32,76],[87,72]],yield:[[65,70]]},
 "place:river":{object:[[58,76],[76,80],[36,78],[86,69]],yield:[[25,69]]},
 "place:reedbed":{object:[[61,78],[82,70]],yield:[[35,71],[78,68]]},
 "place:field":{object:[[68,79],[79,74]],yield:[[47,72]]},
 "place:kiln":{object:[[58,76],[79,75]],yield:[[43,69]]},
 "place:claypits":{object:[[59,79]],yield:[[43,71]]},
 "place:ford":{object:[[60,79]],yield:[[40,70]]}
};
export function slotFor(place,kind,index){
 const a=slots[place]?.[kind]||[[45,75],[70,75]];
 return a[index%a.length];
}
