import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/session";
import { getCachedSalesPulseReport } from "@/lib/admin/salesPulseData";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET() {
  // Cookie/HMAC only: anonymous requests never read a cache or Supabase.
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Please sign in again to view Sales Pulse." }, { status: 401, headers });
  }
  try {
    return NextResponse.json(await getCachedSalesPulseReport(), { headers });
  } catch (error) {
    console.error("[SalesPulse] Could not build a complete snapshot:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json(
      { error: "Could not load a complete Sales Pulse snapshot. Please try again shortly." },
      { status: 503, headers },
    );
  }
}
