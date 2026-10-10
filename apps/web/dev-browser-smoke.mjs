/**
 * Manual smoke runner for the real Edge browser, without Playwright.
 * node apps/web/dev-browser-smoke.mjs
 * Writes screenshots under artifacts/; preserves existing files.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const profile = mkdtempSync(path.join(tmpdir(), "openlife-edge-"));
const debuggingPort = 9337;
const output = path.join(root, "artifacts");
mkdirSync(output, { recursive: true });
let server, browser, socket;
let sequence = 0;
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
    cwd:root, env:{...process.env,PORT:"0"}, stdio:["ignore","pipe","pipe"] });
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
    `--remote-debugging-port=${debuggingPort}`,`--user-data-dir=${profile}`,url
  ],{stdio:"ignore"});
  const page = await until(async () => {
    const reply = await fetch(`http://127.0.0.1:${debuggingPort}/json/list`);
    const list = await reply.json();
    return list.find(p=>p.type==="page" && p.webSocketDebuggerUrl);
  },"No Edge debugging page");
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
    socket.onopen=resolve;socket.onerror=reject;
    setTimeout(()=>reject(new Error("CDP websocket timeout")),8000);
  });
  socket.onmessage=e=>{
    const data=JSON.parse(String(e.data));
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
  return path.join("artifacts",file).replaceAll("\\","/");
}
try{
  const url=await startServer();
  await openBrowser(url+"/");
  await until(async()=>await evaluate('Boolean(document.querySelector("#screen-life"))'),"Frontend scripts did not initialize");
  console.log("BOOT", JSON.stringify(await evaluate('({route:document.body.dataset.screen,screen:!!document.querySelector("#screen-life"),home:!!document.querySelector("#homeNewLife")})')));
  await evaluate('document.querySelector("#homeNewLife").click();true');
  await until(async()=>await evaluate('Boolean(document.querySelector("#newLifeModal:not([hidden])"))'),"New life form did not open");
  await evaluate('document.querySelector("#newLifeForm button[type=submit]").click();true');
  await until(async()=>await evaluate('document.body.dataset.screen==="life"'),"New life did not open");
  await evaluate('document.querySelector("#appNavigation [data-route=activities]").click();true');
  await until(async()=>await evaluate('document.body.dataset.screen==="activities" && Boolean(document.querySelector("#settlementScene:not([hidden])"))'),"Settlement scene unavailable");

  // Real mobile rendering, click walking focus, then a real nearby person.
  await cdp("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  const defaultActions=await evaluate('document.querySelectorAll("#sceneActions [data-action]").length');
  assert.equal(defaultActions,0,"no commands should spill out before choosing a target");
  await evaluate('document.querySelector("#sceneActions [data-focus=walk]").click();true');
  const movement=await evaluate('document.querySelectorAll("#sceneActions [data-action]").length');
  assert.ok(movement>0,"walking destinations should appear after selection");
  await evaluate('document.querySelector("#sceneActions [data-focus=close]").click();true');
  const people=await evaluate('document.querySelectorAll("#sceneNeighbours [data-person]").length');
  let greeting=0;
  if(people){
    await evaluate('document.querySelector("#sceneNeighbours [data-person]").click();true');
    greeting=await evaluate('document.querySelectorAll("#sceneActions [data-action=\\"settlement-locations.talk\\"]").length');
    assert.equal(greeting,1,"one real nearby person should offer a conversation");
  }
  const mobile=await evaluate('({screen:document.body.dataset.screen,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,nav:getComputedStyle(document.querySelector("#appNavigation")).position,personCount:document.querySelectorAll("#sceneNeighbours [data-person]").length})');
  assert.equal(mobile.nav,"fixed","bottom navigation on 390px screen");
  assert.ok(mobile.scrollWidth<=mobile.width+4,`mobile overflow: ${JSON.stringify(mobile)}`);
  const mobilePath=await screenshot("ux-390px-context.png");
  await evaluate('document.querySelector("#appNavigation [data-route=works]").click();true');
  await until(async()=>await evaluate('document.body.dataset.screen==="works"'),"Backpack route did not work");
  assert.ok(await evaluate('Boolean(document.querySelector("#portableOverview"))'),"real carry summary missing");
  const packPath=await screenshot("ux-390px-backpack.png");

  await cdp("Emulation.setDeviceMetricsOverride",{width:1280,height:820,deviceScaleFactor:1,mobile:false});
  await evaluate('document.querySelector("#appNavigation [data-route=activities]").click();true');
  await sleep(200);
  const desktopPath=await screenshot("ux-1280px-settlement.png");
  console.log(JSON.stringify({ok:true,mobile,movement,greeting,
    screenshots:[mobilePath,packPath,desktopPath]}));
}finally{
  if(socket)socket.close();
  if(browser)browser.kill();
  if(server)server.kill();
  try{rmSync(profile,{recursive:true,force:true,maxRetries:3});}catch{}
}
