import assert from "node:assert/strict";
import test from "node:test";
import { sourceCapacity, sourceNextStock, sourceStage } from "../apps/card-world/resource-ecology.js";

test("winter kills frost-sensitive growth while deep pines remain harvestable", () => {
  const winter = { season: "冬", weather: "雪", day: 13, winterDay: 1 };
  assert.equal(sourceNextStock("hemp", 5, winter), 0);
  assert.equal(sourceNextStock("berries", 5, winter), 0);
  assert.equal(sourceNextStock("chestnut", 4, { ...winter, frostProne: true }), 0);
  assert.equal(sourceNextStock("chestnut", 4, winter), 2);
  assert.equal(sourceNextStock("pineGrove", 3, winter), 4);
  assert.equal(sourceStage("pineGrove", 4, winter), "snowgreen");
});

test("weather changes real yield, and a depleted node waits before renewing", () => {
  const summer = { season: "夏", weather: "晴", day: 8 };
  assert.equal(sourceNextStock("berries", 3, { ...summer, drought: true }), 2);
  assert.equal(sourceNextStock("berries", 3, { ...summer, weather: "雨" }), 7);
  assert.equal(sourceNextStock("reeds", 0, { ...summer, readyDay: 9 }), 0);
  assert.equal(sourceNextStock("reeds", 0, { ...summer, day: 9, readyDay: 9 }), 2);
  assert.equal(sourceCapacity("lake", { ...summer, season: "冬" }), 3);
  assert.equal(sourceNextStock("lake", 3, { ...summer, season: "春", flood: true }), 6);
});
