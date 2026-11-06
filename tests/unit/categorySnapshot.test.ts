import assert from "node:assert/strict";
import test from "node:test";
import { buildWeeklyPromotionPlan, DEFAULT_PULSE_FILTERS, selectDailyCategorySnapshot } from "../../lib/salesPulse/promotions";
import type { ContentCategory } from "../../lib/salesPulse/types";
import { contentFixture, PULSE_NOW } from "../fixtures/salesPulse";

const options = { filters: DEFAULT_PULSE_FILTERS, week: "next" as const, now: new Date(PULSE_NOW) };

test("category pictures use only the requested day's goods and category-level counts", () => {
  const plan = buildWeeklyPromotionPlan(contentFixture(8), options);
  const original = structuredClone(plan);
  const monday = selectDailyCategorySnapshot(plan, "2026-11-09", "miniatures");
  assert.equal(monday.date, "2026-11-09");
  assert.equal(monday.category, "miniatures");
  assert.equal(monday.productCount, 4);
  assert.equal(monday.posts.length, 3);
  assert.equal(monday.individualShots, 2);
  assert.equal(monday.groupShots, 1);
  assert.deepEqual(monday.outletPosts, { unilorin: 1, tanke: 2 });
  assert.ok(monday.posts.every((post) => post.date === monday.date && post.category === "miniatures"));
  assert.ok(monday.posts.flatMap((post) => post.products).every((product) => product.contentCategory === "miniatures"));
  assert.ok(monday.productCount < plan.days[0].productCount);
  assert.ok(monday.posts.length < plan.days[0].requiredPosts);

  const tuesday = selectDailyCategorySnapshot(plan, "2026-11-10", "miniatures");
  const mondayIds = new Set(monday.posts.flatMap((post) => post.products.map((product) => product.productId)));
  assert.ok(tuesday.posts.flatMap((post) => post.products).every((product) => !mondayIds.has(product.productId)));
  assert.deepEqual(plan, original);
});

test("missing, empty or stale category selections never fall back to another picture", () => {
  const plan = buildWeeklyPromotionPlan(contentFixture(8), options);
  for (const [date, category] of [
    ["2026-11-15", "miniatures"], // This small queue has already been allocated on earlier days.
    ["2026-11-02", "100ml"],
    ["not-a-date", "extra"],
    ["2026-11-09", "unknown"],
  ]) {
    assert.throws(() => selectDailyCategorySnapshot(plan, date, category as ContentCategory), /No scheduled goods for this category on the selected day/);
  }
});
