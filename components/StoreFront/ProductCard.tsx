// components/StoreFront/ProductCard.tsx
// Adapted from the ArticleCard template — all perfume details preserved
"use client";

import * as React from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";
import { useCart } from "@/contexts/CartContext";
import { MapPin, ShoppingCart } from "lucide-react";
import OptimizedImage from "@/components/StoreFront/OptimizedImage";

interface PerfumeCardProps extends Omit<HTMLMotionProps<"div">, "children"> {
  id: string;
  imageUrl: string;
  name: string;
  outlets?: string[];
  outletStock?: Record<string, number>;
  /** Effective price — already the discount price when one is active */
  price?: number;
  /** Normal price, shown struck through while a discount is active */
  originalPrice?: number;
  category: string;
  /** Enriched product description (AI-generated) */
  description?: string;
  /** Sensory tagline from enrichment */
  tagline?: string;
  /** Scent notes: top / heart / base */
  scentNotesTop?: string;
  scentNotesHeart?: string;
  scentNotesBase?: string;
}

const cardVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
  hover: { y: -5, scale: 1.02, boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.15)" },
} as const;

const imageVariants = {
  hover: { scale: 1.1 },
};

const PerfumeCard = React.forwardRef<HTMLDivElement, PerfumeCardProps>(
  (
    {
      className,
      id,
      imageUrl,
      name,
      outlets = [],
      outletStock = {},
      price = 0,
      originalPrice,
      category,
      description,
      tagline,
      scentNotesTop,
      scentNotesHeart,
      scentNotesBase,
      ...props
    },
    ref
  ) => {
    const { addItem } = useCart();
    const totalAvailable = Object.values(outletStock).reduce((sum, quantity) => sum + quantity, 0);
    const soldOut = totalAvailable <= 0;
    const discounted =
      originalPrice != null && originalPrice > price && price > 0;
    const percentOff = discounted
      ? Math.round(((originalPrice! - price) / originalPrice!) * 100)
      : 0;

    const fallbackImage = '/6539650.jpg';
    const displayImage = !imageUrl ? fallbackImage : imageUrl;

    // Extract first note from each scent category for display
    const notes = [
      scentNotesTop?.split(',')[0]?.trim(),
      scentNotesHeart?.split(',')[0]?.trim(),
      scentNotesBase?.split(',')[0]?.trim(),
    ].filter(Boolean);

    const handleAddToCart = (e: React.MouseEvent) => {
      e.stopPropagation();
      addItem({
        id: `${id}`,
        productId: id,
        name,
        price: price ?? 0,
        grade: "pending",
        category,
        imageUrl: displayImage,
        outlets: outlets.length > 0 ? outlets : ["Unilorin", "Tanke"],
        availableStock: outletStock,
      });
    };

    return (
      <motion.div
        ref={ref}
        className={cn(
          "w-full h-full overflow-hidden rounded-2xl border bg-white shadow-sm flex flex-col",
          className
        )}
        variants={cardVariants}
        initial="initial"
        animate="animate"
        whileHover="hover"
        transition={{ duration: 0.3, ease: "easeInOut" }}
        {...props}
      >
        {/* ── Content Section (top) ── */}
        <div className="order-2 p-4 sm:p-5 flex flex-col flex-1">
          {/* Header: category tag + price */}
          <header className="mb-2 sm:mb-3 lg:mb-4 flex items-center justify-between gap-2">
            <span className="rounded-full bg-[#FAF5E6] px-2 sm:px-3 py-0.5 sm:py-1 text-[8px] sm:text-[10px] font-semibold uppercase tracking-[0.1em] text-[#121212]/60 truncate">
              {category}
            </span>
            {discounted ? (
              <span className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                <span className="text-[9px] sm:text-[10px] font-medium text-[#121212]/40 line-through">
                  ₦{originalPrice!.toLocaleString()}
                </span>
                <span className="text-xs sm:text-sm font-bold text-red-500 tracking-tight">
                  ₦{price.toLocaleString()}
                </span>
                <span className="rounded-full bg-red-500/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-red-500">
                  {percentOff}% off
                </span>
              </span>
            ) : (
              <span className="text-xs sm:text-sm font-bold text-[#121212] tracking-tight">
                ₦{price.toLocaleString()}
              </span>
            )}
          </header>

          {/* Main content */}
          <main className="space-y-1.5 sm:space-y-2">
            <h3 className="font-serif text-sm sm:text-base lg:text-lg font-bold tracking-tight text-[#121212]">
              {name}
            </h3>

            {description && (
              <p className="text-[10px] sm:text-xs text-[#121212]/50 leading-relaxed line-clamp-2">
                {description}
              </p>
            )}

            {tagline && (
              <p className="text-[9px] sm:text-[10px] italic text-[#D4AF37]/60 leading-snug line-clamp-1">
                &ldquo;{tagline}&rdquo;
              </p>
            )}

            {/* Scent notes pills */}
            {notes.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {notes.map((note, i) => (
                  <span
                    key={i}
                    className="text-[8px] font-medium uppercase tracking-wider text-[#121212]/40 bg-[#121212]/5 px-1 sm:px-1.5 py-0.5 rounded-full"
                  >
                    {note}
                  </span>
                ))}
              </div>
            )}

            {/* Stock availability — moved off the image to keep photography clean */}
            <div className="flex flex-wrap gap-1 pt-1">
              {(() => {
                const locations = ["Unilorin", "Tanke"];
                const hasStock = Object.keys(outletStock).length > 0;

                if (!hasStock) {
                  return (
                    <span className="inline-flex items-center gap-1 text-[8px] sm:text-[9px] font-medium uppercase tracking-wider text-red-500">
                      <MapPin className="w-2.5 h-2.5 text-[#D4AF37]" />
                      Out of stock
                    </span>
                  );
                }

                return locations.map((loc) => {
                  const qty = outletStock[loc] ?? 0;
                  const lowStock = qty > 0 && qty <= 3;
                  return (
                    <span
                      key={loc}
                      className={`inline-flex items-center gap-1 px-1 sm:px-1.5 py-0.5 rounded-full text-[8px] font-medium uppercase tracking-wider ${
                        lowStock
                          ? "bg-red-500/10 text-red-500"
                          : "bg-[#121212]/5 text-[#121212]/40"
                      }`}
                    >
                      <MapPin className="w-2.5 h-2.5 text-[#D4AF37]" />
                      {loc}
                      <span className={qty > 0 ? "" : "text-[#121212]/25"}>
                        {qty > 0 ? `${qty} pcs` : "Out"}
                      </span>
                    </span>
                  );
                });
              })()}
            </div>

            {/* Add to cart — full width button */}
            <div className="pt-1 sm:pt-2 mt-auto">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.92 }}
                onClick={handleAddToCart}
                disabled={soldOut}
                aria-label={soldOut ? `${name} is out of stock` : `Add ${name} to cart`}
                className="flex items-center gap-1 sm:gap-2 w-full justify-center rounded-full bg-[#121212] text-white text-[9px] sm:text-[10px] font-semibold uppercase tracking-widest px-3 sm:px-4 py-2.5 sm:py-2 hover:bg-[#2A2A2A] transition-colors duration-300 shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ShoppingCart className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                {soldOut ? "Out of Stock" : "Add to Cart"}
              </motion.button>
            </div>
          </main>
        </div>

        {/* ── Image Section (bottom) — clean product photography, no text overlays ── */}
        <div className="order-1 aspect-square overflow-hidden rounded-t-2xl bg-[#FAF5E6]">
          <motion.div
            variants={imageVariants}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="h-full w-full"
          >
            <OptimizedImage
              src={displayImage}
              alt={name}
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover object-center"
              fallbackSrc="/6539650.jpg"
            />
          </motion.div>
        </div>
      </motion.div>
    );
  }
);

PerfumeCard.displayName = "PerfumeCard";

export { PerfumeCard };
