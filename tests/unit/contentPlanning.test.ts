import assert from "node:assert/strict";
import test from "node:test";
import { CONTENT_CATEGORIES, contentCategoryFor, DAILY_SHOOT_BUDGET } from "../../lib/salesPulse/contentCategories";
import { buildWeeklyPromotionPlan, DEFAULT_PULSE_FILTERS } from "../../lib/salesPulse/promotions";
import type { AgedStockItem, PromotionWorkload } from "../../lib/salesPulse/types";
import { agedItem, contentFixture, PULSE_NOW, pulseFixture } from "../fixtures/salesPulse";

const options = { filters: DEFAULT_PULSE_FILTERS, week: "next" as const, now: new Date(PULSE_NOW) };
function fromItems(items: AgedStockItem[]) {
  const report = pulseFixture(0);
  report.agedStock = items;
  return report;
}
const productsIn = (plan: ReturnType<typeof buildWeeklyPromotionPlan>) => plan.posts.flatMap((post) => post.products);

test("content categories recognize requested sizes and semantic overrides without rewriting catalogue data", () => {
  const cases = [
    ["Amber 100ml", "Extra goods", "100ml"],
    ["Amber", "100 MLs", "100ml"],
    ["Honey Oud 100ml", "100MLs", "100ml"],
    ["Amber 50ml", "100MLs", "miniatures"],
    ["Amber 25ML", "Extra goods", "miniatures"],
    ["Amber 30 ml", "Fragrance", "miniatures"],
    ["Amber 5ml", "Extra", "miniatures"],
    ["Amber", "15MLs", "miniatures"],
    ["Musk", "Naseem Oils", "miniatures"],
    ["Body Mist 100ml", "100MLs", "body-home"],
    ["Body Spray 50ml", "50MLs", "body-home"],
    ["Reed diffuser 100ml", "100MLs", "body-home"],
    ["Airfreshner", "Extra", "body-home"],
    ["Body lotion 50ml", "Uncategorised", "body-home"],
    ["Pure honey", "Islamic Materials", "body-home"],
    ["Royal", "Sprays", "body-home"],
    ["Embroidered cap", "Accessories", "islamic"],
    ["Prayer mat", "Extra goods", "islamic"],
    ["Zamzam water 50ml", "50MLs", "islamic"],
    ["Premium jalabias", "Traditional Wear", "islamic"],
    ["Wall clock", "Uncategorized", "extra"],
    ["Key holder", "Elsewhere", "extra"],
  ] as const;
  for (const [productName, category, expected] of cases) {
    const source = { productName, category };
    assert.equal(contentCategoryFor(source), expected, `${productName} / ${category}`);
    assert.deepEqual(source, { productName, category });
  }
});

test("daily plans include multiple goods per stocked section and make post counts explicit", () => {
  const plan = buildWeeklyPromotionPlan(contentFixture(24), options);
  const first = plan.days[0];
  assert.deepEqual(first.categories.map((category) => category.category), CONTENT_CATEGORIES);
  assert.ok(first.categories.every((category) => category.productCount >= 2));
  assert.ok(first.productCount > first.requiredPosts, "grouped shots must cover more than one good");
  for (const day of plan.days) {
    assert.equal(day.requiredPosts, day.individualShots + day.groupShots);
    assert.equal(day.requiredPosts, day.outletPosts.unilorin + day.outletPosts.tanke);
    assert.equal(day.productCount, day.categories.reduce((sum, category) => sum + category.productCount, 0));
  }
});

test("100ml goods are individual even at a low price; low-priced miniatures share a post", () => {
  const report = fromItems([
    ...[0, 1].map((i) => agedItem({ productId: `full-${i}`, key: `full-${i}|unilorin`, productName: `Full ${i} 100ml`, unitPrice: 1_000, stockValue: 10_000 })),
    ...[0, 1].map((i) => agedItem({ productId: `mini-${i}`, key: `mini-${i}|unilorin`, productName: `Small ${i} 5ml`, category: "Miniatures", unitPrice: 1_000, stockValue: 10_000 })),
  ]);
  const plan = buildWeeklyPromotionPlan(report, options);
  const full = plan.posts.filter((post) => post.category === "100ml");
  const mini = plan.posts.filter((post) => post.category === "miniatures");
  assert.equal(full.length, 2);
  assert.ok(full.every((post) => post.shootMode === "individual" && post.products.length === 1));
  assert.equal(mini.length, 1);
  assert.equal(mini[0].products.length, 2);
  assert.equal(mini[0].shootMode, "group");
  assert.equal(plan.days[0].productCount, 4);
  assert.equal(plan.days[0].requiredPosts, 3);
});

test("higher-value goods stay individual and grouped sets share both category and physical boutique", () => {
  const plan = buildWeeklyPromotionPlan(contentFixture(30), options);
  for (const post of plan.posts) {
    assert.ok(post.products.every((product) => product.shootOutlet === post.outlet && product.contentCategory === post.category));
    assert.ok(post.products.every((product) => product.items.some((item) => item.outlet === post.outlet && item.availableUnits > 0)));
    if (post.shootMode === "group") {
      assert.notEqual(post.category, "100ml");
      assert.ok(post.products.length >= 2 && post.products.length <= 4);
      assert.ok(post.products.every((product) => product.unitPrice <= 10_000));
    } else assert.equal(post.products.length, 1);
    if (post.products.some((product) => product.unitPrice > 10_000)) assert.equal(post.shootMode, "individual");
  }
});

test("a representative is never told to take a group photo of goods at different boutiques", () => {
  const report = fromItems([
    agedItem({ productId: "u", key: "u|unilorin", category: "Miniatures", unitPrice: 2_000 }),
    agedItem({ productId: "t", key: "t|tanke", outlet: "tanke", category: "Miniatures", unitPrice: 2_000 }),
  ]);
  const plan = buildWeeklyPromotionPlan(report, options);
  assert.equal(plan.posts.length, 2);
  assert.ok(plan.posts.every((post) => post.shootMode === "individual"));
});

test("larger value and longer inactivity earn more daily allocation with equal category backlogs", () => {
  const report = fromItems([
    ...Array.from({ length: 14 }, (_, i) => agedItem({ productId: `urgent-${i}`, key: `urgent-${i}|unilorin`, category: "Extra goods", productName: `High value accessory ${i}`, unitPrice: 100_000, stockValue: 1_000_000, idleDays: 180 })),
    ...Array.from({ length: 14 }, (_, i) => agedItem({ productId: `quiet-${i}`, key: `quiet-${i}|unilorin`, category: "Miniatures", productName: `Small oil ${i}`, unitPrice: 100, stockValue: 1_000, idleDays: 30 })),
  ]);
  const first = buildWeeklyPromotionPlan(report, options).days[0];
  assert.equal(first.categories.find((category) => category.category === "extra")?.productCount, 3);
  assert.equal(first.categories.find((category) => category.category === "miniatures")?.productCount, 2);
});

test("daily workload and per-category limits hold through a large multi-week queue", () => {
  const report = contentFixture(100);
  for (const workload of ["light", "balanced", "extended"] as PromotionWorkload[]) {
    const first = buildWeeklyPromotionPlan(report, { ...options, workload });
    assert.ok(first.coverageWeeks.length > 1);
    const ids: string[] = [];
    for (const week of first.coverageWeeks) {
      const plan = buildWeeklyPromotionPlan(report, { ...options, workload, coverageWeek: week.index });
      ids.push(...productsIn(plan).map((product) => product.productId));
      assert.equal(plan.plannedBeforeThisWeek + plan.scheduledProducts + plan.remainingProducts, plan.eligibleProducts);
      for (const category of plan.categorySummary) assert.equal(category.earlierWeeks + category.thisWeek + category.laterWeeks, category.eligible);
      for (const day of plan.days) for (const outlet of ["unilorin", "tanke"] as const) {
        assert.ok(day.outletPosts[outlet] <= DAILY_SHOOT_BUDGET[workload]);
        for (const category of day.categories) {
          const count = category.posts.filter((post) => post.outlet === outlet).reduce((sum, post) => sum + post.products.length, 0);
          assert.ok(count <= (category.category === "100ml" ? 6 : 8));
        }
      }
    }
    assert.equal(ids.length, first.eligibleProducts);
    assert.equal(new Set(ids).size, first.eligibleProducts, "later coverage weeks must not repeat earlier goods");
  }
});

test("coverage is deterministic, preserves the snapshot, and clamps a stale coverage-week selection", () => {
  const report = contentFixture(60);
  const original = structuredClone(report);
  const plan = buildWeeklyPromotionPlan(report, options);
  const shuffled = structuredClone(report);
  shuffled.agedStock.reverse();
  assert.deepEqual(buildWeeklyPromotionPlan(shuffled, options), plan);
  assert.deepEqual(report, original);
  const last = buildWeeklyPromotionPlan(report, { ...options, coverageWeek: 99 });
  assert.equal(last.coverageWeek, last.coverageWeeks.length - 1);
  assert.equal(last.remainingProducts, 0);
});

test("small queues taper without fake group members, duplicates or invented posts", () => {
  const report = fromItems([agedItem({ category: "Miniatures", unitPrice: 500 }), agedItem({ category: "Miniatures", unitPrice: 500 })]);
  const plan = buildWeeklyPromotionPlan(report, options);
  assert.equal(plan.eligibleProducts, 1);
  assert.equal(plan.posts.length, 1);
  assert.equal(plan.posts[0].shootMode, "individual");
  assert.equal(plan.days.slice(1).reduce((sum, day) => sum + day.requiredPosts, 0), 0);
  assert.equal(plan.remainingProducts, 0);
});
