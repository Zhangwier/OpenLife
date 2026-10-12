/** Visual-only representations of real world objects and local resources. */
const floor='<ellipse cx="65" cy="108" rx="50" ry="11" fill="#14251f" opacity=".34"/>';
const line=(path,stroke,width=4)=>'<path d="'+path+'" stroke="'+stroke+'" stroke-width="'+width+'" fill="none" stroke-linecap="round"/>';
const shapes={
 jar:n=>floor+'<path d="M47 24Q25 47 34 78Q35 110 65 109Q99 107 98 78Q101 43 82 24Z" fill="#a27354" stroke="#583f32" stroke-width="5"/>'+line("M40 59q22 10 49 0m-48 22q23 11 47-1","#d9ac7d",3)+'<ellipse cx="65" cy="23" rx="24" ry="10" fill="#b48c63" stroke="#644c3b" stroke-width="5"/><ellipse cx="65" cy="22" rx="19" ry="6" fill="'+(n?"#85abae":"#453c30")+'"/>',
 cistern:n=>'<ellipse cx="65" cy="83" rx="58" ry="27" fill="#4b4537" stroke="#998566" stroke-width="10"/><ellipse cx="65" cy="78" rx="49" ry="18" fill="'+(n?"#5c8889":"#3e332e")+'"/><ellipse cx="63" cy="77" rx="'+(n?34:14)+'" ry="7" fill="'+(n?"#9eb6a4":"#514337")+'"/>'+line("M16 89q13 7 26 1m33 3q17 3 29-5","#d7c8a5",3),
 hearth:n=>'<path d="M9 97L22 31L42 22L99 30L121 99L105 112L20 113Z" fill="#937357" stroke="#493e31" stroke-width="7"/><path d="M25 93Q23 45 65 45Q102 45 105 94Z" fill="#362d26"/>'+(n?'<path d="M37 95Q44 67 54 73Q50 55 63 46Q76 68 69 77Q87 68 90 95Z" fill="#f7b25f"/><path d="M58 82l7-19" stroke="#ffe7a5" stroke-width="5"/>':'<path d="M39 89q28-12 51 4" stroke="#878178" fill="none" stroke-width="3"/>'),
 fuel:n=>floor+Array.from({length:Math.max(1,Math.round(2+n*6))},(_,i)=>line("M"+(12+i*11)+" "+(104-i*6)+"l57 "+(12-i*2),i%2?"#b78c5c":"#79563f",9)).join(""),
 reed:n=>floor+Array.from({length:Math.max(2,Math.round(2+n*8))},(_,i)=>line("M"+(10+i*12)+" 105q"+((i%2?1:-1)*15)+" -43 0 -75",i%2?"#aec184":"#657c53",4)+'<ellipse cx="'+(10+i*12)+'" cy="32" rx="3.5" ry="12" fill="#8d8252"/>').join(""),
 grain:n=>floor+Array.from({length:Math.max(3,Math.round(3+n*9))},(_,i)=>line("M"+(10+i*10)+" 106q-10 -41 -3 -65","#b4a272",3)+line("M"+(7+i*10)+" 78l-10 -9m10 -2 9-14","#dbca8e",4)).join(""),
 river:n=>'<ellipse cx="65" cy="85" rx="55" ry="19" fill="#b6ded0" opacity=".08" stroke="#e0eacb" stroke-width="2"/>'+line("M18 79q18-10 33 0m20 5q16-9 35-1M40 98q31-8 49-1","#d9e9d8",3),
 clay:n=>floor+'<path d="M8 101l16-37 26-14 16 19 27-22 27 54-23 13H27Z" fill="#a2866b" stroke="#675649" stroke-width="5"/>'+line("M26 85l37 17 33-24","#cfb595",4),
 basket:n=>floor+'<path d="M19 45Q65 19 111 46L101 104Q65 120 30 103Z" fill="#a28d5e" stroke="#5d5540" stroke-width="5"/>'+line("M24 62q44 15 83-2M29 83q37 13 71-2","#ddc394",5)+'<ellipse cx="65" cy="44" rx="46" ry="15" fill="'+(n?"#b6a16d":"#705c42")+'" stroke="#91795a" stroke-width="5"/>',
 pot:n=>floor+'<path d="M35 29L23 83Q30 115 65 116Q104 115 107 83L95 29Z" fill="#b28667" stroke="#694939" stroke-width="6"/>'+line("M33 51q34 16 63-1","#dfb184",4)+'<ellipse cx="65" cy="30" rx="34" ry="11" fill="#48372d" stroke="#ba926d" stroke-width="5"/>',
 kiln:n=>'<path d="M9 109Q13 23 65 15Q118 23 121 108Z" fill="#a88465" stroke="#674d3d" stroke-width="7"/><path d="M40 106V77Q39 45 65 45Q96 45 96 78V106Z" fill="#3c2f28"/><path d="M47 102q9-29 18-12q8-37 17 0l7 12Z" fill="#e9a15b"/>',
 tool:n=>floor+line("M23 108L97 19","#97734e",11)+'<path d="M80 20q30-17 34 16L88 49Z" fill="#8a968c" stroke="#586559" stroke-width="5"/>',
 mat:n=>floor+'<path d="M8 102L44 64L125 82L87 120Z" fill="#c3ac7c" stroke="#817350" stroke-width="5"/>'+Array.from({length:5},(_,i)=>line("M"+(20+i*17)+" "+(102+i*3)+"l35-37","#e2ca96",3)).join(""),
 default:n=>floor+'<path d="M27 99L40 46L76 30L110 93L90 112L40 112Z" fill="#ab906d" stroke="#6f5942" stroke-width="5"/>'
};
export function objectKind(obj){
 const p=String(obj.prototypeId||"");
 if(p.includes("water-cache"))return "cistern";
 if(p==="prototype:water")return "river";
 if(p.includes("jar")||p.includes("urn"))return "jar";
 if(p.includes("cooking-pot")||p.includes("bowl"))return "pot";
 if(p.includes("shared-kiln"))return "kiln";
 if(p.includes("hearth"))return "hearth";
 if(p.includes("fuel-bundle"))return "fuel";
 if(p.includes("reed-bundle"))return "reed";
 if(p.includes("basket")||p.includes("carrying-bag")||p.includes("fish-trap"))return "basket";
 if(p.includes("grain"))return "grain";
 if(p.includes("clay"))return "clay";
 if(p.includes("mat"))return "mat";
 if(p.includes("digging")||p.includes("knife")||p.includes("paddle"))return "tool";
 return "default";
}
export function resourceKind(id){
 return {"resource:water":"river","resource:grain":"grain","resource:cooked":"pot",
 "resource:reed":"reed","resource:fuel":"fuel","resource:clay":"clay",
 "resource:fish":"river"}[id]||"default";
}
export function fillRatio(obj){
 const cap=Math.max(0,Number(obj.capacity||0));
 return cap>0?Math.max(0,Math.min(1,Math.max(Number(obj.contentsCount||0),Number(obj.quantity||0))/cap)):0;
}
export function propSvg(kind,level=0){
 return '<svg class="prop-illustration" viewBox="0 0 130 125" aria-hidden="true" focusable="false">'+(shapes[kind]||shapes.default)(Math.max(0,Math.min(1,level)))+'</svg>';
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
