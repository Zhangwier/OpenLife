import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * HTTP-level acceptance for the M1 settlement (OPEN_WORLD_REQUIREMENTS.md 搂11).
 *
 * The earlier pottery slice is still reachable through its own save, but the
 * default new life now opens inside a real settlement, so this test drives the
 * loop 搂12 asks for: walk in, take a container, fill it, put it back.
 */
test("UX-P0: Web can only know villagers by real conversations, not one-click friendship", { timeout: 40000 }, async () => {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../apps/web/server.ts", import.meta.url))], {
    env: { ...process.env, OPENLIFE_PERSISTENCE: "0", PORT: "0" }, stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  try {
    const base = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`server startup timeout: ${stderr}`)), 10000);
      let output = "";
      child.stdout.on("data", (chunk) => {
        output += chunk;
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+(?=\r?\n)/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
      child.on("error", (error) => { clearTimeout(timer); reject(error); });
      child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`early exit ${code}: ${stderr}`)); });
    });
    const call = async (path: string, body?: Record<string, unknown>) => {
      const response = await fetch(`${base}/api/${path}`, body
        ? { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify(body) } : {});
      return { status: response.status, data: await response.json() as Record<string, any> };
    };
    let s = (await call("state")).data;
    const original = s.relations.filter((r: { type: string }) => r.type === "family.friend_of").length;
    const act = async (action: string, payload: Record<string, unknown> = {}, ok = true) => {
      const response = await call("action", { action, payload, expectedTick: s.tick,
        expectedActorId: s.character.id, expectedActivityUsed: s.settlement.dailyActivity.used });
      assert.equal(response.status, 200, action);
      assert.equal(response.data.result.ok, ok, JSON.stringify(response.data.result.errors));
      s = response.data.state;
    };
    await act("friend", {}, false);
    assert.equal(s.relations.filter((r: { type: string }) => r.type === "family.friend_of").length, original);
    await act("settlement-locations.arrive", { placeId: "place:field", travelMode: "local" });
    const yu = s.settlement.neighbours.find((r: { realName: string }) => r.realName === "阿予");
    assert.ok(yu && yu.contact === "陌生");
    for (let i = 1; i <= 3; i++) {
      await act("settlement-locations.talk", { targetId: yu.id });
      assert.equal(s.settlement.neighbours.find((r: { id: string }) => r.id === yu.id)?.conversations, i);
      if (i < 3) {
        await act("settlement-locations.talk", { targetId: yu.id }, false);
        await act("settlement-locations.end_day");
      }
    }
    assert.equal(s.settlement.neighbours.find((r: { id: string }) => r.id === yu.id)?.contact, "相识");
    assert.ok(s.settlement.contacts.some((person: { id: string }) => person.id === yu.id));
    assert.equal(s.relations.filter((r: { type: string }) => r.type === "family.friend_of").length, original);
    const save = (await call("save", { label: "real-acquaintance" })).data.save;
    const loaded = await call("load", { save });
    assert.equal(loaded.data.result.ok, true);
    s = loaded.data.state;
    assert.equal(s.settlement.contacts.find((p: { id: string }) => p.id === yu.id)?.conversations, 3);
    await act("settlement-locations.arrive", { placeId: "place:yard", travelMode: "local" });
    await act("settlement-locations.talk", { targetId: yu.id }, false);
    const scene = await (await fetch(`${base}/settlement.js`)).text();
    assert.match(scene, /data-person/);
    assert.match(scene, /data-yield/);
    assert.match(scene, /data-carry/);
    const shell = await (await fetch(`${base}/shell.js`)).text();
    assert.match(shell, /随身行囊/);
    assert.equal(stderr, "");
  } finally {
    child.kill();
  }
});

test("Exchange: Web shows tradeable goods and partners, and the general exchange answers with a reason", { timeout: 40000 }, async () => {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../apps/web/server.ts", import.meta.url))], {
    env: { ...process.env, OPENLIFE_PERSISTENCE: "0", PORT: "0" }, stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  try {
    const base = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`server startup timeout: ${stderr}`)), 10000);
      let output = "";
      child.stdout.on("data", (chunk) => {
        output += chunk;
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+(?=\r?\n)/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
      child.on("error", (error) => { clearTimeout(timer); reject(error); });
      child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`early exit ${code}: ${stderr}`)); });
    });
    const call = async (path: string, body?: Record<string, unknown>) => {
      const response = await fetch(`${base}/api/${path}`, body
        ? { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify(body) } : {});
      return { status: response.status, data: await response.json() as Record<string, any> };
    };
    let s = (await call("state")).data;
    const act = async (action: string, payload: Record<string, unknown> = {}, ok = true) => {
      const response = await call("action", { action, payload, expectedTick: s.tick,
        expectedActorId: s.character.id, expectedActivityUsed: s.settlement.dailyActivity.used });
      assert.equal(response.status, 200, action);
      assert.equal(response.data.result.ok, ok, JSON.stringify(response.data.result.errors));
      s = response.data.state;
      return response.data.result;
    };
    await act("settlement-locations.arrive", { placeId: "place:field", travelMode: "local" });
    await act("settlement-locations.draw", { placeId: "place:field", resourceId: "resource:grain" });
    assert.equal(s.settlement.exchange.mine["resource:grain"].length, 1, "own grain is offered as tradeable");
    assert.equal(s.settlement.exchange.labels["resource:grain"], "粟");
    const partner = s.settlement.exchange.partners[0];
    assert.ok(partner?.name && typeof partner.owed === "number", "people standing here are exchange partners");
    const missing = Object.keys(s.settlement.exchange.labels).find((r) => !(r in partner.goods) && r !== "resource:grain")!;
    const refused = await act("settlement-locations.exchange", {
      targetId: partner.id, give: s.settlement.exchange.mine["resource:grain"], askResource: missing, askAmount: 1,
    }, false);
    assert.match(refused.errors[0].message, /手上没有/);
    const client = readFileSync(new URL("../../apps/web/public/settlement.js", import.meta.url), "utf8");
    assert.match(client, /提出交换/);
    assert.match(client, /记作人情/);
  } finally {
    child.kill();
  }
});

test("M3-D: Web lets player gather grain, ask the cook, refuse or accept the exact real goods", { timeout: 120000 }, async () => {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../apps/web/server.ts", import.meta.url))], {
    env: { ...process.env, OPENLIFE_PERSISTENCE: "0", PORT: "0" }, stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (part) => { stderr += part; });
  try {
    const base = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`server start timeout: ${stderr}`)), 10000);
      let buffer = "";
      child.stdout.on("data", (part) => {
        buffer += part;
        const match = buffer.match(/http:\/\/127\.0\.0\.1:\d+(?=\r?\n)/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
      child.on("error", (error) => { clearTimeout(timer); reject(error); });
      child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`server exited ${code}: ${stderr}`)); });
    });
    const call = async (path: string, body?: Record<string, unknown>) => {
      const response = await fetch(`${base}/api/${path}`, body
        ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
        : {});
      return { status: response.status, data: await response.json() as Record<string, any> };
    };
    let state = (await call("state")).data;
    let actorId = state.character.id;
    const actions = () => state.settlement.actions as Array<{
      id: string; enabled: boolean; payload: Record<string, string>; label: string;
    }>;
    const available = (id: string) => actions().find((a) => a.id === id);
    const carried = (resourceId: string) =>
      state.settlement.carrying.find((r: { resourceId: string }) => r.resourceId === resourceId)?.count ?? 0;
    const act = async (action: string, payload: Record<string, unknown> = {}, expectedOk = true) => {
      const response = await call("action", {
        action, payload, expectedTick: state.tick, expectedActorId: actorId,
        expectedActivityUsed: state.settlement.dailyActivity.used,
      });
      assert.equal(response.status, 200, action);
      assert.equal(response.data.result.ok, expectedOk, JSON.stringify(response.data.result.errors));
      state = response.data.state;
    };
    const setup = async () => {
      // Outdoor gathering costs more on wet days; this scenario is about the trade, so wait for a dry day.
      for (let guard = 0; guard < 10 && ["雨", "雪"].includes(state.settlement.weather?.sky); guard += 1)
        await act("settlement-locations.end_day");
      await act("settlement-locations.arrive", { placeId: "place:field", travelMode: "local" });
      await act("settlement-locations.draw", { placeId: "place:field", resourceId: "resource:grain" });
      assert.equal(carried("resource:grain"), 1);
      await act("settlement-locations.arrive", { placeId: "place:reedbed", travelMode: "local" });
      await act("settlement-locations.draw", { placeId: "place:reedbed", resourceId: "resource:fuel" });
      const fuel = state.settlement.objects.find((o: { prototypeId: string; placement: string }) =>
        o.prototypeId === "prototype:fuel-bundle" && o.placement === "在手中");
      assert.ok(fuel, "player must carry a real bundle to offer it");
      await act("settlement-locations.arrive", { placeId: "place:hearth-yard", travelMode: "local" });
      assert.equal(available("settlement-locations.barter.request")?.enabled, false,
        "the cook has no surplus bundle of his own");
      const cook = state.settlement.neighbours.find((p: { realName: string }) => p.realName === "阿灶");
      assert.ok(cook);
      await act("settlement-locations.talk", { targetId: cook.id });
      await act("settlement-locations.hearth.help", { objectId: fuel.id });
      assert.equal(available("settlement-locations.barter.request")?.enabled, true,
        "once the cook legally owns actual fuel, he may quote a real trade");
    };    await setup();
    const tickBefore = state.tick;
    const quoteRequest = available("settlement-locations.barter.request")!;
    assert.match(quoteRequest.label, /询价/);
    const grainId = quoteRequest.payload.grainId, fuelId = quoteRequest.payload.fuelId;
    assert.ok(grainId && fuelId);
    assert.equal(state.settlement.barter, null);
    await act("settlement-locations.barter.request", quoteRequest.payload);
    assert.equal(state.tick, tickBefore, "asking and quoting do not secretly advance time");
    assert.equal(state.settlement.barter?.status, "offered");
    assert.equal(state.settlement.barter?.grainId, grainId);
    assert.equal(state.settlement.barter?.fuelId, fuelId);
    assert.equal(carried("resource:grain"), 1, "a quote alone cannot spend player grain");
    assert.equal(carried("resource:fuel"), 0, "a quote alone cannot hand over cook fuel");
    assert.equal(available("settlement-locations.barter.accept")?.enabled, true);
    assert.equal(available("settlement-locations.barter.decline")?.enabled, true);
    await act("settlement-locations.barter.accept",
      { grainId, fuelId: "forged-substitution" }, false);
    assert.equal(carried("resource:grain"), 1, "a forged quote response changes no goods");
    await act("settlement-locations.barter.accept",
      available("settlement-locations.barter.accept")!.payload);
    assert.equal(state.settlement.barter?.status, "accepted");
    assert.equal(carried("resource:grain"), 0);
    assert.equal(carried("resource:fuel"), 1);
    assert.ok(state.settlement.objects.some((o: { id: string; placement: string }) =>
      o.id === fuelId && o.placement === "在手中"), "the exact cook fuel ID is now held by the player");
    assert.equal(available("settlement-locations.barter.request")?.enabled, false,
      "the same fixed exchange cannot happen twice");
    const checkpoint = (await call("save", { label: "player-barter" })).data.save;
    const loaded = await call("load", { save: checkpoint });
    assert.equal(loaded.data.result.ok, true);
    state = loaded.data.state;
    assert.equal(state.settlement.barter?.status, "accepted");
    assert.equal(carried("resource:fuel"), 1);
    await act("settlement-locations.barter.accept", { grainId, fuelId }, false);
    assert.equal(carried("resource:fuel"), 1, "save/load does not mint another fuel bundle");

    // A new world follows the same real steps but chooses refusal instead.
    state = (await call("reset", { seed: 104 })).data.state;
    actorId = state.character.id;
    await setup();
    const refusalQuote = available("settlement-locations.barter.request")!.payload;
    await act("settlement-locations.barter.request", refusalQuote);
    assert.equal(state.settlement.barter?.status, "offered");
    await act("settlement-locations.barter.decline",
      available("settlement-locations.barter.decline")!.payload);
    assert.equal(state.settlement.barter?.status, "declined");
    assert.equal(carried("resource:grain"), 1);
    assert.equal(carried("resource:fuel"), 0);
    await act("settlement-locations.barter.accept", refusalQuote, false);
    assert.equal(carried("resource:grain"), 1);

    const page = await (await fetch(`${base}/settlement.js`)).text();
    assert.match(page, /settlement-locations\.barter\.request/);
    assert.match(page, /你拒绝了这次报价/);
    assert.equal(stderr, "");
  } finally {
    child.kill();
  }
});

test("M3-C: manual end-day and continuous batches share one persisted NPC day boundary", { timeout: 40000 }, async () => {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../apps/web/server.ts", import.meta.url))], {
    env: { ...process.env, OPENLIFE_PERSISTENCE: "0", PORT: "0" }, stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (data) => { stderr += data; });
  try {
    const base = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`server start timeout: ${stderr}`)), 10000);
      let output = "";
      child.stdout.on("data", (part) => {
        output += part;
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+(?=\r?\n)/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
      child.on("error", (error) => { clearTimeout(timer); reject(error); });
      child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`server exited ${code}: ${stderr}`)); });
    });
    const call = async (path: string, body?: Record<string, unknown>) => {
      const response = await fetch(`${base}/api/${path}`, body
        ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
      return { status: response.status, data: await response.json() as Record<string, any> };
    };
    let state = (await call("state")).data;
    const playerId = state.character.id;
    const action = async (command: string, payload: Record<string, unknown> = {}) => {
      const response = await call("action", {
        action: command, payload, expectedTick: state.tick,
        expectedActorId: playerId, expectedActivityUsed: state.settlement.dailyActivity.used,
      });
      assert.equal(response.status, 200, command);
      assert.equal(response.data.result.ok, true, JSON.stringify(response.data.result.errors));
      state = response.data.state;
    };
    await action("settlement-locations.arrive", { placeId: "place:hearth-yard", travelMode: "local" });
    const cookedStock = () => state.settlement.yields
      .find((r: { resourceId: string }) => r.resourceId === "resource:cooked").stock;
    const cook = () => state.settlement.neighbours.find((r: { realName: string }) => r.realName === "阿灶");
    const startTick = state.tick;
    const initialFood = cookedStock();
    assert.equal(cook()?.dailyNote ?? "", "");
    await action("settlement-locations.end_day");
    assert.equal(state.tick, startTick + 1, "manual end_day advances the one world clock");
    assert.equal(cookedStock(), initialFood - 1, "manual day triggers exactly one farmer meal");
    assert.match(cook()?.dailyNote ?? "", /柴草/);
    assert.match(cook()?.dailyNote ?? "", /休息/);
    assert.equal(cook()?.tradeCount, 0);
    const saved = (await call("save", { label: "manual-npc-day" })).data.save;
    const restored = await call("load", { save: saved });
    assert.equal(restored.data.result.ok, true);
    state = restored.data.state;
    assert.equal(cookedStock(), initialFood - 1,
      "load and projections cannot replay yesterday's NPC food");
    assert.match(cook()?.dailyNote ?? "", /柴草/);

    // The passive next-day endpoint shares the identical calendar boundary.
    const continuous = await call("autosim", {
      mode: "continuous-batch", days: 1, expectedTick: state.tick,
      expectedActorId: playerId, expectedPlanRevision: state.settlement.dailyPlan.revision,
    });
    assert.equal(continuous.status, 200);
    assert.equal(continuous.data.result.interrupted, false, JSON.stringify(continuous.data.result));
    state = continuous.data.state;
    assert.equal(state.tick, startTick + 2);
    // The kitchen starts full and refills overnight, so one farmer meal a day leaves it one short each morning.
    assert.equal(cookedStock(), initialFood - 1, "no skipped or duplicate NPC meal in continuous mode");
    assert.match(cook()?.dailyNote ?? "", /柴草/);

    // Doing unrelated manual activity in the SAME day does not trigger NPCs.
    const tickSameDay = state.tick;
    await action("settlement-locations.arrive", { placeId: "place:field", travelMode: "local" });
    assert.equal(state.tick, tickSameDay);
    const farmer = state.settlement.neighbours.find((r: { realName: string }) => r.realName === "阿予");
    assert.match(farmer?.dailyNote ?? "", /照料田地/);
    await action("settlement-locations.arrive", { placeId: "place:hearth-yard", travelMode: "local" });
    assert.equal(cookedStock(), initialFood - 1, "no double meal when player moves within one day");

    const stale = await call("action", {
      action: "settlement-locations.end_day", payload: {},
      expectedTick: startTick, expectedActorId: playerId,
    });
    assert.equal(stale.status, 409);
    assert.equal(cookedStock(), initialFood - 1);

    await action("settlement-locations.end_day");
    assert.equal(state.tick, startTick + 3);
    assert.equal(cookedStock(), initialFood - 1, "third day uses same bounded day routine (refill, then one meal)");
    assert.equal(cook()?.tradeCount, 0);

    // M4-B: a two-day journey is two lived village days, not a frozen village.
    // The engine's village agent runs for each stepped day of the trip.
    const beforeJump = state.tick;
    await action("settlement-locations.arrive", { placeId: "place:river", costDays: 2 });
    assert.equal(state.tick, beforeJump + 2);
    await action("settlement-locations.arrive", { placeId: "place:hearth-yard", travelMode: "local" });
    assert.ok(cookedStock() >= 0, "shared food stays a real, finite stock");
    assert.match(cook()?.dailyNote ?? "", /\S/, "the cook kept living while the player travelled");
    const page = await (await fetch(`${base}/`)).text();
    assert.match(page, /pauseAutoButton|startContinuousAuto/,
      "the existing start/pause controls remain present");
    assert.equal(stderr, "");
  } finally {
    child.kill();
  }
});

test("M3-B: Web shows two bounded NPC routines and one persistent physical barter", { timeout: 40000 }, async () => {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../apps/web/server.ts", import.meta.url))], {
    env: { ...process.env, OPENLIFE_PERSISTENCE: "0", PORT: "0" }, stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  try {
    const base = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`startup timeout: ${stderr}`)), 10000);
      let output = "";
      child.stdout.on("data", (data) => {
        output += data;
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+(?=\r?\n)/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
      child.on("error", (error) => { clearTimeout(timer); reject(error); });
      child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`early exit ${code}: ${stderr}`)); });
    });
    const call = async (path: string, body?: Record<string, unknown>) => {
      const response = await fetch(`${base}/api/${path}`, body
        ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
      return { status: response.status, data: await response.json() as Record<string, any> };
    };
    let s = (await call("state")).data;
    const actorId = s.character.id;
    const startTick = s.tick;
    const act = async (action: string, payload: Record<string, unknown>) => {
      const response = await call("action", { action, payload,
        expectedTick: s.tick, expectedActorId: actorId, expectedActivityUsed: s.settlement.dailyActivity.used });
      assert.equal(response.status, 200);
      assert.equal(response.data.result.ok, true, JSON.stringify(response.data.result.errors));
      s = response.data.state;
    };
    await act("settlement-locations.arrive", { placeId: "place:hearth-yard", travelMode: "local" });
    for (let batch = 0; batch < 2; batch++) {
      const advanced = await call("autosim", { mode: "continuous-batch", days: 3,
        expectedTick: s.tick, expectedActorId: actorId,
        expectedPlanRevision: s.settlement.dailyPlan.revision });
      assert.equal(advanced.status, 200);
      assert.equal(advanced.data.result.interrupted, false, JSON.stringify(advanced.data.result));
      s = advanced.data.state;
    }
    assert.equal(s.tick, startTick + 6);
    const cook = s.settlement.neighbours.find((p: { realName: string }) => p.realName === "阿灶");
    assert.ok(cook, "the cook is physically present at the communal hearth");
    assert.equal(cook.tradeCount, 0, "a trade cannot be forced by the sixth-day timer");
    assert.match(cook.dailyNote, /公灶|柴草/, "cook responds to material needs");    const saved = (await call("save", { label: "npc-barter" })).data.save;
    const restore = await call("load", { save: saved });
    assert.equal(restore.data.result.ok, true);
    s = restore.data.state;
    assert.equal(s.settlement.neighbours.find((p: { realName: string }) => p.realName === "阿灶")?.tradeCount, 0);
    await act("settlement-locations.arrive", { placeId: "place:field", travelMode: "local" });
    const yu = s.settlement.neighbours.find((p: { realName: string }) => p.realName === "阿予");
    assert.ok(yu);
    assert.equal(yu.tradeCount, 0, "the farmer was not forced into an arbitrary exchange");
    assert.match(yu.dailyNote, /照料田地/);    const client = await (await fetch(`${base}/settlement.js`)).text();
    assert.match(client, /实物交换/);
    const stale = await call("autosim", { mode: "continuous-batch", days: 1,
      expectedTick: startTick, expectedActorId: actorId });
    assert.equal(stale.status, 409, "old batch cannot make a second trade");
    const next = await call("autosim", { mode: "continuous-batch", days: 1,
      expectedTick: s.tick, expectedActorId: actorId });
    assert.equal(next.status, 200);
    s = next.data.state;
    assert.equal(s.settlement.neighbours.find((p: { realName: string }) => p.realName === "阿予")?.tradeCount, 0);
    assert.equal(stderr, "");
  } finally {
    child.kill();
  }
});

test("M3-A: Web continuous simulation runs one autonomous farmer and exposes witnessed actions", { timeout: 40000 }, async () => {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../apps/web/server.ts", import.meta.url))], {
    env: { ...process.env, OPENLIFE_PERSISTENCE: "0", PORT: "0" }, stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (data) => { stderr += data; });
  try {
    const base = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`server startup timeout: ${stderr}`)), 10000);
      let output = "";
      child.stdout.on("data", (data) => {
        output += data;
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+(?=\r?\n)/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
      child.on("error", (error) => { clearTimeout(timer); reject(error); });
      child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`server exit ${code}: ${stderr}`)); });
    });
    const call = async (path: string, body?: Record<string, unknown>) => {
      const response = await fetch(`${base}/api/${path}`, body
        ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
      return { status: response.status, data: await response.json() as Record<string, any> };
    };
    let s = (await call("state")).data;
    assert.equal(s.settlement.neighbours.some((p: { realName: string }) => p.realName === "阿予"), false,
      "the distant farmer is not shown as if nearby");
    const act = async (action: string, payload: Record<string, unknown>) => {
      const response = await call("action", {
        action, payload, expectedTick: s.tick, expectedActorId: s.character.id,
        expectedActivityUsed: s.settlement.dailyActivity.used,
        expectedPlanRevision: s.settlement.dailyPlan.revision,
      });
      assert.equal(response.status, 200);
      assert.equal(response.data.result.ok, true, JSON.stringify(response.data.result.errors));
      s = response.data.state;
    };
    await act("settlement-locations.arrive", { placeId: "place:hearth-yard", travelMode: "local" });
    const cooked = () => s.settlement.yields.find((v: { resourceId: string }) =>
      v.resourceId === "resource:cooked")?.stock;
    const beforeFood = cooked();
    const beforeTick = s.tick;
    const beforePlayerBudget = s.settlement.dailyActivity.used;
    const batch = await call("autosim", {
      mode: "continuous-batch", days: 1, expectedTick: s.tick, expectedActorId: s.character.id,
      expectedPlanRevision: s.settlement.dailyPlan.revision,
    });
    assert.equal(batch.status, 200);
    assert.equal(batch.data.result.interrupted, false, JSON.stringify(batch.data.result));
    s = batch.data.state;
    assert.equal(s.tick, beforeTick + 1);
    assert.equal(cooked(), beforeFood - 1, "NPC consumed the same real food stock visible to player");
    assert.equal(s.settlement.dailyActivity.used, 0, "player receives a fresh day, no stolen budget");
    assert.equal(s.character.alive, true);
    assert.equal(s.settlement.neighbours.some((p: { realName: string }) => p.realName === "阿予"), false,
      "the player cannot see a distant NPC's private routine");
    const stale = await call("autosim", {
      mode: "continuous-batch", days: 1, expectedTick: beforeTick, expectedActorId: s.character.id,
      expectedPlanRevision: s.settlement.dailyPlan.revision,
    });
    assert.equal(stale.status, 409);
    assert.equal(beforePlayerBudget, 1);
    await act("settlement-locations.arrive", { placeId: "place:field", travelMode: "local" });
    const neighbor = s.settlement.neighbours.find((p: { realName: string }) => p.realName === "阿予");
    assert.ok(neighbor, "player at the field can now encounter the same physical resident");
    assert.match(neighbor.dailyNote, /照料田地/, JSON.stringify({tick:s.tick, beforeTick, neighbor, batch:batch.data.result, allNeighbors:s.settlement.neighbours}));
    assert.match(neighbor.dailyNote, /吃一份熟食/);
    assert.match(neighbor.dailyNote, /休息/);
    const checkpoint = (await call("save", { label: "autonomous-farmer" })).data.save;
    const restored = await call("load", { save: checkpoint });
    assert.equal(restored.data.result.ok, true);
    s = restored.data.state;
    assert.equal(s.settlement.neighbours.find((p: { realName: string }) => p.realName === "阿予")?.dailyNote,
      neighbor.dailyNote);
    const ui = await (await fetch(`${base}/settlement.js`)).text();
    assert.match(ui, /dailyNote/);
    assert.equal(stderr, "");
  } finally {
    child.kill();
  }
});

test("M2-B-C: Web turns harvested reeds into a worn wrap with real field-work savings", { timeout: 40000 }, async () => {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../apps/web/server.ts", import.meta.url))], {
    env: { ...process.env, OPENLIFE_PERSISTENCE: "0", PORT: "0" }, stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (data) => { stderr += data; });
  try {
    const base = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`server startup timeout: ${stderr}`)), 10000);
      let output = "";
      child.stdout.on("data", (data) => {
        output += data;
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+(?=\r?\n)/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
      child.on("error", (error) => { clearTimeout(timer); reject(error); });
      child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`server exit ${code}: ${stderr}`)); });
    });
    const call = async (route: string, body?: Record<string, unknown>) => {
      const response = await fetch(`${base}/api/${route}`, body
        ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
      return { status: response.status, data: await response.json() as Record<string, any> };
    };
    let s = (await call("state")).data;
    const action = async (type: string, payload: Record<string, unknown> = {}, ok = true) => {
      const response = await call("action", {
        action: type, payload, expectedTick: s.tick, expectedActorId: s.character.id,
        expectedActivityUsed: s.settlement.dailyActivity.used,
      });
      assert.equal(response.status, 200, type);
      assert.equal(response.data.result.ok, ok, JSON.stringify(response.data.result.errors));
      s = response.data.state;
      return response.data.result;
    };
    await action("settlement-locations.arrive", { placeId: "place:reedbed", costDays: 3 });
    const before = s.settlement.yields.find((row: { resourceId: string }) =>
      row.resourceId === "resource:reed").stock;
    await action("settlement-locations.prepare_fiber", {}, false);
    assert.equal(s.settlement.dailyActivity.used, 0);
    const unauthorized = await action("world-objects.wear", { objectId: "instance:lan-cloth" }, false);
    assert.ok(unauthorized.errors?.length, "player cannot wear the neighbor's clothing");
    for (let i = 0; i < 2; i++) await action("settlement-locations.draw",
      { placeId: "place:reedbed", resourceId: "resource:reed" });
    assert.equal(s.settlement.dailyActivity.used, 4);
    assert.ok(s.settlement.actions.some((a: { id: string; enabled: boolean }) =>
      a.id === "settlement-locations.prepare_fiber" && a.enabled));
    await action("settlement-locations.prepare_fiber");
    assert.equal(s.settlement.dailyActivity.used, 6);
    assert.equal(s.settlement.carrying.find((a: { resourceId: string }) =>
      a.resourceId === "resource:fiber")?.count, 2);
    await action("settlement-locations.weave_wrap");
    assert.equal(s.settlement.dailyActivity.used, 8);
    assert.equal(s.settlement.yields.find((row: { resourceId: string }) =>
      row.resourceId === "resource:reed").stock, before - 2);
    assert.equal(s.settlement.carrying.find((a: { resourceId: string }) =>
      a.resourceId === "resource:fiber"), undefined);
    const wrap = s.settlement.objects.find((o: { prototypeId: string; placement: string }) =>
      o.prototypeId === "prototype:fiber-wrap" && o.placement === "在手中");
    assert.ok(wrap, "Web displays the actual newly crafted wrap");
    assert.equal(s.settlement.outfit, null);
    assert.ok(s.settlement.actions.some((a: { id: string; enabled: boolean; payload: { objectId: string } }) =>
      a.id === "world-objects.wear" && a.payload.objectId === wrap.id && a.enabled));
    await action("world-objects.wear", { objectId: wrap.id });
    assert.equal(s.settlement.outfit?.objectId, wrap.id);
    assert.equal(s.settlement.outfit?.fieldWorkActivityCost, 2);
    await action("world-objects.wear", { objectId: wrap.id }, false);
    await action("world-objects.place", { objectId: wrap.id, placeId: "place:reedbed" }, false);

    const save = (await call("save", { label: "fiber-outfit" })).data.save;
    const loaded = await call("load", { save });
    assert.equal(loaded.data.result.ok, true);
    s = loaded.data.state;
    assert.equal(s.settlement.outfit?.objectId, wrap.id);
    await action("settlement-locations.arrive", { placeId: "place:field", costDays: 2 });
    const tendAction = () => s.settlement.actions.find((a: { id: string; payload: { spaceId: string } }) =>
      a.id === "settlement-locations.tend" && a.payload.spaceId === "space:field-edge");
    assert.equal(tendAction()?.activityCost, 2);
    const fieldTick = s.tick;
    await action("settlement-locations.tend", { spaceId: "space:field-edge" });
    assert.equal(s.tick, fieldTick);
    assert.equal(s.settlement.dailyActivity.used, 2);
    await action("world-objects.unwear", { objectId: wrap.id });
    assert.equal(s.settlement.outfit, null);
    assert.equal(tendAction()?.activityCost, 3);
    await action("settlement-locations.tend", { spaceId: "space:field-edge" });
    assert.equal(s.settlement.dailyActivity.used, 5);
    assert.ok(s.settlement.objects.some((o: { id: string; placement: string }) =>
      o.id === wrap.id && o.placement === "在手中"),
      "undressing leaves the original object in the player's possession");
    const client = await (await fetch(`${base}/settlement.js`)).text();
    assert.match(client, /已穿/);
    assert.equal(stderr, "");
  } finally {
    child.kill();
  }
});

test("M2-B: Web weaves a carrying bag and sleeping mat with real storage and rest benefits", { timeout: 40000 }, async () => {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../apps/web/server.ts", import.meta.url))], {
    env: { ...process.env, OPENLIFE_PERSISTENCE: "0", PORT: "0" }, stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (data) => { stderr += data; });
  try {
    const base = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`server startup timeout: ${stderr}`)), 10000);
      let output = "";
      child.stdout.on("data", (data) => {
        output += data;
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+(?=\r?\n)/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
      child.on("error", (error) => { clearTimeout(timer); reject(error); });
      child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`server exit ${code}: ${stderr}`)); });
    });
    const call = async (route: string, body?: Record<string, unknown>) => {
      const response = await fetch(`${base}/api/${route}`, body
        ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
        : {});
      return { status: response.status, data: await response.json() as Record<string, any> };
    };
    let s = (await call("state")).data;
    const act = async (action: string, payload: Record<string, unknown> = {}) => {
      const response = await call("action", { action, payload, expectedTick: s.tick,
        expectedActorId: s.character.id, expectedActivityUsed: s.settlement.dailyActivity.used });
      assert.equal(response.status, 200, action);
      assert.equal(response.data.result.ok, true, JSON.stringify(response.data.result.errors));
      s = response.data.state;
    };
    await act("settlement-locations.arrive", { placeId: "place:reedbed", costDays: 2 });
    const firstReeds = s.settlement.yields.find((row: { resourceId: string }) =>
      row.resourceId === "resource:reed").stock;
    for (let n = 0; n < 3; n += 1) await act("settlement-locations.draw",
      { placeId: "place:reedbed", resourceId: "resource:reed", amount: 1 });
    assert.equal(s.settlement.dailyActivity.used, 6);
    assert.ok(s.settlement.actions.some((a: { id: string; enabled: boolean }) =>
      a.id === "settlement-locations.weave_bag" && a.enabled));
    await act("settlement-locations.weave_bag");
    const bagId = s.settlement.objects.find((o: { prototypeId: string; placement: string }) =>
      o.prototypeId === "prototype:carrying-bag" && o.placement === "在手中")?.id;
    assert.ok(bagId, "weaving makes a real carrying bag in player hands");
    const remaining = s.settlement.objects.find((o: { prototypeId: string; placement: string }) =>
      o.prototypeId === "prototype:reed-bundle" && o.placement === "在手中")?.id;
    assert.ok(remaining);
    assert.ok(s.settlement.actions.some((a: { id: string; payload: { objectId: string; containerId: string } }) =>
      a.id === "world-objects.store" && a.payload.objectId === remaining && a.payload.containerId === bagId));
    await act("world-objects.store", { objectId: remaining, containerId: bagId });
    assert.equal(s.settlement.carrying.find((v: { resourceId: string }) =>
      v.resourceId === "resource:reed")?.count, 1, "reed persists within the bag");
    assert.ok(!s.settlement.objects.some((o: { id: string }) => o.id === remaining));
    const saved = (await call("save", { label: "woven-bag" })).data.save;
    const reloaded = await call("load", { save: saved });
    assert.equal(reloaded.data.result.ok, true);
    s = reloaded.data.state;
    assert.equal(s.settlement.carrying.find((v: { resourceId: string }) =>
      v.resourceId === "resource:reed")?.count, 1);
    await act("settlement-locations.end_day");
    await act("settlement-locations.arrive", { placeId: "place:field", travelMode: "local" });
    assert.ok(s.settlement.actions.some((a: { id: string; payload: { objectId: string } }) =>
      a.id === "world-objects.retrieve" && a.payload.objectId === remaining));
    await act("world-objects.retrieve", { objectId: remaining });
    assert.ok(s.settlement.objects.some((o: { id: string; placement: string }) =>
      o.id === remaining && o.placement === "在手中"));
    await act("settlement-locations.arrive", { placeId: "place:reedbed", travelMode: "local" });
    const reedAfterAllWork = s.settlement.yields.find((v: { resourceId: string }) =>
      v.resourceId === "resource:reed").stock;
    assert.ok(reedAfterAllWork >= 0 && reedAfterAllWork <= firstReeds - 3,
      "the three player harvests happened, while autonomous neighbours may gather additional real reeds");    // M2-B-B: make a real mat from two more bundles, lay it at home,
    // and verify that only the next world day gains one activity unit.
    for (let n = 0; n < 2; n += 1) await act("settlement-locations.draw",
      { placeId: "place:reedbed", resourceId: "resource:reed", amount: 1 });
    assert.equal(s.settlement.dailyActivity.used, 6);
    assert.ok(s.settlement.actions.some((a: { id: string; enabled: boolean }) =>
      a.id === "settlement-locations.weave_mat" && a.enabled));
    await act("settlement-locations.weave_mat");
    const matId = s.settlement.objects.find((o: { prototypeId: string; placement: string }) =>
      o.prototypeId === "prototype:mat" && o.placement === "在手中")?.id;
    assert.ok(matId, "two bundles now form a persistent sleeping mat");
    await act("settlement-locations.arrive", { placeId: "place:yard", costDays: 1 });
    assert.equal(s.settlement.dailyActivity.capacity, 8);
    assert.ok(s.settlement.actions.some((a: { id: string; enabled: boolean; payload: { matId?: string } }) =>
      a.id === "settlement-locations.rest" && a.payload.matId === matId && a.enabled));
    await act("world-objects.place", { objectId: matId, placeId: "place:yard" });
    assert.ok(s.settlement.actions.some((a: { id: string; enabled: boolean; payload: { matId?: string } }) =>
      a.id === "settlement-locations.rest" && a.payload.matId === matId && a.enabled),
      "laying the real mat at home does not remove its usable benefit");
    // A leaking roof on a wet night soaks the mat; this check is about a dry night's benefit.
    for (let guard = 0; guard < 10 && s.settlement.roof.leaking && ["雨", "雪"].includes(s.settlement.weather.sky); guard += 1)
      await act("settlement-locations.end_day");
    await act("settlement-locations.rest", { spaceId: s.settlement.spaceId, matId });
    assert.equal(s.settlement.dailyActivity.capacity, 8, "resting does not increase today's budget");
    const matSave = (await call("save", { label: "woven-mat" })).data.save;
    const matLoad = await call("load", { save: matSave });
    assert.equal(matLoad.data.result.ok, true);
    s = matLoad.data.state;
    await act("settlement-locations.end_day");
    assert.equal(s.settlement.dailyActivity.capacity, 9);
    assert.equal(s.settlement.dailyActivity.remaining, 9, "the next day genuinely gains a ninth slot");
    await act("settlement-locations.rest", { spaceId: s.settlement.spaceId, matId });
    assert.equal(s.settlement.dailyActivity.capacity, 9, "mat bonus must not stack");
    // The standing routine must use the same real mat benefit; automation
    // cannot invent a better night without a legitimate local object.
    await act("settlement-locations.plan.configure", {
      steps: ["rest"], enabled: true, repeat: true,
    });
    const beforeRoutineTick = s.tick;
    const routine = await call("autosim", {
      mode: "continuous-batch", days: 1,
      expectedTick: s.tick, expectedActorId: s.character.id,
      expectedPlanRevision: s.settlement.dailyPlan.revision,
    });
    assert.equal(routine.status, 200);
    assert.equal(routine.data.result.interrupted, false, JSON.stringify(routine.data.result));
    assert.deepEqual(routine.data.result.actions, ["rest"]);
    s = routine.data.state;
    assert.equal(s.tick, beforeRoutineTick + 1);
    assert.equal(s.settlement.dailyActivity.capacity, 9,
      "a routine chooses the real mat at home, preserving next-day rest benefit");
    assert.equal(s.settlement.yields.find((v: { resourceId: string }) =>
      v.resourceId === "resource:reed"), undefined, "mat production never materializes reed at home");
    assert.equal(stderr, "");
  } finally {
    child.kill();
  }
});

// This walk measures the 8-unit day budget exactly, so it runs without the hunger toll.
// Spawns a real server and drives a full HTTP loop; ~33s warm, and the whole
// suite runs in parallel, so 40s was clipping under load. The work itself is
// unchanged -- only the ceiling above it.
// This one walks the whole settlement over HTTP with the full pack loaded. It
// takes ~80s on its own and more when the suite runs files in parallel, so the
// cap has to be well above the serial time or it fails for being busy rather
// than for being wrong.
test("Web player walks the settlement, borrows a jar, fetches water and returns it", { timeout: 180000 }, async () => {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../apps/web/server.ts", import.meta.url))], {
    env: { ...process.env, OPENLIFE_PERSISTENCE: "0", PORT: "0", OPENLIFE_HUNGER_TOLL: "0" }, stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (data) => { stderr += data; });
  try {
    const base = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`server startup timeout: ${stderr}`)), 10000);
      let output = "";
      child.stdout.on("data", (data) => {
        output += data;
        // Wait for the complete log line: stdout chunks can split a port number.
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+(?=\r?\n)/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
      child.on("error", (error) => { clearTimeout(timer); reject(error); });
      child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`server exit ${code}: ${stderr}`)); });
    });

    const call = async (path: string, body?: Record<string, unknown>) => {
      const response = await fetch(`${base}/api/${path}`, body
        ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
        : {});
      return { status: response.status, data: await response.json() as Record<string, any> };
    };

    let s = (await call("state")).data;
    assert.equal(s.character.age, 16);

    // The world now declares a day-scale clock: a year is still twelve months,
    // but a month is thirty days (TIME-001).
    assert.equal(s.clock.exists, true);
    assert.equal(s.clock.baseUnit, "day");
    assert.equal(s.clock.daysPerMonth, 30);
    assert.equal(s.clock.monthsPerYear, 12);
    assert.equal(s.clock.dayTicksPerYear, 360);

    // The opening scene is a real place with real people and objects, not a
    // name plus a paragraph (MAP-001).
    assert.equal(s.settlement.exists, true);
    assert.equal(s.settlement.placeId, "place:yard");
    assert.ok(s.settlement.placeName.length > 0);
    assert.ok(s.settlement.neighbours.length >= 1, "someone else is already here");
    assert.ok(s.settlement.objects.length >= 5, "the opening room has real objects");
    assert.ok(s.settlement.actions.length >= 8, "several routes are offered");

    const act = async (action: string, payload: Record<string, unknown> = {}) => {
      const response = await call("action", {
        action, payload, expectedTick: s.tick, expectedActorId: s.character.id,
        expectedActivityUsed: s.settlement.dailyActivity.used,
      });
      assert.equal(response.status, 200);
      assert.equal(response.data.result.ok, true, JSON.stringify(response.data.result.errors));
      s = response.data.state;
    };

    // A stale action from a previous tick is rejected and refreshes the client.
    const staleTick = s.tick;
    const jarId = s.settlement.objects.find((o: { prototypeId: string }) => o.prototypeId === "prototype:water-jar")!.id;
    const privateJar = s.settlement.objects.find((o: { prototypeId: string }) =>
      o.prototypeId === "prototype:small-jar")?.id;
    assert.ok(privateJar, "a private household jar is present for consent denial");
    const refusedLoan = await call("action", {
      action: "world-objects.take", payload: { objectId: privateJar },
      expectedTick: s.tick, expectedActorId: s.character.id,
      expectedActivityUsed: s.settlement.dailyActivity.used,
    });
    assert.equal(refusedLoan.status, 200);
    assert.equal(refusedLoan.data.result.ok, false, "private belongings require consent");
    assert.equal(refusedLoan.data.state.player.settlementLoans.length, 0);
    await act("world-objects.take", { objectId: jarId });

    // Borrowing creates a real, dated obligation rather than a silent transfer.
    assert.equal(s.player.settlementLoans.length, 1, "borrowing is recorded as a loan");
    assert.ok(s.settlement.carrying.some((row: { resourceId: string }) => row.resourceId === "resource:jar"));

    // Walk to the river and fill the jar. Walking costs days, so the tick moves.
    await act("settlement-locations.arrive", { placeId: "place:river", costDays: 1 });
    assert.equal(s.settlement.placeId, "place:river");
    assert.ok(s.tick > staleTick, "walking costs days");

    // Now a request stamped with the old tick must be refused as stale.
    const stale = await call("action", {
      action: "settlement-locations.end_day", payload: {},
      expectedTick: staleTick, expectedActorId: s.character.id,
    });
    assert.equal(stale.status, 409);

    // The river's own stock is what the jar draws from; the yard has none.
    const riverStockBefore = s.settlement.yields
      .find((row: { resourceId: string }) => row.resourceId === "resource:water").stock;
    assert.ok(riverStockBefore > 0);

    await act("settlement-locations.drink", { containerId: jarId, resourceId: "resource:water" });
    assert.ok(
      s.settlement.carrying.some((row: { resourceId: string; count: number }) => row.resourceId === "resource:water" && row.count > 0),
      "the jar now carries water",
    );
    const riverStockAfter = s.settlement.yields
      .find((row: { resourceId: string }) => row.resourceId === "resource:water").stock;
    assert.ok(riverStockAfter < riverStockBefore, "the river lost what the jar gained");

    // Carry it home and give it back.
    await act("settlement-locations.arrive", { placeId: "place:yard", costDays: 0 });
    assert.equal(s.settlement.placeId, "place:yard");
    await act("world-objects.return", { objectId: jarId });
    assert.equal(s.player.settlementLoans.length, 0, "the loan is cleared on return");
    assert.ok(!s.settlement.carrying.some((row: { resourceId: string }) => row.resourceId === "resource:jar"));


    // M2-A: the Web server must actually accept the cook command, not just list it.
    await act("settlement-locations.arrive", { placeId: "place:field", costDays: 2 });
    await act("settlement-locations.draw", { placeId: "place:field", resourceId: "resource:grain", amount: 1 });
    await act("settlement-locations.arrive", { placeId: "place:reedbed", costDays: 3 });
    await act("settlement-locations.draw", { placeId: "place:reedbed", resourceId: "resource:fuel", amount: 1 });
    await act("settlement-locations.arrive", { placeId: "place:hearth-yard", costDays: 1 });
    assert.ok(s.settlement.actions.some((a: { id: string; enabled: boolean }) =>
      a.id === "settlement-locations.cook" && a.enabled), "a valid cooking action is shown");
    await act("settlement-locations.cook");
    const cookedId = s.settlement.objects.find((o: { prototypeId: string; placement: string }) =>
      o.prototypeId === "prototype:cooked-food" && o.placement === "在手中")?.id;
    assert.ok(cookedId, "the cooked ration is a real held item in Web state");
    const hungerBeforeMeal = s.settlement.hunger;
    const sharedFoodBefore = s.settlement.yields
      .find((v: { resourceId: string }) => v.resourceId === "resource:cooked").stock;
    await act("settlement-locations.eat", { objectId: cookedId, resourceId: "resource:cooked" });
    assert.ok(s.settlement.hunger < hungerBeforeMeal, "eating the ration improves hunger");
    assert.ok(!s.settlement.objects.some((o: { id: string }) => o.id === cookedId),
      "eaten ration disappears from the player's scene");
    assert.equal(s.settlement.yields.find((v: { resourceId: string }) =>
      v.resourceId === "resource:cooked").stock, sharedFoodBefore,
      "eating carried food does not consume shared food");


    // M2-A3: Web sow/tend/harvest uses actual grain and world time.
    await act("settlement-locations.arrive", { placeId: "place:field", costDays: 2 });
    const initialSeedStock = s.settlement.yields
      .find((r: { resourceId: string }) => r.resourceId === "resource:grain").stock;
    await act("settlement-locations.draw", { placeId: "place:field", resourceId: "resource:grain", amount: 1 });
    assert.equal(s.settlement.crop.phase, "fallow");
    assert.ok(s.settlement.actions.some((a: { id: string; enabled: boolean }) =>
      a.id === "settlement-locations.sow" && a.enabled));
    await act("settlement-locations.sow");
    assert.equal(s.settlement.crop.phase, "growing");
    assert.ok(!s.settlement.actions.some((a: { id: string; enabled: boolean }) =>
      a.id === "settlement-locations.harvest" && a.enabled));
    await act("settlement-locations.tend", { spaceId: "space:field-edge" });
    assert.equal(s.settlement.crop.tended, true);
    const cropSaved = (await call("save", { label: "crop-growing" })).data.save;
    const cropLoaded = await call("load", { save: cropSaved });
    assert.equal(cropLoaded.data.result.ok, true);
    s = cropLoaded.data.state;
    assert.equal(s.settlement.crop.phase, "growing", "growing crop survives save/load");
    // Growth time depends on the sowing season (30 days spring/summer, up to 60 in winter).
    for (let day = 0; day < 60 && s.settlement.crop.phase !== "ready"; day += 1) await act("settlement-locations.end_day");
    assert.equal(s.settlement.crop.phase, "ready");
    await act("settlement-locations.harvest");
    assert.equal(s.settlement.crop.phase, "fallow");
    assert.equal(s.settlement.carrying.find((r: { resourceId: string }) =>
      r.resourceId === "resource:grain")?.count, 3);
    const farmerTrades = s.settlement.neighbours.find((resident: { realName: string }) =>
      resident.realName === "阿予")?.tradeCount ?? 0;
    assert.equal(farmerTrades, 0, "harvest day does not mint a predetermined trade");
    const remainingGrain = s.settlement.yields.find((r: { resourceId: string }) =>
      r.resourceId === "resource:grain").stock;
    const heapCapacity = s.settlement.yields.find((r: { resourceId: string }) =>
      r.resourceId === "resource:grain").capacity ?? initialSeedStock;
    assert.ok(remainingGrain >= 0 && remainingGrain <= heapCapacity,
      "harvest surplus returns to the field heap, which never exceeds its capacity");
    // Let a day pass, then keep saving and loading the whole world.
    const beforeDay = s.tick;
    await act("settlement-locations.end_day");
    assert.equal(s.tick, beforeDay + 1, "one action is one day");


    // M2-UX2-A: multiple real actions within the same world day.
    const scheduleDay = s.tick;
    const budgetAtStart = s.settlement.dailyActivity;
    assert.equal(budgetAtStart.used, 0);
    const grainBeforeMeals = s.settlement.yields
      .find((r: { resourceId: string }) => r.resourceId === "resource:grain").stock;
    await act("settlement-locations.eat", { resourceId: "resource:grain", placeId: "place:field" });
    const staleBudget = s.settlement.dailyActivity.used;
    await act("settlement-locations.tend", { spaceId: "space:field-edge" });
    assert.equal(s.tick, scheduleDay, "breakfast and field work share a world day");
    const staleSameDay = await call("action", {
      action: "settlement-locations.eat",
      payload: { resourceId: "resource:grain", placeId: "place:field" },
      expectedTick: s.tick, expectedActorId: s.character.id,
      expectedActivityUsed: staleBudget,
    });
    assert.equal(staleSameDay.status, 409, "same-tick, old-balance commands cannot replay");
    await act("settlement-locations.eat", { resourceId: "resource:grain", placeId: "place:field" });
    await act("settlement-locations.rest", { spaceId: "space:field-edge" });
    assert.equal(s.tick, scheduleDay, "lunch and rest stay within the same day");
    assert.equal(s.settlement.dailyActivity.used, 7);
    assert.equal(s.settlement.yields.find((r: { resourceId: string }) =>
      r.resourceId === "resource:grain").stock, grainBeforeMeals - 2);
    await act("settlement-locations.eat", { resourceId: "resource:grain", placeId: "place:field" });
    assert.equal(s.settlement.dailyActivity.remaining, 0);
    const stockAtCapacity = s.settlement.yields.find((r: { resourceId: string }) =>
      r.resourceId === "resource:grain").stock;
    const exceeded = await call("action", {
      action: "settlement-locations.eat",
      payload: { resourceId: "resource:grain", placeId: "place:field" },
      expectedTick: s.tick, expectedActorId: s.character.id,
      expectedActivityUsed: s.settlement.dailyActivity.used,
    });
    assert.equal(exceeded.status, 200);
    assert.equal(exceeded.data.result.ok, false, "daily budget prevents overbooking");
    assert.equal(exceeded.data.state.settlement.yields.find((r: { resourceId: string }) =>
      r.resourceId === "resource:grain").stock, stockAtCapacity, "rejected action costs nothing");
    await act("settlement-locations.end_day");
    assert.equal(s.tick, scheduleDay + 1);
    assert.equal(s.settlement.dailyActivity.remaining, 8, "next day replenishes available activity time");

    const saved = (await call("save", { label: "m1-checkpoint" })).data.save;
    const loaded = await call("load", { save: saved });
    assert.equal(loaded.data.result.ok, true);
    const reloaded = loaded.data.state;
    assert.equal(reloaded.tick, s.tick);
    assert.equal(reloaded.settlement.placeId, s.settlement.placeId);
    assert.equal(reloaded.settlement.neighbours.length, s.settlement.neighbours.length);
    assert.deepEqual(reloaded.settlement.yields, s.settlement.yields);

    // The catalogue reports the modules actually loaded, with no phantom entries.
    const catalog = (await call("catalog")).data;
    assert.equal(catalog.modules.find((m: { id: string }) => m.id === "settlement-locations").loaded, true);
    assert.equal(catalog.modules.find((m: { id: string }) => m.id === "world-clock").loaded, true);
    // Geography is genuinely loaded now: the web opening installs a map pack and
    // pins the village to a location on it, which is what makes travelling to a
    // real place possible. It used to be listed but never installed.
    assert.equal(catalog.modules.find((m: { id: string }) => m.id === "world-geography").loaded, true);
    assert.equal(catalog.modules.find((m: { id: string }) => m.id === "travel").loaded, true);

    assert.equal(stderr, "");
  } finally {
    child.kill();
  }
});


test("M2-UX2-B: configured routine repeats real actions, survives save, and yields to manual play", { timeout: 40000 }, async () => {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../apps/web/server.ts", import.meta.url))], {
    env: { ...process.env, OPENLIFE_PERSISTENCE: "0", PORT: "0" }, stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (data) => { stderr += data; });
  try {
    const base = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`server startup timeout: ${stderr}`)), 10000);
      let output = "";
      child.stdout.on("data", (data) => {
        output += data;
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+(?=\r?\n)/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
      child.on("error", (error) => { clearTimeout(timer); reject(error); });
      child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`server exit ${code}: ${stderr}`)); });
    });
    const call = async (path: string, body?: Record<string, unknown>) => {
      const response = await fetch(`${base}/api/${path}`, body
        ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
      return { status: response.status, data: await response.json() as Record<string, any> };
    };
    let s = (await call("state")).data;
    const action = async (type: string, payload: Record<string, unknown> = {}) => {
      const result = await call("action", {
        action: type, payload, expectedTick: s.tick, expectedActorId: s.character.id,
        expectedActivityUsed: s.settlement.dailyActivity.used,
        expectedPlanRevision: s.settlement.dailyPlan.revision,
      });
      assert.equal(result.status, 200);
      s = result.data.state;
      return result.data.result;
    };
    assert.equal(s.settlement.dailyPlan.enabled, false, "old/default world has no implicit plan");
    const invalid = await action("settlement-locations.plan.configure", {
      steps: ["invent_food"], enabled: true, repeat: true,
    });
    assert.equal(invalid.ok, false);
    assert.equal(s.settlement.dailyPlan.revision, 0);

    assert.equal((await action("settlement-locations.arrive", { placeId: "place:field" })).ok, true);
    assert.equal((await action("settlement-locations.plan.configure", {
      steps: ["eat", "tend", "rest"], enabled: true, repeat: true,
    })).ok, true);
    assert.equal(s.settlement.dailyPlan.revision, 1);
    const grainBefore = s.settlement.yields.find((v: { resourceId: string }) =>
      v.resourceId === "resource:grain").stock;
    const startTick = s.tick;
    let batch = await call("autosim", { mode: "continuous-batch", days: 2,
      expectedTick: s.tick, expectedActorId: s.character.id,
      expectedPlanRevision: s.settlement.dailyPlan.revision });
    assert.equal(batch.status, 200);
    assert.equal(batch.data.result.interrupted, false, JSON.stringify(batch.data.result));
    assert.deepEqual(batch.data.result.actions, ["eat", "tend", "rest", "eat", "tend", "rest"]);
    s = batch.data.state;
    assert.equal(s.tick, startTick + 2);
    const grainAfterTwoDays = s.settlement.yields.find((v: { resourceId: string }) =>
      v.resourceId === "resource:grain").stock;
    assert.ok(grainAfterTwoDays >= 0 && grainAfterTwoDays <= grainBefore - 2,
      "the player consumed two real portions, and other residents can gather more");    assert.equal(s.settlement.dailyPlan.progressIndex, 0, "next day's routine starts at step 0");
    const saved = (await call("save", { label: "configured-routine" })).data.save;
    const loaded = await call("load", { save: saved });
    assert.equal(loaded.data.result.ok, true);
    s = loaded.data.state;
    assert.deepEqual(s.settlement.dailyPlan.steps, ["eat", "tend", "rest"]);
    batch = await call("autosim", { mode: "continuous-batch", days: 1,
      expectedTick: s.tick, expectedActorId: s.character.id,
      expectedPlanRevision: s.settlement.dailyPlan.revision });
    assert.equal(batch.data.result.interrupted, false);
    assert.deepEqual(batch.data.result.actions, ["eat", "tend", "rest"]);
    s = batch.data.state;
    const grainAfterThreeDays = s.settlement.yields.find((v: { resourceId: string }) =>
      v.resourceId === "resource:grain").stock;
    assert.ok(grainAfterThreeDays >= 0 && grainAfterThreeDays <= grainAfterTwoDays - 1,
      "save/load does not repeat the previous two days; the third meal consumes grain");
    const manual = await action("settlement-locations.eat", {
      resourceId: "resource:grain", placeId: "place:field",
    });
    assert.equal(manual.ok, true);
    assert.equal(s.settlement.dailyPlan.enabled, false, "manual action suspends routine");
    assert.equal(s.settlement.dailyPlan.revision, 2);

    assert.equal((await action("settlement-locations.arrive", { placeId: "place:yard" })).ok, true);
    assert.equal((await action("settlement-locations.plan.configure", {
      steps: ["tend"], enabled: true, repeat: true,
    })).ok, true);
    const blockedTick = s.tick;
    const blocked = await call("autosim", { mode: "continuous-batch", days: 3,
      expectedTick: s.tick, expectedActorId: s.character.id,
      expectedPlanRevision: s.settlement.dailyPlan.revision });
    assert.equal(blocked.status, 200);
    assert.equal(blocked.data.result.interrupted, true);
    assert.match(String(blocked.data.result.stopReason), /劳动|位置/);
    assert.equal(blocked.data.state.tick, blockedTick);
    assert.equal(blocked.data.state.settlement.dailyPlan.progressIndex, 0);

    const stale = await call("autosim", { mode: "continuous-batch", days: 1,
      expectedTick: s.tick, expectedActorId: s.character.id, expectedPlanRevision: 1 });
    assert.equal(stale.status, 409, "stale plan revision cannot drive a different routine");
    // M2-UX2-C: start at the yard, eat at the hearth, tend the field,
    // and walk to the pottery kiln within a single world day.
    const newPlan = await action("settlement-locations.plan.configure", {
      steps: ["go-hearth", "go-field", "tend", "go-kiln"],
      enabled: true, repeat: true,
    });
    assert.equal(newPlan.ok, true);
    const villageDay = s.tick;
    const hearthBefore = s.settlement.dailyActivity.used;
    const routeBatch = await call("autosim", {
      mode: "continuous-batch", days: 2,
      expectedTick: s.tick, expectedActorId: s.character.id,
      expectedPlanRevision: s.settlement.dailyPlan.revision,
    });
    assert.equal(routeBatch.status, 200);
    assert.equal(routeBatch.data.result.interrupted, false, JSON.stringify(routeBatch.data.result));
    assert.deepEqual(routeBatch.data.result.actions,
      ["go-hearth", "go-field", "tend", "go-kiln",
       "go-hearth", "go-field", "tend", "go-kiln"]);
    // The move/work routine must not depend on infinite communal food;
    // food is actually consumed by both the player and living NPCs.
    s = routeBatch.data.state;
    assert.equal(s.tick, villageDay + 2, "two whole daily routines cost two global days");
    assert.equal(s.settlement.placeId, "place:kiln", "daily route ends at the real kiln");
    assert.equal(s.settlement.dailyActivity.used, 0, "new day resets local walk/work capacity");
    assert.equal(s.settlement.dailyPlan.enabled, true);
    assert.ok(s.settlement.dailyPlan.steps.includes("go-field"));
    assert.equal(hearthBefore, 0, "previous manual travels do not silently spend today's activity");
    const travelStep = s.settlement.actions.find((a: { id: string; payload: { travelMode?: string }; activityCost?: number }) =>
      a.id === "settlement-locations.arrive" && a.payload.travelMode === "local");
    assert.equal(travelStep?.activityCost, 1, "the Web now offers intra-village walks at a one-slot cost");
    // M2-UX2-D: pottery demands real village materials and pauses at a
    // genuine Practice checkpoint rather than auto-selecting clay treatment.
    s = (await call("reset", { seed: 104 })).data.state;
    assert.equal(s.settlement.placeId, "place:yard");
    assert.equal((await action("settlement-locations.plan.configure", {
      steps: ["go-kiln", "pottery"], enabled: true, repeat: false,
    })).ok, true);
    const missing = await call("autosim", { mode: "continuous-batch", days: 2,
      expectedTick: s.tick, expectedActorId: s.character.id,
      expectedPlanRevision: s.settlement.dailyPlan.revision });
    assert.equal(missing.status, 200);
    assert.equal(missing.data.result.interrupted, true);
    assert.match(String(missing.data.result.stopReason), /黏土|柴草/);
    assert.deepEqual(missing.data.result.actions, ["go-kiln"], "missing inputs never start a phantom pottery Practice");
    s = missing.data.state;
    assert.equal(s.settlement.dailyPlan.progressIndex, 1);
    assert.equal(s.player.practice, null);
    assert.equal((await action("settlement-locations.arrive", { placeId: "place:claypits", costDays: 2 })).ok, true);
    assert.equal((await action("settlement-locations.draw", {
      placeId: "place:claypits", resourceId: "resource:clay", amount: 1,
    })).ok, true);
    assert.equal((await action("settlement-locations.arrive", { placeId: "place:reedbed", costDays: 3 })).ok, true);
    for (let i = 0; i < 2; i += 1) {
      assert.equal((await action("settlement-locations.draw", {
        placeId: "place:reedbed", resourceId: "resource:fuel", amount: 1,
      })).ok, true);
    }
    const rawStock = s.settlement.carried;
    assert.equal(rawStock.find((entry: {resourceId: string}) => entry.resourceId === "resource:clay")?.count, 1);
    assert.equal(rawStock.find((entry: {resourceId: string}) => entry.resourceId === "resource:fuel")?.count, 2);
    assert.equal((await action("settlement-locations.plan.configure", {
      steps: ["go-kiln", "pottery"], enabled: true, repeat: false,
    })).ok, true);
    const potteryBatch = await call("autosim", {
      mode: "continuous-batch", days: 2, expectedTick: s.tick, expectedActorId: s.character.id,
      expectedPlanRevision: s.settlement.dailyPlan.revision,
    });
    assert.equal(potteryBatch.status, 200);
    assert.equal(potteryBatch.data.result.interrupted, true, JSON.stringify(potteryBatch.data.result));
    assert.match(String(potteryBatch.data.result.stopReason), /亲自决定/);
    assert.deepEqual(potteryBatch.data.result.actions, ["go-kiln", "pottery"]);
    s = potteryBatch.data.state;
    assert.equal(s.settlement.placeId, "place:kiln");
    assert.ok(s.player.practice?.interaction, "actual Practice reached a player-facing checkpoint");
    assert.ok(s.actions.some((item: {id: string}) => item.id === "pottery-choice"),
      "manual pottery choices are visible even in the newer default village");
    assert.equal(s.settlement.carried.find((entry: {resourceId: string}) =>
      entry.resourceId === "resource:clay"), undefined);
    assert.equal(s.settlement.carried.find((entry: {resourceId: string}) =>
      entry.resourceId === "resource:fuel"), undefined);
    assert.equal(s.settlement.dailyPlan.enabled, false, "one-time plan does not restart the same vessel");
    const potterySave = (await call("save", { label: "pottery-checkpoint" })).data.save;
    const savedPottery = await call("load", { save: potterySave });
    assert.equal(savedPottery.data.result.ok, true);
    s = savedPottery.data.state;
    assert.ok(s.player.practice?.interaction, "pottery decision survives a real world save");
    const manualChoice = s.actions.find((choice: { id: string; enabled: boolean }) =>
      choice.id === "pottery-choice" && choice.enabled);
    assert.ok(manualChoice, "player is offered a real pottery treatment decision");
    assert.equal((await action(manualChoice.id, manualChoice.payload)).ok, true,
      "manual pottery decision passes through the original Practice command");
    assert.equal(s.settlement.dailyPlan.enabled, false, "manual craft does not silently resume automation");

    const page = await (await fetch(`${base}/`)).text();
    const script = await (await fetch(`${base}/app.js`)).text();
    assert.match(page, /id="planSteps"/);
    assert.match(page, /id="saveDailyPlan"/);
    assert.match(page, /id="disableDailyPlan"/);
    assert.match(script, /function openPlanEditor\(/);
    assert.match(script, /"settlement-locations.plan.configure"/);
    assert.equal(stderr, "");
  } finally {
    child.kill();
  }
});

test("M2-UX1: bounded continuous batches advance, guard stale requests, and stop at real hunger crisis", { timeout: 40000 }, async () => {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../apps/web/server.ts", import.meta.url))], {
    env: { ...process.env, OPENLIFE_PERSISTENCE: "0", PORT: "0" }, stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (data) => { stderr += data; });
  try {
    const base = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`server startup timeout: ${stderr}`)), 10000);
      let output = "";
      child.stdout.on("data", (data) => {
        output += data;
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+(?=\r?\n)/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
      child.on("error", (error) => { clearTimeout(timer); reject(error); });
      child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`server exit ${code}: ${stderr}`)); });
    });
    const call = async (path: string, body?: Record<string, unknown>) => {
      const response = await fetch(`${base}/api/${path}`, body
        ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
        : {});
      return { status: response.status, data: await response.json() as Record<string, any> };
    };
    let state = (await call("state")).data;
    const actorId = state.character.id;
    const startingTick = state.tick;
    const invalid = await call("autosim", { mode: "continuous-batch", days: 90, expectedTick: state.tick, expectedActorId: actorId });
    assert.equal(invalid.status, 400, "no enormous uninterruptible batch");
    assert.equal((await call("state")).data.tick, startingTick);
    let totalDays = 0;
    let stopped = false;
    for (let i = 0; i < 12; i += 1) {
      const previousTick = state.tick;
      const response = await call("autosim", {
        mode: "continuous-batch", days: 3, expectedTick: previousTick, expectedActorId: actorId,
      });
      assert.equal(response.status, 200);
      assert.equal(response.data.result.ok, true, JSON.stringify(response.data.result.errors));
      state = response.data.state;
      const batchDays = state.tick - previousTick;
      assert.equal(response.data.result.days, batchDays);
      assert.ok(batchDays >= 1 && batchDays <= 3, "one browser-controlled batch at a time");
      totalDays += batchDays;
      if (i === 0) {
        const stale = await call("autosim", { mode: "continuous-batch", days: 1,
          expectedTick: previousTick, expectedActorId: actorId });
        assert.equal(stale.status, 409, "client must not replay stale batch");
        assert.equal((await call("state")).data.tick, state.tick);
      }
      if (response.data.result.interrupted) {
        stopped = true;
        assert.match(String(response.data.result.stopReason), /饥饿/);
        break;
      }
    }
    assert.equal(stopped, true, "real critical need returns control to the player");
    assert.equal(totalDays, 20, "hunger +1 every 2 days: stops on the crisis, not at the end of a three-day batch");
    assert.equal(state.settlement.hunger, 10);
    const after = await call("autosim", { mode: "continuous-batch", days: 3,
      expectedTick: state.tick, expectedActorId: actorId });
    assert.equal(after.data.result.interrupted, true);
    assert.equal(after.data.result.days, 0, "cannot endlessly continue through urgent hunger");
    assert.equal(after.data.state.tick, state.tick);
    const saved = (await call("save", { label: "continuous-time" })).data.save;
    const load = await call("load", { save: saved });
    assert.equal(load.data.result.ok, true);
    assert.equal(load.data.state.tick, state.tick);
    assert.equal(load.data.state.settlement.hunger, 10);
    const page = await (await fetch(`${base}/`)).text();
    const script = await (await fetch(`${base}/app.js`)).text();
    assert.match(page, /id="pauseAutoButton"/, "the Pause control is present in real HTML");
    assert.match(page, /id="startContinuousAuto"/, "the Start control is present in real HTML");
    assert.match(script, /"continuous-batch"/, "client requests bounded batches");
    assert.match(script, /function pauseContinuousLife\(/, "client implements pause between batches");
    assert.equal(stderr, "");
  } finally {
    child.kill();
  }
});

test("Web player can still finish the older pottery slice from its own save", { timeout: 40000 }, async () => {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../apps/web/server.ts", import.meta.url))], {
    env: { ...process.env, OPENLIFE_PERSISTENCE: "0", PORT: "0", OPENLIFE_START: "pottery" }, stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (data) => { stderr += data; });
  try {
    const base = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`server startup timeout: ${stderr}`)), 10000);
      let output = "";
      child.stdout.on("data", (data) => {
        output += data;
        // Wait for the complete log line: stdout chunks can split a port number.
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+(?=\r?\n)/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
      child.on("error", (error) => { clearTimeout(timer); reject(error); });
      child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`server exit ${code}: ${stderr}`)); });
    });
    const call = async (path: string, body?: Record<string, unknown>) => {
      const response = await fetch(`${base}/api/${path}`, body
        ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
        : {});
      return { status: response.status, data: await response.json() as Record<string, any> };
    };

    const s = (await call("state")).data;
    assert.equal(s.character.age, 16);
    // The pottery scenario is opt-in, so the settlement must not be founded here.
    assert.equal(s.settlement, null);
    // Entering the old slice is implicit: its first actions are the craft ones.
    assert.ok(s.actions.some((action: { id: string; enabled: boolean }) => action.id === "life-study" && action.enabled));
    assert.ok(s.actions.some((action: { id: string }) => action.id === "pottery-start"));
    assert.equal(stderr, "");
  } finally {
    child.kill();
  }
});
