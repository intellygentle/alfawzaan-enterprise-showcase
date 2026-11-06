import assert from "node:assert/strict";
import test from "node:test";
import { buildPromotionPdf } from "../../lib/salesPulse/exports";
import { buildWeeklyPromotionPlan, DEFAULT_PULSE_FILTERS, filterAgedStock } from "../../lib/salesPulse/promotions";
import { agedItem, contentFixture, PULSE_NOW, pulseFixture } from "../fixtures/salesPulse";

test("current-week plans use future Lagos days and both start-week options cover the eligible queue", () => {
  const report = pulseFixture();
  const current = buildWeeklyPromotionPlan(report, { filters: DEFAULT_PULSE_FILTERS, week: "current", now: new Date(PULSE_NOW) });
  assert.equal(current.weekStart, "2026-11-02");
  assert.equal(current.weekEnd, "2026-11-08");
  assert.equal(current.availableDays, 5);
  assert.equal(current.scheduledProducts, 8);
  assert.equal(current.posts[0].date, "2026-11-04");
  assert.ok(current.posts.every((post) => post.time === "18:00"));
  const next = buildWeeklyPromotionPlan(report, { filters: DEFAULT_PULSE_FILTERS, week: "next", now: new Date(PULSE_NOW) });
  assert.equal(next.weekStart, "2026-11-09");
  assert.equal(next.weekEnd, "2026-11-15");
  assert.equal(next.availableDays, 7);
  assert.equal(next.scheduledProducts, 8);
  assert.equal(new Set(next.posts.flatMap((post) => post.products.map((product) => product.productId))).size, 8);
});

test("passed evening slots and Sunday rollovers never produce backdated posts", () => {
  const report = pulseFixture();
  const options = { filters: DEFAULT_PULSE_FILTERS, week: "current" as const };
  assert.equal(buildWeeklyPromotionPlan(report, { ...options, now: new Date("2026-11-04T17:00:01Z") }).posts[0].date, "2026-11-05");
  assert.equal(buildWeeklyPromotionPlan(report, { ...options, now: new Date("2026-11-08T17:00:01Z") }).posts.length, 0);
  const newYear = buildWeeklyPromotionPlan(report, { ...options, week: "next", now: new Date("2026-12-31T23:30:00Z") });
  assert.equal(newYear.weekStart, "2027-01-04");
});

test("both boutiques of one product share one post with accurate available units and value", () => {
  const report = pulseFixture(0);
  report.agedStock = [agedItem(), agedItem({ key: "product-one|tanke", outlet: "tanke", availableUnits: 4, grades: { extra: 4 }, stockValue: 40_000 })];
  const plan = buildWeeklyPromotionPlan(report, { filters: DEFAULT_PULSE_FILTERS, week: "next", now: new Date(PULSE_NOW) });
  assert.equal(plan.posts.length, 1);
  assert.equal(plan.posts[0].availableUnits, 14);
  assert.equal(plan.posts[0].stockValue, 140_000);
  assert.equal(plan.posts[0].products[0].items.length, 2);
  assert.equal("owner" in plan, false);
  assert.equal(plan.eligibleProducts, 1);
});

test("preview filters, exclusions and missing prices apply to the exported plan without changing the snapshot", () => {
  const report = pulseFixture();
  const original = structuredClone(report);
  const filters = { ...DEFAULT_PULSE_FILTERS, outlet: "unilorin" as const, minIdleDays: 90 };
  const eligible = filterAgedStock(report.agedStock, filters);
  const excluded = eligible[0].productId;
  const plan = buildWeeklyPromotionPlan(report, { filters, week: "next", excludedProductIds: [excluded], now: new Date(PULSE_NOW) });
  assert.ok(plan.posts.length > 0);
  assert.ok(plan.posts.flatMap((post) => post.products).every((product) => product.productId !== excluded && product.unitPrice > 0));
  assert.ok(plan.posts.flatMap((post) => post.products.flatMap((product) => product.items)).every((item) => item.outlet === "unilorin" && item.idleDays >= 90));
  assert.match(plan.scope, /Unilorin.*90\+.*1 goods skipped/);
  assert.deepEqual(report, original);
});

test("search and segment selections are respected and empty selections remain empty", () => {
  const report = pulseFixture();
  const item = report.agedStock.find((entry) => entry.unitPrice > 0)!;
  const filters = { ...DEFAULT_PULSE_FILTERS, search: `  ${item.productName.toLowerCase()}  `, valueBand: item.valueBand, segment: item.segment };
  const plan = buildWeeklyPromotionPlan(report, { filters, week: "next", now: new Date(PULSE_NOW) });
  assert.equal(plan.posts.length, 1);
  assert.equal(plan.posts[0].products[0].productId, item.productId);
  assert.equal(plan.sourceGeneratedAt, report.generatedAt);
  assert.match(plan.posts[0].products[0].productUrl, /\/store\?search=/);
  const empty = buildWeeklyPromotionPlan(report, { filters: { ...filters, search: "missing goods" }, week: "next", now: new Date(PULSE_NOW) });
  assert.deepEqual(empty.posts, []);
  assert.throws(() => buildPromotionPdf(empty), /no scheduled products/);
});

test("PDF handoffs carry every planned item, source time and evidence without an assigned team", () => {
  const report = contentFixture(8);
  report.agedStock[0].productName = "A very long product name for a gift collection ".repeat(6);
  const plan = buildWeeklyPromotionPlan(report, { filters: DEFAULT_PULSE_FILTERS, week: "next", now: new Date(PULSE_NOW) });
  const { doc, fileName } = buildPromotionPdf(plan);
  const output = doc.output();
  assert.equal(fileName, "alfawzaan-content-week-2026-11-09.pdf");
  assert.doesNotMatch(output, /Responsible team:|Team:/i);
  assert.match(output, /NGN/);
  assert.match(output, /2026/);
  for (const product of plan.posts.flatMap((post) => post.products)) {
    assert.ok(output.includes(product.productName.split(" ").slice(0, 4).join(" ")));
    assert.ok(output.includes(product.productUrl));
  }
  assert.ok(doc.getNumberOfPages() >= 2);
  assert.ok(doc.getNumberOfPages() <= 15);
  const pages = (doc.internal as unknown as { pages: string[][] }).pages.slice(1).map((page) => page.join("\n"));
  const dailyStart = pages.findIndex((page) => page.includes("Daily posts required"));
  const notesStart = pages.findIndex((page) => page.includes("Shooting notes"));
  assert.ok(dailyStart > 0 && notesStart > dailyStart);
  for (const page of pages.slice(dailyStart, notesStart)) {
    assert.match(page, /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d+ Nov 2026/, "Every continued call-sheet page must identify its content day");
  }
  assert.ok(doc.output("arraybuffer").byteLength > 5_000);
});
