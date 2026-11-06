import type { Grade, Outlet } from "../types";

export const SALES_HISTORY_DAYS = 730;
export const MIN_IDLE_DAYS = 30;
export const SALES_PULSE_CACHE_SECONDS = 3_600;

export type SalesAnalyticsPeriod = "day" | "week" | "month" | "year";

export interface SalesAnalyticsProduct {
  productId: string;
  productName: string;
  category: string | null;
  imageUrl: string | null;
  units: number;
  revenue: number;
  outlets: string[];
}

export interface SalesAnalyticsReport {
  period: SalesAnalyticsPeriod;
  periodLabel: string;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  totalUnits: number;
  totalRevenue: number;
  previousUnits: number;
  previousRevenue: number;
  topProducts: SalesAnalyticsProduct[];
  outletSummary: Array<{ outlet: Outlet; units: number; revenue: number }>;
}

export interface PulseProduct {
  id: string;
  name: string;
  category: string | null;
  price: number | null;
  created_at: string | null;
  base_image_url?: string | null;
}

export interface PulseInventory {
  product_id: string;
  outlet: Outlet;
  grade: string;
  quantity: number;
  reserved_quantity: number | null;
}

export interface PulseOrderItem {
  order_id: string;
  product_id: string;
  product_name: string;
  outlet: string;
  grade: string;
  quantity: number;
  unit_price: number;
  total_price: number | null;
  orders: { status: string; updated_at: string } | Array<{ status: string; updated_at: string }>;
}

export interface PulseAuditRow {
  id: string;
  product_id: string | null;
  action: string;
  outlet: string | null;
  admin_id: string | null;
  created_at: string;
  details: string | null;
  metadata: Record<string, unknown> | null;
}

export interface PulseAlias {
  alias_product_id: string;
  survivor_product_id: string;
}

export interface PulseSale {
  productId: string;
  productName: string;
  outlet: Outlet;
  grade: Grade;
  soldAt: string;
  units: number;
  revenue: number;
}

export interface NormalizedPulseSales {
  sales: PulseSale[];
  /** product + outlet keys with unreadable/unlinkable history, excluded from planning. */
  uncertainKeys: string[];
  ignoredRecords: number;
  unpricedUnits: number;
}

export type ValueBand = "A" | "B" | "C" | "unpriced";
export type PromotionSegment = "value-recovery" | "stock-heavy" | "rediscovery";
export type SegmentationMethod = "kmeans" | "rules" | "none";

export const VALUE_BAND_LABEL: Record<ValueBand, string> = {
  A: "A · High value",
  B: "B · Mid value",
  C: "C · Lower value",
  unpriced: "Price needed",
};

export const SEGMENT_LABEL: Record<PromotionSegment, string> = {
  "value-recovery": "Value recovery",
  "stock-heavy": "Stock-heavy",
  rediscovery: "Rediscovery",
};

export interface AgedStockItem {
  key: string;
  productId: string;
  productName: string;
  category: string;
  outlet: Outlet;
  availableUnits: number;
  grades: Partial<Record<Grade, number>>;
  unitPrice: number;
  stockValue: number;
  lastSoldAt: string | null;
  /** Calendar days in Lagos. If no sale was observed, a bounded observation window. */
  idleDays: number;
  observationStart: string;
  units90: number;
  otherOutletUnits30: number;
  valueBand: ValueBand;
  segment: PromotionSegment;
  priorityScore: number;
}

export interface SalesPulseReport {
  generatedAt: string;
  refreshAfter: string;
  historyStart: string;
  sales: Record<SalesAnalyticsPeriod, SalesAnalyticsReport>;
  agedStock: AgedStockItem[];
  inventorySummary: {
    availableUnits: number;
    retailValue: number;
    excludedForHistory: number;
    missingProducts: number;
    unknownAge: number;
  };
  model: {
    method: SegmentationMethod;
    sampleSize: number;
    clusterCount: number;
  };
  quality: { ignoredRecords: number; unpricedSalesUnits: number };
}

export interface PulseFilters {
  outlet: "all" | Outlet;
  minIdleDays: number;
  valueBand: "all" | ValueBand;
  segment: "all" | PromotionSegment;
  search: string;
}

export type PromotionWeek = "current" | "next";
export type ContentCategory = "100ml" | "miniatures" | "body-home" | "islamic" | "extra";
export type PromotionWorkload = "light" | "balanced" | "extended";

export interface PromotionProduct {
  productId: string;
  productName: string;
  /** Original catalogue category, retained as evidence for the content grouping. */
  category: string;
  contentCategory: ContentCategory;
  items: AgedStockItem[];
  shootOutlet: Outlet;
  stockValue: number;
  availableUnits: number;
  unitPrice: number;
  idleDays: number;
  attentionScore: number;
  individualRequired: boolean;
  segment: PromotionSegment;
  productUrl: string;
}

export interface PromotionPost {
  id: string;
  date: string;
  /** Daily content deadline in WAT, not a claimed optimal publishing time. */
  time: string;
  category: ContentCategory;
  outlet: Outlet;
  shootMode: "individual" | "group";
  products: PromotionProduct[];
  stockValue: number;
  availableUnits: number;
  channel: string;
  format: string;
  angle: string;
  shotList: string;
  caption: string;
}

export interface DailyContentCategory {
  category: ContentCategory;
  posts: PromotionPost[];
  productCount: number;
  individualShots: number;
  groupShots: number;
}

/** The exact day/category being exported, with category-only totals. */
export interface DailyCategorySnapshot extends DailyContentCategory {
  date: string;
  outletPosts: Record<Outlet, number>;
}

export interface PromotionDay {
  date: string;
  categories: DailyContentCategory[];
  productCount: number;
  requiredPosts: number;
  individualShots: number;
  groupShots: number;
  outletPosts: Record<Outlet, number>;
}

export interface WeeklyPromotionPlan {
  weekStart: string;
  weekEnd: string;
  generatedAt: string;
  sourceGeneratedAt: string;
  historyStart: string;
  scope: string;
  modelMethod: SegmentationMethod;
  eligibleProducts: number;
  availableDays: number;
  dailyShootBudget: number;
  lowValueLimit: number;
  maxGroupSize: number;
  scheduledProducts: number;
  plannedBeforeThisWeek: number;
  remainingProducts: number;
  coverageWeek: number;
  coverageWeeks: Array<{ index: number; weekStart: string; weekEnd: string; products: number; posts: number }>;
  categorySummary: Array<{ category: ContentCategory; eligible: number; thisWeek: number; earlierWeeks: number; laterWeeks: number }>;
  days: PromotionDay[];
  posts: PromotionPost[];
}
