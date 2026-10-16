/**
 * Current text-mode smoke runner in real Edge. Artwork is not required.
 * node apps/web/dev-browser-smoke.mjs
 * Writes screenshots under artifacts/; preserves existing files.
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
const output = path.join(root, "artifacts", "mobile-ui");
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
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:"nearest"});true`);
  const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();const x=r.left+r.width/2,y=r.top+r.height/2;return {x,y,reachable:e.contains(document.elementFromPoint(x,y))};})()`);
  assert.ok(point.reachable, `touch target is covered: ${selector} ${JSON.stringify(point)}`);
  await cdp("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:point.x,y:point.y}]});
  await cdp("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
}
try{
  const url=await startServer();
  assert.equal((await fetch(url + "/")).status, 200);
  assert.equal((await fetch(url + "/api/state")).status, 200);
  await openBrowser(url+"/");
  await cdp("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await until(async()=>await evaluate('Boolean(document.querySelector("#screen-life"))'),"Frontend scripts did not initialize");
  assert.equal(await evaluate('document.documentElement.dataset.view'), "text");
  await tap("#homeNewLife");
  await until(async()=>await evaluate('Boolean(document.querySelector("#newLifeModal:not([hidden])"))'),"New life form did not open");
  await tap("#newLifeForm button[type=submit]");
  await until(async()=>await evaluate('document.body.dataset.screen==="activities" && !document.body.classList.contains("is-busy")'),"New life did not open");
  const before = await (await fetch(url + "/api/state")).json();
  await tap("#sceneMapButton");
  const destination = await evaluate('Array.from(document.querySelectorAll("#sceneQuickActions [data-scene-quick]")).find(b=>!b.disabled)?.dataset.sceneQuick');
  assert.ok(destination !== undefined, "a reachable destination must be offered");
  await tap('#sceneQuickActions [data-scene-quick="'+destination+'"]:not([disabled])');
  await until(async()=> (await (await fetch(url + "/api/state")).json()).settlement.placeId !== before.settlement.placeId,"movement must reach the authoritative world");
  await until(async()=>await evaluate('!document.body.classList.contains("is-busy")'),"action did not complete");
  const layoutChecks=[];
  for(const [width,height] of [[360,800],[390,844],[430,932],[1280,820]]) {
    await cdp("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<600});
    for(const route of ["activities","works","people","character"]) {
      await evaluate(`document.querySelector('#appNavigation [data-route="${route}"]').click();true`);
      const layout=await evaluate('({scroll:document.documentElement.scrollWidth,nav:Array.from(document.querySelectorAll("#appNavigation>button")).map(b=>({h:b.getBoundingClientRect().height,w:b.getBoundingClientRect().width}))})');
      assert.ok(layout.scroll<=width+1, `overflow ${width} ${route}: ${layout.scroll}`);
      assert.ok(width >= 600 || layout.nav.every(b=>b.h>=48&&b.w>=48), `small navigation target ${width} ${route}: ${JSON.stringify(layout.nav)}`);
      if (route === "character") {
        const origin = await evaluate('(()=>{const e=document.querySelector("#originCard");return {hidden:e.hidden,width:e.getBoundingClientRect().width,parent:e.parentElement.getBoundingClientRect().width};})()');
        assert.ok(origin.hidden || origin.width >= origin.parent * 0.75, "origin story must span a readable card, not the portrait column");
      }
      layoutChecks.push({width,route,scroll:layout.scroll});
    }
    await screenshot(`current-${width}px.png`);
  }
  await cdp("Page.reload");
  await until(async()=>await evaluate('Boolean(document.querySelector("#screen-life"))'),"reload failed");
  await tap("#continueLife");
  await until(async()=>await evaluate('document.body.dataset.screen==="activities"'),"continue failed");
  assert.deepEqual(browserErrors,[],"no uncaught browser errors");
  const acceptance={mode:"text",pageAndState:true,newLife:true,realMovement:true,reloadContinue:true,layoutChecks,uncaughtErrors:0};
  writeFileSync(path.join(output,"acceptance.json"),JSON.stringify(acceptance,null,2));
  console.log("MOBILE_ACCEPTANCE",JSON.stringify(acceptance));
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
