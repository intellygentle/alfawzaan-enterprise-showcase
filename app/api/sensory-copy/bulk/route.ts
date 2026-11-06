// app/api/sensory-copy/bulk/route.ts
// Enrichment feature disabled — returns empty results

import { NextRequest, NextResponse } from "next/server";

interface SensoryCopyData {
  copy: string;
  scentNotes: { top: string; heart: string; base: string };
  tagline: string;
  reviewInsight?: string;
}

interface ProductInput {
  name: string;
  category: string;
  id: string;
}

function getDefaultResponse(): SensoryCopyData {
  return {
    copy: "",
    scentNotes: {
      top: "Fresh citrus and aromatic spices",
      heart: "Rich florals and warm woods",
      base: "Deep amber and sensual musk",
    },
    tagline: "Wear your confidence",
    reviewInsight: "Wearers love how this scent draws compliments throughout the day.",
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const products: ProductInput[] = body.products;
    const result: Record<string, SensoryCopyData> = {};
    if (Array.isArray(products)) {
      for (const p of products) {
        result[p.name] = getDefaultResponse();
      }
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({});
  }
}
