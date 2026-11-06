// components/StoreFront/SaleBanner.tsx
// Time-boxed discount sales banner for the landing and marketplace pages.
// Shows only between SALE_START and SALE_END (the campaign window management
// set for the September 2026 retailer discounts: Wed 9 Sep – Mon 14 Sep, WAT)
// and hides itself automatically afterwards — no redeploy needed to remove it.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { BadgePercent } from "lucide-react";

// WAT is UTC+1 year-round.
const SALE_START = new Date("2026-09-09T00:00:00+01:00").getTime();
const SALE_END = new Date("2026-09-14T23:59:59+01:00").getTime();

function formatRemaining(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days >= 1) return `${days} day${days !== 1 ? "s" : ""} ${hours}h left`;
  if (hours >= 1) return `${hours}h ${minutes}m left`;
  if (totalMinutes > 0) return `${minutes}m left`;
  return "Ending now";
}

export default function SaleBanner() {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    // Start after mount so SSR HTML never embeds a server time that could
    // mismatch on hydration (same pattern as the boutique open/closed badge).
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  // `now === null` means pre-hydration: render nothing rather than flash the
  // banner in markets far from WAT where the sale may not have started yet.
  if (now === null || now < SALE_START || now > SALE_END) return null;

  const remaining = SALE_END - now;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="relative bg-[#121212] text-white overflow-hidden"
      role="region"
      aria-label="Discount sales announcement"
    >
      {/* Subtle gold shimmer edges */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#D4AF37]/70 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#D4AF37]/70 to-transparent" />

      <Link
        href="/store"
        className="block mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-10 py-2.5 sm:py-3 group"
      >
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
          <span className="flex items-center gap-1.5 sm:gap-2">
            <BadgePercent size={14} className="text-[#D4AF37] shrink-0" />
            <span className="text-[10px] sm:text-xs font-black uppercase tracking-[0.18em] sm:tracking-[0.25em]">
              Discount Sales
            </span>
          </span>
          <span className="hidden sm:inline h-3 w-px bg-white/20" />
          <span className="text-[10px] sm:text-xs font-medium text-white/70">
            Wed 9 Sep – Mon 14 Sep
          </span>
          <span className="hidden sm:inline h-3 w-px bg-white/20" />
          <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-[#D4AF37]">
            {formatRemaining(remaining)}
          </span>
          <span className="hidden min-[400px]:inline text-[10px] sm:text-xs font-semibold text-white/50 underline underline-offset-4 group-hover:text-white/80 transition-colors">
            Shop discounted prices
          </span>
        </div>
      </Link>
    </motion.div>
  );
}
