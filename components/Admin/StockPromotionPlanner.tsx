"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clock3, Coins, Gem, Search, Sparkles } from "lucide-react";
import WeeklyContentPlan from "./WeeklyContentPlan";
import { formatPulseDate, formatPulseTimestamp, lagosDate } from "@/lib/salesPulse/dates";
import {
  DEFAULT_PULSE_FILTERS, filterAgedStock, idleLabel,
  outletLabel, pulseMoney, stockDetail,
} from "@/lib/salesPulse/promotions";
import {
  SEGMENT_LABEL, VALUE_BAND_LABEL, type PromotionSegment,
  type PulseFilters, type SalesPulseReport, type ValueBand,
} from "@/lib/salesPulse/types";

const PAGE_SIZE = 12;
const compactMoney = (value: number) => `₦${value.toLocaleString("en-NG", { notation: "compact", maximumFractionDigits: 2 })}`;
const selectClass = "mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-800 focus:border-[#D4AF37] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20";
const badgeClass = "rounded-full border border-gray-200 px-2 py-1 text-[10px] font-bold text-gray-600";

export default function StockPromotionPlanner({ report }: { report: SalesPulseReport }) {
  const [filters, setFilters] = useState<PulseFilters>({ ...DEFAULT_PULSE_FILTERS });
  const [page, setPage] = useState(1);
  const [excluded, setExcluded] = useState<string[]>([]);

  const updateFilters = (changes: Partial<PulseFilters>) => {
    setFilters((current) => ({ ...current, ...changes }));
    setPage(1);
  };
  const filtered = useMemo(() => filterAgedStock(report.agedStock, filters), [report.agedStock, filters]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visibleItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const summary = useMemo(() => {
    const items = report.agedStock;
    return {
      products: new Set(items.map((item) => item.productId)).size,
      value: items.reduce((sum, item) => sum + item.stockValue, 0),
      units: items.reduce((sum, item) => sum + item.availableUnits, 0),
      over90: items.filter((item) => item.idleDays >= 90).length,
      noSale: items.filter((item) => !item.lastSoldAt).length,
    };
  }, [report.agedStock]);
  const valueShare = report.inventorySummary.retailValue ? Math.round(summary.value / report.inventorySummary.retailValue * 100) : 0;
  const reviewCount = report.inventorySummary.excludedForHistory + report.inventorySummary.missingProducts + report.inventorySummary.unknownAge;

  return <div className="space-y-5">
    <section aria-labelledby="aged-stock-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#8B7355]">Turn quiet stock into content</p>
          <h3 id="aged-stock-title" className="mt-1 font-serif text-2xl font-bold text-gray-900 sm:text-3xl">Worth another spotlight</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">Available goods with a sales gap of at least 30 days at a boutique. See where value is sitting, then give your team a ready-made content week.</p>
        </div>
        <a href="#promotion-plan-title" className="rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-3 py-2 text-xs font-bold text-[#82671c] hover:bg-[#D4AF37]/20">Jump to weekly plan ↓</a>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { title: "Goods needing attention", value: summary.products.toLocaleString(), note: `${report.agedStock.length} boutique listings · 30+ days`, icon: Gem },
          { title: "Aged stock retail value", value: <><span className="sm:hidden" title={pulseMoney(summary.value)}>{compactMoney(summary.value)}</span><span className="hidden sm:inline">{pulseMoney(summary.value)}</span></>, note: `${summary.units} available units · ${valueShare}% of available value`, icon: Coins },
          { title: "90+ days without a sale", value: summary.over90.toLocaleString(), note: "Boutique listings to revisit first", icon: Clock3 },
          { title: "No sale observed", value: summary.noSale.toLocaleString(), note: "Within the available history window", icon: Search },
        ].map(({ title, value, note, icon: Icon }) => <div key={title} className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5">
          <Icon size={18} className="mb-3 text-[#a68a32]" />
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{title}</p>
          <p className="mt-2 break-words text-xl font-black text-gray-900 sm:text-2xl">{value}</p>
          <p className="mt-1 text-[11px] leading-5 text-gray-500">{note}</p>
        </div>)}
      </div>

      {(reviewCount > 0 || report.quality.ignoredRecords > 0) && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
        {reviewCount} boutique listings need history, catalogue or date review and are excluded from this shortlist.
        {report.quality.ignoredRecords > 0 && ` ${report.quality.ignoredRecords} source records could not be fully reconciled.`} Use Data Health and the product audit to review them.
      </p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <h4 className="text-sm font-bold text-gray-900">Value categories</h4>
          <p className="mt-1 text-xs leading-5 text-gray-500">ABC bands by available stock × regular price. A holds roughly the first 70% of aged value, B the next 20%, C the rest.</p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {(["A", "B", "C"] as const).map((band) => {
              const items = report.agedStock.filter((item) => item.valueBand === band);
              const value = items.reduce((sum, item) => sum + item.stockValue, 0);
              return <button type="button" key={band} aria-label={`Filter ${VALUE_BAND_LABEL[band]}`} aria-pressed={filters.valueBand === band} onClick={() => updateFilters({ valueBand: filters.valueBand === band ? "all" : band })} className={`min-w-0 rounded-xl border px-2 py-3 text-left transition sm:p-3 ${filters.valueBand === band ? "border-[#D4AF37] bg-[#D4AF37]/10" : "border-gray-100 hover:bg-gray-50"}`}>
                <p className="text-[11px] font-black text-gray-800 sm:text-xs">{VALUE_BAND_LABEL[band]}</p>
                <p title={pulseMoney(value)} className="mt-2 whitespace-nowrap text-xs font-bold text-gray-900 sm:text-sm">{compactMoney(value)}</p>
                <p className="mt-1 text-[10px] text-gray-500">{items.length} listings</p>
              </button>;
            })}
          </div>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="flex items-center gap-2 text-sm font-bold text-gray-900"><Sparkles size={16} className="text-[#a68a32]" /> Stock pattern categories</h4><span className="text-[10px] font-bold text-[#82671c]">{report.model.method === "kmeans" ? "Local ML · 3 clusters" : report.model.method === "rules" ? "Rule-based fallback" : "Awaiting priced goods"}</span></div>
          <p className="mt-1 text-xs leading-5 text-gray-500">{report.model.method === "kmeans" ? `Learned from ${report.model.sampleSize} priced listings using sales gaps, value, available units and 90-day demand.` : "With fewer than six distinct-enough priced listings, simple value and stock rules keep the recommendations useful."}</p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {(Object.keys(SEGMENT_LABEL) as PromotionSegment[]).map((segment) => <button type="button" key={segment} aria-label={`Filter ${SEGMENT_LABEL[segment]}`} aria-pressed={filters.segment === segment} onClick={() => updateFilters({ segment: filters.segment === segment ? "all" : segment })} className={`min-w-0 rounded-xl border px-2 py-3 text-left transition sm:p-3 ${filters.segment === segment ? "border-[#D4AF37] bg-[#D4AF37]/10" : "border-gray-100 hover:bg-gray-50"}`}>
              <p className="text-[11px] font-bold text-gray-800 sm:text-xs">{SEGMENT_LABEL[segment]}</p>
              <p className="mt-2 text-xl font-black text-gray-900">{report.agedStock.filter((item) => item.segment === segment && item.unitPrice > 0).length}</p>
              <p className="mt-1 text-[10px] text-gray-500">priced listings</p>
            </button>)}
          </div>
        </div>
      </div>
    </section>

    <section aria-labelledby="shortlist-title" className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
      <div className="border-b border-gray-100 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 id="shortlist-title" className="font-serif text-xl font-bold text-gray-900">Goods waiting for a spotlight</h3><p className="mt-1 text-xs text-gray-500">Filters also shape the weekly plan. Skip a product to leave it out of this handoff.</p></div>
          <button type="button" onClick={() => updateFilters({ ...DEFAULT_PULSE_FILTERS })} className="text-xs font-bold text-[#82671c] underline decoration-[#D4AF37]/40 underline-offset-4">Reset filters</button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Search goods<input value={filters.search} onChange={(event) => updateFilters({ search: event.target.value })} placeholder="Name or category" type="search" maxLength={100} className={selectClass} /></label>
          <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Boutique<select value={filters.outlet} onChange={(event) => updateFilters({ outlet: event.target.value as PulseFilters["outlet"] })} className={selectClass}><option value="all">Both boutiques</option><option value="unilorin">Unilorin</option><option value="tanke">Tanke</option></select></label>
          <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Minimum sales gap<select value={filters.minIdleDays} onChange={(event) => updateFilters({ minIdleDays: Number(event.target.value) })} className={selectClass}>{[30, 60, 90, 180].map((days) => <option key={days} value={days}>{days}+ days</option>)}</select></label>
          <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Value band<select value={filters.valueBand} onChange={(event) => updateFilters({ valueBand: event.target.value as PulseFilters["valueBand"] })} className={selectClass}><option value="all">All value bands</option>{(Object.keys(VALUE_BAND_LABEL) as ValueBand[]).map((band) => <option key={band} value={band}>{VALUE_BAND_LABEL[band]}</option>)}</select></label>
          <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Stock segment<select value={filters.segment} onChange={(event) => updateFilters({ segment: event.target.value as PulseFilters["segment"] })} className={selectClass}><option value="all">All segments</option>{(Object.keys(SEGMENT_LABEL) as PromotionSegment[]).map((segment) => <option key={segment} value={segment}>{SEGMENT_LABEL[segment]}</option>)}</select></label>
        </div>
        <p aria-live="polite" className="mt-4 text-xs text-gray-500">{new Set(filtered.map((item) => item.productId)).size} goods · {filtered.length} boutique listings · {pulseMoney(filtered.reduce((sum, item) => sum + item.stockValue, 0))} available retail value</p>
      </div>

      {filtered.length === 0 ? <div className="px-5 py-12 text-center"><Gem size={28} className="mx-auto mb-3 text-[#b59a45]" /><p className="text-sm font-semibold text-gray-700">{report.agedStock.length ? "No goods match these filters." : "No eligible aged stock in this snapshot."}</p><p className="mx-auto mt-2 max-w-md text-xs leading-5 text-gray-500">{report.agedStock.length ? "Try another boutique, sales gap or category." : "Available goods need at least 30 days of reliable sales history or catalogue age to appear here."}</p></div>
        : <div className="divide-y divide-gray-100">{visibleItems.map((item) => {
          const skipped = excluded.includes(item.productId);
          return <article key={item.key} aria-label={`${item.productName} at ${outletLabel(item.outlet)}`} className={`p-5 sm:px-6 ${skipped ? "bg-gray-50" : ""}`}>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div className="min-w-0"><h4 className="break-words text-sm font-bold text-gray-900">{item.productName}</h4><p className="mt-1 text-xs text-gray-500">{item.category} · {outletLabel(item.outlet)}</p><div className="mt-2 flex flex-wrap gap-1.5"><span className={badgeClass}>{VALUE_BAND_LABEL[item.valueBand]}</span>{item.unitPrice > 0 && <span className={badgeClass}>{SEGMENT_LABEL[item.segment]}</span>}<span className={badgeClass}>Priority {item.priorityScore}/100</span>{skipped && <span className="rounded-full bg-gray-200 px-2 py-1 text-[10px] font-bold text-gray-600">Skipped for this plan</span>}</div></div>
              <button type="button" aria-pressed={skipped} aria-label={`${skipped ? "Include" : "Skip"} ${item.productName} in weekly plan`} onClick={() => setExcluded((current) => skipped ? current.filter((id) => id !== item.productId) : [...current, item.productId])} className="shrink-0 self-start rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:border-[#D4AF37] hover:text-gray-900">{skipped ? "Include in plan" : "Skip for this plan"}</button>
            </div>
            <div className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
              <div><p className={`font-bold ${item.idleDays >= 90 ? "text-amber-800" : "text-gray-800"}`}>{idleLabel(item)}</p><p className="mt-1 leading-5 text-gray-500">{item.lastSoldAt ? `Last recorded sale: ${formatPulseTimestamp(item.lastSoldAt)} WAT` : `Observed since ${formatPulseDate(item.observationStart)}; earlier sales may exist.`}</p></div>
              <div><p className="font-bold text-gray-800">{item.availableUnits} units available</p><p className="mt-1 leading-5 text-gray-500">{stockDetail(item)}</p></div>
              <div><p className="font-bold text-gray-800">{item.unitPrice > 0 ? `${pulseMoney(item.stockValue)} retail value` : "Catalogue price needed"}</p><p className="mt-1 leading-5 text-gray-500">{item.unitPrice > 0 ? `${pulseMoney(item.unitPrice)} per unit · ${item.units90} sold here in 90 days` : "Set a regular price to include this item in a promotion plan."}</p></div>
            </div>
            {item.otherOutletUnits30 > 0 && <p className="mt-3 text-[11px] font-medium text-emerald-700">Demand exists elsewhere: {item.otherOutletUnits30} sold at {outletLabel(item.outlet === "unilorin" ? "tanke" : "unilorin")} in the last 30 days. Consider a boutique-specific story.</p>}
          </article>;
        })}</div>}
      {pageCount > 1 && <div className="flex items-center justify-between border-t border-gray-100 px-5 py-4 text-xs text-gray-500"><p>Page {safePage} of {pageCount} · {filtered.length} listings</p><div className="flex gap-2"><button type="button" aria-label="Previous aged stock page" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} className="rounded-lg border border-gray-200 p-2 disabled:opacity-30"><ChevronLeft size={16} /></button><button type="button" aria-label="Next aged stock page" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)} className="rounded-lg border border-gray-200 p-2 disabled:opacity-30"><ChevronRight size={16} /></button></div></div>}
    </section>

    <WeeklyContentPlan report={report} filters={filters} excluded={excluded} restoreExcluded={() => setExcluded([])} />

    <details className="rounded-2xl border border-gray-200 bg-white px-5 py-4 text-xs text-gray-500">
      <summary className="cursor-pointer font-bold text-gray-800">How the reminders, ML categories and weekly plan work</summary>
      <div className="mt-4 space-y-3 leading-6">
        <p><strong>Sales history:</strong> verified orders plus direct sales from {formatPulseDate(lagosDate(report.historyStart))}, reconciled against linked reversals and merged product IDs. Admin and representative verification deductions are counted once. Verification timestamps are used where traceable; older orders fall back to their recorded update date.</p>
        <p><strong>Inactivity:</strong> a boutique&apos;s most recent surviving sale, or observation since the later of catalogue creation and the history start. “No sale observed” does not mean never sold. A sales gap can include out-of-stock periods; it is not a physical shelf-age measurement. New catalogue entries receive at least 30 days before being shortlisted.</p>
        <p><strong>Value:</strong> regular catalogue price × units available after reservations. ABC groups cover approximately 70%, 20% and 10% of this aged value; equal-value goods share a band. This is retail opportunity value, not purchase cost or profit.</p>
        <p><strong>ML:</strong> deterministic, locally fitted k-means (three clusters) on log-scaled, standardised inactivity, value, stock and 90-day unit sales. The highest-value cluster is Value recovery, the stock-heaviest remaining cluster is Stock-heavy, and the last is Rediscovery. Small or indistinguishable samples use explicitly labelled rules. These are descriptive groups, not sales forecasts.</p>
        <p><strong>Daily allocation:</strong> the content plan combines the same good across boutiques and gives its available retail value and inactivity equal weight. Category quantities grow with that attention score and the remaining queue, targeting 2–8 goods per category per boutique daily (up to 6 for 100ml), within the chosen shoot budget. The stock shortlist&apos;s separate priority score still includes 90-day stock pressure.</p>
        <p><strong>Photo batches and coverage:</strong> all 100ml goods and items above ₦10,000 each receive individual shots. Other lower-value goods may be photographed in groups of up to four within the same category and boutique. Each photo set produces one required content post. Follow-on coverage weeks contain the rest of the queue, without repeating goods from earlier planned weeks.</p>
        <p><strong>Efficient snapshots:</strong> one shared hourly server snapshot; filters, periods, local ML results and downloads reuse it. Refresh becomes eligible at {formatPulseTimestamp(report.refreshAfter)} WAT. Downloads are generated on your device from the preview.</p>
      </div>
    </details>
  </div>;
}
