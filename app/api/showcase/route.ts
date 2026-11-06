import { NextResponse } from "next/server";
import { getShowcaseItems } from "@/lib/master/showcase";

export async function GET() {
  try {
    const items = await getShowcaseItems();
    // CDN-cache the response so every landing-page visitor doesn't trigger a
    // fresh Master DB read (Cached Egress quota).
    return NextResponse.json(items, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to load showcase items" },
      { status: 500 }
    );
  }
}
