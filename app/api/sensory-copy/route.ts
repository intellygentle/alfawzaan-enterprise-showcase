// app/api/sensory-copy/route.ts
// Enrichment feature disabled — returns empty result

import { NextRequest, NextResponse } from "next/server";

interface SensoryCopyResponse {
  copy: string;
  scentNotes: { top: string; heart: string; base: string };
  tagline: string;
  reviewInsight?: string;
}

function getDefaultResponse(): SensoryCopyResponse {
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

export async function POST(_request: NextRequest) {
  return NextResponse.json(getDefaultResponse());
}
