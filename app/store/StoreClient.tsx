// app/store/StoreClient.tsx
// Interactive storefront shell. The product list arrives as server-rendered
// props (cached server-side — see lib/storefront/data.ts) instead of being
// fetched from every visitor's browser, which is what pushed the Master
// project over its Cached Egress quota.
"use client";

import { useState, useEffect, useCallback, type KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PerfumeCard } from "@/components/StoreFront/ProductCard";
import { CartDrawer } from "@/components/StoreFront/CartDrawer";
import {
  Check,
  ChevronDown,
  ExternalLink,
  Flame,
  Gift,
  Heart,
  Loader2,
  MapPin,
  Package,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Snowflake,
  Sun,
  TreePine,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { StoreProduct } from "@/lib/types";
import { CATEGORIES, WHATSAPP_CHANNEL_URL } from "@/lib/constants";
import { useSearchParams, useRouter } from "next/navigation";
import { Navigation } from "@/components/Navigation";
import { useInventorySubscription } from "@/hooks/useInventorySubscription";
import { useStoreSearch } from "@/hooks/useStoreSearch";
import {
  hasAvailableStock,
  isStoreSearchQuery,
  normalizeStoreSearch,
  productSearchScore,
  STORE_SEARCH_MAX_LENGTH,
} from "@/lib/storefront/search";
import SaleBanner from "@/components/StoreFront/SaleBanner";
import GiftCodeModal from "@/components/StoreFront/GiftCodeModal";
import AmbassadorClaimModal from "@/components/StoreFront/AmbassadorClaimModal";

// ─── Mood-to-scent keyword mapping for ScentFinder integration ───
const MOOD_KEYWORDS: Record<string, string[]> = {
  fresh: ["citrus", "aqua", "ocean", "fresh", "clean", "breeze", "water", "mint", "lime", "lemon", "bergamot", "green", "tea", "marine"],
  warm: ["vanilla", "amber", "sandalwood", "warm", "cozy", "cashmere", "musk", "tonka", "cinnamon", "caramel", "honey", "coconut"],
  bold: ["oud", "leather", "spice", "dark", "bold", "intense", "noir", "black", "tobacco", "incense", "saffron", "rum", "brandy"],
  floral: ["rose", "jasmine", "peony", "floral", "bloom", "petal", "garden", "lavender", "lily", "violet", "gardenia", "freesia", "iris", "magnolia"],
  energetic: ["pink pepper", "grapefruit", "mint", "energy", "vibrant", "spark", "ginger", "cologne", "neroli", "bergamot", "lime", "tangerine"],
  grounded: ["patchouli", "vetiver", "cedar", "wood", "earthy", "natural", "root", "moss", "suede", "oakmoss", "pine", "cypress", "amberwood"],
};

const MOOD_META: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  fresh:     { label: "Fresh & Clean",      icon: Snowflake, color: "#38bdf8" },
  warm:      { label: "Warm & Cozy",        icon: Flame,     color: "#fb923c" },
  bold:      { label: "Bold & Confident",   icon: Zap,       color: "#f43f5e" },
  floral:    { label: "Romantic & Floral",  icon: Heart,     color: "#f472b6" },
  energetic: { label: "Energetic & Vibrant",icon: Sun,       color: "#fbbf24" },
  grounded:  { label: "Grounded & Natural", icon: TreePine,  color: "#34d399" },
};

type SortOption = "newest" | "price-asc" | "price-desc" | "name-asc";

// Render the catalog in chunks instead of mounting all 800+ cards at once.
// Cards below the fold lazy-load their images anyway, but every mounted card
// still costs DOM, layout work, and an optimizer request the moment it scrolls
// into view — chunking keeps the first paint (and its image egress) small.
const PAGE_SIZE = 24;

/** Small removable chip shown in the toolbar for each active filter. */
function ActiveChip({
  children,
  onRemove,
}: {
  children: React.ReactNode;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#121212] text-white text-[9px] font-bold uppercase tracking-widest shadow-sm hover:bg-[#121212]/85 transition-colors"
    >
      {children}
      <X className="w-3 h-3 text-white/60" />
    </button>
  );
}

export default function StoreClient({ initialProducts }: { initialProducts: StoreProduct[] }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlMood = searchParams.get("mood");
  const initialMood = urlMood && MOOD_META[urlMood] ? urlMood : null;
  const urlCategory = searchParams.get("category");
  const initialCategory = urlCategory && CATEGORIES.includes(urlCategory as (typeof CATEGORIES)[number]) ? urlCategory : null;
  const initialSearch = searchParams.get("search")?.slice(0, STORE_SEARCH_MAX_LENGTH) ?? "";
  const urlOutlet = searchParams.get("outlet");
  // Gift code claim (scanned from an Extravaganza receipt QR): /store?gift=CODE
  const giftCode = searchParams.get("gift");
  // Ambassador QR link: /store?ambassador=CODE
  const ambassadorCode = searchParams.get("ambassador");
  const initialOutlet = urlOutlet && ["Unilorin", "Tanke"].includes(urlOutlet) ? urlOutlet : null;

  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [activeMood, setActiveMood] = useState<string | null>(initialMood);
  const [search, setSearch] = useState(initialSearch);
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlightedSuggestion, setHighlightedSuggestion] = useState(0);
  // Server-rendered initial data — no client-side catalog fetch.
  const [products, setProducts] = useState<StoreProduct[]>(initialProducts);
  const catalogSearch = useStoreSearch(search, !inStockOnly);
  const normalizedSearch = normalizeStoreSearch(search);
  const includeOutOfStock = isStoreSearchQuery(normalizedSearch) && !inStockOnly;
  // How many filtered results are currently mounted (see PAGE_SIZE).
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Filters panel visibility (mood, store, stock & categories tuck behind it)
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Sync URL param to local state after mount (deferred to avoid cascading renders)
  useEffect(() => {
    if (!initialMood) return;
    const timeout = setTimeout(() => setActiveMood(initialMood), 0);
    return () => clearTimeout(timeout);
  }, [initialMood]);

  useEffect(() => {
    if (!initialCategory) return;
    const timeout = setTimeout(() => setSelectedCategories(new Set([initialCategory])), 0);
    return () => clearTimeout(timeout);
  }, [initialCategory]);

  useEffect(() => {
    if (!initialOutlet) return;
    const timeout = setTimeout(() => setSelectedLocations(new Set([initialOutlet])), 0);
    return () => clearTimeout(timeout);
  }, [initialOutlet]);

  // Collapse back to the first page whenever the result set changes, so a
  // "Load More" from a previous filter never leaves a wall of stale cards.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, sortBy, inStockOnly, activeMood, selectedCategories, selectedLocations]);

  const selectMood = useCallback(
    (moodId: string) => {
      const next = activeMood === moodId ? null : moodId;
      setActiveMood(next);
      router.replace(next ? `/store?mood=${next}` : "/store");
    },
    [activeMood, router]
  );

  const toggleCategory = useCallback((cat: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const toggleLocation = useCallback((loc: string) => {
    setSelectedLocations((prev) => {
      const next = new Set(prev);
      if (next.has(loc)) next.delete(loc);
      else next.add(loc);
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setSelectedCategories(new Set());
    setSelectedLocations(new Set());
    setSortBy("newest");
    setInStockOnly(false);
    setSearch("");
    setActiveMood(null);
    router.replace("/store");
  }, [router]);

  // Subscribe to real-time inventory changes
  useInventorySubscription(products, setProducts);

  const matchesNonSearchFilters = (p: StoreProduct) => {
    const matchesCategory =
      selectedCategories.size === 0 || selectedCategories.has(p.category);
    const matchesMood =
      !activeMood ||
      !MOOD_KEYWORDS[activeMood] ||
      MOOD_KEYWORDS[activeMood].some(
        (kw) =>
          p.name.toLowerCase().includes(kw) ||
          (p.description && p.description.toLowerCase().includes(kw))
      );
    const matchesLocation =
      selectedLocations.size === 0 ||
      p.outlets.some((loc) => selectedLocations.has(loc));
    const matchesStock = includeOutOfStock || hasAvailableStock(p);
    return (
      matchesCategory &&
      matchesMood &&
      matchesLocation &&
      matchesStock
    );
  };

  // Keep on-demand results separate from the browsing catalog so clearing a
  // search also removes sold-out goods from display and background refreshes.
  // Existing products retain their more recent realtime stock/price updates.
  const searchableProducts = Array.from(new Map(
    [...catalogSearch.products, ...products].map((product) => [product.id, product])
  ).values()).filter((product) => includeOutOfStock || hasAvailableStock(product));
  const availableProducts = searchableProducts.filter(matchesNonSearchFilters);
  const exactMatches = availableProducts.filter((product) => product.name.toLowerCase().includes(normalizedSearch));
  const suggestions = normalizedSearch.length >= 2
    ? searchableProducts
      .filter((product) => product.name.toLowerCase().includes(normalizedSearch) || product.category.toLowerCase().includes(normalizedSearch))
      .sort((a, b) => productSearchScore(b, normalizedSearch) - productSearchScore(a, normalizedSearch))
      .slice(0, 6)
    : [];
  const relatedProducts = normalizedSearch.length >= 2 && exactMatches.length === 0
    ? availableProducts
      .map((product) => ({ product, score: productSearchScore(product, normalizedSearch) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ product }) => product)
    : [];
  const filtered = normalizedSearch.length >= 2 && exactMatches.length === 0 ? relatedProducts : exactMatches;

  // Sort the filtered results
  const sorted = [...filtered];
  if (sortBy === "price-asc") sorted.sort((a, b) => a.price - b.price);
  else if (sortBy === "price-desc") sorted.sort((a, b) => b.price - a.price);
  else if (sortBy === "name-asc") sorted.sort((a, b) => a.name.localeCompare(b.name));

  // Only mount the first `visibleCount` cards; the rest arrive on "Load More".
  const visibleProducts = sorted.slice(0, visibleCount);

  // Number of active filters — drives the toolbar badge + active chips
  const activeFilterCount =
    (activeMood ? 1 : 0) +
    selectedLocations.size +
    selectedCategories.size +
    (inStockOnly ? 1 : 0);

  function chooseSuggestion(product: StoreProduct) {
    setSearch(product.name);
    setSearchOpen(false);
    setHighlightedSuggestion(0);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!searchOpen || suggestions.length === 0) {
      if (event.key === "Escape") setSearchOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedSuggestion((current) => (current + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedSuggestion((current) => (current - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      chooseSuggestion(suggestions[highlightedSuggestion] ?? suggestions[0]);
    } else if (event.key === "Escape") {
      setSearchOpen(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f4ee] text-[#121212] selection:bg-[#D4AF37]/20">
      <Navigation variant="store" />
      <SaleBanner />

      <main className="px-4 sm:px-6 lg:px-8 py-10 sm:py-14 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-10 text-center space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#8B7355] mb-3">Alfawzaan&apos;s boutiques</p>
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-[#121212] tracking-tight">
            The <span className="italic text-[#D4AF37]">Collection</span>
          </h1>
          <p className="text-[#121212]/55 text-xs sm:text-sm max-w-md mx-auto leading-relaxed">
            Discover carefully selected fragrances with live availability across our Unilorin and Tanke boutiques.
          </p>
        </div>

        {/* Toolbar: search + filters (sort and the rest tuck behind “Filters”) */}
        <div className="mb-5">
          <div className="flex items-center gap-2.5">
            {/* Search */}
            <div className="relative flex-1 min-w-0 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#121212]/40" size={16} />
              <input
                type="text"
                placeholder="Search perfumes, oils..."
                maxLength={STORE_SEARCH_MAX_LENGTH}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSearchOpen(true);
                  setHighlightedSuggestion(0);
                }}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={handleSearchKeyDown}
                onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={searchOpen && suggestions.length > 0}
                aria-controls="store-search-suggestions"
                className="w-full bg-white/80 backdrop-blur-xl border border-white/40 rounded-full pl-10 pr-5 py-2.5 text-sm font-medium text-[#121212] outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/30 transition-all placeholder-[#121212]/30 shadow-md"
              />
              {searchOpen && suggestions.length > 0 && (
                <div id="store-search-suggestions" role="listbox" className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-black/5 bg-white shadow-xl">
                  <p className="border-b border-black/5 px-4 py-2.5 text-[9px] font-black uppercase tracking-[0.18em] text-black/35">Suggested products</p>
                  {suggestions.map((product, index) => (
                    <button
                      key={product.id}
                      type="button"
                      role="option"
                      aria-selected={index === highlightedSuggestion}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => chooseSuggestion(product)}
                      className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition ${index === highlightedSuggestion ? "bg-[#D4AF37]/10" : "hover:bg-[#f7f4ee]"}`}
                    >
                      <span className="min-w-0"><span className="block truncate text-xs font-bold text-[#121212]">{product.name}</span><span className="mt-0.5 block text-[9px] uppercase tracking-wider text-black/35">{product.category}{!hasAvailableStock(product) && " · Out of stock"}</span></span>
                      <span className="shrink-0 text-xs font-black text-[#8B7355]">₦{product.price.toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Filters toggle */}
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
              aria-controls="filters-panel"
              className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-all shadow-md ${
                filtersOpen || activeFilterCount > 0
                  ? "bg-[#121212] text-white border-[#121212] shadow-lg shadow-[#121212]/25"
                  : "bg-white/80 text-[#121212]/70 border-white/40 hover:border-black/20"
              }`}
            >
              <SlidersHorizontal size={14} />
              {filtersOpen ? "Close" : "Filters"}
              {activeFilterCount > 0 && (
                <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#D4AF37] text-black text-[9px] font-black">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Active filter chips (shown while the panel is closed) */}
          <AnimatePresence initial={false}>
            {activeFilterCount > 0 && !filtersOpen && (
              <motion.div
                key="active-chips"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
                  {activeMood && (
                    <ActiveChip onRemove={() => selectMood(activeMood)}>
                      {MOOD_META[activeMood].label}
                    </ActiveChip>
                  )}
                  {Array.from(selectedLocations).map((loc) => (
                    <ActiveChip key={loc} onRemove={() => toggleLocation(loc)}>
                      {loc}
                    </ActiveChip>
                  ))}
                  {inStockOnly && (
                    <ActiveChip onRemove={() => setInStockOnly(false)}>
                      In Stock Only
                    </ActiveChip>
                  )}
                  {Array.from(selectedCategories).map((cat) => (
                    <ActiveChip key={cat} onRemove={() => toggleCategory(cat)}>
                      {cat}
                    </ActiveChip>
                  ))}
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest text-[#121212]/45 hover:text-[#121212] transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Clear all
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Filters panel — collapsible, keeps the top of the page uncluttered */}
        <AnimatePresence initial={false}>
          {filtersOpen && (
            <motion.div
              key="filters-panel"
              id="filters-panel"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="mb-6 rounded-2xl border border-white/40 bg-white/70 backdrop-blur-xl shadow-lg p-4 sm:p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#121212]/45">
                    Refine your search
                  </p>
                  {activeFilterCount > 0 && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-[#121212]/45 hover:text-[#121212] transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reset
                    </button>
                  )}
                </div>

                <div className="space-y-5">
                  {/* Sort */}
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#121212]/40 mb-2.5">
                      Sort By
                    </p>
                    <div className="relative">
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as SortOption)}
                        aria-label="Sort products"
                        className="w-full appearance-none bg-white/70 border border-white/40 rounded-xl pl-4 pr-10 py-2.5 text-xs font-bold text-[#121212]/70 outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/30 shadow-sm cursor-pointer hover:border-black/20 transition-colors"
                      >
                        <option value="newest">Newest</option>
                        <option value="price-asc">Price: Low to High</option>
                        <option value="price-desc">Price: High to Low</option>
                        <option value="name-asc">Name A&ndash;Z</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#121212]/40 pointer-events-none" />
                    </div>
                  </div>

                  {/* Scent mood */}
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#121212]/40 mb-2.5">
                      Scent Mood
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(MOOD_META).map(([moodId, meta]) => {
                        const isActive = activeMood === moodId;
                        return (
                          <button
                            key={moodId}
                            type="button"
                            onClick={() => selectMood(moodId)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all border ${
                              isActive
                                ? "bg-[#121212] text-white border-[#121212] shadow-lg shadow-[#121212]/25"
                                : "bg-white/70 text-[#121212]/50 border-white/40 hover:border-black/20 hover:text-[#121212]/70"
                            }`}
                          >
                            <meta.icon
                              className="w-4 h-4"
                              style={{ color: isActive ? undefined : meta.color }}
                            />
                            {meta.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Store + stock */}
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#121212]/40 mb-2.5">
                      Store
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(["Unilorin", "Tanke"] as const).map((loc) => {
                        const isActive = selectedLocations.has(loc);
                        return (
                          <button
                            key={loc}
                            type="button"
                            onClick={() => toggleLocation(loc)}
                            aria-pressed={isActive}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all border ${
                              isActive
                                ? "bg-[#121212] text-white border-[#121212] shadow-lg shadow-[#121212]/25"
                                : "bg-white/70 text-[#121212]/50 border-white/40 hover:border-[#D4AF37]/40 hover:text-[#121212]"
                            }`}
                          >
                            <MapPin className="w-3.5 h-3.5 text-[#D4AF37]" />
                            {loc}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => setInStockOnly((v) => !v)}
                        aria-pressed={inStockOnly}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all border ${
                          inStockOnly
                            ? "bg-[#121212] text-white border-[#121212] shadow-lg shadow-[#121212]/25"
                            : "bg-white/70 text-[#121212]/50 border-white/40 hover:border-[#D4AF37]/40 hover:text-[#121212]"
                        }`}
                      >
                        <Check className="w-3.5 h-3.5 text-[#D4AF37]" />
                        In Stock Only
                      </button>
                    </div>
                  </div>

                  {/* Category */}
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#121212]/40 mb-2.5">
                      Category
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {CATEGORIES.map((cat) => {
                        const isActive = selectedCategories.has(cat);
                        return (
                          <button
                            key={cat}
                            onClick={() => toggleCategory(cat)}
                            aria-pressed={isActive}
                            className={`px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all border ${
                              isActive
                                ? "bg-[#121212] text-white border-[#121212] shadow-lg shadow-[#121212]/25"
                                : "bg-white/70 text-[#121212]/50 border-white/40 hover:border-[#D4AF37]/40 hover:text-[#121212]"
                            }`}
                          >
                            {cat}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results count */}
        <div className="mb-8 text-center">
          <p aria-live="polite" className="text-[11px] font-medium text-[#121212]/50">
            {sorted.length} product{sorted.length === 1 ? "" : "s"}
            {catalogSearch.loading && " · Searching the full catalogue…"}
          </p>
          {!normalizedSearch && (
            <p className="mt-1 text-[11px] text-[#121212]/40">Search to find out-of-stock items too.</p>
          )}
          {catalogSearch.error && (
            <p role="alert" className="mt-2 text-xs text-[#8B7355]">
              We couldn&apos;t check the full catalogue. Some search results may be missing.{" "}
              <button type="button" onClick={catalogSearch.retry} className="font-bold underline underline-offset-2">Try again</button>
            </p>
          )}
        </div>

        {/* Product Grid */}
        <AnimatePresence mode="wait">
          {catalogSearch.loading && filtered.length === 0 ? (
            <motion.div
              key="loader"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-20 gap-3"
            >
              <Loader2 size={28} className="animate-spin text-[#D4AF37]" />
              <p className="text-xs text-[#121212]/40 font-medium">Searching products…</p>
            </motion.div>
           ) : filtered.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-20 text-center"
            >
              <Package size={40} className="text-[#121212]/20 mb-3" />
              <h3 className="text-base font-bold text-[#121212] mb-1">{catalogSearch.error ? "Search is temporarily unavailable" : "No products found"}</h3>
              <p className="text-xs text-[#121212]/40 max-w-sm">
                {catalogSearch.error
                  ? "Please try the search again."
                  : normalizedSearch
                  ? `No results for "${search}". Try a different search term.`
                  : activeMood
                  ? `No ${MOOD_META[activeMood].label.toLowerCase()} scents available right now.`
                  : selectedCategories.size > 0 || selectedLocations.size > 0
                  ? "No products match your filters. Try adjusting them."
                  : "No products are currently in stock. Check back soon."}
              </p>
            </motion.div>
           ) : (
            <>
             {normalizedSearch.length >= 2 && exactMatches.length === 0 && relatedProducts.length > 0 && (
               <div className="mb-6 rounded-2xl border border-[#D4AF37]/20 bg-white px-5 py-4 shadow-sm">
                 <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8B7355]">No exact match for “{search}”</p>
                 <p className="mt-1 text-xs leading-relaxed text-black/50">These fragrances share similar names, categories, or scent descriptions.</p>
               </div>
             )}
             <motion.div
              key="grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5"
            >
                {visibleProducts.map((product) => (
                 <PerfumeCard
                   key={product.id}
                   id={product.id}
                   name={product.name}
                   price={product.price}
                   originalPrice={product.originalPrice}
                   category={product.category}
                   outlets={product.outlets}
                   outletStock={product.outletStock}
                   imageUrl={product.imageUrl}
                   description={product.description}
                   tagline={product.tagline}
                   scentNotesTop={product.scentNotesTop}
                   scentNotesHeart={product.scentNotesHeart}
                   scentNotesBase={product.scentNotesBase}
                 />
                ))}
             </motion.div>
            </>
           )}
        </AnimatePresence>
        {(visibleCount < sorted.length || catalogSearch.hasMore) && (
          <div className="mt-10 flex flex-col items-center gap-2">
            <button
              type="button"
              disabled={catalogSearch.loading && visibleCount >= sorted.length}
              onClick={() => {
                setVisibleCount((count) => count + PAGE_SIZE);
                if (visibleCount >= sorted.length) catalogSearch.loadMore();
              }}
              className="rounded-full bg-[#121212] px-7 py-3 text-[10px] font-bold uppercase tracking-widest text-white shadow-lg shadow-[#121212]/20 transition-colors hover:bg-[#2A2A2A] disabled:opacity-50"
            >
              {visibleCount < sorted.length
                ? `Load ${Math.min(PAGE_SIZE, sorted.length - visibleCount)} more products`
                : catalogSearch.loading ? "Loading search results…" : "Load more search results"}
            </button>
            {sorted.length > 0 && (
              <p className="text-[10px] font-medium uppercase tracking-wider text-[#121212]/40">
                Showing {visibleProducts.length} of {sorted.length}{catalogSearch.hasMore ? "+" : ""}
              </p>
            )}
          </div>
        )}
      </main>

      {/* Storefront footer. A customer who lands here from a receipt QR never
          sees the landing page's footer, so the reward channel gets its own
          entry point on this page too — including the claimed-code dead end. */}
      <footer className="mt-16 border-t border-[#121212]/8 bg-white px-4 sm:px-6 lg:px-8 py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="space-y-1.5">
            <p className="text-lg font-serif font-bold tracking-tight text-[#121212]">
              ALFAWZAAN&apos;S ENTERPRISE<span className="text-[#D4AF37]">.</span>
            </p>
            <p className="text-[11px] leading-relaxed text-[#121212]/50">
              Discover the collection, then collect from our Unilorin or Tanke boutique.
            </p>
          </div>
          <a
            href={WHATSAPP_CHANNEL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-[#25D366]/30 bg-[#25D366]/10 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-[#128C4A] transition-colors hover:bg-[#25D366]/20"
          >
            <Gift size={14} /> Join our WhatsApp Channel <ExternalLink size={11} className="opacity-60" />
          </a>
        </div>
        <p className="mx-auto mt-8 max-w-7xl border-t border-[#121212]/5 pt-5 text-center text-[10px] text-[#121212]/40">
          &copy; 2026 Alfawzaan&apos;s Enterprise. All rights reserved.
        </p>
      </footer>

      {/* Cart Drawer */}
      <CartDrawer />
      <GiftCodeModal code={giftCode} />
      <AmbassadorClaimModal code={ambassadorCode} />
    </div>
  );
}
