// app/ambassador/[code]/page.tsx
// Read-only sales portal for one ambassador, opened from the private link the
// admin hands out (/ambassador/CODE?token=SECRET). Shows only orders the admin
// has verified as paid — pending orders are surfaced as pending and never
// counted. No customer names or phone numbers are shown, so the link is safe to
// share. Deliberately lightweight: two small indexed queries, no catalog, no
// images, and it is excluded from search engines.
//
// Payment screenshots live in the ambassador's WhatsApp group, not here, so
// this page uses none of the project's storage.

import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, Clock, Megaphone, ShieldCheck } from "lucide-react";
import { getAmbassadorByAccess } from "@/lib/master/ambassadors";
import { getAmbassadorPortalStats } from "@/lib/archive/ambassadorRedemptions";
import { canonicalAmbassadorCode } from "@/lib/ambassadors";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ambassador Dashboard | Alfawzaan's Enterprise",
  robots: { index: false, follow: false },
};

function naira(value: number): string {
  return `₦${Math.round(value).toLocaleString()}`;
}

function validLinkNotice() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f4ee] px-6">
      <div className="w-full max-w-sm rounded-3xl border border-black/5 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-black/5">
          <ShieldCheck size={26} className="text-black/40" />
        </div>
        <h1 className="font-serif text-2xl font-bold text-[#121212]">Private link required</h1>
        <p className="mt-2 text-sm leading-relaxed text-black/50">
          This ambassador dashboard opens from a private link. Please use the exact link the store shared
          with you, or ask the store for a new one.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-full bg-[#121212] px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-white"
        >
          Back to the store
        </Link>
      </div>
    </main>
  );
}

export default async function AmbassadorPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { code } = await params;
  const { token } = await searchParams;
  const canonical = canonicalAmbassadorCode(code ?? "");
  const ambassador = canonical && token ? await getAmbassadorByAccess(canonical, token) : null;

  if (!ambassador) return validLinkNotice();

  const stats = await getAmbassadorPortalStats(canonical as string);

  return (
    <main className="min-h-screen bg-[#f7f4ee] px-5 py-10 sm:px-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#D4AF37]/25 bg-[#FAF5E6]">
            <Megaphone size={22} className="text-[#D4AF37]" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#8B7355]">
              Ambassador dashboard
            </p>
            <h1 className="truncate font-serif text-2xl font-bold text-[#121212]">{ambassador.name}</h1>
            <p className="font-mono text-[11px] text-black/40">{ambassador.code}</p>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-black/5 bg-white p-5">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-600">
              <BadgeCheck size={13} /> Confirmed buyers
            </p>
            <p className="mt-2 text-3xl font-black text-[#121212]">{stats.paidCount}</p>
            <p className="mt-1 text-[11px] text-black/45">Orders the store has verified as paid.</p>
          </div>
          <div className="rounded-2xl border border-black/5 bg-white p-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#8B7355]">
              Confirmed revenue
            </p>
            <p className="mt-2 text-3xl font-black text-[#121212]">{naira(stats.paidRevenue)}</p>
            <p className="mt-1 text-[11px] text-black/45">Total of verified paid orders.</p>
          </div>
        </section>

        {stats.pendingCount > 0 && (
          <p className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] leading-relaxed text-amber-800">
            <Clock size={14} className="mt-0.5 shrink-0" />
            {stats.pendingCount} order{stats.pendingCount === 1 ? "" : "s"} awaiting payment confirmation.
            These count once the store verifies the payment screenshot.
          </p>
        )}

        <section className="overflow-hidden rounded-2xl border border-black/5 bg-white">
          <div className="border-b border-black/5 px-5 py-4">
            <h2 className="text-sm font-bold text-[#121212]">Confirmed sales</h2>
            <p className="text-[11px] text-black/40">Most recent verified paid orders through your QR.</p>
          </div>
          {stats.recentPaid.length === 0 ? (
            <p className="px-5 py-10 text-center text-xs text-black/40">
              No confirmed paid orders yet. When a buyer pays and the store verifies it, it appears here.
            </p>
          ) : (
            <ul className="divide-y divide-black/5">
              {stats.recentPaid.map((order, index) => (
                <li key={`${order.at}-${index}`} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <p className="text-xs font-semibold text-[#121212]">
                      {new Date(order.at).toLocaleDateString("en-NG", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                    {order.outlet && (
                      <p className="text-[10px] uppercase tracking-wider text-black/40">{order.outlet}</p>
                    )}
                  </div>
                  <p className="text-sm font-black text-[#121212]">{naira(order.amount)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="px-1 text-center text-[10px] leading-relaxed text-black/35">
          Payment screenshots are shared in your WhatsApp group. This dashboard only shows orders the store
          has confirmed as paid.
        </p>
      </div>
    </main>
  );
}
