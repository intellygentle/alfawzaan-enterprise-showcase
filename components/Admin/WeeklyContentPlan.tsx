"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Camera, Download, FileText, Layers3, Loader2 } from "lucide-react";
import {
  CONTENT_CATEGORY_DESCRIPTION, CONTENT_CATEGORY_LABEL, DAILY_SHOOT_BUDGET,
} from "@/lib/salesPulse/contentCategories";
import { formatPulseDate, formatPulseTimestamp } from "@/lib/salesPulse/dates";
import { buildWeeklyPromotionPlan, idleLabel, outletLabel, promotionWeekLabel, pulseMoney, stockDetail } from "@/lib/salesPulse/promotions";
import { SEGMENT_LABEL, type ContentCategory, type PromotionWeek, type PromotionWorkload, type PulseFilters, type SalesPulseReport } from "@/lib/salesPulse/types";
import type { CategorySnapshotPicture } from "@/lib/salesPulse/exports";

interface Props {
  report: SalesPulseReport;
  filters: PulseFilters;
  excluded: string[];
  restoreExcluded: () => void;
}

function savePicture(picture: CategorySnapshotPicture): void {
  const url = URL.createObjectURL(picture.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = picture.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export default function WeeklyContentPlan({ report, filters, excluded, restoreExcluded }: Props) {
  const [week, setWeek] = useState<PromotionWeek>("current");
  const [workload, setWorkload] = useState<PromotionWorkload>("balanced");
  const [coverageWeek, setCoverageWeek] = useState(0);
  const [selectedDate, setSelectedDate] = useState("");
  const [planningNow, setPlanningNow] = useState(() => new Date());
  const [exporting, setExporting] = useState<ContentCategory | "pdf" | null>(null);
  const [readyPictures, setReadyPictures] = useState<{ scope: string; date: string; category: ContentCategory; pictures: CategorySnapshotPicture[] } | null>(null);
  const exportRequest = useRef(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPlanningNow(new Date());
    setCoverageWeek(0);
    setSelectedDate("");
  }, [report.generatedAt, filters, excluded]);

  const plan = useMemo(() => buildWeeklyPromotionPlan(report, {
    filters, week, workload, coverageWeek, excludedProductIds: excluded, now: planningNow,
  }), [report, filters, week, workload, coverageWeek, excluded, planningNow]);
  const day = plan.days.find((entry) => entry.date === selectedDate) ?? plan.days.find((entry) => entry.requiredPosts > 0) ?? plan.days[0];
  const exportScope = JSON.stringify([report.generatedAt, filters, excluded, week, workload, coverageWeek, day?.date]);
  useEffect(() => {
    exportRequest.current++;
    setReadyPictures(null);
    setExporting(null);
  }, [report, exportScope]);
  useEffect(() => () => { exportRequest.current++; }, []);
  const selectedValue = plan.posts.reduce((sum, post) => sum + post.stockValue, 0);
  const resetPeriod = () => { setCoverageWeek(0); setSelectedDate(""); setPlanningNow(new Date()); };
  const selectClass = "mt-2 block w-full rounded-xl border border-white/20 bg-[#242424] px-3 py-2.5 text-sm text-white outline-none focus:border-[#D4AF37]";

  async function download(format: ContentCategory | "pdf") {
    const request = ++exportRequest.current;
    const requestedDate = day?.date ?? "";
    setExporting(format);
    setReadyPictures(null);
    setError(null);
    const now = new Date();
    try {
      const currentPlan = buildWeeklyPromotionPlan(report, { filters, week, workload, coverageWeek, excludedProductIds: excluded, now });
      setPlanningNow(now);
      const exports = await import("@/lib/salesPulse/exports");
      if (request !== exportRequest.current) return;
      if (format === "pdf") exports.downloadPromotionPdf(currentPlan);
      else {
        const pictures = await exports.buildDailyCategoryPictures(currentPlan, requestedDate, format);
        if (request !== exportRequest.current) return;
        if (pictures.length === 1) savePicture(pictures[0]);
        else setReadyPictures({ scope: exportScope, date: requestedDate, category: format, pictures });
      }
    } catch (cause) {
      if (request === exportRequest.current) setError(cause instanceof Error ? cause.message : "Could not download the content plan. Please try again.");
    } finally {
      if (request === exportRequest.current) setExporting(null);
    }
  }

  return <section aria-labelledby="promotion-plan-title" className="overflow-hidden rounded-[1.5rem] bg-[#141414] p-5 text-white sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-5">
      <div>
        <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[#D4AF37]"><CalendarDays size={15} /> Daily content, planned by category</p>
        <h3 id="promotion-plan-title" className="mt-2 font-serif text-2xl font-bold sm:text-3xl">Your weekly content handoff</h3>
        <p className="mt-2 text-sm text-white/75">{promotionWeekLabel(plan)}</p>
        <p className="mt-2 max-w-2xl text-xs leading-6 text-white/60">Multiple goods per category, with daily quantities driven by available retail value, inactivity and the size of the queue. Content is due by 18:00 WAT each scheduled day.</p>
      </div>
      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/50">Start the coverage plan</p>
        <div className="flex gap-1 rounded-xl border border-white/15 bg-white/5 p-1">{(["current", "next"] as const).map((option) => <button type="button" key={option} aria-pressed={week === option} onClick={() => { setWeek(option); resetPeriod(); }} className={`rounded-lg px-4 py-2 text-xs font-bold ${week === option ? "bg-[#D4AF37] text-black" : "text-white/65 hover:text-white"}`}>{option === "current" ? "This week" : "Next week"}</button>)}</div>
      </div>
    </div>

    <div className="mt-5 grid gap-3 rounded-2xl border border-[#D4AF37]/25 bg-[#D4AF37]/[0.07] p-4 sm:grid-cols-2">
      <p className="text-xs leading-6 text-white/80"><Camera size={16} className="mb-1 text-[#D4AF37]" /><strong className="text-[#D4AF37]">100ml goods: snap separately.</strong> Every listed product needs its own individual photo and content post, even when its price is low.</p>
      <p className="text-xs leading-6 text-white/80"><Layers3 size={16} className="mb-1 text-[#D4AF37]" /><strong className="text-[#D4AF37]">Lower-value goods: snap together.</strong> Up to {plan.maxGroupSize} items priced at {pulseMoney(plan.lowValueLimit)} or less each may share one photo and one post, within the same category and boutique. Higher-value items get separate shots.</p>
    </div>

    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <label className="text-xs font-bold text-white/65">Daily shoot budget<select aria-label="Daily shoot budget" aria-describedby="shoot-budget-help" value={workload} onChange={(event) => { setWorkload(event.target.value as PromotionWorkload); resetPeriod(); }} className={selectClass}>{(Object.keys(DAILY_SHOOT_BUDGET) as PromotionWorkload[]).map((level) => <option key={level} value={level}>{level.charAt(0).toUpperCase() + level.slice(1)} · {DAILY_SHOOT_BUDGET[level]} sets / boutique</option>)}</select><span id="shoot-budget-help" className="mt-1 block text-[10px] font-normal leading-5 text-white/45">One set = one individual or grouped photo, reused for Instagram and WhatsApp.</span></label>
      <label className="text-xs font-bold text-white/65">Coverage week<select aria-label="Coverage week" aria-describedby="coverage-week-help" value={plan.coverageWeek} disabled={plan.coverageWeeks.length === 1} onChange={(event) => { setCoverageWeek(Number(event.target.value)); setSelectedDate(""); }} className={`${selectClass} disabled:opacity-60`}>{plan.coverageWeeks.map((entry) => <option key={entry.index} value={entry.index}>Week {entry.index + 1} · {formatPulseDate(entry.weekStart)} · {entry.products} goods</option>)}</select><span id="coverage-week-help" className="mt-1 block text-[10px] font-normal leading-5 text-white/45">Continue through later weeks to cover the rest of this snapshot&apos;s queue.</span></label>
    </div>

    <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[
        { value: plan.scheduledProducts, label: "Goods this week" },
        { value: plan.posts.length, label: "Required content posts" },
        { value: plan.remainingProducts, label: "Goods in later weeks" },
        { value: plan.coverageWeeks.length, label: "Weeks for full coverage" },
      ].map((metric) => <div key={metric.label} className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-2xl font-black text-[#D4AF37]">{metric.value}</p><p className="mt-1 text-[11px] text-white/60">{metric.label}</p></div>)}
    </div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs leading-6 text-white/55">
      <p aria-live="polite">{plan.plannedBeforeThisWeek} goods in earlier planned weeks + {plan.scheduledProducts} this week + {plan.remainingProducts} later = {plan.eligibleProducts} eligible goods. Selected retail value: {pulseMoney(selectedValue)}.</p>
      {excluded.length > 0 && <button type="button" onClick={restoreExcluded} className="font-semibold text-[#D4AF37]">Restore {excluded.length} skipped goods</button>}
    </div>
    <p className="mt-1 text-[11px] leading-5 text-white/40">Each good appears once across this coverage plan. These are planned batches; completion is tracked by your team.</p>

    <div className="mt-5 flex flex-wrap gap-2 border-y border-white/10 py-4">
      <button type="button" disabled={!plan.posts.length || !!exporting} onClick={() => void download("pdf")} className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-3 text-xs font-bold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40">{exporting === "pdf" ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />} Download weekly brief (PDF)</button>
      <p className="w-full text-xs leading-6 text-white/60">Select a day, then use <strong className="text-[#D4AF37]">Download PNG</strong> on any category below. Each picture contains only that category&apos;s daily goods and required posts, ready to forward to the people concerned.</p>
    </div>
    {error && <p role="alert" className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}

    {plan.posts.length === 0 ? <div className="py-12 text-center"><CalendarDays size={30} className="mx-auto mb-3 text-[#D4AF37]/70" /><p className="text-sm font-semibold">{plan.availableDays === 0 ? "This week's content deadlines have passed." : "No goods are ready for this plan."}</p><p className="mt-2 text-xs leading-5 text-white/50">{plan.availableDays === 0 ? "Select Next week to start a new Monday–Sunday coverage plan." : "Adjust the filters, restore skipped goods, or add missing catalogue prices."}</p></div> : <>
      <h4 className="mt-6 text-sm font-bold">Daily posts required</h4>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" role="group" aria-label="Content days">
        {plan.days.map((entry) => <button type="button" key={entry.date} aria-label={`Content for ${formatPulseDate(entry.date, true)}`} aria-pressed={entry.date === day?.date} onClick={() => setSelectedDate(entry.date)} className={`rounded-xl border p-3 text-left transition ${entry.date === day?.date ? "border-[#D4AF37] bg-[#D4AF37]/10" : "border-white/10 bg-white/[0.03] hover:bg-white/10"}`}><p className="text-[11px] font-semibold text-white/65">{formatPulseDate(entry.date, true).replace(/,? \d{4}$/, "")}</p><p className="mt-2 text-xl font-black text-[#D4AF37]">{entry.requiredPosts} <span className="text-xs font-medium">posts</span></p><p className="mt-1 text-[11px] text-white/55">{entry.productCount} goods to snap</p></button>)}
      </div>

      {day && <section aria-label={`Daily content for ${formatPulseDate(day.date, true)}`} className="mt-5">
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl bg-white/[0.05] p-4">
          <div><h4 className="font-serif text-xl font-bold">{formatPulseDate(day.date, true)}</h4><p className="mt-2 text-sm font-bold text-[#D4AF37]">{day.requiredPosts} posts required · {day.productCount} distinct goods</p><p className="mt-1 text-xs leading-6 text-white/60">{day.individualShots} individual shots + {day.groupShots} group photos · due by 18:00 WAT<br />Unilorin: {day.outletPosts.unilorin}/{plan.dailyShootBudget} sets · Tanke: {day.outletPosts.tanke}/{plan.dailyShootBudget} sets</p></div>
        </div>

        <div className="mt-4 space-y-4">{day.categories.map((category) => {
          const coverage = plan.categorySummary.find((entry) => entry.category === category.category)!;
          return <section key={category.category} aria-label={CONTENT_CATEGORY_LABEL[category.category]} className="rounded-2xl border border-white/15 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h5 className="text-base font-bold text-white">{CONTENT_CATEGORY_LABEL[category.category]}</h5><p className="mt-1 max-w-2xl text-[11px] leading-5 text-white/50">{CONTENT_CATEGORY_DESCRIPTION[category.category]}</p></div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="rounded-lg bg-[#D4AF37]/10 px-3 py-2 text-xs font-bold text-[#D4AF37]">{category.productCount} goods · {category.posts.length} posts today</p>
                <button type="button" aria-label={`Download ${CONTENT_CATEGORY_LABEL[category.category]} snapshot (PNG)`} disabled={!category.posts.length || !!exporting} onClick={() => void download(category.category)} className="inline-flex items-center gap-2 rounded-xl bg-[#D4AF37] px-3 py-2.5 text-xs font-bold text-black transition hover:bg-[#e1be51] disabled:cursor-not-allowed disabled:opacity-40">{exporting === category.category ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Download PNG</button>
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-white/45">This week: {coverage.thisWeek} of {coverage.eligible} eligible goods · {category.individualShots} separate shots / {category.groupShots} group photos today</p>
            {readyPictures?.scope === exportScope && readyPictures.date === day.date && readyPictures.category === category.category && <div className="mt-3 rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/10 p-3">
              <p role="status" className="text-xs leading-6 text-white/80">{readyPictures.pictures.length} PNG sheets are ready for {CONTENT_CATEGORY_LABEL[category.category]} on {formatPulseDate(day.date)}. Download each sheet to include all of this category&apos;s goods.</p>
              <div className="mt-2 flex flex-wrap gap-2">{readyPictures.pictures.map((picture, index) => <button type="button" key={picture.fileName} aria-label={`Download ${CONTENT_CATEGORY_LABEL[category.category]} sheet ${index + 1} of ${readyPictures.pictures.length} (PNG)`} onClick={() => savePicture(picture)} className="rounded-lg bg-[#D4AF37] px-3 py-2 text-xs font-bold text-black">Download sheet {index + 1} / {readyPictures.pictures.length}</button>)}</div>
            </div>}
            {!category.posts.length ? <p className="mt-3 text-xs text-white/40">{coverage.eligible === 0 ? "No eligible goods in this section for the current filters." : "No additional goods allocated to this section today; use the other planned days or coverage weeks."}</p> : <div className="mt-4 space-y-3">{category.posts.map((post, index) => <div key={post.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:p-4">
              <p className="text-xs font-bold text-[#D4AF37]">Post {index + 1} · {outletLabel(post.outlet)} · {post.shootMode === "group" ? `Snap ${post.products.length} goods together — 1 group photo` : "Snap this item separately — 1 individual photo"}</p>
              <ul className="mt-3 divide-y divide-white/10">{post.products.map((product) => <li key={product.productId} className="py-3 first:pt-0 last:pb-0">
                <a href={product.productUrl} target="_blank" rel="noopener noreferrer" className="break-words text-sm font-bold text-white underline decoration-white/20 underline-offset-4 hover:decoration-[#D4AF37]">{product.productName}</a>
                <p className="mt-1 text-[11px] leading-5 text-white/60">{pulseMoney(product.unitPrice)} each · {pulseMoney(product.stockValue)} available retail value · Attention {product.attentionScore}/100 · {SEGMENT_LABEL[product.segment]}</p>
                {product.items.map((item) => <p key={item.key} className="mt-1 text-[11px] leading-5 text-white/45">{stockDetail(item)} · {idleLabel(item)}</p>)}
              </li>)}</ul>
              <details className="mt-3 border-t border-white/10 pt-3 text-xs text-white/65"><summary className="cursor-pointer font-semibold text-[#D4AF37]">Shot list &amp; starter caption</summary><div className="mt-3 space-y-2 leading-6"><p>{post.angle}</p><p><strong className="text-white/85">Prepare:</strong> {post.shotList}</p><p><strong className="text-white/85">Caption:</strong> {post.caption}</p></div></details>
            </div>)}</div>}
          </section>;
        })}</div>
      </section>}
    </>}
    <p className="mt-5 text-[11px] leading-5 text-white/45">Quantities target 2–8 goods per stocked category per boutique daily (up to 6 for 100ml), when the queue and shoot budget allow. Smaller queues taper naturally. Availability is from {formatPulseTimestamp(report.generatedAt)} WAT; values use regular prices before discounts. The preview and downloads reuse this snapshot.</p>
  </section>;
}
