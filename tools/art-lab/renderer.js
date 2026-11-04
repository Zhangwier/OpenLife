(async()=>{
'use strict';
if(!window.ART_MANIFEST||!window.ART_SOURCES)throw Error('请先在本目录运行 python prepare.py，再刷新页面。');
const W=window.ART_MANIFEST.scene.width,H=window.ART_MANIFEST.scene.height,canvas=document.getElementById('scene'),ctx=canvas.getContext('2d',{alpha:false});
canvas.width=W;canvas.height=H;
function make(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
const images=Object.fromEntries(await Promise.all(Object.entries(window.ART_SOURCES).map(([name,src])=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve([name,im]);im.onerror=()=>reject(Error(name+' 载入失败'));im.src=src;}))));
const meta=window.ART_MANIFEST.assets;
const art={},masks={};
for(const [name,m] of Object.entries(meta)){const c=make(...m.size),g=c.getContext('2d',{willReadFrequently:true});g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.drawImage(images[m.source||name],...m.crop,0,0,...m.size);const d=g.getImageData(0,0,...m.size),p=d.data;for(let i=0;i<p.length;i+=4){if(p[i+3]<(m.alphaCutoff??190)){p[i]=p[i+1]=p[i+2]=p[i+3]=0;continue;}p[i+3]=255;if(m.tint)for(let c=0;c<3;c++)p[i+c]=Math.round(p[i+c]*m.tint[c]);if(p[i]>180&&p[i+1]<80&&p[i+2]<85){p[i+3]=0;continue;}}g.putImageData(d,0,0);art[name]=c;masks[name]=p;}
function sample(im){const c=make(W,H),g=c.getContext('2d');g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.drawImage(im,0,0,W,H);return g.getImageData(0,0,W,H).data;}
const rawGrass=sample(images.lawn),rawDirt=sample(images.ground);
const initial=window.ART_MANIFEST.scene.objects;
let objects=structuredClone(initial),selected=null,drag=null,scale=1,camera={x:0,y:0,w:W,h:H},wind=!matchMedia('(prefers-reduced-motion: reduce)').matches,windTime=0,last=performance.now(),light=true,inventory={flower:0,tallgrass:0},walkTarget=null;
const audit={fractionalDraws:0,scaledWorldDraws:0,frames:0,walkFrames:[],fadedTrees:[]};
let route=null,routeDistance=0,walkFrame=-1,occlusionEnabled=true,editing=false;
const fadeOpacity=new Map(),bursts=[];
let roadGrid;
let walkMask;
function rebuildWalkability(){walkMask=window.ArtMotion.groundMask(W,H,objects,window.ART_MANIFEST.colliders);roadGrid=window.ArtMotion.createGrid(walkMask,W,H);}
const walkingFrames=[],walkingLeft=[];
const walkDef=window.ART_MANIFEST.animations.walk;
function mirror(source){const c=make(source.width,source.height),g=c.getContext('2d');g.imageSmoothingEnabled=false;g.translate(c.width,0);g.scale(-1,1);g.drawImage(source,0,0);return c;}
for(const crop of walkDef.frames){const c=make(...walkDef.nativeSize),g=c.getContext('2d');g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.drawImage(images[walkDef.source],...crop,0,0,...walkDef.nativeSize);const d=g.getImageData(0,0,c.width,c.height);for(let i=0;i<d.data.length;i+=4){const a=d.data;if(a[i+3]<220||(a[i]>180&&a[i+1]<80&&a[i+2]<85)){a[i]=a[i+1]=a[i+2]=a[i+3]=0;}else a[i+3]=255;}g.putImageData(d,0,0);walkingFrames.push(c);walkingLeft.push(mirror(c));}
const idleLeft=mirror(art.person);

const terrain=make(W,H),terrainCtx=terrain.getContext('2d'),lighting=make(W,H),lightingCtx=lighting.getContext('2d');
function hash(x,y,seed=1){let n=Math.imul(x+seed*97,374761393)^Math.imul(y+seed*41,668265263);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967295;}
function noise(x,y,step,seed){const gx=Math.floor(x/step),gy=Math.floor(y/step),u=x/step-gx,v=y/step-gy,fx=u*u*(3-2*u),fy=v*v*(3-2*v);return (hash(gx,gy,seed)*(1-fx)+hash(gx+1,gy,seed)*fx)*(1-fy)+(hash(gx,gy+1,seed)*(1-fx)+hash(gx+1,gy+1,seed)*fx)*fy;}
function curve(points,n=32){const out=[];for(let i=0;i<=n;i++){const t=i/n,u=1-t;out.push([u*u*u*points[0][0]+3*u*u*t*points[1][0]+3*u*t*t*points[2][0]+t*t*t*points[3][0],u*u*u*points[0][1]+3*u*u*t*points[1][1]+3*u*t*t*points[2][1]+t*t*t*points[3][1]]);}return out;}
function distance(x,y,a,b){const vx=b[0]-a[0],vy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*vx+(y-a[1])*vy)/(vx*vx+vy*vy)));return Math.hypot(x-a[0]-vx*t,y-a[1]-vy*t);}
const routes=[{p:curve([[231,472],[253,359],[305,295],[390,255]]),r:21,taper:13},{p:curve([[390,255],[474,206],[625,221],[806,202]]),r:21},{p:curve([[390,255],[287,235],[223,191],[183,116]]),r:15}];
const roadMask=new Uint8Array(W*H);
function buildGround(){const data=terrainCtx.createImageData(W,H),d=data.data;for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4;let edge=Infinity;for(const route of routes){let dis=Infinity;for(let k=1;k<route.p.length;k++)dis=Math.min(dis,distance(x,y,route.p[k-1],route.p[k])-route.r-(route.taper||0)*(1-k/(route.p.length-1)));edge=Math.min(edge,dis);}edge=Math.min(edge,(Math.hypot((x-181)/1.5,y-122)-24));edge+=(noise(x,y,18,4)-.5)*7+(noise(x,y,5,5)-.5)*2;const road=edge<0,fringe=edge>=0&&edge<3;roadMask[y*W+x]=road?1:0;let r,g,b;if(road){r=rawDirt[i]*.94;g=rawDirt[i+1]*.94;b=rawDirt[i+2]*.95;const worn=noise(x,y,44,7)-.5;r+=worn*10;g+=worn*8;b+=worn*5;}else{r=rawGrass[i]*.85;g=rawGrass[i+1]*.87;b=rawGrass[i+2]*.9;if(fringe&&hash(x,y,16)>.72){r+=11;g+=10;b+=3;}}if(edge>-1.4&&edge<.6){r*=.9;g*=.92;b*=.9;}else if(edge>=.6&&edge<2.2){r+=5;g+=7;b+=1;}
if(edge<0&&edge>-2.5&&hash(x,y,23)>.83){r=rawGrass[i]*.85;g=rawGrass[i+1]*.87;b=rawGrass[i+2]*.9;}
d[i]=r;d[i+1]=g;d[i+2]=b;d[i+3]=255;}terrainCtx.putImageData(data,0,0);buildLighting();}
function buildLighting(){const data=lightingCtx.createImageData(W,H),d=data.data;const trees=objects.filter(o=>!o.removed&&['tree','treeFront','slender','birch'].includes(o.kind));for(let y=0;y<H;y++)for(let x=0;x<W;x++){let amount=0;for(const o of trees){const w=art[o.kind].width,q=((x-o.x-22)/(w*.61))**2+((y-o.y-5)/(w*.27))**2;if(q<2.2)amount=Math.max(amount,Math.exp(-q*1.5)*.26);}const forest=(1-Math.min(1,Math.hypot((x-395)/310,(y-233)/180)))*.015;amount=Math.max(0,amount-forest);const i=(y*W+x)*4;d[i]=25;d[i+1]=42;d[i+2]=36;d[i+3]=Math.round(amount*255);}lightingCtx.putImageData(data,0,0);}
buildGround();
rebuildWalkability();
function blit(img,sx,sy,w,h,x,y){if(![sx,sy,w,h,x,y].every(Number.isInteger))audit.fractionalDraws++;ctx.drawImage(img,sx,sy,w,h,x,y,w,h);}
const treeKinds=['tree','treeFront','slender','birch'];
function overlapsCanopy(o,p){
  if(!treeKinds.includes(o.kind)||p.y>=o.y)return false;
  const a=art[o.kind],left=o.x-Math.floor(a.width/2),top=o.y-a.height,mask=masks[o.kind];
  for(const dx of [-3,0,3])for(const dy of [-10,-22,-32]){
    const x=p.x+dx-left,y=p.y+dy-top;
    if(x>=0&&x<a.width&&y>=0&&y<a.height*.75&&mask[(y*a.width+x)*4+3])return true;
  }
  return false;
}
function objectSeed(id){let value=2166136261;for(const c of id)value=Math.imul(value^c.charCodeAt(0),16777619);return value>>>0;}
function drawObject(o,index){
  let a=art[o.kind];
  if(o.kind==='person'){
    a=route&&walkFrame>=0?(o.facing==='left'?walkingLeft:walkingFrames)[walkFrame]:o.facing==='left'?idleLeft:art.person;
  }
  const x=o.x-camera.x-Math.floor(a.width/2),y=o.y-camera.y-a.height;
  if(x+a.width<-3||x>camera.w+3||y+a.height<0||y>camera.h)return;
  if(['house','person','fence'].includes(o.kind)){blit(a,0,0,a.width,a.height,x,y);return;}
  const isTree=treeKinds.includes(o.kind),phase=Math.sin(windTime/(isTree?1600:900)+hash(objectSeed(o.id),8,3)*6.28),amp=isTree?1.2:.9;
  const crownLimit=isTree?a.height*.75:a.height;
  for(let row=0;row<a.height;row++){
    const bend=row<crownLimit?Math.round(phase*(1-row/crownLimit)*amp):0;
    ctx.globalAlpha=isTree&&row<crownLimit?(fadeOpacity.get(o.id)??1):1;
    blit(a,0,row,a.width,1,x+bend,y+row);
  }
  ctx.globalAlpha=1;
}
function startWalk(target){
  if(target.x<0||target.y<0||target.x>=W||target.y>=H||!walkMask[Math.floor(target.y)*W+Math.floor(target.x)])return false;
  const p=objects.find(o=>o.id==='player'),candidate=window.ArtMotion.path(roadGrid,p,target);
  if(!candidate){notice('这里暂时走不到');return false;}
  route=candidate;walkTarget=target;routeDistance=0;selected=null;ui();return true;
}
function draw(now=performance.now()){
  const dt=Math.min(70,Math.max(0,now-last));last=now;
  if(wind&&!document.hidden)windTime+=dt;
  const player=objects.find(o=>o.id==='player');
  if(route&&!document.hidden){
    const moving=window.ArtMotion.step(player,route,dt);
    routeDistance=route.distance;walkFrame=Math.floor(routeDistance/walkDef.stepPixels)%walkingFrames.length;
    if(!audit.walkFrames.includes(walkFrame))audit.walkFrames.push(walkFrame);
    if(!moving){route=null;walkTarget=null;walkFrame=-1;}
  }
  audit.fadedTrees=[];
  for(const o of objects.filter(o=>!o.removed&&treeKinds.includes(o.kind))){
    const hidden=occlusionEnabled&&overlapsCanopy(o,player),target=hidden?.35:1,current=fadeOpacity.get(o.id)??1;
    fadeOpacity.set(o.id,current+Math.sign(target-current)*Math.min(Math.abs(target-current),dt/180));
    if(hidden)audit.fadedTrees.push(o.id);
  }
  ctx.globalAlpha=1;ctx.imageSmoothingEnabled=false;
  blit(terrain,camera.x,camera.y,camera.w,camera.h,0,0);
  if(light)blit(lighting,camera.x,camera.y,camera.w,camera.h,0,0);
  const visible=objects.filter(o=>!o.removed).sort((a,b)=>a.y-b.y||a.id.localeCompare(b.id));
  for(const o of visible){
    if(!['house','person','fence'].includes(o.kind))continue;
    ctx.fillStyle=o.kind==='person'?'rgba(35,42,29,.28)':'rgba(46,37,26,.15)';
    if(o.kind==='person')ctx.fillRect(o.x-camera.x-6,o.y-camera.y,14,2);
    else ctx.fillRect(o.x-camera.x-72,o.y-camera.y,151,2);
  }
  visible.forEach(drawObject);
  for(let i=bursts.length-1;i>=0;i--){
    const b=bursts[i],t=(now-b.born)/650;if(t>=1){bursts.splice(i,1);continue;}
    ctx.globalAlpha=t<.5?1:.55;
    for(let j=0;j<6;j++){
      const angle=j*Math.PI/3,dx=Math.round(Math.cos(angle)*t*9),dy=Math.round(Math.sin(angle)*t*5-t*8);
      ctx.fillStyle=b.kind==='flower'?(j%2?'#ece2b8':'#aaab6a'):'#8e9b62';
      ctx.fillRect(b.x-camera.x+dx,b.y-camera.y-9+dy,1,1);
    }
  }
  ctx.globalAlpha=1;
  if(selected){const o=objects.find(o=>o.id===selected&&!o.removed);if(o){ctx.fillStyle='#ded5a9';ctx.fillRect(o.x-camera.x-4,o.y-camera.y+1,9,1);ctx.fillRect(o.x-camera.x-5,o.y-camera.y,1,1);ctx.fillRect(o.x-camera.x+5,o.y-camera.y,1,1);}}
  audit.frames++;
  const preview=document.getElementById('walkPreview');if(preview&&preview.getClientRects().length){const g=preview.getContext('2d');g.fillStyle='#24352b';g.fillRect(0,0,256,152);g.imageSmoothingEnabled=false;walkingFrames.forEach((frame,i)=>g.drawImage(frame,i*64+8,18,frame.width*3,frame.height*3));g.fillStyle='#b9c18c';g.fillRect(Math.floor(now/140)%4*64+7,139,50,2);}
}
function animate(t){draw(t);requestAnimationFrame(animate);}
function ui(){document.getElementById('wind').textContent='风：'+(wind?'开':'停');document.getElementById('light').textContent='光照：'+(light?'开':'停');document.getElementById('status').textContent=camera.w+'×'+camera.h+' · '+scale+'倍 · 野花 '+inventory.flower+' / 草 '+inventory.tallgrass;const o=objects.find(o=>o.id===selected&&!o.removed);document.getElementById('panel').hidden=!o;if(o){document.getElementById('name').textContent=o.kind==='flower'?'野花':o.kind==='tallgrass'?'野草':o.kind==='person'?'我':o.kind==='house'?'居所':o.kind==='fence'?'木栅栏':o.kind.startsWith('shrub')?'灌木':'树';document.getElementById('description').textContent='独立物件 · 可拖动调整位置';document.getElementById('collect').hidden=!['flower','tallgrass'].includes(o.kind);document.getElementById('collect').textContent=o.kind==='flower'?'采摘':'割草';}}
function layout(){const mode=document.getElementById('scale').value,frame=document.getElementById('frame');let width=Math.min(frame.clientWidth,frame.clientHeight/camera.h*camera.w);scale=mode==='auto'?Math.max(1,Math.floor(width/camera.w)):Number(mode);canvas.style.width=camera.w*scale+'px';canvas.style.height=camera.h*scale+'px';ui();alignDisplay();}
function notice(message){const toast=document.getElementById('toast');toast.textContent=message;toast.hidden=false;clearTimeout(notice.timer);notice.timer=setTimeout(()=>toast.hidden=true,1500);}
function alignDisplay(){
  const wrap=canvas.parentElement;
  wrap.style.left='0px';wrap.style.top='0px';
  const rect=canvas.getBoundingClientRect(),dpr=devicePixelRatio||1;
  wrap.style.position='relative';
  wrap.style.left=(Math.round(rect.left*dpr)/dpr-rect.left)+'px';
  wrap.style.top=(Math.round(rect.top*dpr)/dpr-rect.top)+'px';
}
function collect(){const o=objects.find(o=>o.id===selected&&!o.removed);if(!o||!['flower','tallgrass'].includes(o.kind))return;o.removed=true;inventory[o.kind]++;bursts.push({x:o.x,y:o.y,kind:o.kind,born:performance.now()});selected=null;notice((o.kind==='flower'?'野花':'草')+' +1');ui();draw();}
function point(e){const r=canvas.getBoundingClientRect();return{x:Math.floor((e.clientX-r.left)/scale)+camera.x,y:Math.floor((e.clientY-r.top)/scale)+camera.y};}
function hit(p){const list=objects.filter(o=>!o.removed).sort((a,b)=>b.y-a.y);for(const o of list){const a=art[o.kind],x=p.x-o.x+Math.floor(a.width/2),y=p.y-o.y+a.height;if(x>=0&&x<a.width&&y>=0&&y<a.height&&masks[o.kind][(y*a.width+x)*4+3])return o;}return list.find(o=>['flower','tallgrass'].includes(o.kind)&&Math.hypot(p.x-o.x,p.y-o.y+8)<8);}
canvas.onpointerdown=e=>{
  const p=point(e),inside=p.x>=0&&p.x<W&&p.y>=0&&p.y<H;
  if(!editing&&inside){const picked=hit(p);if(!picked||!['flower','tallgrass'].includes(picked.kind)||e.shiftKey){selected=null;startWalk(p);ui();return;}}
  const o=hit(p);selected=o?.id??null;
  drag=editing&&o?{id:o.id,dx:o.x-p.x,dy:o.y-p.y}:null;
  if(drag){if(o.id==='player'){route=null;walkFrame=-1;}canvas.setPointerCapture(e.pointerId);}
  else if(!o&&inside)startWalk(p);
  ui();
};
canvas.onpointermove=e=>{if(!drag)return;const p=point(e),o=objects.find(o=>o.id===drag.id);o.x=p.x+drag.dx;o.y=p.y+drag.dy;draw();};
for(const ev of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(ev,()=>{if(drag&&treeKinds.includes(objects.find(o=>o.id===drag.id).kind))buildLighting();if(drag)rebuildWalkability();drag=null;});
document.getElementById('collect').onclick=collect;document.getElementById('close').onclick=()=>{selected=null;ui();};
document.getElementById('approach').onclick=()=>{const o=objects.find(o=>o.id===selected);if(o)startWalk({x:o.x,y:o.y+8});};
document.getElementById('wind').onclick=()=>{wind=!wind;ui();};document.getElementById('light').onclick=()=>{light=!light;ui();};
document.getElementById('occlusion').onclick=()=>{occlusionEnabled=!occlusionEnabled;document.getElementById('occlusion').textContent='树冠避让：'+(occlusionEnabled?'开':'关');};
document.getElementById('editing').onclick=()=>{editing=!editing;document.getElementById('editing').textContent='摆放：'+(editing?'开':'关');};
document.getElementById('reset').onclick=()=>{objects=structuredClone(initial);selected=null;inventory={flower:0,tallgrass:0};route=null;walkTarget=null;walkFrame=-1;fadeOpacity.clear();bursts.length=0;buildLighting();rebuildWalkability();ui();};
document.getElementById('scale').onchange=layout;
document.getElementById('settings').onclick=()=>{const toolbar=document.querySelector('.toolbar');toolbar.hidden=!toolbar.hidden;document.getElementById('settings').setAttribute('aria-expanded',String(!toolbar.hidden));};
addEventListener('keydown',e=>{if(e.key==='Escape'){document.querySelector('.toolbar').hidden=true;document.getElementById('settings').setAttribute('aria-expanded','false');route=null;walkTarget=null;walkFrame=-1;selected=null;ui();}});
document.getElementById('camera').onclick=()=>{const near=camera.w===W;camera=near?{x:144,y:96,w:480,h:270}:{x:0,y:0,w:W,h:H};canvas.width=camera.w;canvas.height=camera.h;document.getElementById('camera').textContent=near?'回到全景':'靠近看';layout();draw();};
document.getElementById('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.getElementById('frame').requestFullscreen();}catch{}};addEventListener('resize',layout);document.addEventListener('fullscreenchange',layout);document.addEventListener('visibilitychange',()=>last=performance.now());
window.artDemo={canvas,art,meta,audit,draw,walkingFrames,setAnimationTime(t){windTime=t;last=performance.now();draw(last)},captureState(){return {version:window.ART_MANIFEST.version,windTimeMs:windTime,light,camera:{...camera},scale,seed:window.ART_MANIFEST.scene.seed,objects:objects.map(o=>({id:o.id,x:o.x,y:o.y,removed:!!o.removed}))}},overlapsCanopy,fadeOpacity,get roadGrid(){return roadGrid},get walkMask(){return walkMask},startWalk,get route(){return route},get walkFrame(){return walkFrame},get objects(){return objects},get camera(){return camera},get scale(){return scale},get inventory(){return inventory},get windTime(){return windTime},get roadMask(){return roadMask},get light(){return light},setWind(v){wind=v;ui()},select(id){selected=id;ui()},collect,exportNative(){draw();return canvas.toDataURL('image/png')}};
new ResizeObserver(()=>layout()).observe(document.getElementById('frame'));
document.getElementById('loading').textContent='项目外视觉小样：采摘与人物走动仅作用于本页，尚未接入游戏规则和存档。';layout();requestAnimationFrame(animate);
})().catch(e=>{document.getElementById('loading').textContent=e.message;console.error(e);});
