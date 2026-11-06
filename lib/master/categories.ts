// lib/master/categories.ts
// Server-side category management — single source of truth for categories
// Deliberately NOT "use server": imported only by server code
// (app/actions/getCategories.ts, lib/admin/bulkUpload.ts). As a server-action
// module, ensureCategory/batchAutoDetectCategories would be writable by any
// caller that knew the action id.

import { getMasterServer } from "@/lib/supabase/server";

// ─── Pattern-based category detection rules ───
// More specific patterns must come BEFORE more general ones
const CATEGORY_RULES: { pattern: RegExp; category: string; slug: string }[] = [
  // Gift Sets (must come before general 100MLs since names may overlap)
  { pattern: /gift\s*set/i, category: "Gift Sets", slug: "gift-sets" },

  // Naseem Oils (must come before general Oils)
  { pattern: /naseem|nazeem/i, category: "Naseem Oils", slug: "naseem-oils" },

  // Body Sprays / Body Mists
  { pattern: /body\s*spray/i, category: "Body Sprays", slug: "body-sprays" },
  { pattern: /body\s*mist/i, category: "Body Mists", slug: "body-mists" },
  { pattern: /mist\b/i, category: "Body Mists", slug: "body-mists" },

  // Traditional Wear
  { pattern: /jalab|jalabia|emirate|shorthand|sleeve/i, category: "Traditional Wear", slug: "traditional-wear" },

  // Islamic Materials — books, sunnah products, traditional items
  { pattern: /quran|qur'an|hadeeth|hadith|islam|nahw|fiqh|bukhari|muslim|nur|bayaan|nuraaniyah|tayseer|mutoon|bulugh|maran|juz|yasin|zamzam|rose water|apple cider|vinegar|honey\b(?!\s*small)/i, category: "Islamic Materials", slug: "islamic-materials" },
  { pattern: /citadel.*believer|attainment.*happiness|miracle.*merit|enjoy your life|winning.*heart|life.*messenger/i, category: "Islamic Materials", slug: "islamic-materials" },
  { pattern: /musk tahara|bint sudan/i, category: "Islamic Materials", slug: "islamic-materials" },

  // 100MLs (must detect before general Sprays) — also catch 105ml, 150ml, 200ml
  { pattern: /1[0-5][05]\s*ml\b|200\s*ml\b|1[0-5][05]ml\b|200ml\b/i, category: "100MLs", slug: "100mls" },

  // Oils (include "jamid" which means solid oil in Arabic)
  { pattern: /\bml\s*oil\b|\boil\b|jamid/i, category: "Oils", slug: "oils" },

  // Home Fragrance
  { pattern: /reed\s*diffuser|diffuser|air\s*fresher|febreze/i, category: "Home Fragrance", slug: "home-fragrance" },

  // Bakhoor & Incense
  { pattern: /incense|bakhoor|bukhooR/i, category: "Bakhoor & Incense", slug: "bakhoor-incense" },

  // Body Sprays (general spray)
  { pattern: /\bspray\b/i, category: "Body Sprays", slug: "body-sprays" },

  // Roll-ons
  { pattern: /roll\s*on/i, category: "Roll-ons", slug: "roll-ons" },

  // Accessories
  { pattern: /\bburner\b|\bcap\b|glove|prayer\s*mat|socks/i, category: "Accessories", slug: "accessories" },

  // Self Care
  { pattern: /\bsoap\b|\bcream\b|vaseline|nivea/i, category: "Self Care", slug: "self-care" },

  // 50ML category
  { pattern: /50\s*ml\b|50ml\b/i, category: "50MLs", slug: "50mls" },

  // 30ML category
  { pattern: /30\s*ml\b|30ml\b/i, category: "30MLs", slug: "30mls" },

  // Miniatures (explicit small sizes: 20ml, 24ml, 25ml, 35ml, 6-15ml)
  { pattern: /\b(2[45]|20|35|[6-9]|1[0-5])\s*ml\b/i, category: "Miniatures", slug: "miniatures" },
  { pattern: /\bmini\b|pencil/i, category: "Miniatures", slug: "miniatures" },

  // Known perfume house brands → 100MLs
  { pattern: /lattafa|rayhaan|haramain|badee al oud|qaeed|qimmah|ramz|anghaam|avanti|mayar|maysoon|khamrah|hayaati|ameeratul|fakhar|fakhr|opulent|now (?:by rave|white|woman|pink)|intense noir|liam grey|24k oud|aventos|barakat|carribean|leo lutens|asad|craft oro|genie club|genie ford|genie o|haltiti|pubescense|lamsat|musk mood/i, category: "100MLs", slug: "100mls" },

  // 2-in-1 body sprays
  { pattern: /2 in 1|2in1/i, category: "Body Sprays", slug: "body-sprays" },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── Database operations ───
// NOTE: The `categories` table must exist in the Master DB.
// Run `devtools/migrations/005_create_categories.sql` to create it.

export interface CategoryRecord {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

/**
 * Fetch all categories from the Master DB.
 */
export async function getAllCategories(): Promise<CategoryRecord[]> {
  const db = getMasterServer();
  const { data, error } = await db
    .from("categories")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    console.error("[categories] Failed to fetch categories:", error);
    // Fallback to a minimal set so the app doesn't crash
    return [];
  }

  return (data ?? []) as CategoryRecord[];
}

/**
 * Fetch all category names as a flat string array.
 */
export async function getCategoryNames(): Promise<string[]> {
  const categories = await getAllCategories();
  return categories.map((c) => c.name);
}

/**
 * Ensure a category exists in the database. Creates it if missing.
 * Returns the category name regardless.
 */
export async function ensureCategory(name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) return "Uncategorized";

  const slug = slugify(trimmed);
  const db = getMasterServer();

  // Check if it exists
  const { data: existing } = await db
    .from("categories")
    .select("name")
    .eq("slug", slug)
    .maybeSingle();

  if (existing) {
    return existing.name;
  }

  // Create it
  const { error } = await db
    .from("categories")
    .insert({ name: trimmed, slug })
    .single();

  if (error) {
    // If another concurrent request created it, that's fine
    if (error.code === "23505") {
      // unique violation
      return trimmed;
    }
    console.error(`[categories] Failed to create category "${trimmed}":`, error);
    // Return the name anyway — the product can still be saved with this category
    // even if the categories table entry failed
    return trimmed;
  }

  console.log(`[categories] ✨ Created new category: "${trimmed}"`);
  return trimmed;
}

// ─── Auto-detection ───

/**
 * Auto-detect the best category for a product based on its name.
 * Returns the category name, creating it in the DB if needed.
 */
export async function autoDetectCategory(
  productName: string
): Promise<string> {
  if (!productName) return "Uncategorized";

  const name = productName.trim();

  // Try pattern-based rules first
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(name)) {
      return ensureCategory(rule.category);
    }
  }

  // If no pattern matched, try batch frequency analysis
  // Extract meaningful keywords (words >= 4 chars, not common stopwords)
  const stopWords = new Set([
    "the", "and", "for", "with", "new", "from", "this", "that",
    "old", "big", "red", "gold", "pink", "blue", "men", "her",
  ]);

  const words = name
    .split(/[\s,]+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, ""))
    .filter((w) => w.length >= 4 && !stopWords.has(w.toLowerCase()));

  // Use the longest meaningful word as a category hint
  if (words.length > 0) {
    const bestWord = words.reduce((a, b) =>
      a.length >= b.length ? a : b
    );
    const categoryName = bestWord.charAt(0).toUpperCase() + bestWord.slice(1);
    return ensureCategory(categoryName);
  }

  // Last resort: fallback
  return "Uncategorized";
}

/**
 * Batch auto-detect categories for multiple products.
 * Uses frequency analysis across the entire batch to detect common keywords.
 */
export async function batchAutoDetectCategories(
  products: { name: string }[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  // First pass: try pattern matching
  const unmatched: string[] = [];
  for (const product of products) {
    const matched = CATEGORY_RULES.find((r) => r.pattern.test(product.name));
    if (matched) {
      result.set(product.name, await ensureCategory(matched.category));
    } else {
      unmatched.push(product.name);
    }
  }

  if (unmatched.length === 0) return result;

  // Second pass: frequency analysis on unmatched names
  // Count keyword occurrences across all unmatched products
  const keywordCounts = new Map<string, number>();
  const stopWords = new Set([
    "the", "and", "for", "with", "new", "from", "this", "that",
    "old", "big", "red", "gold", "pink", "blue", "men", "her",
    "perfume", "spray",
  ]);

  for (const name of unmatched) {
    const words = name
      .split(/[\s,]+/)
      .map((w) => w.replace(/[^a-zA-Z0-9]/g, ""))
      .filter((w) => w.length >= 4 && !stopWords.has(w.toLowerCase()));

    const seen = new Set<string>();
    for (const word of words) {
      const lower = word.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        keywordCounts.set(lower, (keywordCounts.get(lower) || 0) + 1);
      }
    }
  }

  // For products that still have no category, assign based on most common keyword
  // Sort keywords by frequency (descending) — most common clusters first
  const sortedKeywords = [...keywordCounts.entries()]
    .filter(([, count]) => count >= 2) // At least 2 products share this keyword
    .sort(([, a], [, b]) => b - a);

  // Build a category for each significant keyword
  const keywordCategories = new Map<string, string>();
  for (const [keyword] of sortedKeywords) {
    const catName = keyword.charAt(0).toUpperCase() + keyword.slice(1);
    keywordCategories.set(keyword, await ensureCategory(catName));
  }

  // Assign categories to unmatched products
  for (const name of unmatched) {
    const words = name
      .split(/[\s,]+/)
      .map((w) => w.replace(/[^a-zA-Z0-9]/g, ""))
      .filter((w) => w.length >= 4 && !stopWords.has(w.toLowerCase()));

    let assigned = false;
    for (const word of words) {
      const lower = word.toLowerCase();
      const cat = keywordCategories.get(lower);
      if (cat) {
        result.set(name, cat);
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      // Last resort — use the longest word in the name
      if (words.length > 0) {
        const bestWord = words.reduce((a, b) =>
          a.length >= b.length ? a : b
        );
        const catName =
          bestWord.charAt(0).toUpperCase() + bestWord.slice(1);
        result.set(name, await ensureCategory(catName));
      } else {
        result.set(name, await ensureCategory("Uncategorized"));
      }
    }
  }

  return result;
}
