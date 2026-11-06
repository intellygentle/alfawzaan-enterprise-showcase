"use client";

import Link from "next/link";
import { Clock3, MapPin, Truck, ArrowRight, Package } from "lucide-react";
import { Navigation } from "@/components/Navigation";

export default function DeliveryPage() {
  return (
    <div className="min-h-screen bg-[#f7f4ee] text-[#121212] font-sans">
      <Navigation variant="store" />

      <main className="px-4 sm:px-6 lg:px-8 py-14 sm:py-24 flex items-center justify-center min-h-[80vh]">
        <div className="max-w-2xl mx-auto text-center">
          {/* ── Icon ── */}
          <div className="relative w-20 h-20 mx-auto mb-8">
            <div className="absolute inset-0 rounded-full bg-[#D4AF37]/20 animate-pulse-glow" />
            <div className="relative w-24 h-24 rounded-full bg-black text-white flex items-center justify-center border-2 border-black shadow-xl shadow-black/20">
               <Package size={36} />
            </div>
            <div className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-[#D4AF37] text-black flex items-center justify-center border-2 border-black/20">
              <Truck size={16} />
            </div>
          </div>

          {/* ── Badge ── */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#D4AF37]/30 bg-white/70">
            <Clock3 size={13} className="text-[#9b7911]" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#121212]/70">
              Delivery service coming soon
            </span>
          </div>

          {/* ── Heading ── */}
          <h1 className="mt-6 text-4xl md:text-5xl font-serif font-bold text-[#121212] tracking-tight leading-tight">
            Flexible delivery is on the way.
          </h1>

          {/* ── Copy ── */}
          <p className="mt-5 text-[#121212]/60 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
            We are preparing a reliable delivery option for customers who want their fragrance brought to them. For now, place your order through WhatsApp and arrange pickup or direct delivery with the boutique.
          </p>

          <div className="grid sm:grid-cols-2 gap-3 mt-9 text-left">
            <div className="rounded-2xl border border-black/5 bg-white/75 p-4 shadow-sm">
              <MapPin size={18} className="text-[#D4AF37] mb-3" />
              <p className="text-sm font-bold">Boutique pickup</p>
              <p className="text-xs text-black/50 mt-1 leading-relaxed">Collect your order from Unilorin or Tanke after payment confirmation.</p>
            </div>
            <div className="rounded-2xl border border-black/5 bg-white/75 p-4 shadow-sm">
              <Truck size={18} className="text-[#D4AF37] mb-3" />
              <p className="text-sm font-bold">Direct delivery</p>
              <p className="text-xs text-black/50 mt-1 leading-relaxed">Contact the selected boutique after ordering to confirm available delivery arrangements.</p>
            </div>
          </div>

          {/* ── CTAs ── */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <Link href="/store" className="group relative overflow-hidden bg-[#D4AF37] text-black border-2 border-[#D4AF37] px-8 py-3 rounded-full text-xs font-semibold uppercase tracking-widest transition-all duration-300 hover:bg-[#c9a431] hover:border-[#c9a431] hover:shadow-lg hover:shadow-[#D4AF37]/25">
                <span className="relative z-10 flex items-center gap-2">
                  Browse the Collection
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
                </span>
            </Link>
            <Link href="/" className="group relative px-8 py-3 rounded-full text-xs font-semibold uppercase tracking-widest text-black/60 hover:text-black border border-black/15 bg-white/40 backdrop-blur-sm transition-all duration-300 hover:border-[#D4AF37]/50 hover:bg-white/60">
                Back to Home
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
