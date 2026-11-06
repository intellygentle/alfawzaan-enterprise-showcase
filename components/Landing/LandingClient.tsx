// components/Landing/LandingClient.tsx
// Interactive landing-page shell. Featured products, category images, product
// count, and phone numbers arrive as server-rendered props (cached server-side
// via lib/storefront/data.ts) instead of being fetched from every visitor's
// browser, which is what pushed the Master project over its Cached Egress
// quota.
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Clock,
  Droplets,
  Flame,
  Flower,
  Flower2,
  Gem,
  Gift,
  Globe,
  LayoutGrid,
  Map,
  MapPin,
  MessageCircle,
  Phone,
  PhoneCall,
  ExternalLink,
  ShoppingBag,
  Ruler,
  Shirt,
  Smile,
  Sparkles,
  SprayCan,
  Watch,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { CartDrawer } from "@/components/StoreFront/CartDrawer";
import { WhatsAppLink } from "@/components/WhatsAppLink";
import OptimizedImage from "@/components/StoreFront/OptimizedImage";
import SaleBanner from "@/components/StoreFront/SaleBanner";

import { CATEGORIES, WHATSAPP_CHANNEL_URL } from "@/lib/constants";
import type { StoreProduct } from "@/lib/types";
import { SENSORY_TAGLINES } from "@/lib/sensoryCopy";
import { Navigation } from "@/components/Navigation";
import CompactHero from "@/components/Sensory/CompactHero";
import ProductShowcaseCarousel from "@/components/Sensory/ProductShowcaseCarousel";
import FadeIn from "@/components/Sensory/FadeIn";
import ScentFinder from "@/components/Sensory/ScentFinder";
import StorefrontPhoto from "@/components/Sensory/StorefrontPhoto";
import MobileLandingNav from "@/components/MobileLandingNav";

export interface LandingClientProps {
  featured: StoreProduct[];
  categoryImages: Record<string, string>;
  productCount: number;
  phones: Record<string, string>;
}

const SectionLabel = ({ text, delay = 0 }: { text: string; delay?: number }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    className="flex items-center gap-3 justify-center mb-6"
  >
    <span className="h-px w-8 bg-[#D4AF37]/30" />
    <span className="text-xs font-medium uppercase tracking-[0.25em] text-[#D4AF37]/60">
      {text}
    </span>
    <span className="h-px w-8 bg-[#D4AF37]/30" />
  </motion.div>
);

const SectionHeading = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <motion.h2
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    className={`text-3xl md:text-4xl lg:text-5xl font-serif font-bold text-[#121212] tracking-tight ${className}`}
  >
    {children}
  </motion.h2>
);

// ─── Opening-hours helpers ───
function parseHoursRange(hours: string): { open: number; close: number } | null {
  const match = hours.match(
    /(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i
  );
  if (!match) return null;

  const toMinutes = (h: number, m: number, meridian: string) => {
    let hour = h % 12;
    if (meridian.toUpperCase() === "PM") hour += 12;
    return hour * 60 + m;
  };

  return {
    open: toMinutes(parseInt(match[1], 10), parseInt(match[2], 10), match[3]),
    close: toMinutes(parseInt(match[4], 10), parseInt(match[5], 10), match[6]),
  };
}

// The store's clock is African/Lagos time — store hours are set in Nigeria,
// so the badge must reflect Lagos time, not the visitor's local timezone.
const LAGOS_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: "Africa/Lagos",
  hour: "numeric",
  minute: "numeric",
  hour12: false,
});

function getLagosClock(date: Date): { hours: number; minutes: number } {
  const parts = LAGOS_CLOCK.formatToParts(date);
  const hour =
    parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10) % 24;
  const minutes = parseInt(
    parts.find((p) => p.type === "minute")?.value ?? "0",
    10
  );
  return { hours: hour, minutes };
}

function isOpenAt(
  hours: string,
  clock: { hours: number; minutes: number }
): boolean {
  const range = parseHoursRange(hours);
  if (!range) return false;
  const current = clock.hours * 60 + clock.minutes;
  // Same-day hours (e.g. 8:00 AM - 9:00 PM)
  if (range.open <= range.close) {
    return current >= range.open && current < range.close;
  }
  // Overnight hours (e.g. 10:00 PM - 2:00 AM)
  return current >= range.open || current < range.close;
}

export default function LandingPage({
  featured,
  categoryImages,
  productCount,
  phones,
}: LandingClientProps) {
  const [now, setNow] = useState<Date | null>(null);
  const [ceoPhotoReady, setCeoPhotoReady] = useState(false);

  // Keep the boutique open/closed badge in sync with the current time.
  // The initial value is set after mount (not during render) so the SSR HTML
  // never embeds a server-side time that could mismatch on hydration.
  useEffect(() => {
    const timeout = setTimeout(() => setNow(new Date()), 0);
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);

  // Show the real CEO portrait once /abdulrahman.jpg exists in /public;
  // until then, display an elegant gold monogram plate instead.
  useEffect(() => {
    const img = new Image();
    img.onload = () => setCeoPhotoReady(true);
    img.src = "/abdulrahman.jpg";
    return () => {
      img.onload = null;
    };
  }, []);

  // ─── Category metadata (icons & descriptions for landing page cards) ───
  const CATEGORY_META: Record<string, { icon: LucideIcon; desc: string }> = {
    '100MLs': { icon: Gem, desc: 'Full-size luxury bottles' },
    '50MLs': { icon: Ruler, desc: 'Mid-size elegant bottles' },
    '30MLs': { icon: Ruler, desc: 'Compact travel-friendly sizes' },
    'Miniatures': { icon: Sparkles, desc: 'Small yet mighty treasures' },
    'Naseem Oils': { icon: Droplets, desc: 'Premium Naseem oil collection' },
    'Oils': { icon: Droplets, desc: 'Concentrated pure fragrance oils' },
    'Body Sprays': { icon: Wind, desc: 'Light & refreshing mists' },
    'Body Mists': { icon: Smile, desc: 'Soft everyday wear mists' },
    'Roll-ons': { icon: SprayCan, desc: 'Convenient roll-on perfumes' },
    'Gift Sets': { icon: Gift, desc: 'Curated luxury gift collections' },
    'Home Fragrance': { icon: Flower2, desc: 'Scent your living space' },
    'Bakhoor & Incense': { icon: Flame, desc: 'Traditional Arabian incense' },
    'Traditional Wear': { icon: Shirt, desc: 'Jalab, hijab & more' },
    'Islamic Materials': { icon: BookOpen, desc: 'Quran, honey, black seed & more' },
    'Self Care': { icon: Flower, desc: 'Soaps, creams & body care' },
    'Accessories': { icon: Watch, desc: 'Caps, gloves, prayer mats & more' },
  };

  // ─── Rotating sensory tagline ───
  const [taglineIndex, setTaglineIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTaglineIndex((prev) => (prev + 1) % SENSORY_TAGLINES.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const philoImages = featured.length >= 2
    ? [featured[0]?.imageUrl || "/6539650.jpg", featured[1]?.imageUrl || "/6539650.jpg"]
    : ["/6539650.jpg", "/6539650.jpg"];

  const allCategoryConfig = CATEGORIES.map((name) => ({
    name,
    icon: CATEGORY_META[name]?.icon || LayoutGrid,
    desc: CATEGORY_META[name]?.desc || 'Explore our collection',
    fallbackImg: "/6539650.jpg",
  }));
  const featuredCategoryConfig = allCategoryConfig.filter((category) =>
    ["100MLs", "Oils", "Body Sprays", "Gift Sets", "Home Fragrance", "Bakhoor & Incense"].includes(category.name)
  );
  const boutiqueData = [
    {
      name: "Unilorin Branch",
      address: "University of Ilorin Main Campus, Ilorin",
      hours: "8:00 AM - 9:00 PM",
      phone: phones.unilorin,
      tag: "Main Campus",
      image: "/UnilorinStoreFront.jpg",
      mapQuery: "Alfawzaan Enterprise University of Ilorin",
      location: "Unilorin",
    },
    {
      name: "Tanke Branch",
      address: "Tanke Junction, Behind Femtech building, Ilorin",
      hours: "9:00 AM - 7:00 PM",
      phone: phones.tanke,
      tag: "City Center",
      image: "/TankeStorefront.jpg",
      mapQuery: "Alfawzaan Enterprise Tanke Junction Ilorin",
      location: "Tanke",
    },
  ];

  // ─── Categories carousel state & handlers ───
  const carouselRef = useRef<HTMLDivElement>(null);
  const autoScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [autoScrollPaused, setAutoScrollPaused] = useState(false);

  const updateScrollButtons = useCallback(() => {
    const el = carouselRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 5);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 5);
  }, []);

  const scrollBy = useCallback((offset: number) => {
    const el = carouselRef.current;
    if (!el) return;
    const cardWidth = 264; // card width (260px) + gap (16px)
    const target = el.scrollLeft + offset * cardWidth;
    el.scrollTo({ left: target, behavior: 'smooth' });
    setTimeout(updateScrollButtons, 400);
  }, [updateScrollButtons]);

  const handleCarouselScroll = useCallback(() => {
    updateScrollButtons();
    // Pause auto-scroll briefly after manual interaction
    setAutoScrollPaused(true);
    if (autoScrollTimerRef.current) clearTimeout(autoScrollTimerRef.current);
    autoScrollTimerRef.current = setTimeout(() => {
      setAutoScrollPaused(false);
    }, 6000);
  }, [updateScrollButtons]);

  // ─── Auto-scroll every 4 seconds ───
  useEffect(() => {
    const interval = setInterval(() => {
      if (autoScrollPaused) return;
      if (!canScrollRight) {
        // Loop back to the start
        carouselRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
        setTimeout(updateScrollButtons, 400);
      } else {
        scrollBy(1);
      }
    }, 4000);

    return () => {
      clearInterval(interval);
      if (autoScrollTimerRef.current) clearTimeout(autoScrollTimerRef.current);
    };
  }, [autoScrollPaused, canScrollRight, scrollBy, updateScrollButtons]);

  return (
    <div className="min-h-screen bg-[#f7f4ee] text-[#121212] font-sans selection:bg-[#D4AF37]/20">

      <Navigation variant="landing" />

      <SaleBanner />

      {/* ═════════════════ HERO ═════════════════ */}
      <CompactHero productCount={productCount} />

      {/* ═════════════════ TRUST BAR ═════════════════ */}
      <section aria-label="Why shop with Alfawzaan" className="border-b border-black/5 bg-white px-5 py-5 sm:px-8">
        <div className="mx-auto grid max-w-[1200px] grid-cols-2 gap-5 md:grid-cols-4">
          {[
            { value: `${productCount.toLocaleString()}+`, label: "Products to explore" },
            { value: "2", label: "Ilorin boutiques" },
            { value: "Live", label: "Stock availability" },
            { value: "Direct", label: "WhatsApp ordering" },
          ].map((item) => (
            <div key={item.label} className="border-l border-[#D4AF37]/35 pl-4">
              <p className="font-serif text-xl font-bold text-[#121212] sm:text-2xl">{item.value}</p>
              <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.16em] text-black/40 sm:text-[10px]">{item.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═════════════════ SCENT FINDER ═════════════════ */}
      <div id="scent-finder" className="scroll-mt-20">
        <ScentFinder />
      </div>

      {/* ═════════════════ PHILOSOPHY ═════════════════ */}
      <section className="relative bg-white border-y border-black/5 py-20 lg:py-28 px-6 lg:px-10 overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute inset-0 bg-islamic pointer-events-none" />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(212,175,55,0.06) 0%, transparent 60%)",
          }}
        />
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#D4AF37]/[0.02] rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#D4AF37]/[0.02] rounded-full blur-3xl" />

        <div className="max-w-[1200px] mx-auto relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 sm:gap-16 lg:gap-24 items-center">
            <FadeIn>
              <div className="space-y-8">
                <SectionLabel text="Our Philosophy" delay={0} />
                <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-serif font-bold text-[#121212] leading-[1.1] tracking-tight">
                  Luxury is in the{" "}
                  <span className="relative italic">
                    <span className="text-[#D4AF37] relative z-10">details</span>
                    <span
                      className="absolute -bottom-1 left-0 right-0 h-1.5 sm:h-2 bg-[#D4AF37]/20 -skew-x-6"
                      aria-hidden="true"
                    />
                  </span>
                  .
                </h2>
                {/* ── Rotating sensory tagline ── */}
                <div className="min-h-[2rem]">
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={taglineIndex}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                      className="text-xs font-medium italic text-[#D4AF37]/60"
                    >
                      &ldquo;{SENSORY_TAGLINES[taglineIndex]}&rdquo;
                    </motion.p>
                  </AnimatePresence>
                </div>

                <p className="text-black/60 text-sm sm:text-[15px] leading-[1.9] max-w-md font-sans">
                  Every bottle tells a story. The citrus that greets you. The
                  florals that unfold. The base that lingers like a memory. We
                  don&apos;t just sell fragrances — we curate experiences that
                  evolve with you through the day.
                </p>

                {/* Stat */}
                <div className="relative border border-black/5 bg-white/70 backdrop-blur-sm rounded-2xl p-4 sm:p-5 shadow-sm text-center">
                  <p className="text-2xl sm:text-3xl font-bold text-brand-gold tracking-tight">
                    {productCount.toLocaleString()}+
                  </p>
                  <p className="text-[10px] sm:text-[11px] font-medium uppercase tracking-widest text-black/40 mt-1">
                    Curated Products
                  </p>
                </div>

                <Link href="/store" className="group inline-flex relative overflow-hidden bg-black text-white border-2 border-black px-6 sm:px-8 py-2.5 sm:py-3 rounded-full text-[10px] sm:text-xs font-semibold uppercase tracking-widest transition-all duration-300 hover:bg-black/90 hover:shadow-lg hover:shadow-black/25">
                    <span className="relative z-10 flex items-center gap-2">
                      Explore Collection
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
                    </span>
                </Link>
              </div>
            </FadeIn>

            <FadeIn delay={0.15}>
              <div className="grid grid-cols-2 gap-4 lg:gap-6">
                <div className="space-y-4 lg:space-y-6 mt-8 lg:mt-12">
                  <div className="relative aspect-[3/4] rounded-2xl overflow-hidden group border border-black/5">
                    <OptimizedImage
                      src={philoImages[0]}
                      className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                      sizes="(max-width: 1024px) 50vw, 25vw"
                      alt="Perfume"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  </div>
                  <div className="bg-white/80 border border-black/5 p-4 sm:p-6 rounded-2xl hover:border-brand-gold/40 hover:shadow-lg transition-all duration-300 shadow-sm">
                    <div className="w-10 h-10 rounded-full bg-[#D4AF37]/10 flex items-center justify-center mb-3">
                      <Gem className="text-[#D4AF37]" size={20} />
                    </div>
                    <p className="text-sm font-semibold text-[#121212]">
                      Premium Selection
                    </p>
                    <p className="text-xs text-black/50 mt-1">
                      Handpicked luxury for discerning tastes.
                    </p>
                  </div>
                </div>
                <div className="space-y-4 lg:space-y-6">
                  <div className="bg-white/80 border border-black/5 p-4 sm:p-6 rounded-2xl hover:border-brand-gold/40 hover:shadow-lg transition-all duration-300 shadow-sm">
                    <div className="w-10 h-10 rounded-full bg-[#D4AF37]/10 flex items-center justify-center mb-3">
                      <Droplets className="text-[#D4AF37]" size={20} />
                    </div>
                    <p className="text-sm font-semibold text-[#121212]">
                      Pure Oils
                    </p>
                    <p className="text-xs text-black/50 mt-1">
                      100% natural, long-lasting fragrance oils.
                    </p>
                  </div>
                  <div className="relative aspect-[3/4] rounded-2xl overflow-hidden group border border-black/5">
                    <OptimizedImage
                      src={philoImages[1]}
                      className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                      sizes="(max-width: 1024px) 50vw, 25vw"
                      alt="Oil"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  </div>
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ═════════════════ CATEGORIES ═════════════════ */}
      <section className="relative py-20 lg:py-28 px-6 lg:px-10 overflow-hidden">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-16 space-y-4">
            <SectionLabel text="Browse by Category" />
            <SectionHeading>Find your essence</SectionHeading>
          </div>

          <div className="relative group/carousel">
              {/* Left Arrow (desktop only) */}
              <button
                onClick={() => scrollBy(-1)}
                disabled={!canScrollLeft}
                className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-10 h-10 hidden md:flex items-center justify-center rounded-full bg-white/90 shadow-lg border border-white/40 text-[#121212] opacity-0 group-hover/carousel:opacity-100 transition-all duration-300 hover:bg-white disabled:opacity-0 disabled:cursor-default"
                aria-label="Scroll left"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              {/* Scroll Container */}
              <div
                ref={carouselRef}
                onScroll={handleCarouselScroll}
                onMouseEnter={() => setAutoScrollPaused(true)}
                onMouseLeave={() => setAutoScrollPaused(false)}
                onTouchStart={() => setAutoScrollPaused(true)}
                onTouchEnd={() => {
                  // Resume after a delay when touch ends
                  if (autoScrollTimerRef.current) clearTimeout(autoScrollTimerRef.current);
                  autoScrollTimerRef.current = setTimeout(() => {
                    setAutoScrollPaused(false);
                  }, 4000);
                }}
                className="flex gap-4 overflow-x-auto pb-4 scroll-smooth snap-x snap-mandatory scrollbar-hide"
              >
                {featuredCategoryConfig.map((cat) => (
                  <Link
                    key={cat.name}
                    href={`/store?category=${encodeURIComponent(cat.name)}`}
                    className="snap-start shrink-0 w-[260px] group"
                  >
                    <div className="relative h-[280px] rounded-2xl overflow-hidden border border-[#D4AF37]/5 hover:border-[#D4AF37]/20 transition-all duration-500">
                      <div className="absolute inset-0">
                        <OptimizedImage
                          src={categoryImages[cat.name] || cat.fallbackImg}
                          alt={cat.name}
                          sizes="260px"
                          className="object-cover transition-transform duration-700 group-hover:scale-[1.06]"
                        />
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                      {/* Gold accent line */}
                      <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#D4AF37] scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left" />

                      <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="p-2 bg-white/10 backdrop-blur-sm rounded-xl text-white group-hover:bg-[#D4AF37]/20 transition-colors duration-300">
                            <cat.icon className="w-5 h-5" />
                          </div>
                          <h3 className="text-lg font-serif font-semibold">
                            {cat.name}
                          </h3>
                        </div>
                        <p className="text-xs text-white/50 font-medium">
                          {cat.desc}
                        </p>
                        <div className="flex items-center gap-1 text-[11px] font-medium text-[#D4AF37] mt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          Shop Now <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              {/* Right Arrow (desktop only) */}
              <button
                onClick={() => scrollBy(1)}
                disabled={!canScrollRight}
                className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-10 h-10 hidden md:flex items-center justify-center rounded-full bg-white/90 shadow-lg border border-white/40 text-[#121212] opacity-0 group-hover/carousel:opacity-100 transition-all duration-300 hover:bg-white disabled:opacity-0 disabled:cursor-default"
                aria-label="Scroll right"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          <div className="mt-8 text-center">
            <Link href="/store" className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-black/60 transition hover:text-black">
              View all categories <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* ═════════════════ HOW ORDERING WORKS ═════════════════ */}
      <section className="border-y border-black/5 bg-white px-6 py-24 lg:px-10 lg:py-28">
        <div className="mx-auto max-w-[1100px]">
          <div className="mx-auto mb-12 max-w-xl text-center">
            <SectionLabel text="Simple ordering" />
            <SectionHeading>From discovery to confirmation</SectionHeading>
            <p className="mt-4 text-sm leading-relaxed text-black/50">Browse at your pace, choose where to collect, and complete your order directly with the boutique.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { number: "01", icon: Sparkles, title: "Choose your fragrance", copy: "Explore the collection or use the scent finder to narrow down what suits you." },
              { number: "02", icon: MapPin, title: "Select a boutique", copy: "Choose Unilorin or Tanke based on live stock and the location convenient for you." },
              { number: "03", icon: MessageCircle, title: "Confirm on WhatsApp", copy: "Send your prepared order and complete payment verification with the boutique team." },
            ].map((step) => (
              <div key={step.number} className="relative rounded-2xl border border-black/5 bg-[#f7f4ee] p-6 sm:p-7">
                <span className="absolute right-5 top-4 font-serif text-3xl font-bold text-[#D4AF37]/20">{step.number}</span>
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-[#121212] text-[#D4AF37]"><step.icon size={19} /></div>
                <h3 className="font-serif text-xl font-bold">{step.title}</h3>
                <p className="mt-2 text-xs leading-6 text-black/50">{step.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═════════════════ BOUTIQUES ═════════════════ */}
      <section id="boutiques" className="relative py-28 lg:py-36 px-6 lg:px-10 bg-[#121212] border-y border-[#D4AF37]/10 overflow-hidden scroll-mt-24">
        <div className="absolute inset-0 bg-islamic pointer-events-none" />
        <div
          className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(212,175,55,0.03) 0%, transparent 60%)",
          }}
        />

        <div className="max-w-[1200px] mx-auto relative z-10">
          <div className="text-center mb-16 space-y-4">
            <SectionLabel text="Visit Us" />
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="text-3xl md:text-4xl lg:text-5xl font-serif font-bold text-white tracking-tight"
            >
              Our Boutiques
            </motion.h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
            {boutiqueData.map((branch, i) => {
              const open = now ? isOpenAt(branch.hours, getLagosClock(now)) : null;
              return (
                <FadeIn key={branch.name} delay={i * 0.1}>
                <div className="group relative bg-[#121212] border border-white/5 p-8 lg:p-10 rounded-2xl hover:border-brand-gold/45 hover:shadow-xl hover:shadow-brand-gold/5 transition-all duration-500">
                  {/* Decorative corner accent */}
                  <div className="absolute top-0 right-0 w-16 h-16 overflow-hidden rounded-tr-2xl">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-[#D4AF37]/5 -translate-y-8 translate-x-8 rotate-45 group-hover:bg-[#D4AF37]/10 transition-colors duration-500" />
                  </div>

                  <div className="flex items-start justify-between mb-6">
                    <div className="p-3 bg-[#D4AF37]/10 rounded-xl border border-brand-gold/20">
                      <MapPin className="text-[#D4AF37]" size={22} />
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-[#D4AF37] bg-[#D4AF37]/5 px-3 py-1.5 rounded-full border border-[#D4AF37]/10">
                      <span className={`w-1.5 h-1.5 rounded-full ${open === null ? "bg-white/30 animate-pulse" : open ? "bg-green-500" : "bg-red-400"}`} />
                      {open === null ? "Checking…" : open ? "Open Now" : "Closed Now"}
                    </span>
                  </div>

                  <h3 className="text-xl lg:text-2xl font-serif font-semibold text-white mb-5">
                    {branch.name}
                    <span className="block text-[11px] font-sans font-medium uppercase tracking-widest text-[#D4AF37]/50 mt-1">
                      {branch.tag}
                    </span>
                  </h3>

                  <StorefrontPhoto
                    src={branch.image}
                    alt={`${branch.name} storefront`}
                    className="mb-6"
                  />

                  <div className="space-y-4">
                    <div className="flex items-start gap-3 text-sm text-white/55 font-sans">
                      <Map className="w-4 h-4 shrink-0 mt-0.5 text-[#D4AF37]/50" />
                      <span>{branch.address}</span>
                    </div>
                    <div className="flex items-start gap-3 text-sm text-white/55 font-sans">
                      <Clock className="w-4 h-4 shrink-0 mt-0.5 text-[#D4AF37]/50" />
                      <span>{branch.hours}</span>
                    </div>
                    <div className="flex items-start gap-3 text-sm text-white/55 font-sans">
                      <Phone className="w-4 h-4 shrink-0 mt-0.5 text-[#D4AF37]/50" />
                      <span>{branch.phone}</span>
                    </div>
                  </div>

                  <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <a href={`tel:${branch.phone}`} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-2 py-2.5 text-[9px] font-bold uppercase tracking-wider text-white/75 transition hover:border-[#D4AF37]/50 hover:text-white"><PhoneCall size={13} /> Call</a>
                    <WhatsAppLink phone={branch.phone} text={`Hi! I'd like to visit your ${branch.name}.`} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-2 py-2.5 text-[9px] font-bold uppercase tracking-wider text-white/75 transition hover:border-[#D4AF37]/50 hover:text-white"><MessageCircle size={13} /> Chat</WhatsAppLink>
                    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(branch.mapQuery)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-2 py-2.5 text-[9px] font-bold uppercase tracking-wider text-white/75 transition hover:border-[#D4AF37]/50 hover:text-white"><ExternalLink size={13} /> Map</a>
                    <Link href={`/store?outlet=${branch.location}`} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#D4AF37] px-2 py-2.5 text-[9px] font-bold uppercase tracking-wider text-black transition hover:bg-[#e0bd4a]"><ShoppingBag size={13} /> Shop</Link>
                  </div>
                </div>
                </FadeIn>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═════════════════ SHOWCASE ═════════════════ */}
      <section className="py-28 lg:py-36 px-6 lg:px-10">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-16 space-y-4">
             <SectionLabel text="The Alfawzaan edit" />
             <SectionHeading>Selected for your next signature</SectionHeading>
             <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-black/50">A considered selection from our collection for everyday wear, memorable evenings, and thoughtful gifts.</p>
          </div>

          <ProductShowcaseCarousel />
        </div>
      </section>

      {/* ═════════════════ MEET THE CEO ═════════════════ */}
      <section id="about" className="relative py-28 lg:py-36 px-6 lg:px-10 overflow-hidden bg-[#121212] border-y border-[#D4AF37]/10 scroll-mt-24">
        {/* Ambient gold glows */}
        <div
          className="absolute top-[-140px] right-[-140px] w-[420px] h-[420px] rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(212,175,55,0.06) 0%, transparent 60%)",
          }}
        />
        <div
          className="absolute bottom-[-140px] left-[-140px] w-[360px] h-[360px] rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(212,175,55,0.05) 0%, transparent 60%)",
          }}
        />

        <div className="max-w-[1200px] mx-auto relative z-10">
          <div className="text-center mb-16 space-y-4">
            <SectionLabel text="Leadership" />
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="text-3xl md:text-4xl lg:text-5xl font-serif font-bold text-white tracking-tight"
            >
              Meet the CEO
            </motion.h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* Portrait */}
            <FadeIn>
              <div className="relative max-w-[440px] mx-auto lg:mx-0">
                <div className="relative rounded-[1.5rem] overflow-hidden border border-[#D4AF37]/15">
                  {ceoPhotoReady ? (
                    <OptimizedImage
                      src="/abdulrahman.jpg"
                      alt="AbdurRahman Olalekan Ahmed - Founder & CEO"
                      sizes="(max-width: 1024px) 90vw, 440px"
                      className="object-cover"
                      containerClassName="w-full aspect-[4/5]"
                    />
                  ) : (
                    <div className="w-full aspect-[4/5] bg-gradient-to-br from-[#1A1A1A] via-[#141414] to-[#0E0E0E] flex flex-col items-center justify-center gap-5">
                      <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border border-[#D4AF37]/30 flex items-center justify-center">
                        <span className="font-serif text-4xl sm:text-5xl text-[#D4AF37] tracking-tight">
                          AO
                        </span>
                      </div>
                      <p className="text-white/70 font-serif text-lg sm:text-xl font-semibold text-center">
                         AbdurRahman Olalekan Ahmed
                      </p>
                    </div>
                  )}
                  {/* Overlay gradient (photo only) */}
                  {ceoPhotoReady && (
                    <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent pointer-events-none" />
                  )}
                </div>

                {/* Offset gold frame */}
                <div className="absolute -bottom-3 -right-3 w-full h-full border border-[#D4AF37]/25 rounded-[1.5rem] -z-10" />

                {/* Tag */}
                <div className="absolute bottom-6 left-6 bg-[#D4AF37] text-black px-4 py-2 rounded-full text-[11px] font-semibold uppercase tracking-widest shadow-lg shadow-[#D4AF37]/20">
                  Founder &amp; CEO
                </div>
              </div>
            </FadeIn>

            {/* Bio */}
            <FadeIn delay={0.2}>
              <div className="space-y-6">
                <div>
                  <h3 className="text-3xl lg:text-4xl font-serif font-bold text-white leading-tight tracking-tight mb-2">
                     AbdurRahman Olalekan Ahmed
                  </h3>
                  <p className="text-[#D4AF37] text-sm font-medium uppercase tracking-widest">
                    Alfawzaan&apos;s Enterprise
                  </p>
                </div>

                <div className="w-16 h-px bg-gradient-to-r from-[#D4AF37]/60 to-transparent" />

                <p className="text-white/60 text-[15px] leading-[1.9]">
                   With a deep commitment to quality and customer service,
                   AbdurRahman Olalekan Ahmed founded Alfawzaan&apos;s Enterprise with a
                   clear vision: to make premium, authentic fragrances accessible to
                   everyone in Ilorin and beyond.
                </p>

                <p className="text-white/60 text-[15px] leading-[1.9]">
                   His passion for scents grew from serving customers and building a
                   carefully considered local collection. Today, he personally helps
                   curate the fragrance offering, ensuring each product meets the
                   business&apos;s standards for quality and value.
                </p>

                <blockquote className="border-l-2 border-[#D4AF37]/40 pl-5">
                  <p className="font-serif italic text-white/75 text-lg leading-relaxed">
                    &ldquo;Fragrance is more than just a scent — it&apos;s an expression
                    of who you are. At Alfawzaan&apos;s, we help you find your
                    signature.&rdquo;
                  </p>
                </blockquote>

                {/* Contact */}
                <div className="flex items-center gap-4 pt-2">
                  <WhatsAppLink
                    phone="2348102017226"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#D4AF37] text-black text-[11px] font-semibold uppercase tracking-widest transition-all duration-300 hover:bg-[#c9a431] hover:shadow-lg hover:shadow-[#D4AF37]/20"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Chat on WhatsApp
                  </WhatsAppLink>
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ═════════════════ CTA ═════════════════ */}
      <section className="relative bg-[#1A1A1A] py-28 lg:py-36 px-6 lg:px-10 overflow-hidden">
        {/* Geometric decorative elements */}
        <div
          className="absolute top-[-100px] right-[-100px] w-[400px] h-[400px] rotate-45 pointer-events-none"
          style={{
            border: "1px solid rgba(212, 175, 55, 0.04)",
            borderRadius: "30px",
          }}
        />
        <div
          className="absolute bottom-[-100px] left-[-100px] w-[300px] h-[300px] rotate-45 pointer-events-none"
          style={{
            border: "1px solid rgba(212, 175, 55, 0.04)",
            borderRadius: "30px",
          }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(212,175,55,0.04) 0%, transparent 60%)",
          }}
        />

        <div className="max-w-2xl mx-auto text-center relative z-10">
          <FadeIn>
            {/* Decorative gold line */}
            <motion.div
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="w-12 h-px bg-[#D4AF37]/40 mx-auto mb-8"
            />

            <h2 className="text-3xl md:text-5xl lg:text-6xl font-serif font-bold text-white mb-5 leading-tight tracking-tight">
              Ready to find your{" "}
              <span className="relative italic">
                <span className="text-[#D4AF37] relative z-10">signature</span>
                <span
                  className="absolute -bottom-1 left-0 right-0 h-2 bg-[#D4AF37]/10 -skew-x-6"
                  aria-hidden="true"
                />
              </span>
              ?
            </h2>
            <p className="text-white/60 text-[15px] mb-12 max-w-md mx-auto leading-relaxed">
              Browse our full collection and place your order via WhatsApp. No
              sign-up required.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/store" className="group inline-flex relative overflow-hidden bg-[#D4AF37] text-black border-2 border-[#D4AF37] px-8 py-3 rounded-full text-xs font-semibold uppercase tracking-widest transition-all duration-300 hover:bg-[#c9a431] hover:border-[#c9a431] hover:shadow-lg hover:shadow-[#D4AF37]/25">
                  <span className="relative z-10">Shop the Collection</span>
              </Link>
              <a href="#boutiques" className="group inline-flex relative px-8 py-3 rounded-full text-xs font-semibold uppercase tracking-widest text-white/70 hover:text-white border border-white/15 bg-white/5 backdrop-blur-sm transition-all duration-300 hover:border-[#D4AF37]/40 hover:bg-[#D4AF37]/5">
                  <span className="relative">Find Our Boutiques</span>
              </a>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ═════════════════ FOOTER ═════════════════ */}
      <footer className="bg-[#1A1A1A] pt-20 pb-32 lg:pb-12 px-6 lg:px-10 relative overflow-hidden">
        {/* Decorative top edge */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#D4AF37]/20 to-transparent" />

        <div className="max-w-[1200px] mx-auto relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
            <div className="space-y-6">
              <Link
                href="/"
                className="text-xl font-serif font-bold tracking-tight text-white"
              >
                ALFAWZAAN&apos;S ENTERPRISE<span className="text-[#D4AF37]">.</span>
              </Link>
              <p className="text-sm text-white/65 leading-relaxed">
                Premium fragrances and Islamic materials for the modern
                connoisseur. Serving Unilorin &amp; Tanke.
              </p>
              <div className="flex gap-3">
                <WhatsAppLink
                  phone="2348102017226"
                  className="w-9 h-9 rounded-full border border-white/10 flex items-center justify-center text-white/25 hover:text-[#D4AF37] hover:border-[#D4AF37]/30 transition-all duration-300"
                  aria-label="WhatsApp"
                >
                  <MessageCircle className="w-4 h-4" />
                </WhatsAppLink>
                <Link
                  href="/"
                  className="w-9 h-9 rounded-full border border-white/10 flex items-center justify-center text-white/25 hover:text-[#D4AF37] hover:border-[#D4AF37]/30 transition-all duration-300"
                  aria-label="Website"
                >
                  <Globe className="w-4 h-4" />
                </Link>
              </div>
            </div>

            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-widest text-[#D4AF37]/60 mb-6">
                Shop
              </h4>
              <ul className="space-y-3.5">
                {["100MLs", "Body Sprays", "Oils", "Islamic Materials"].map(
                  (item) => (
                    <li key={item}>
                      <Link
                        href="/store"
                        className="text-sm text-white/60 hover:text-white/80 transition-colors duration-300"
                      >
                        {item}
                      </Link>
                    </li>
                  )
                )}
              </ul>
            </div>

            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-widest text-[#D4AF37]/60 mb-6">
                Company
              </h4>
              <ul className="space-y-3.5">
                {[
                  { label: "About Us", href: "#about" },
                  { label: "Our Locations", href: "#boutiques" },
                  { label: "Delivery Policy", href: "/delivery" },
                ].map(({ label, href }) => (
                  <li key={label}>
                    <Link
                      href={href}
                      className="text-sm text-white/60 hover:text-white/80 transition-colors duration-300"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-widest text-[#D4AF37]/60 mb-6">
                Contact
              </h4>
              <p className="text-sm text-white/60 mb-5">
                Orders, delivery, and inquiries — we respond quickly.
              </p>
              <WhatsAppLink
                phone="2348102017226"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#D4AF37] text-black text-[11px] font-semibold uppercase tracking-widest hover:bg-[#c9a431] transition-colors duration-300"
              >
                <MessageCircle className="w-4 h-4" />
                Chat on WhatsApp
              </WhatsAppLink>
              {/* Reward drops land here occasionally — the same channel the
                  claim card points a customer to once their code is spent. */}
              <a
                href={WHATSAPP_CHANNEL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex w-fit items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-white/50 hover:text-[#D4AF37] transition-colors duration-300"
              >
                <Gift className="w-4 h-4" />
                Join our WhatsApp Channel
                <ExternalLink className="w-3 h-3 opacity-60" />
              </a>
              <p className="text-xs text-white/50 mt-4 leading-relaxed">
                Unilorin Main Campus &amp; Tanke Junction, Ilorin
              </p>
            </div>
          </div>

          <div className="border-t border-white/5 pt-8 text-center">
            <p className="text-xs text-white/40">
              &copy; 2026 Alfawzaan&apos;s Enterprise. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      <CartDrawer />
      <MobileLandingNav />
    </div>
  );
}
