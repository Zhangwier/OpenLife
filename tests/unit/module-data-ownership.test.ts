/**
 * INV-007: a module's component data is written only by that module, or by a
 * module its owner explicitly granted in `writableBy`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DefinitionSet } from "@openlife/rule-engine";
import { Kernel } from "@openlife/kernel";
import { seedEntities } from "../helpers/seed.ts";

function kernelWith(writableBy?: string[]) {
  const definitions = new DefinitionSet();
  definitions.components.register("owner.secret",
    { id: "owner.secret", persist: true, ...(writableBy ? { writableBy } : {}) }, "owner");
  for (const module of ["owner", "intruder"]) {
    definitions.commands.register(`${module}.write`, { type: `${module}.write` }, module);
    definitions.resolutions.register(`${module}.write.resolve`, {
      id: `${module}.write.resolve`, kind: "resolution", commandType: `${module}.write`,
      resolve: () => [{ kind: "setComponent", entityId: "thing", component: "owner.secret", value: { by: module } }],
    }, module);
  }
  definitions.commands.register("intruder.ghost", { type: "intruder.ghost" }, "intruder");
  definitions.resolutions.register("intruder.ghost.resolve", {
    id: "intruder.ghost.resolve", kind: "resolution", commandType: "intruder.ghost",
    resolve: () => [{ kind: "modifyComponent", entityId: "thing", component: "intruder.unregistered", patch: { x: 1 } }],
  }, "intruder");
  const kernel = new Kernel({ worldSeed: 1, definitions });
  seedEntities(kernel, [{ id: "thing", kind: "test.thing", components: {} }]);
  return kernel;
}

test("INV-007: the owning module writes its own component", () => {
  const kernel = kernelWith();
  assert.equal(kernel.dispatch({ type: "owner.write" }).ok, true);
  assert.deepEqual(kernel.worldView().getComponent("thing", "owner.secret"), { by: "owner" });
});

test("INV-007: another module cannot write it, and the transaction leaves no trace", () => {
  const kernel = kernelWith();
  const before = kernel.internals.store.fingerprint();
  const result = kernel.dispatch({ type: "intruder.write" });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0]?.code, "E_PERMISSION_DENIED");
  assert.equal(kernel.internals.store.fingerprint(), before);
});

test("INV-007: an explicit owner grant allows exactly the named module", () => {
  const kernel = kernelWith(["intruder"]);
  assert.equal(kernel.dispatch({ type: "intruder.write" }).ok, true);
  assert.deepEqual(kernel.worldView().getComponent("thing", "owner.secret"), { by: "intruder" });
});

test("INV-007: writing an unregistered component is rejected", () => {
  const kernel = kernelWith();
  const result = kernel.dispatch({ type: "intruder.ghost" });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0]?.code, "E_UNKNOWN_COMPONENT");
});
