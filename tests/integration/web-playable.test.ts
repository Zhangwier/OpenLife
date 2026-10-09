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
test("Web player walks the settlement, borrows a jar, fetches water and returns it", { timeout: 40000 }, async () => {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../apps/web/server.ts", import.meta.url))], {
    env: { ...process.env, PORT: "0" }, stdio: ["ignore", "pipe", "pipe"],
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
    for (let day = 0; day < 30; day += 1) await act("settlement-locations.end_day");
    assert.equal(s.settlement.crop.phase, "ready");
    await act("settlement-locations.harvest");
    assert.equal(s.settlement.crop.phase, "fallow");
    assert.equal(s.settlement.carrying.find((r: { resourceId: string }) =>
      r.resourceId === "resource:grain")?.count, 3);
    assert.equal(s.settlement.yields.find((r: { resourceId: string }) =>
      r.resourceId === "resource:grain").stock, initialSeedStock - 1,
      "seed grain reserve did not replenish itself or duplicate the harvest");

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
    assert.equal(catalog.modules.find((m: { id: string }) => m.id === "world-geography").loaded, false);

    assert.equal(stderr, "");
  } finally {
    child.kill();
  }
});


test("M2-UX2-B: configured routine repeats real actions, survives save, and yields to manual play", { timeout: 40000 }, async () => {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../apps/web/server.ts", import.meta.url))], {
    env: { ...process.env, PORT: "0" }, stdio: ["ignore", "pipe", "pipe"],
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
    assert.equal(s.settlement.yields.find((v: { resourceId: string }) =>
      v.resourceId === "resource:grain").stock, grainBefore - 2);
    assert.equal(s.settlement.dailyPlan.progressIndex, 0, "next day's routine starts at step 0");
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
    assert.equal(s.settlement.yields.find((v: { resourceId: string }) =>
      v.resourceId === "resource:grain").stock, grainBefore - 3,
      "save/load did not repeat the previous two days' meals");

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
      steps: ["go-hearth", "eat", "go-field", "tend", "go-kiln"],
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
      ["go-hearth", "eat", "go-field", "tend", "go-kiln",
       "go-hearth", "eat", "go-field", "tend", "go-kiln"]);
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
    env: { ...process.env, PORT: "0" }, stdio: ["ignore", "pipe", "pipe"],
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
    for (let i = 0; i < 6; i += 1) {
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
    assert.equal(totalDays, 10, "stops on the crisis, not at the end of a three-day batch");
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
    env: { ...process.env, PORT: "0", OPENLIFE_START: "pottery" }, stdio: ["ignore", "pipe", "pipe"],
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
