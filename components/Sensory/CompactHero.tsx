"use client";

import { motion } from "framer-motion";
import { ArrowRight, MapPin, Sparkles } from "lucide-react";
import Link from "next/link";
import HeroVideo from "@/components/Sensory/HeroVideo";

interface CompactHeroProps {
  productCount?: number;
}

export default function CompactHero({ productCount }: CompactHeroProps) {
  const collectionSize = productCount ? `${productCount.toLocaleString()}+` : "Hundreds of";

  return (
    <section className="relative overflow-hidden bg-[#121212] px-5 py-10 sm:px-8 sm:py-14 lg:px-10 lg:py-20">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(212,175,55,0.12),transparent_35%)]" />
      <div className="relative z-10 mx-auto grid max-w-[1200px] items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <div className="max-w-2xl text-center lg:text-left">
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 text-[10px] font-bold uppercase tracking-[0.28em] text-[#D4AF37] sm:text-xs"
          >
            Premium fragrance boutiques in Ilorin
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="font-serif text-[2.65rem] font-bold leading-[1.02] tracking-tight text-white sm:text-6xl lg:text-7xl"
          >
            Find a fragrance that feels like <span className="italic text-[#D4AF37]">you.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.7 }}
            className="mx-auto mt-6 max-w-xl text-sm leading-7 text-white/65 sm:text-base lg:mx-0"
          >
            Shop authentic perfumes, concentrated oils, body mists, gift sets, and more with live availability from our Unilorin and Tanke boutiques.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.7 }}
            className="mt-8 flex flex-col items-stretch justify-center gap-3 min-[420px]:flex-row lg:justify-start"
          >
            <Link href="/store" className="group inline-flex items-center justify-center gap-2 rounded-full bg-[#D4AF37] px-7 py-3.5 text-[11px] font-bold uppercase tracking-widest text-black transition hover:bg-[#e0bd4a]">
              Explore the collection
              <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
            </Link>
            <a href="#scent-finder" className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/5 px-7 py-3.5 text-[11px] font-bold uppercase tracking-widest text-white transition hover:border-[#D4AF37]/60 hover:bg-white/10">
              <Sparkles size={14} className="text-[#D4AF37]" />
              Find your scent
            </a>
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[10px] font-medium uppercase tracking-wider text-white/45 lg:justify-start"
          >
            <span>{collectionSize} products</span>
            <span className="hidden h-1 w-1 rounded-full bg-[#D4AF37] sm:block" />
            <span>Live boutique stock</span>
            <span className="hidden h-1 w-1 rounded-full bg-[#D4AF37] sm:block" />
            <span>WhatsApp ordering</span>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.15 }}
          className="relative mx-auto w-full max-w-[560px]"
        >
          <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] border border-white/10 bg-[#1b1b1b] shadow-2xl shadow-black/30 sm:aspect-[5/4] lg:aspect-[4/5]">
            <HeroVideo />
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/10" />
            <div className="absolute inset-x-5 bottom-5 flex items-center justify-between rounded-2xl border border-white/10 bg-black/45 p-4 text-white backdrop-blur-md">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#D4AF37]">Shop in person</p>
                <p className="mt-1 font-serif text-lg font-semibold">Unilorin &amp; Tanke</p>
              </div>
              <a href="#boutiques" aria-label="View boutique locations" className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black transition hover:bg-[#D4AF37]">
                <MapPin size={17} />
              </a>
            </div>
          </div>
          <div className="absolute -bottom-3 -right-3 -z-10 h-full w-full rounded-[2rem] border border-[#D4AF37]/25" />
        </motion.div>
      </div>
    </section>
  );
}
