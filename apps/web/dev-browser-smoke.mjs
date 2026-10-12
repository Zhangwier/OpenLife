/**
 * Manual smoke runner for the real Edge browser, without Playwright.
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
  await openBrowser(url+"/");
  await until(async()=>await evaluate('Boolean(document.querySelector("#screen-life"))'),"Frontend scripts did not initialize");
  console.log("BOOT", JSON.stringify(await evaluate('({route:document.body.dataset.screen,screen:!!document.querySelector("#screen-life"),home:!!document.querySelector("#homeNewLife")})')));
  await evaluate('document.querySelector("#homeNewLife").click();true');
  await until(async()=>await evaluate('Boolean(document.querySelector("#newLifeModal:not([hidden])"))'),"New life form did not open");
  await evaluate('document.querySelector("#newLifeForm button[type=submit]").click();true');
  await until(async()=>await evaluate('document.body.dataset.screen==="activities"'),"New life did not open in the playable settlement");
  await until(async()=>await evaluate('document.body.dataset.screen==="activities" && Boolean(document.querySelector("#settlementScene:not([hidden])"))'),"Settlement scene unavailable");
  assert.ok(await evaluate('Boolean(document.querySelector("#communityFeed [data-story-action]"))'),"the living community offers a real optional next step");
  await until(async()=>await evaluate('document.querySelector("#sceneBackdrop").complete && document.querySelector("#sceneBackdrop").naturalWidth > 0'),"Painted SVG scene failed to load");
  assert.ok(await evaluate('Boolean(document.querySelector("#sceneHotspots [data-person]"))'),"painted NPC hotspot is missing");
  const artStatus = await evaluate('(async()=>{return await Promise.all(["hearth","yard","reedbed","field","river","kiln","claypits","ford"].map(name=>new Promise(resolve=>{const img=new Image();img.onload=()=>resolve({name,ok:img.naturalWidth>0});img.onerror=()=>resolve({name,ok:false});img.src="/art/scene-"+name+".svg";})));})()');
  assert.ok(artStatus.every(a=>a.ok),"one or more illustrated scenes unavailable: "+JSON.stringify(artStatus));



  // Real mobile rendering, click walking focus, then a real nearby person.
  await cdp("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  const mobileScenePath=await screenshot("ux-390px-scene.png");
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
  await evaluate('document.querySelector("#sceneHotspots [data-person]").click();true');
  assert.ok(await evaluate('!document.querySelector("#sceneQuickActions").hidden'),"tapping an NPC must open in-scene actions");
  const mobileMenu=await evaluate('(()=>{const p=document.querySelector("#sceneQuickActions").getBoundingClientRect(),s=document.querySelector("#sceneTheater").getBoundingClientRect(),n=document.querySelector("#appNavigation").getBoundingClientRect();return {top:p.top,bottom:p.bottom,sceneBottom:s.bottom,navTop:n.top,shown:getComputedStyle(document.querySelector("#sceneQuickActions")).display!=="none"};})()');
  assert.ok(mobileMenu.shown && mobileMenu.top>=0 && mobileMenu.top>=mobileMenu.sceneBottom && mobileMenu.bottom<=mobileMenu.navTop,
    "touch actions should sit below the picture and above navigation: "+JSON.stringify(mobileMenu));
  const mobileActionPath=await screenshot("ux-390px-inline-actions.png");
  await tap('#sceneQuickActions [data-scene-quick="0"]');
  await until(async()=>await evaluate('!document.body.classList.contains("is-busy") && document.querySelector("#actionFeedback").textContent.includes("聊了一会")'),"real conversation did not complete");
  await tap('#appNavigation [data-route="people"]');
  assert.ok(await evaluate('document.querySelector("#relationshipOrbit").textContent.includes("当面聊过 1 次")'),"early settlement contacts should be visible without entering pottery");
  await tap('[data-person-route]');
  assert.ok(await evaluate('document.body.dataset.screen==="activities" && !document.querySelector("#sceneQuickActions").hidden'),"nearby contact must open that person's scene actions");


  assert.equal(await evaluate('Array.from(document.querySelectorAll("#sceneActions [data-action]")).filter(e=>e.dataset.action==="settlement-locations.talk").length'),1,
    "clicking the illustrated NPC must open the real authorized talk action");
  await evaluate('document.querySelector("#sceneActions [data-focus=close]").click();true');
  await evaluate('document.querySelector("#appNavigation [data-route=works]").click();true');
  await until(async()=>await evaluate('document.body.dataset.screen==="works"'),"Backpack route did not work");
  assert.ok(await evaluate('Boolean(document.querySelector("#portableOverview"))'),"real carry summary missing");
  const packPath=await screenshot("ux-390px-backpack.png");

  await cdp("Emulation.setDeviceMetricsOverride",{width:1280,height:820,deviceScaleFactor:1,mobile:false});
  await evaluate('document.querySelector("#appNavigation [data-route=activities]").click();true');
  await sleep(200);
  const desktopPath=await screenshot("ux-1280px-settlement.png");
  const pathToHearth = await evaluate('Array.from(document.querySelectorAll("#sceneHotspots [data-stage-go]")).some(e=>e.dataset.stageGo==="place:hearth-yard")');
  assert.ok(pathToHearth,"a visible route from the home yard to the public hearth is required");
  await evaluate('Array.from(document.querySelectorAll("#sceneHotspots [data-stage-go]")).find(e=>e.dataset.stageGo==="place:hearth-yard").click();true');
  await until(async()=>await evaluate('document.querySelector("#sceneTheater").dataset.location==="hearth"'),"hearth scene did not appear after real travel");  await until(async()=>await evaluate('document.querySelector("#sceneBackdrop").complete && document.querySelector("#sceneBackdrop").naturalWidth>0'),"hearth art not loaded");
  const hearthPath=await screenshot("ux-1280px-hearth.png");
  await cdp("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+4'),"hearth scene overflows mobile");
  const hearthMobilePath=await screenshot("ux-390px-hearth.png");
  await cdp("Emulation.setDeviceMetricsOverride",{width:1280,height:820,deviceScaleFactor:1,mobile:false});
  assert.ok(await evaluate('document.querySelectorAll(".painted-person[data-head][data-eyes][data-mouth]").length>=2'),
    "people must use stable modular face components");
  assert.ok(await evaluate('document.querySelectorAll("#sceneHotspots [data-object] .prop-illustration").length>0'),
    "scene objects must be drawings, not permanent text labels");
  await evaluate('Array.from(document.querySelectorAll("#sceneHotspots [data-stage-go]")).find(e=>e.dataset.stageGo==="place:river").click();true');
  await until(async()=>await evaluate('document.querySelector("#sceneTheater").dataset.location==="river"'),
    "river scene did not appear after real travel");
  await until(async()=>await evaluate('document.querySelector("#sceneBackdrop").naturalWidth>0'),"river background absent");
  assert.ok(await evaluate('document.querySelectorAll("#sceneHotspots [data-prop-kind=cistern]").length>0'),
    "real water cache should have its own visual hotspot at river");
  await evaluate('document.querySelector("#sceneHotspots [data-prop-kind=cistern]").click();true');
  const riverOptions=await evaluate('Array.from(document.querySelectorAll("#sceneActions [data-action]")).map(e=>e.dataset.action)');
  assert.ok(riverOptions.includes("settlement-locations.draw") || riverOptions.includes("settlement-locations.drink"),
    "water cache shows real possible water actions");
  assert.ok(!riverOptions.includes("world-objects.take"),"the fixed water pit must not be picked up");
  assert.ok(await evaluate('!document.querySelector("#sceneQuickActions").hidden'),"river actions must open next to the object");
  const quickWater=await evaluate('Array.from(document.querySelectorAll("#sceneQuickActions [data-scene-quick]")).some(b=>b.textContent.includes("取河水")&&!b.disabled)');
  assert.ok(quickWater,"river water must be usable directly from scene UI");
  const waterMenuPath=await screenshot("ux-1280px-river-interact.png");
  await cdp("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+4'),"river mobile horizontal overflow");
  const riverMobileMenuPath=await screenshot("ux-390px-river-interact.png");
  await evaluate('document.querySelector("#sceneQuickActions [data-scene-close]").click();true');
  const riverMobilePath=await screenshot("ux-390px-river.png");
  await cdp("Emulation.setDeviceMetricsOverride",{width:1280,height:820,deviceScaleFactor:1,mobile:false});
  await evaluate('document.querySelector("#sceneHotspots [data-prop-kind=cistern]").click();true');

  await evaluate('Array.from(document.querySelectorAll("#sceneQuickActions [data-scene-quick]")).find(b=>b.textContent.includes("取河水")&&!b.disabled).click();true');
  await until(async()=>await evaluate('document.querySelector("#toast").classList.contains("show")'),"real in-scene water action did not complete");
  await until(async()=>await evaluate('!document.body.classList.contains("is-busy")'),"water command did not finish its bookkeeping");
  await evaluate('document.querySelector("#sceneMapButton").click();true');
  assert.ok(await evaluate('!document.querySelector("#sceneQuickActions").hidden && document.querySelector("#sceneQuickActions").textContent.includes("陶家庭院")'),
    "all destinations must remain reachable using the in-scene map");
  await cdp("Input.dispatchKeyEvent",{type:"keyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
  await until(async()=>await evaluate('document.querySelector("#sceneQuickActions").hidden'),"Escape should close in-scene menu");
  await cdp("Input.dispatchKeyEvent",{type:"keyUp",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
  await evaluate('document.querySelector("#sceneWorkButton").click();true');
  assert.ok(await evaluate('!document.querySelector("#sceneQuickActions").hidden'),"work and rest need an in-scene entry");
  await evaluate('document.querySelector("#sceneQuickActions [data-scene-close]").click();true');
  await evaluate('document.querySelector("#sceneMapButton").click();true');
  const returnRoute = await evaluate('Array.from(document.querySelectorAll("#sceneQuickActions [data-scene-quick]")).find(b=>b.textContent.includes("公用灶台")&&!b.disabled)?.outerHTML||""');
  assert.ok(returnRoute,"player must have a legal route back without scrolling");
  await evaluate('Array.from(document.querySelectorAll("#sceneQuickActions [data-scene-quick]")).find(b=>b.textContent.includes("公用灶台")&&!b.disabled).click();true');
  await until(async()=>await evaluate('document.querySelector("#sceneTheater").dataset.location==="hearth"'),"cannot return from water point");


  const returnHearthPath=await screenshot("ux-1280px-return-hearth.png");

  // Phone-first acceptance: hit-tested touches, browser Back, and real inventory mutations.
  await cdp("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await cdp("Emulation.setTouchEmulationEnabled",{enabled:true,maxTouchPoints:1});
  await until(async()=>await evaluate('!document.body.classList.contains("is-busy")'),"travel still busy");
  await evaluate('history.replaceState(null,"", "#activities");window.scrollTo(0,0);true');
  assert.equal(await evaluate('document.querySelectorAll("#appNavigation>button").length'),4,"four primary destinations");
  await tap("#sceneMapButton");
  await evaluate('history.back();true');
  await until(async()=>await evaluate('document.querySelector("#sceneQuickActions").hidden && document.body.dataset.screen==="activities"'),"Back must close scene details without leaving life");
  await tap("#menuButton");
  await until(async()=>await evaluate('!document.querySelector("#menuModal").hidden'),"menu missing");
  await evaluate('history.back();true');
  await until(async()=>await evaluate('document.querySelector("#menuModal").hidden && !document.querySelector("main").inert'),"Back must close menu and restore main");
  await tap("#sceneTimeButton");
  await until(async()=>await evaluate('!document.querySelector("#autoModal").hidden'),"time plan not reachable");
  await evaluate('history.back();true');
  await until(async()=>await evaluate('document.querySelector("#autoModal").hidden && !document.querySelector("main").inert'),"Back must close time settings");

  await tap("#sceneMapButton");
  const yardIndex = await evaluate('Array.from(document.querySelectorAll("#sceneQuickActions [data-scene-quick]")).find(b=>b.textContent.includes("陶家庭院")&&!b.disabled)?.dataset.sceneQuick');
  assert.ok(yardIndex !== undefined, "yard should be reachable");
  if (await evaluate(`Boolean(document.querySelector('[data-scene-quick="${yardIndex}"]').closest("details"))`)) await tap("#sceneQuickActions details>summary");
  await tap(`#sceneQuickActions [data-scene-quick="${yardIndex}"]`);
  await until(async()=>await evaluate('document.querySelector("#sceneTheater").dataset.location==="yard" && !document.body.classList.contains("is-busy")'),"return to yard for inventory");

  // The earlier real water-gathering action created this carried item.
  const takeable = await evaluate('(async()=>{const s=(await (await fetch("/api/state")).json()).settlement;return s.objects.find(o=>o.placement==="在手中")?.id;})()');
  assert.ok(takeable,"gathering must have created a real carried object");
  await tap('#appNavigation [data-route="works"]');
  await tap(`[data-bag-id=${JSON.stringify(takeable)}]`);
  assert.equal(await evaluate('document.body.dataset.screen'),"works","item selection must stay in bag");
  await evaluate('history.back();true');
  await until(async()=>await evaluate('document.querySelector("#bagDetail").hidden && document.body.dataset.screen==="works"'),"Back must close bag item first");
  await tap(`[data-bag-id=${JSON.stringify(takeable)}]`);
  await screenshot("ux-390px-bag-item.png");
  const putIndex = await evaluate('Array.from(document.querySelectorAll("[data-bag-action]")).find(b=>b.textContent.includes("放下")&&!b.disabled)?.dataset.bagAction');
  assert.ok(putIndex !== undefined,"held item must expose put-down");
  await tap(`[data-bag-action="${putIndex}"]`);
  await until(async()=>await evaluate(`!document.body.classList.contains("is-busy") && !Array.from(document.querySelectorAll("[data-bag-id]")).some(b=>b.dataset.bagId===${JSON.stringify(takeable)})`),"bag inventory not refreshed after put-down");
  assert.equal(await evaluate('document.body.dataset.screen'),"works","put-down must stay in bag");
  const afterPut = await evaluate(`(async()=>{const s=(await (await fetch("/api/state")).json()).settlement;return s.objects.find(o=>o.id===${JSON.stringify(takeable)})?.placement;})()`);
  assert.equal(afterPut,"放着","put-down must mutate the authoritative object");

  const viewports = [[360,800],[390,844],[430,932],[1280,820]];
  const layoutChecks = [];
  for (const [width,height] of viewports) {
    await cdp("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<600});
    for (const route of ["activities","works","people","character"]) {
      await evaluate(`document.querySelector('#appNavigation [data-route="${route}"]').click();true`);
      const layout=await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth,route:document.body.dataset.screen,navButtons:Array.from(document.querySelectorAll("#appNavigation>button")).map(b=>({height:b.getBoundingClientRect().height,width:b.getBoundingClientRect().width})),background:getComputedStyle(document.body).backgroundImage})');
      assert.ok(layout.scroll<=width+1,`overflow ${JSON.stringify(layout)}`);
      assert.ok(layout.navButtons.every(b=>b.height>=48&&b.width>=48),`small navigation target ${JSON.stringify(layout)}`);
      layoutChecks.push({width,height,route,scroll:layout.scroll});
      await screenshot(`ux-${width}px-${route}.png`);
    }
  }
  // Large text must wrap without cutting off navigation or blocking actions.
  await cdp("Emulation.setDeviceMetricsOverride",{width:360,height:800,deviceScaleFactor:1,mobile:true});
  await evaluate('document.querySelector("#appNavigation [data-route=activities]").click();document.head.insertAdjacentHTML("beforeend", "<style id=largeText>button,summary,p,small{font-size:20px!important}</style>");true');
  await tap("#sceneWorkButton");
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),"large text must not introduce horizontal overflow");
  await screenshot("ux-360px-large-text.png");
  await evaluate('document.querySelector("#largeText").remove();true');
  await evaluate('history.back();true');
  await until(async()=>await evaluate('document.querySelector("#sceneQuickActions").hidden'),"final detail should close");
  assert.deepEqual(browserErrors,[],"no uncaught browser errors");
  const acceptance={layoutChecks,realInventoryRoundTrip:true,phoneBack:true,earlySettlementContacts:true,uncaughtErrors:browserErrors.length};
  writeFileSync(path.join(output,"acceptance.json"),JSON.stringify(acceptance,null,2));
  console.log("MOBILE_ACCEPTANCE",JSON.stringify(acceptance));


  console.log(JSON.stringify({ok:true,mobile,movement,greeting,
    screenshots:[mobileScenePath,mobilePath,mobileActionPath,packPath,desktopPath,hearthPath,hearthMobilePath,riverMobilePath,riverMobileMenuPath,waterMenuPath,returnHearthPath]}));
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
