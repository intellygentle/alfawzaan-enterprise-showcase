import type { Outlet } from "../types";
import { calendarDays, formatPulseDate, lagosDate, shiftDate } from "./dates";
import {
  CONTENT_CATEGORIES, CONTENT_CATEGORY_LABEL, contentCategoryFor, DAILY_SHOOT_BUDGET,
  LOW_VALUE_PHOTO_LIMIT, MAX_100ML_PRODUCTS_PER_DAY, MAX_CATEGORY_PRODUCTS_PER_DAY, MAX_GROUP_PHOTO_PRODUCTS,
} from "./contentCategories";
import {
  SEGMENT_LABEL, VALUE_BAND_LABEL, type AgedStockItem, type ContentCategory, type DailyCategorySnapshot, type PromotionDay,
  type PromotionPost, type PromotionProduct, type PromotionWeek, type PromotionWorkload,
  type PulseFilters, type SalesPulseReport, type WeeklyPromotionPlan,
} from "./types";

export const DEFAULT_PULSE_FILTERS: PulseFilters = {
  outlet: "all", minIdleDays: 30, valueBand: "all", segment: "all", search: "",
};

export const outletLabel = (outlet: string) => outlet === "unilorin" ? "Unilorin" : "Tanke";
export const pulseMoney = (value: number) => `₦${value.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

export function idleLabel(item: AgedStockItem): string {
  return item.lastSoldAt
    ? `${item.idleDays} days since sale`
    : `No sale observed in ${item.idleDays} days`;
}

export function stockDetail(item: AgedStockItem): string {
  return `${outletLabel(item.outlet)}: ${Object.entries(item.grades).map(([grade, units]) => `${units} ${grade}`).join(", ")}`;
}

export function filterAgedStock(items: AgedStockItem[], filters: PulseFilters): AgedStockItem[] {
  const query = filters.search.trim().toLowerCase();
  return items.filter((item) =>
    (filters.outlet === "all" || item.outlet === filters.outlet)
    && item.idleDays >= filters.minIdleDays
    && (filters.valueBand === "all" || item.valueBand === filters.valueBand)
    && (filters.segment === "all" || item.segment === filters.segment)
    && (!query || `${item.productName} ${item.category}`.toLowerCase().includes(query)),
  );
}

export function describePulseFilters(filters: PulseFilters): string {
  return [
    filters.outlet === "all" ? "Both boutiques" : outletLabel(filters.outlet),
    `${filters.minIdleDays}+ days without an observed sale`,
    filters.valueBand === "all" ? "All value bands" : VALUE_BAND_LABEL[filters.valueBand],
    filters.segment === "all" ? "All segments" : SEGMENT_LABEL[filters.segment],
    ...(filters.search.trim() ? [`Search: ${filters.search.trim()}`] : []),
  ].join(" · ");
}

interface CategoryQueue {
  category: ContentCategory;
  outlet: Outlet;
  remaining: PromotionProduct[];
  lastDay: number;
}

interface ShootDraft { products: PromotionProduct[]; canGroup: boolean }

function makePost(draft: ShootDraft, queue: CategoryQueue, date: string, index: number): PromotionPost {
  const grouped = draft.products.length > 1;
  const names = draft.products.map((product) => product.productName).join("; ");
  return {
    id: `${date}-${queue.outlet}-${queue.category}-${index + 1}`,
    date, time: "18:00", category: queue.category, outlet: queue.outlet,
    shootMode: grouped ? "group" : "individual", products: draft.products,
    stockValue: draft.products.reduce((sum, product) => sum + product.stockValue, 0),
    availableUnits: draft.products.reduce((sum, product) => sum + product.availableUnits, 0),
    channel: "Instagram + WhatsApp Status",
    format: grouped ? "Grouped photo / comparison post" : "Individual product spotlight",
    angle: grouped
      ? `Present these ${draft.products.length} lower-value goods together as a ${CONTENT_CATEGORY_LABEL[queue.category].toLowerCase()} edit. Keep every label and individual price legible.`
      : queue.category === "100ml"
        ? "Give this 100ml fragrance its own photo and content post. Show the bottle, packaging, size and regular price separately."
        : "Give this product its own photo and content post, with clear packaging, size and regular price.",
    shotList: grouped
      ? `At ${outletLabel(queue.outlet)}, arrange only these listed goods in one frame; add a labelled price card for each. One group photo produces one content post; do not describe it as a discounted bundle.`
      : `At ${outletLabel(queue.outlet)}, take a clean solo hero shot, a label/size close-up and a short optional demo. Prepare one content post for this product.`,
    caption: grouped
      ? `Explore this ${CONTENT_CATEGORY_LABEL[queue.category].toLowerCase()} selection: ${names}. ${draft.products.map((product) => `${product.productName}: NGN ${product.unitPrice.toLocaleString("en-NG")}`).join("; ")}. Ask ${outletLabel(queue.outlet)} about availability.`
      : `Take a closer look at ${names}. Regular retail price: NGN ${draft.products[0].unitPrice.toLocaleString("en-NG")}. Ask ${outletLabel(queue.outlet)} about availability or explore it on our website.`,
  };
}

function summarizeDay(date: string, posts: PromotionPost[]): PromotionDay {
  const categories = CONTENT_CATEGORIES.map((category) => {
    const selected = posts.filter((post) => post.category === category);
    return {
      category, posts: selected,
      productCount: selected.reduce((sum, post) => sum + post.products.length, 0),
      individualShots: selected.filter((post) => post.shootMode === "individual").length,
      groupShots: selected.filter((post) => post.shootMode === "group").length,
    };
  });
  return {
    date, categories, requiredPosts: posts.length,
    productCount: categories.reduce((sum, category) => sum + category.productCount, 0),
    individualShots: categories.reduce((sum, category) => sum + category.individualShots, 0),
    groupShots: categories.reduce((sum, category) => sum + category.groupShots, 0),
    outletPosts: {
      unilorin: posts.filter((post) => post.outlet === "unilorin").length,
      tanke: posts.filter((post) => post.outlet === "tanke").length,
    },
  };
}

/** Allocate shoot effort per boutique, while free spaces in group photos cover more goods. */
function allocateDay(queues: CategoryQueue[], date: string, dayIndex: number, budget: number): PromotionDay {
  const posts: PromotionPost[] = [];
  const daysLeftInWeek = 7 - ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7);
  for (const outlet of ["unilorin", "tanke"] as const) {
    let used = 0;
    const active = queues.filter((queue) => queue.outlet === outlet && queue.remaining.length).map((queue) => {
      const attention = queue.remaining.reduce((sum, product) => sum + product.attentionScore, 0) / queue.remaining.length;
      return {
        queue, drafts: [] as ShootDraft[], count: 0,
        weight: queue.remaining.reduce((sum, product) => sum + 1 + product.attentionScore / 100, 0),
        target: Math.min(queue.remaining.length, queue.category === "100ml" ? MAX_100ML_PRODUCTS_PER_DAY : MAX_CATEGORY_PRODUCTS_PER_DAY,
          Math.max(2, Math.ceil(queue.remaining.length / daysLeftInWeek * (0.75 + attention / 200)))),
      };
    });
    type Allocation = typeof active[number];
    const openGroup = (allocation: Allocation) => allocation.drafts.find((draft) => draft.canGroup && draft.products.length < MAX_GROUP_PHOTO_PRODUCTS);
    const fits = (allocation: Allocation, product: PromotionProduct) => used < budget || (!product.individualRequired && !!openGroup(allocation));
    const take = (allocation: Allocation, index: number) => {
      const [product] = allocation.queue.remaining.splice(index, 1);
      const group = product.individualRequired ? undefined : openGroup(allocation);
      if (group) group.products.push(product);
      else { allocation.drafts.push({ products: [product], canGroup: !product.individualRequired }); used++; }
      allocation.count++;
      allocation.queue.lastDay = dayIndex;
    };

    // Every stocked category gets a useful pair first, when the budget permits.
    // Under the lighter budget, a category deferred yesterday goes first today.
    for (const allocation of [...active].sort((a, b) => a.queue.lastDay - b.queue.lastDay || b.weight - a.weight || a.queue.category.localeCompare(b.queue.category))) {
      const first = allocation.queue.remaining.slice(0, Math.min(2, allocation.target));
      const cost = first.filter((product) => product.individualRequired).length + (first.some((product) => !product.individualRequired) ? 1 : 0);
      if (cost > budget - used) continue;
      for (let i = 0; i < first.length; i++) take(allocation, 0);
    }
    while (true) {
      const choices = active.filter((allocation) => allocation.count < allocation.target).map((allocation) => ({
        allocation, index: allocation.queue.remaining.findIndex((product) => fits(allocation, product)),
      })).filter((choice) => choice.index >= 0)
        .sort((a, b) => b.allocation.weight / (b.allocation.count + 1) - a.allocation.weight / (a.allocation.count + 1)
          || a.allocation.queue.category.localeCompare(b.allocation.queue.category));
      if (!choices.length) break;
      take(choices[0].allocation, choices[0].index);
    }
    for (const allocation of active) {
      posts.push(...allocation.drafts.map((draft, index) => makePost(draft, allocation.queue, date, index)));
    }
  }
  return summarizeDay(date, posts);
}

/**
 * Build a complete, non-repeating coverage queue from the loaded snapshot,
 * then expose one calendar week. Counts describe distinct goods and required
 * content posts, not inventory units or a record of completed photography.
 */
export function buildWeeklyPromotionPlan(report: SalesPulseReport, options: {
  filters: PulseFilters;
  week: PromotionWeek;
  workload?: PromotionWorkload;
  coverageWeek?: number;
  excludedProductIds?: string[];
  now?: Date;
}): WeeklyPromotionPlan {
  const now = options.now ?? new Date();
  const today = lagosDate(now);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const monday = shiftDate(today, -((weekday + 6) % 7));
  const baseWeek = options.week === "next" ? shiftDate(monday, 7) : monday;
  const budget = DAILY_SHOOT_BUDGET[options.workload ?? "balanced"] ?? DAILY_SHOOT_BUDGET.balanced;
  const excluded = new Set(options.excludedProductIds ?? []);
  const grouped = new Map<string, AgedStockItem[]>();
  for (const item of filterAgedStock(report.agedStock, options.filters)) {
    if (item.availableUnits <= 0 || item.unitPrice <= 0 || excluded.has(item.productId)) continue;
    const entries = grouped.get(item.productId) ?? [];
    if (entries.some((entry) => entry.key === item.key)) continue;
    entries.push(item);
    grouped.set(item.productId, entries);
  }
  const maxValue = Math.max(1, ...[...grouped.values()].map((items) => items.reduce((sum, item) => sum + item.stockValue, 0)));
  const products: PromotionProduct[] = [...grouped.entries()].map(([productId, entries]) => {
    const items = [...entries].sort((a, b) => b.priorityScore - a.priorityScore || a.key.localeCompare(b.key));
    const lead = items[0];
    const stockValue = items.reduce((sum, item) => sum + item.stockValue, 0);
    const idleDays = Math.max(...items.map((item) => item.idleDays));
    const contentCategory = contentCategoryFor(lead);
    return {
      productId, productName: lead.productName, category: lead.category, contentCategory, items,
      shootOutlet: lead.outlet, stockValue, availableUnits: items.reduce((sum, item) => sum + item.availableUnits, 0),
      unitPrice: lead.unitPrice, idleDays, segment: lead.segment,
      attentionScore: Math.round(50 * Math.min(idleDays / 180, 1) + 50 * Math.log1p(stockValue) / Math.log1p(maxValue)),
      individualRequired: contentCategory === "100ml" || lead.unitPrice > LOW_VALUE_PHOTO_LIMIT,
      productUrl: `https://www.alfawzaanenterprise.ng/store?search=${encodeURIComponent(lead.productName)}`,
    };
  }).sort((a, b) => b.attentionScore - a.attentionScore || b.stockValue - a.stockValue || a.productId.localeCompare(b.productId));

  // One photo location per product; balance estimated work when either
  // boutique can supply it. All other eligible boutique stock stays in the brief.
  const assignedEffort: Record<Outlet, number> = { unilorin: 0, tanke: 0 };
  for (const product of products) {
    product.shootOutlet = [...product.items].sort((a, b) => assignedEffort[a.outlet] - assignedEffort[b.outlet]
      || b.priorityScore - a.priorityScore || a.outlet.localeCompare(b.outlet))[0].outlet;
    assignedEffort[product.shootOutlet] += product.individualRequired ? 1 : 1 / MAX_GROUP_PHOTO_PRODUCTS;
  }
  const queues: CategoryQueue[] = (["unilorin", "tanke"] as const).flatMap((outlet) => CONTENT_CATEGORIES.map((category) => ({
    outlet, category, remaining: products.filter((product) => product.shootOutlet === outlet && product.contentCategory === category), lastDay: -1,
  })));
  let date = baseWeek > today ? baseWeek : today;
  if (Date.parse(`${date}T18:00:00+01:00`) < now.getTime()) date = shiftDate(date, 1);
  const allDays: PromotionDay[] = [];
  while (queues.some((queue) => queue.remaining.length)) {
    const day = allocateDay(queues, date, allDays.length, budget);
    if (day.productCount === 0) throw new Error("The content workload could not allocate the remaining goods.");
    allDays.push(day);
    date = shiftDate(date, 1);
  }
  const lastDate = allDays.at(-1)?.date ?? baseWeek;
  const totalWeeks = Math.floor(calendarDays(baseWeek, lastDate) / 7) + 1;
  const coverageWeeks = Array.from({ length: totalWeeks }, (_, index) => {
    const start = shiftDate(baseWeek, index * 7);
    const end = shiftDate(start, 6);
    const selected = allDays.filter((day) => day.date >= start && day.date <= end);
    return { index, weekStart: start, weekEnd: end, products: selected.reduce((sum, day) => sum + day.productCount, 0), posts: selected.reduce((sum, day) => sum + day.requiredPosts, 0) };
  });
  const requestedWeek = Number.isSafeInteger(options.coverageWeek) ? Math.max(0, options.coverageWeek!) : 0;
  const coverageWeek = Math.min(requestedWeek, totalWeeks - 1);
  const { weekStart, weekEnd } = coverageWeeks[coverageWeek];
  const days = Array.from({ length: 7 }, (_, i) => shiftDate(weekStart, i))
    .filter((day) => Date.parse(`${day}T18:00:00+01:00`) >= now.getTime())
    .map((day) => allDays.find((entry) => entry.date === day) ?? summarizeDay(day, []));
  const posts = days.flatMap((day) => day.categories.flatMap((category) => category.posts));
  const scheduledProducts = days.reduce((sum, day) => sum + day.productCount, 0);
  const earlierDays = allDays.filter((day) => day.date < weekStart);
  const plannedBeforeThisWeek = earlierDays.reduce((sum, day) => sum + day.productCount, 0);
  const categorySummary = CONTENT_CATEGORIES.map((category) => {
    const eligible = products.filter((product) => product.contentCategory === category).length;
    const thisWeek = posts.filter((post) => post.category === category).reduce((sum, post) => sum + post.products.length, 0);
    const earlierWeeks = earlierDays.reduce((sum, day) => sum + day.categories.find((entry) => entry.category === category)!.productCount, 0);
    return { category, eligible, thisWeek, earlierWeeks, laterWeeks: eligible - thisWeek - earlierWeeks };
  });

  return {
    weekStart, weekEnd, generatedAt: now.toISOString(), sourceGeneratedAt: report.generatedAt,
    historyStart: report.historyStart,
    scope: describePulseFilters(options.filters) + (excluded.size ? ` · ${excluded.size} goods skipped` : ""),
    modelMethod: report.model.method, eligibleProducts: products.length, availableDays: days.length,
    dailyShootBudget: budget, lowValueLimit: LOW_VALUE_PHOTO_LIMIT, maxGroupSize: MAX_GROUP_PHOTO_PRODUCTS,
    scheduledProducts, plannedBeforeThisWeek, remainingProducts: products.length - plannedBeforeThisWeek - scheduledProducts,
    coverageWeek, coverageWeeks, categorySummary, days, posts,
  };
}

export function promotionWeekLabel(plan: WeeklyPromotionPlan): string {
  return `${formatPulseDate(plan.weekStart)} – ${formatPulseDate(plan.weekEnd)}`;
}

/** Never substitute another day/category or reuse the whole day's totals. */
export function selectDailyCategorySnapshot(
  plan: WeeklyPromotionPlan,
  date: string,
  category: ContentCategory,
): DailyCategorySnapshot {
  const selected = plan.days.find((day) => day.date === date)?.categories.find((entry) => entry.category === category);
  const posts = selected?.posts.filter((post) => post.date === date && post.category === category) ?? [];
  if (!posts.length) throw new Error("No scheduled goods for this category on the selected day. Choose another day or category.");
  return {
    date, category, posts,
    productCount: posts.reduce((sum, post) => sum + post.products.length, 0),
    individualShots: posts.filter((post) => post.shootMode === "individual").length,
    groupShots: posts.filter((post) => post.shootMode === "group").length,
    outletPosts: {
      unilorin: posts.filter((post) => post.outlet === "unilorin").length,
      tanke: posts.filter((post) => post.outlet === "tanke").length,
    },
  };
}
