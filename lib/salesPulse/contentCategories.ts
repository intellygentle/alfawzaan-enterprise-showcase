import type { ContentCategory, PromotionWorkload } from "./types";

export const CONTENT_CATEGORIES: ContentCategory[] = ["100ml", "miniatures", "body-home", "islamic", "extra"];
export const CONTENT_CATEGORY_LABEL: Record<ContentCategory, string> = {
  "100ml": "100ml fragrances",
  miniatures: "Miniatures & small sizes",
  "body-home": "Sprays, body & home essentials",
  islamic: "Islamic materials",
  extra: "Extra goods",
};
export const CONTENT_CATEGORY_DESCRIPTION: Record<ContentCategory, string> = {
  "100ml": "100ml and full-size fragrances · photograph every product separately",
  miniatures: "50ml, 25ml, 30ml, 5ml, other small sizes and perfume oils",
  "body-home": "Sprays, body mists, diffusers, air fresheners, body care, lotions and honey",
  islamic: "Caps, prayer mats, Zamzam water, jalabias, books and related materials",
  extra: "Other, uncategorised and extra goods from across the catalogue",
};

export const LOW_VALUE_PHOTO_LIMIT = 10_000;
export const MAX_GROUP_PHOTO_PRODUCTS = 4;
export const MAX_CATEGORY_PRODUCTS_PER_DAY = 8;
export const MAX_100ML_PRODUCTS_PER_DAY = 6;
export const DAILY_SHOOT_BUDGET: Record<PromotionWorkload, number> = { light: 8, balanced: 10, extended: 12 };

const normalize = (value: string) => value.toLowerCase().replace(/[’']/g, "").replace(/[^\p{L}\p{N}.]+/gu, " ").trim();
const smallCategory = /\b(?:miniatures?|mini|oils?|attar|naseem|50\s*mls?|30\s*mls?|25\s*mls?|5\s*mls?)\b/;
const fullCategory = /\b100\s*mls?\b|\b(?:full size|perfumes?|fragrances?)\b/;
const careCategory = /\b(?:body|self|skin|hair)\s*(?:care|mists?|sprays?)\b|\b(?:sprays?|mists?|home fragrance|lotions?|creams?|roll ons?|diffusers?|air\s*fresh(?:e?ners?|ners?|ers?)|honey|bakhoor|incense)\b/;

/**
 * Content-only grouping. The catalogue is never rewritten. Product identity
 * catches goods stored under Extra/Accessories/Islamic Materials (e.g. honey),
 * while a 100ml mist or lotion is not mistaken for a 100ml perfume.
 */
export function contentCategoryFor(product: { productName: string; category: string }): ContentCategory {
  const name = normalize(product.productName);
  const category = normalize(product.category);
  const perfumeCategory = smallCategory.test(category) || fullCategory.test(category);
  const explicitCare = /\b(?:body|room|air)\s*(?:sprays?|mists?|fresh(?:e?ners?|ners?|ers?))\b|\b(?:diffusers?|lotions?|body care|body creams?|soaps?|vaseline|roll ons?|deodorants?|shampoos?|bakhoor|incense)\b/;
  if (explicitCare.test(name) || careCategory.test(category)) return "body-home";
  // Honey Oud perfume retains its fragrance category; actual honey, including
  // legacy Islamic Materials honey, joins the requested essentials section.
  if (/\bhoney\b/.test(name) && (!perfumeCategory || /\b(?:pure|raw|natural|sachet|jar)\b/.test(name))) return "body-home";
  if (/\b(?:zam\s*zam|jalab[iy][a-z]*|jallab[iy][a-z]*|thobes?|jilbabs?|kufi|taqiyah|prayer mats?|sajjadah|janamaz|quran|hadith|hadeeth)\b/.test(name)
    || (!perfumeCategory && /\b(?:caps?|mats?)\b/.test(name))) return "islamic";
  const sizes = [...name.matchAll(/\b(\d+(?:\.\d+)?)\s*mls?\b/g)].map((match) => Number(match[1]));
  if (sizes.some((size) => size >= 100 && size <= 200)) return "100ml";
  if (sizes.some((size) => size > 0 && size < 100)) return "miniatures";
  const categorySizes = [...category.matchAll(/\b(\d+(?:\.\d+)?)\s*mls?\b/g)].map((match) => Number(match[1]));
  if (categorySizes.some((size) => size >= 100 && size <= 200)) return "100ml";
  if (categorySizes.some((size) => size > 0 && size < 100)) return "miniatures";
  if (smallCategory.test(category) || /\b(?:miniatures?|attar|perfume oil)\b/.test(name)) return "miniatures";
  if (/\b(?:islamic|traditional wear|jalabias?|prayer|caps?|mats?|zam\s*zam)\b/.test(category)) return "islamic";
  return "extra";
}
