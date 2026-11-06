"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BarChart3, Crown, Flame, Loader2, MapPin, RefreshCw, Sparkles, Store, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { SalesAnalyticsPeriod, SalesPulseReport } from "@/lib/salesPulse/types";
import { formatPulseDate, formatPulseTimestamp } from "@/lib/salesPulse/dates";
import StockPromotionPlanner from "@/components/Admin/StockPromotionPlanner";
import OptimizedImage from "@/components/StoreFront/OptimizedImage";

const money = (value: number) => `₦${value.toLocaleString()}`;
const label = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const change = (current: number, previous: number) => previous ? Math.round(((current - previous) / previous) * 100) : current ? null : 0;

export default function SalesAnalyticsBoard() {
  const [snapshot, setSnapshot] = useState<SalesPulseReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<SalesAnalyticsPeriod>("month");
  const request = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 30_000);
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/admin/sales-pulse", { cache: "no-store", signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load Sales Pulse.");
      if (request.current === controller) setSnapshot(data as SalesPulseReport);
    } catch (err) {
      if (request.current === controller && (!controller.signal.aborted || timedOut)) setError(timedOut ? "The snapshot took too long to load. Please try again." : err instanceof Error ? err.message : "Could not load Sales Pulse.");
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    return () => { request.current?.abort(); request.current = null; };
  }, [load]);

  if (loading && !snapshot) return <div role="status" className="rounded-3xl bg-[#121212] p-16 text-center text-white"><Loader2 className="mx-auto animate-spin text-[#D4AF37]" /><p className="mt-4 text-sm text-white/65">Preparing your Sales Pulse snapshot…</p></div>;
  if (error && !snapshot) return <div role="alert" className="rounded-3xl border border-red-100 bg-white p-10 text-center text-sm text-red-600">{error}<button type="button" onClick={() => void load()} className="ml-3 rounded-lg bg-[#121212] px-3 py-2 text-xs text-white">Retry Sales Pulse</button></div>;
  if (!snapshot) return null;
  const report = snapshot.sales[period];

  const unitsChange = change(report.totalUnits, report.previousUnits);
  const revenueChange = change(report.totalRevenue, report.previousRevenue);
  const top = report.topProducts[0];
  const leadingOutlet = [...report.outletSummary].filter((outlet) => outlet.units > 0).sort((a, b) => b.units - a.units)[0];
  const maxUnits = Math.max(...report.topProducts.map((item) => item.units), 1);
  const stats: Array<{ title: string; value: string; percent: number | null; icon: LucideIcon }> = [
    { title: "Units sold", value: report.totalUnits.toLocaleString(), percent: unitsChange, icon: BarChart3 },
    { title: "Revenue", value: money(report.totalRevenue), percent: revenueChange, icon: TrendingUp },
    { title: "Top seller", value: top?.productName ?? "No sales yet", percent: null, icon: Flame },
    { title: "Leading outlet", value: leadingOutlet ? label(leadingOutlet.outlet) : "No data", percent: null, icon: Store },
  ];
  const featured = report.topProducts.slice(1, 4);

  return <div className="space-y-5">
    <section className="relative overflow-hidden rounded-[2rem] bg-[#121212] px-5 py-7 text-white sm:px-8 sm:py-9">
      <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[#D4AF37]/10 blur-3xl" />
      <div className="relative flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#D4AF37]">Alfawzaan&apos;s Enterprise</p><h2 className="mt-3 font-serif text-3xl font-bold sm:text-5xl">Sales Pulse</h2><p className="mt-2 text-sm text-white/65">What&apos;s moving. What needs a spotlight. What to post this week.</p></div>
        <div className="text-left sm:text-right"><p className="text-[10px] uppercase tracking-widest text-white/50">Shared hourly snapshot</p><p className="mt-1 text-xs font-semibold">{formatPulseTimestamp(snapshot.generatedAt)} WAT</p><button type="button" onClick={() => void load()} disabled={loading} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-white/20 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10 disabled:opacity-50"><RefreshCw size={13} className={loading ? "animate-spin" : ""} />Refresh snapshot</button></div>
      </div>
      <p className="relative mt-5 text-[11px] text-white/45">Fresh data becomes available after {formatPulseTimestamp(snapshot.refreshAfter)} WAT. Filters, period switches and downloads reuse this snapshot.</p>
    </section>

    {error && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{error} Showing the snapshot from {formatPulseTimestamp(snapshot.generatedAt)} WAT.</p>}

    <StockPromotionPlanner report={snapshot} />

    <div className="flex flex-wrap items-end justify-between gap-4 pt-5">
      <div><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#8B7355]">Demand &amp; performance</p><h3 className="mt-1 font-serif text-2xl font-bold text-gray-900">Keep an eye on what&apos;s moving</h3><p className="mt-2 text-xs text-gray-500">{report.periodLabel} · {formatPulseDate(report.periodStart)} to {formatPulseDate(report.periodEnd)}</p></div>
      <div aria-label="Sales ranking period" className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1">
        {(["day", "week", "month", "year"] as SalesAnalyticsPeriod[]).map((option) => <button key={option} type="button" onClick={() => setPeriod(option)} aria-pressed={period === option} className={`shrink-0 rounded-lg px-4 py-2 text-[10px] font-black uppercase tracking-widest transition ${period === option ? "bg-[#D4AF37] text-black" : "text-gray-500 hover:text-gray-900"}`}>{option}</button>)}
      </div>
    </div>
    {snapshot.quality.unpricedSalesUnits > 0 && <p className="text-xs leading-5 text-gray-500">{snapshot.quality.unpricedSalesUnits} direct-sale units in the history window have no recorded price. They contribute to unit counts; revenue includes recorded amounts only.</p>}

    {top && <section aria-label="Screenshot-ready hot sellers card" className="mx-auto w-full max-w-[920px] overflow-hidden rounded-[1.5rem] bg-[#0e0e0f] text-white shadow-2xl shadow-black/15 sm:rounded-[2rem]">
      <div className="relative aspect-[4/5] overflow-hidden p-4 sm:aspect-square sm:p-8 lg:p-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(212,175,55,0.22),transparent_32%),radial-gradient(circle_at_85%_80%,rgba(212,175,55,0.12),transparent_28%)]" />
        <div className="absolute inset-3 rounded-[1.15rem] border border-[#D4AF37]/20 sm:inset-6 sm:rounded-[1.5rem]" />
        <div className="relative z-10 flex h-full flex-col">
          <header className="flex items-start justify-between gap-2 sm:gap-4">
            <div><p className="font-serif text-sm font-black tracking-tight min-[380px]:text-base sm:text-2xl">ALFAWZAAN&apos;S<span className="text-[#D4AF37]">.</span></p><p className="mt-0.5 text-[6px] font-bold uppercase tracking-[0.22em] text-white/40 min-[380px]:text-[7px] sm:mt-1 sm:text-[10px] sm:tracking-[0.3em]">Enterprise · Ilorin</p></div>
            <div className="max-w-[48%] rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/10 px-2.5 py-1.5 text-center text-[6px] font-bold uppercase tracking-[0.12em] text-[#D4AF37] min-[380px]:text-[7px] sm:max-w-none sm:px-4 sm:py-2 sm:text-[9px] sm:tracking-[0.2em]">Hot sellers · {report.periodLabel}</div>
          </header>

          <div className="mt-3 grid min-h-0 flex-1 grid-rows-[1.2fr_0.8fr] gap-3 sm:mt-8 sm:grid-cols-[1.08fr_0.92fr] sm:grid-rows-1 sm:gap-7">
            <div className="relative min-h-0 overflow-hidden rounded-[1.3rem] border border-white/10 bg-white/5 sm:rounded-[1.8rem]">
              {top.imageUrl ? <OptimizedImage key={top.imageUrl} src={top.imageUrl} alt={top.productName} sizes="(max-width: 640px) 90vw, 450px" /> : <div className="flex h-full items-center justify-center bg-[#191919] text-[#D4AF37]"><Sparkles className="h-12 w-12 sm:h-20 sm:w-20" /></div>}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/5 to-transparent" />
              <div className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-[#D4AF37] text-black shadow-lg sm:left-5 sm:top-5 sm:h-12 sm:w-12"><Crown size={15} className="sm:h-6 sm:w-6" /></div>
              <div className="absolute inset-x-0 bottom-0 p-3.5 sm:p-6">
                <p className="text-[7px] font-black uppercase tracking-[0.22em] text-[#D4AF37] sm:text-[10px] sm:tracking-[0.25em]">No. 1 most loved</p>
                <h3 className="mt-1 line-clamp-2 font-serif text-xl font-bold leading-tight min-[380px]:text-2xl sm:mt-2 sm:text-4xl">{top.productName}</h3>
                <p className="mt-1 text-[7px] font-medium uppercase tracking-wider text-white/55 min-[380px]:text-[8px] sm:mt-2 sm:text-xs">{top.category || "Signature fragrance"}</p>
              </div>
            </div>

            <div className="flex min-h-0 flex-col">
              <div className="flex items-end justify-between gap-3 sm:block"><div><p className="text-[7px] font-bold uppercase tracking-[0.2em] text-[#D4AF37] sm:text-[11px] sm:tracking-[0.26em]">The scent list</p><h2 className="mt-1 font-serif text-lg font-bold leading-none min-[380px]:text-xl sm:mt-2 sm:text-5xl">What everyone is wearing.</h2></div><p className="hidden max-w-xs text-xs leading-5 text-white/45 sm:mt-2 sm:block">The fragrances customers returned for across our Unilorin and Tanke boutiques.</p></div>
              <div className="mt-2 grid min-h-0 flex-1 grid-cols-3 gap-1.5 sm:mt-7 sm:grid-cols-1 sm:grid-rows-3 sm:gap-3">
                {featured.map((item, index) => <div key={item.productId} className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] sm:flex-row sm:items-center sm:gap-3 sm:rounded-2xl sm:p-3"><div className="h-[58%] w-full shrink-0 overflow-hidden bg-white/5 sm:h-16 sm:w-16 sm:rounded-xl">{item.imageUrl ? <OptimizedImage key={item.imageUrl} src={item.imageUrl} alt="" sizes="(max-width: 640px) 25vw, 64px" /> : <div className="flex h-full items-center justify-center text-[#D4AF37]"><Flame size={15} /></div>}</div><div className="min-w-0 flex-1 px-1.5 py-1 sm:p-0"><p className="text-[6px] font-bold uppercase tracking-wider text-[#D4AF37] sm:text-[9px]">No. {index + 2}</p><p className="line-clamp-2 text-[8px] font-bold leading-tight min-[380px]:text-[9px] sm:text-base">{item.productName}</p><p className="mt-0.5 hidden truncate text-[7px] uppercase tracking-wider text-white/35 sm:block sm:text-[9px]">{item.category || "Fragrance"}</p></div></div>)}
                {Array.from({ length: Math.max(0, 3 - featured.length) }).map((_, index) => <div key={`empty-${index}`} className="flex items-center justify-center rounded-lg border border-dashed border-white/10 px-1 text-center text-[6px] uppercase tracking-wider text-white/25 sm:rounded-2xl sm:text-[10px]">More favourites coming soon</div>)}
              </div>
            </div>
          </div>

          <footer className="mt-2.5 flex items-end justify-between gap-3 border-t border-white/10 pt-2.5 sm:mt-6 sm:pt-5">
            <div className="flex items-center gap-1 text-[6px] font-bold uppercase tracking-wider text-white/45 min-[380px]:text-[7px] sm:gap-1.5 sm:text-[10px]"><MapPin size={9} className="text-[#D4AF37] sm:h-[11px] sm:w-[11px]" /> Unilorin · Tanke</div>
            <div className="text-right"><p className="text-[7px] font-black uppercase tracking-[0.12em] text-white min-[380px]:text-[8px] sm:text-xs sm:tracking-[0.18em]">Shop the collection</p><p className="mt-0.5 text-[6px] text-[#D4AF37] min-[380px]:text-[7px] sm:text-[10px]">alfawzaanenterprise.ng</p></div>
          </footer>
        </div>
      </div>
    </section>}

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map(({ title, value, percent, icon: Icon }) => <div key={title} className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5"><div className="mb-3 flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{title}</p><Icon size={17} className="text-[#D4AF37]" /></div><p className="truncate text-lg font-black text-gray-900 sm:text-2xl">{value}</p>{typeof percent === "number" && <p className={`mt-1 text-[10px] font-bold ${percent >= 0 ? "text-emerald-600" : "text-red-500"}`}>{percent >= 0 ? "+" : ""}{percent}% vs previous period</p>}</div>)}
    </div>

    <div className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
      <section className="rounded-2xl border border-gray-100 bg-white p-5 sm:p-7"><div className="mb-6"><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#8B7355]">Demand ranking</p><h3 className="mt-1 font-serif text-2xl font-bold text-gray-900">What&apos;s selling hot</h3></div>{report.topProducts.length === 0 ? <p className="py-12 text-center text-sm text-gray-400">No verified sales in this period.</p> : <div className="space-y-4">{report.topProducts.map((item, index) => <div key={item.productId} className="flex items-center gap-3"><span className="w-5 text-center font-serif text-lg font-bold text-[#D4AF37]">{String(index + 1).padStart(2, "0")}</span><div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-[#f7f4ee]">{item.imageUrl ? <OptimizedImage key={item.imageUrl} src={item.imageUrl} alt="" sizes="48px" /> : <div className="flex h-full items-center justify-center text-[#D4AF37]"><Flame size={17} /></div>}</div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><p className="truncate text-sm font-bold text-gray-900">{item.productName}</p><p className="shrink-0 text-xs font-black text-gray-900">{item.units} units</p></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-[#D4AF37]" style={{ width: `${Math.max(5, (item.units / maxUnits) * 100)}%` }} /></div><p className="mt-1 text-[10px] text-gray-400">{item.category || "Fragrance"} · {item.outlets.map(label).join(" + ")} · {money(item.revenue)}</p></div></div>)}</div>}</section>
      <section className="rounded-2xl border border-gray-100 bg-white p-5 sm:p-7"><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#8B7355]">Boutique performance</p><h3 className="mt-1 font-serif text-2xl font-bold text-gray-900">Where demand is moving</h3><div className="mt-7 space-y-6">{report.outletSummary.map((item) => { const share = report.totalUnits ? Math.round((item.units / report.totalUnits) * 100) : 0; return <div key={item.outlet}><div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-bold text-gray-900"><span className={`h-2.5 w-2.5 rounded-full ${item.outlet === "unilorin" ? "bg-emerald-500" : "bg-violet-500"}`} />{label(item.outlet)}</span><span className="text-sm font-black text-[#D4AF37]">{share}%</span></div><div className="mt-2 h-3 rounded-full bg-gray-100"><div className={`h-full rounded-full ${item.outlet === "unilorin" ? "bg-emerald-500" : "bg-violet-500"}`} style={{ width: `${share}%` }} /></div><p className="mt-2 text-xs text-gray-400">{item.units} units sold · {money(item.revenue)}</p></div>})}</div><div className="mt-8 border-t border-gray-100 pt-5"><p className="text-[10px] uppercase tracking-widest text-gray-400">Board note</p><p className="mt-2 text-xs leading-5 text-gray-500">Rankings use verified orders and recorded sales after reversals. Pending orders are not counted.</p></div></section>
    </div>
    <p className="text-right text-[10px] text-gray-400">Snapshot {formatPulseTimestamp(report.generatedAt)} WAT</p>
  </div>;
}
