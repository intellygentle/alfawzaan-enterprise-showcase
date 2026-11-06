"use client";

import { motion } from "framer-motion";
import { ShoppingBag } from "lucide-react";
import Link from "next/link";
import OptimizedImage from "@/components/StoreFront/OptimizedImage";

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

interface SensoryProductCardProps {
  product: {
    id: string;
    name: string;
    category: string;
    price: number;
    imageUrl: string;
  };
  sensoryData: SensoryCopyData | null;
  sensoryLoading: boolean;
  index: number;
}

function CopySkeleton() {
  return (
    <div className="space-y-6">
      <div className="skeleton h-3 w-20 rounded-full" />
      <div className="skeleton h-8 w-3/4 rounded-lg" />
      <div className="space-y-2.5">
        <div className="skeleton h-4 w-full rounded" />
        <div className="skeleton h-4 w-5/6 rounded" />
        <div className="skeleton h-4 w-4/6 rounded" />
      </div>
      <div className="flex gap-2">
        <div className="skeleton h-7 w-20 rounded-full" />
        <div className="skeleton h-7 w-20 rounded-full" />
        <div className="skeleton h-7 w-20 rounded-full" />
      </div>
      <div className="skeleton h-11 w-32 rounded-xl" />
    </div>
  );
}

export default function SensoryProductCard({
  product,
  sensoryData,
  sensoryLoading,
  index,
}: SensoryProductCardProps) {
  const isReversed = index % 2 !== 0;

  const imageSection = (
    <motion.div
      initial={{ opacity: 0, scale: 1.02 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
      className={`relative overflow-hidden ${isReversed ? "lg:order-2" : "lg:order-1"}`}
    >
      <div className="aspect-[4/3] lg:aspect-auto lg:h-full relative group/image">
        <OptimizedImage
          src={product.imageUrl || "/6539650.jpg"}
          alt={product.name}
          sizes="(max-width: 1024px) 90vw, 50vw"
          className="object-cover transition-transform duration-[1200ms] ease-out group-hover/image:scale-[1.03]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />

        {/* Category badge */}
        <span className="badge badge-sm absolute top-5 left-5 bg-base-100/60 backdrop-blur-sm text-base-content/70 border-0 uppercase tracking-widest font-medium">
          {product.category}
        </span>
      </div>
    </motion.div>
  );

  const copySection = (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.9, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
      className={`flex flex-col justify-center px-8 py-10 lg:px-14 lg:py-16 ${
        isReversed ? "lg:order-1" : "lg:order-2"
      }`}
    >
      {sensoryLoading || !sensoryData ? (
        <CopySkeleton />
      ) : (
        <div className="space-y-7">
          {/* Tagline */}
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-[#D4AF37]/70">
            {sensoryData.tagline}
          </p>

          {/* Product Name */}
          <h2 className="text-3xl lg:text-[2.5rem] font-serif font-bold text-base-content leading-[1.15] tracking-tight">
            {product.name}
          </h2>

          {/* AI Sensory Copy */}
          <p className="text-base lg:text-[17px] font-serif leading-[1.85] text-base-content/55">
            {sensoryData.copy}
          </p>

          {/* Review Insight */}
          {sensoryData.reviewInsight && (
            <p className="text-sm text-base-content/40 italic leading-relaxed pl-4 border-l-2 border-base-content/10">
              {sensoryData.reviewInsight}
            </p>
          )}

          {/* Scent Notes — daisyUI badges */}
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Top", value: sensoryData.scentNotes.top },
              { label: "Heart", value: sensoryData.scentNotes.heart },
              { label: "Base", value: sensoryData.scentNotes.base },
            ].map((note) => (
              <span key={note.label} className="badge badge-outline badge-sm gap-1.5 font-normal text-base-content/50 border-base-content/15">
                <span className="font-semibold text-[#D4AF37]/70">{note.label}</span>
                {note.value}
              </span>
            ))}
          </div>

          {/* Price + CTA */}
          <div className="flex items-center gap-8 pt-2">
            <p className="text-2xl font-semibold text-base-content tracking-tight">
              &#8358;{product.price.toLocaleString()}
            </p>
            <Link href="/store">
              <button className="btn bg-[#D4AF37] text-black border-[#D4AF37] hover:bg-[#c9a431] btn-sm text-xs font-semibold uppercase tracking-widest gap-2">
                <ShoppingBag size={14} />
                Shop Now
              </button>
            </Link>
          </div>
        </div>
      )}
    </motion.div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className="card card-bordered bg-base-100 border-base-content/8 rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-2 min-h-[400px] lg:min-h-[480px] hover:border-base-content/15 transition-colors duration-500"
    >
      {isReversed ? (
        <>
          {copySection}
          {imageSection}
        </>
      ) : (
        <>
          {imageSection}
          {copySection}
        </>
      )}
    </motion.div>
  );
}
