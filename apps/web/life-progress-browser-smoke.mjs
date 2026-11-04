/**
 * Four life routes and a real shadoof project, using touch input in Edge.
 * node apps/web/life-progress-browser-smoke.mjs
 * OPENLIFE_ARTIFACT_DIR selects the screenshot/report directory.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const profile = mkdtempSync(path.join(tmpdir(), "openlife-edge-"));
let debuggingPort;
const output = process.env.OPENLIFE_ARTIFACT_DIR || path.join(root, "artifacts", "life-progress");
mkdirSync(output, { recursive: true });
let server, browser, socket;
let sequence = 0;
const browserErrors = [];
const waiting = new Map();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(f, message, deadline = 14000) {
  const started = Date.now();
  while (Date.now() - started < deadline) {
    try { const result = await f(); if (result) return result; } catch {}
    await sleep(140);
  }
  throw new Error(message);
}
async function startServer() {
  server = spawn(process.execPath, [path.join(root,"apps/web/server.ts")], {
    cwd:root, env:{...process.env,OPENLIFE_PERSISTENCE:"0",PORT:"0"}, stdio:["ignore","pipe","pipe"] });
  let started = "";
  let error = "";
  server.stdout.on("data", d => started += String(d));
  server.stderr.on("data", d => error += String(d));
  return until(() => started.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0],
    "Web server not started: "+error);
}
async function openBrowser(url) {
  browser = spawn(edge, [
    "--headless=new","--disable-gpu","--disable-extensions","--no-first-run",
    "--no-default-browser-check","--disable-features=Translate",
    "--remote-debugging-port=0",`--user-data-dir=${profile}`,url
  ],{stdio:"ignore"});
  debuggingPort = await until(() => Number(readFileSync(path.join(profile,"DevToolsActivePort"),"utf8").split("\n")[0]), "Edge did not publish its private debugging port");
  const page = await until(async () => {
    const reply = await fetch(`http://127.0.0.1:${debuggingPort}/json/list`);
    const list = await reply.json();
    return list.find(p=>p.type==="page" && p.url === url && p.webSocketDebuggerUrl);
  },"No Edge debugging page");
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
    socket.onopen=resolve;socket.onerror=reject;
    setTimeout(()=>reject(new Error("CDP websocket timeout")),8000);
  });
  socket.onmessage=e=>{
    const data=JSON.parse(String(e.data));
    if(data.method === "Runtime.exceptionThrown") browserErrors.push(data.params.exceptionDetails);
    if(data.id && waiting.has(data.id)){
      const {resolve,reject}=waiting.get(data.id);
      waiting.delete(data.id);
      if(data.error) reject(new Error(JSON.stringify(data.error)));
      else resolve(data.result ?? {});
    }
  };
  await cdp("Page.enable");
  await cdp("Runtime.enable");
}
async function cdp(method, params={}) {
  const id=++sequence;
  return new Promise((resolve,reject)=>{
    waiting.set(id,{resolve,reject});
    socket.send(JSON.stringify({id,method,params}));
    setTimeout(()=>{if(waiting.has(id)){waiting.delete(id);reject(new Error(method+" timeout"));}},8500);
  });
}
async function evaluate(js){
  const result=await cdp("Runtime.evaluate",{expression:js,returnByValue:true,awaitPromise:true});
  if(result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
}
async function screenshot(file){
  const result=await cdp("Page.captureScreenshot",{format:"png",fromSurface:true,captureBeyondViewport:false});
  writeFileSync(path.join(output,file),Buffer.from(result.data,"base64"));
  return path.join("artifacts", "mobile-ui",file).replaceAll("\\","/");
}
async function tap(selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:"center"});true`);
  const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();const x=r.left+r.width/2,y=r.top+r.height/2;return {x,y,reachable:e.contains(document.elementFromPoint(x,y))};})()`);
  assert.ok(point.reachable, `touch target is covered: ${selector} ${JSON.stringify(point)}`);
  await cdp("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:point.x,y:point.y}]});
  await cdp("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
}

async function action(type,payload={}) {
  await until(async()=>await evaluate('!document.body.classList.contains("is-busy")'), 'previous action did not finish');
  let result=await evaluate(`window.OpenLifeGame.act(${JSON.stringify(type)},${JSON.stringify(payload)})`);
  if(!result.ok && /活动时间|今天还剩|今天只剩/.test(JSON.stringify(result))) {
    const day=await evaluate('window.OpenLifeGame.act("settlement-locations.end_day",{})');
    assert.ok(day.ok,JSON.stringify(day));
    result=await evaluate(`window.OpenLifeGame.act(${JSON.stringify(type)},${JSON.stringify(payload)})`);
  }
  assert.ok(result.ok,`${type}: ${JSON.stringify(result)} ${!result.ok ? JSON.stringify(await evaluate('window.OpenLifeGame.state().settlement.portableLoad')) : ''}`);
  return result;
}
async function choice(label) {
  const selector=await evaluate(`(()=>{const b=Array.from(document.querySelectorAll('#lsNow button[data-i]')).find(b=>b.querySelector('span')?.textContent===${JSON.stringify(label)});return b ? '#lsNow button[data-i="'+b.dataset.i+'"]' : null;})()`);
  assert.ok(selector,`choice visible: ${label}`); await tap(selector);
  await until(async()=>await evaluate('!document.body.classList.contains("is-busy")'), 'choice did not finish');
  await sleep(160);
}
try{
  const url=await startServer(); await openBrowser(url+'/life');
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await until(async()=>await evaluate('Boolean(window.OpenLifeGame?.state()?.settlement)'),'home not ready');
  await sleep(200);
  await tap('#homeNewLife');
  await until(async()=>await evaluate('Boolean(document.querySelector("#newLifeModal:not([hidden])"))'),'new-life form absent');
  await evaluate('document.querySelector("#newSeed").value="7";true');
  await tap('#newLifeForm button[type=submit]');
  await until(async()=>await evaluate('document.querySelectorAll(".ls-route").length===4'),'four routes not rendered');
  await until(async()=>await evaluate('!document.body.classList.contains("is-busy")'), 'new life did not finish');
  const before=await(await fetch(url+'/api/state')).json();
  // 留在家中的开局行李继续归自己所有，空出双手运送项目材料。
  for (const item of before.settlement.objects.filter(o => o.placement === '在手中')) {
    await action('world-objects.place', { objectId: item.id, placeId: before.settlement.placeId });
  }
  for(const width of [360,390,430]){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});
    assert.equal(await evaluate('document.querySelectorAll(".ls-route").length'),4);
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'horizontal overflow');
    await evaluate('document.querySelector(".ls-route").parentElement.scrollIntoView({block:"start",behavior:"instant"});true');
    await screenshot(`routes-${width}.png`);
  }
  await tap('.ls-route summary');
  assert.ok(await evaluate('document.querySelector(".ls-route").open'), 'route did not expand by touch');
  await screenshot('food-route-expanded.png');
  await tap('.ls-route summary');
  await choice('想办法让打水省力');
  await until(async()=>await evaluate('window.OpenLifeGame.state().outlook.progress.improvement.stage==="idea"'),'project not started');
  const go=id=>action('settlement-locations.arrive',{placeId:id,travelMode:'local'});
  const draw=id=>action('settlement-locations.draw',{resourceId:id});
  await go('place:reedbed'); await draw('resource:reed');
  await action('settlement-locations.craft',{recipeId:'recipe:twist-rope'});
  await go('place:chestnut-wood'); await draw('resource:wood'); await draw('resource:wood');
  await go('place:stone-beach'); await draw('resource:stone'); await go('place:river');
  await choice('给桔槔备料');
  if(await evaluate('window.OpenLifeGame.state().settlement.dailyActivity.remaining<2')) await action('settlement-locations.end_day');
  await choice('调平配重，试做桔槔');
  if(await evaluate('window.OpenLifeGame.state().settlement.dailyActivity.remaining<2')) await action('settlement-locations.end_day');
  await choice('在河边安装桔槔');
  await until(async()=>await evaluate('window.OpenLifeGame.state().outlook.progress.improvement.stage==="installed"'),'project not installed');
  await screenshot('shadoof-installed.png');
  const saved=await(await fetch(url+'/api/save',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).json();
  const loaded=await(await fetch(url+'/api/load',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({save:saved.save})})).json();
  assert.ok(loaded.result.ok,JSON.stringify(loaded));
  await cdp('Page.reload');
  await until(async()=>await evaluate('Boolean(document.querySelector("#continueLife"))'),'continue button absent');
  await tap('#continueLife');
  await until(async()=>await evaluate('document.querySelectorAll(".ls-route").length===4'),'resume routes absent');
  assert.equal(await evaluate('window.OpenLifeGame.state().outlook.progress.improvement.stage'),'installed');
  assert.deepEqual(browserErrors,[]);
  const report={newLife:true,routes:4,widths:[360,390,430],realMaterialGathering:true,trialAndInstall:true,saveLoad:true,resume:true,elapsedDays:loaded.state.tick-before.tick,uncaughtErrors:0};
  writeFileSync(path.join(output,'acceptance.json'),JSON.stringify(report,null,2));
  console.log('LIFE_PROGRESS_ACCEPTANCE',JSON.stringify(report));
}finally{
  if(browserErrors.length) console.error("BROWSER_ERRORS", JSON.stringify(browserErrors));
  if(socket) { try { await cdp("Browser.close"); } catch {} }
  if(socket)socket.close();
  if(browser)browser.kill();
  if(server)server.kill();
  const safeProfile=path.resolve(profile);
  if(path.dirname(safeProfile)!==path.resolve(tmpdir()) || !path.basename(safeProfile).startsWith("openlife-edge-")) throw new Error("Unexpected browser profile cleanup target");
  try{rmSync(safeProfile,{recursive:true,force:true,maxRetries:3});}catch{}
}
