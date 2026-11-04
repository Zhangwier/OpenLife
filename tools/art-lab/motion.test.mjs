import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context={window:{}};
vm.runInNewContext(fs.readFileSync(new URL('./motion.js',import.meta.url),'utf8'),context);
const {createGrid,path,step}=context.window.ArtMotion;

test('curved-road path remains on its road and cannot cut the corner',()=>{
  const width=40,height=40,mask=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(x<12||y>27)mask[y*width+x]=1;
  const grid=createGrid(mask,width,height),route=path(grid,{x:6,y:6},{x:34,y:34});
  assert.ok(route&&route.points.length>2);
  const actor={x:6,y:6};
  for(let frame=0;frame<1000;frame++){
    const moving=step(actor,route,16);
    assert.equal(mask[actor.y*width+actor.x],1,'actor left road');
    assert.ok(Number.isInteger(actor.x)&&Number.isInteger(actor.y));
    if(!moving)break;
  }
  assert.equal(actor.x,34);assert.equal(actor.y,34);
});

test('disconnected road islands return no route',()=>{
  const mask=new Uint8Array(40*20);
  for(let y=0;y<20;y++)for(let x=0;x<40;x++)if(x<8||x>31)mask[y*40+x]=1;
  assert.equal(path(createGrid(mask,40,20),{x:2,y:2},{x:38,y:14}),null);
});

test('continuous movement reaches the same snapped destination at different frame rates',()=>{
  const grid=createGrid(new Uint8Array(80*20).fill(1),80,20);
  for(const dt of [16,40,70]){
    const actor={x:2,y:10},route=path(grid,actor,{x:74,y:10});
    for(let i=0;i<1000;i++)if(!step(actor,route,dt))break;
    assert.equal(actor.x,74);assert.equal(actor.y,10);assert.equal(actor.facing,'right');
  }
});


test('open ground permits grass travel and routes around solid footprints',()=>{
  const {groundMask}=context.window.ArtMotion;
  const mask=groundMask(100,80,[{kind:'house',x:50,y:45}],{house:[-12,-22,12,0]});
  assert.equal(mask[10*100+30],1);
  assert.equal(mask[35*100+50],0);
  const actor={x:10,y:34},route=path(createGrid(mask,100,80),actor,{x:90,y:34});
  assert.ok(route);
  for(let i=0;i<1000;i++) { const moving=step(actor,route,16);assert.equal(mask[actor.y*100+actor.x],1);if(!moving)break; }
  assert.equal(actor.x,90);
});

test('tree canopy and plants do not block ground; trunk does',()=>{
  const mask=context.window.ArtMotion.groundMask(100,100,[{kind:'tree',x:50,y:70},{kind:'flower',x:20,y:20}],{tree:[-4,-5,4,0]});
  assert.equal(mask[30*100+50],1);assert.equal(mask[20*100+20],1);assert.equal(mask[70*100+50],0);
});
