"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ShoppingBag, Star } from "lucide-react";
import Link from "next/link";
import { AnimatedTabs } from "@/components/ui/animated-tabs";
import OptimizedImage from "@/components/StoreFront/OptimizedImage";

interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  imageUrl: string;
  grade: string;
  outlets: string[];
  outletStock: Record<string, number>;
}

interface ScentNotes {
  top: string;
  heart: string;
  base: string;
}

interface SensoryCopyData {
  copy: string;
  scentNotes: ScentNotes;
  tagline: string;
  reviewInsight?: string;
}

interface SensoryCardsGridProps {
  products: Product[];
}

function TabContentSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="skeleton h-[280px] rounded-xl" />
      <div className="space-y-4 py-2">
        <div className="skeleton h-3 w-20 rounded-full" />
        <div className="skeleton h-7 w-3/4 rounded-lg" />
        <div className="space-y-2">
          <div className="skeleton h-4 w-full rounded" />
          <div className="skeleton h-4 w-5/6 rounded" />
          <div className="skeleton h-4 w-4/6 rounded" />
        </div>
        <div className="flex gap-2">
          <div className="skeleton h-6 w-20 rounded-full" />
          <div className="skeleton h-6 w-20 rounded-full" />
          <div className="skeleton h-6 w-20 rounded-full" />
        </div>
        <div className="skeleton h-10 w-28 rounded-xl" />
      </div>
    </div>
  );
}

function ProductTabContent({
  product,
  sensoryData,
  loading,
}: {
  product: Product;
  sensoryData: SensoryCopyData | null;
  loading: boolean;
}) {
  if (loading || !sensoryData) {
    return <TabContentSkeleton />;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* Product image */}
      <div className="relative rounded-xl overflow-hidden aspect-[4/3] border border-white/40">
        <OptimizedImage
          src={product.imageUrl || "/6539650.jpg"}
          alt={product.name}
          sizes="(max-width: 768px) 90vw, 50vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
        <span className="absolute top-4 left-4 text-[10px] font-bold uppercase tracking-widest text-[#D4AF37] bg-black/60 backdrop-blur-sm border border-white/5 px-3 py-1.5 rounded-full">
          {product.category}
        </span>
      </div>

      {/* Copywriting */}
      <div className="flex flex-col justify-center space-y-5 bg-white/80 backdrop-blur-xl border border-white/40 rounded-xl p-8 shadow-xl shadow-[#D4AF37]/10">
        {/* Tagline */}
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#D4AF37]">
          {sensoryData.tagline}
        </p>

        {/* Product name */}
        <h3 className="text-2xl lg:text-3xl font-serif font-bold text-[#121212] leading-tight tracking-tight">
          {product.name}
        </h3>

        {/* AI sensory copy */}
        <p className="text-sm font-sans leading-[1.8] text-[#121212]/60">
          {sensoryData.copy}
        </p>

        {/* Review insight */}
        {sensoryData.reviewInsight && (
          <p className="text-xs text-[#121212]/40 italic leading-relaxed pl-4 border-l-2 border-[#121212]/10">
            {sensoryData.reviewInsight}
          </p>
        )}

        {/* Scent notes */}
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Top", value: sensoryData.scentNotes.top },
            { label: "Heart", value: sensoryData.scentNotes.heart },
            { label: "Base", value: sensoryData.scentNotes.base },
          ].map((note) => (
            <span
              key={note.label}
              className="badge badge-sm gap-1.5 font-normal bg-[#121212] text-white border-[#D4AF37]/30 px-2.5 py-3"
            >
              <span className="font-bold text-[#D4AF37] uppercase text-[9px] tracking-wider">
                {note.label}
              </span>
              {note.value}
            </span>
          ))}
        </div>

        {/* Price + CTA */}
        <div className="flex items-center gap-6 pt-1">
          <p className="text-xl font-bold text-[#121212] tracking-tight">
            &#8358;{product.price.toLocaleString()}
          </p>
          <Link href="/store">
            <button className="btn btn-sm bg-[#121212] text-white border-[#121212] hover:bg-[#121212]/90 text-[10px] font-bold uppercase tracking-widest gap-2 rounded-full px-5 py-2 border border-[#D4AF37]/40 hover:shadow-lg hover:shadow-[#D4AF37]/20">
              <ShoppingBag size={13} />
              Shop Now
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function SensoryCardsGrid({ products }: SensoryCardsGridProps) {
  const [sensoryMap, setSensoryMap] = useState<Record<string, SensoryCopyData>>(
    {}
  );
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (products.length === 0) return;

    const initialLoading: Record<string, boolean> = {};
    products.forEach((p) => {
      initialLoading[p.name] = true;
    });
    setLoadingMap(initialLoading);

    fetch("/api/sensory-copy/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        products: products.map((p) => ({
          name: p.name,
          category: p.category,
          id: p.id,
        })),
      }),
    })
      .then((res) => res.json())
      .then((data: Record<string, SensoryCopyData>) => {
        setSensoryMap(data);
        setLoadingMap({});
      })
      .catch(() => {
        setLoadingMap({});
      });
  }, [products]);

  if (products.length === 0) return null;

  const tabs = products.map((product) => ({
    id: product.id || product.name,
    label: product.name,
    content: (
      <ProductTabContent
        product={product}
        sensoryData={sensoryMap[product.name] || null}
        loading={loadingMap[product.name] || false}
      />
    ),
  }));

  return (
    <section className="py-20 lg:py-32 px-6 lg:px-10 max-w-[1200px] mx-auto">
      {/* Section Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.9 }}
        className="text-center mb-14 space-y-4"
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#D4AF37]/70">
          The Collection
        </p>
        <h2 className="text-3xl md:text-4xl font-serif font-bold text-[#121212] tracking-tight">
          Fragrances crafted for you
        </h2>
        <p className="text-[#121212]/50 text-xs sm:text-sm max-w-md mx-auto leading-relaxed">
          Each recommendation is grounded in real fragrance community insights.
        </p>
      </motion.div>

      {/* Animated Tabs */}
      <AnimatedTabs tabs={tabs} autoRotate autoRotateInterval={5000} />
    </section>
  );
}
