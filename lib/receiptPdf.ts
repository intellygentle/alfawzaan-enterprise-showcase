// lib/receiptPdf.ts — production "flex receipt" (premium dark design).
//
// Ported from the approved preview (devtools/scripts/preview-receipt-flex.mjs):
// circular logo seal, order-details plate, ledger, TOTAL band, fragrance
// profile (donut + bars), and a REAL scannable QR. When the order's dominant
// tier is Extravaganza, the QR encodes /store?gift=CODE — scanning pops the
// claim card — and the code is registered server-side so it can be redeemed
// exactly once (lib/archive/giftCodes.ts guards against double claims).
//
// All colors are opaque: some PDF viewers render jsPDF GState transparency
// as fully opaque, which previously turned decorative layers into solid
// blocks covering text.

import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import {
  computeTierTotals,
  dominantTierKey,
  GIFT_MIN_RECEIPT_TOTAL,
  orderRefForOrderId,
  type GiftTierKey,
} from "./gifts";

export interface ReceiptPdfItem {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  grade?: string;
}

export interface ReceiptPdfData {
  orderId: string;
  customerName?: string | null;
  outlet: string;
  status: string;
  total: number;
  items: ReceiptPdfItem[];
  createdAt?: string;
}

/** Logo passed into the layout builder: data URL + true pixel size. */
export interface ReceiptLogo {
  data: string;
  format: "PNG" | "JPEG";
  width: number;
  height: number;
}

/** One measured text draw — collected by the optional audit hook so tests can
 *  assert no text leaves the frame and nothing overlaps. */
export interface ReceiptAuditEntry {
  text: string;
  drawX: number;
  endX: number;
  y: number;
  page: number;
  fontSize: number;
  font: string;
  charSpace: number;
}
export type ReceiptAuditHook = (entry: ReceiptAuditEntry) => void;

export interface ReceiptLayoutResult {
  pages: number;
  contentEndY: number;
  profileBottom: number;
  footerEndY: number;
  /** Set when the dominant tier is Extravaganza — the claimable gift code. */
  giftCode: string | null;
}

// ─── Palette (from the approved HTML design) ───
type Rgb = [number, number, number];
const PAGE_BG: Rgb = [19, 19, 22];
const CARD: Rgb = [14, 14, 17];
const PLATE: Rgb = [27, 27, 30];
const ROW_ALT: Rgb = [25, 25, 28];
const HIGH: Rgb = [42, 42, 45];
const GOLD: Rgb = [242, 202, 80];
const GOLD_DIM: Rgb = [104, 88, 40];
const ON_GOLD: Rgb = [60, 47, 0];
const TERT: Rgb = [227, 205, 142];
const INK: Rgb = [228, 225, 230];
const SUB: Rgb = [208, 197, 175];
const RULE: Rgb = [58, 54, 48];
const VERIFIED_BG: Rgb = [0, 49, 31];
const MINT: Rgb = [78, 222, 163];

const TIERS: Array<{
  key: GiftTierKey;
  label: string;
  barLabel: string;
  color: Rgb;
}> = [
  { key: "normal", label: "Signature", barLabel: "Signature Everyday", color: [16, 185, 129] },
  { key: "extra", label: "Prestige", barLabel: "Prestige Artisanal", color: [59, 130, 246] },
  { key: "special", label: "Extravaganza", barLabel: "Extravaganza Collection", color: [245, 158, 11] },
];
const TAGLINES: Record<GiftTierKey, string> = {
  special: "Your collection leans toward rare, premium indulgences — rich ouds and amber selections.",
  extra: "A refined balance of bright citrus florals and soft musk — elevated everyday luxury.",
  normal: "Clean, versatile everyday selections for the discerning minimalist.",
};
const WEBSITE = "www.alfawzaanenterprise.ng";

const capHeight = (pt: number) => pt * 0.72 * 0.352778;

function spacedWidth(doc: jsPDF, text: string, charSpace: number) {
  return doc.getTextWidth(text) + charSpace * Math.max(0, text.length - 1);
}

/**
 * Shrink text to fit maxWidth, then truncate with an ellipsis if it still
 * doesn't fit at the minimum size. Long customer or product names can then
 * never spill out of their container or push the layout around.
 */
function fitText(doc: jsPDF, text: string, maxWidth: number, startPt: number, minPt = 7) {
  const widthAt = (size: number, value: string) => {
    doc.setFontSize(size);
    return doc.getTextWidth(value);
  };
  let size = startPt;
  while (size > minPt && widthAt(size, text) > maxWidth) size -= 0.5;
  let out = text;
  if (widthAt(size, out) > maxWidth) {
    while (out.length > 1 && widthAt(size, `${out}…`) > maxWidth) out = out.slice(0, -1);
    out = `${out}…`;
  }
  return { size, text: out };
}

/** Right-aligned amount with bespoke N-with-two-strokes naira mark
 *  (jsPDF's built-in fonts cannot render ₦). */
function nairaAmount(doc: jsPDF, amount: number, rightX: number, y: number) {
  const text = amount.toLocaleString();
  const textW = doc.getTextWidth(text);
  const nW = doc.getTextWidth("N");
  const x = rightX - textW - 1.6 - nW;
  const fontSize = doc.getFontSize();
  const cap = capHeight(fontSize);
  doc.text("N", x, y);
  const dc = doc.getTextColor() as number[] | string;
  const rgb: Rgb = Array.isArray(dc) ? [dc[0] ?? 0, dc[1] ?? 0, dc[2] ?? 0] : [0, 0, 0];
  doc.setDrawColor(...rgb);
  doc.setLineWidth(Math.max(0.18, fontSize * 0.006));
  doc.line(x - 0.25, y - cap * 0.32, x + nW + 0.25, y - cap * 0.32);
  doc.line(x - 0.25, y - cap * 0.58, x + nW + 0.25, y - cap * 0.58);
  doc.text(text, rightX, y, { align: "right" });
}

/** Annulus sector for the donut. */
function donutSlice(doc: jsPDF, cx: number, cy: number, rOuter: number, rInner: number, a0: number, a1: number, color: Rgb) {
  const steps = Math.max(2, Math.ceil((a1 - a0) / 0.05));
  const outer: [number, number][] = [];
  const inner: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = a0 + ((a1 - a0) * i) / steps;
    outer.push([cx + rOuter * Math.cos(a), cy + rOuter * Math.sin(a)]);
    inner.push([cx + rInner * Math.cos(a), cy + rInner * Math.sin(a)]);
  }
  const pts = [...outer, ...inner.reverse()];
  doc.setFillColor(...color);
  doc.lines(
    pts.slice(1).map(([x, yy], i) => [x - pts[i][0], yy - pts[i][1]]),
    pts[0][0],
    pts[0][1],
    [1, 1],
    "F",
    true,
  );
}

/** Small filled diamond. */
function diamond(doc: jsPDF, cx: number, cy: number, r: number, color: Rgb) {
  doc.setFillColor(...color);
  doc.lines([[r, r], [-r, r], [-r, -r], [r, -r]], cx, cy - r, [1, 1], "F", true);
}

/** Deterministic PRNG (decorative QR fallback pattern). */
function seededRandom(seedStr: string) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i += 1) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export async function buildReceiptLayout(
  doc: jsPDF,
  data: ReceiptPdfData,
  logo: ReceiptLogo | null,
  auditHook?: ReceiptAuditHook,
): Promise<ReceiptLayoutResult> {
  if (auditHook) {
    const originalText = doc.text.bind(doc);
    // jsPDF's public types don't surface getFontSize/getFont/getCurrentPageInfo
    // on `internal`, but they exist at runtime (the preview audit relied on them).
    const internal = doc.internal as unknown as {
      getFontSize(): number;
      getFont(): { fontName: string; fontStyle: string };
      getCurrentPageInfo(): { pageNumber: number };
    };
    doc.text = ((
      text: string | string[],
      x: number,
      y: number,
      options?: Record<string, unknown>,
    ) => {
      const fontSize = internal.getFontSize();
      const font = internal.getFont();
      const align = (options?.align as string) ?? "left";
      const charSpace = (options?.charSpace as number) ?? 0;
      const measure = (t: string) => {
        let w = 0;
        for (const ch of String(t)) w += doc.getTextWidth(ch) + charSpace;
        return w - charSpace;
      };
      const width = Array.isArray(text) ? Math.max(...text.map(measure)) : measure(text);
      let drawX = x;
      if (align === "center") drawX = x - width / 2;
      else if (align === "right") drawX = x - width;
      auditHook({
        text: Array.isArray(text) ? text.join(" | ") : String(text),
        drawX,
        endX: drawX + width,
        y,
        page: internal.getCurrentPageInfo().pageNumber,
        fontSize,
        font: `${font.fontName}-${font.fontStyle}`,
        charSpace,
      });
      return originalText(text as never, x, y, options as never);
    }) as unknown as typeof doc.text;
  }

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const LEFT = 16;
  const RIGHT = pageWidth - 16;
  const CENTER = pageWidth / 2;
  const CONTENT_LIMIT = 248;

  const items = data.items.map((item) => ({
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
  }));
  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const receiver = (data.customerName || "Customer").trim();
  const outlet = data.outlet;
  const verified = data.status.toLowerCase() !== "pending";
  const dateLabel = data.createdAt
    ? new Date(data.createdAt).toLocaleString("en-NG")
    : new Date().toLocaleString("en-NG");
  const orderRef = orderRefForOrderId(data.orderId);

  const paintPage = (continuation: boolean) => {
    doc.setFillColor(...PAGE_BG);
    doc.rect(0, 0, pageWidth, pageHeight, "F");
    // Complete double hairline frame.
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.45);
    doc.rect(11, 11, pageWidth - 22, pageHeight - 22);
    doc.setDrawColor(...GOLD_DIM);
    doc.setLineWidth(0.25);
    doc.rect(12.4, 12.4, pageWidth - 24.8, pageHeight - 24.8);
    if (continuation) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...TERT);
      doc.text(`ALFAWZAAN'S ENTERPRISE  ·  ORDER #${orderRef}  ·  CONTINUED`, CENTER, 20, { align: "center" });
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.3);
      doc.line(LEFT, 22.5, RIGHT, 22.5);
    }
  };

  paintPage(false);

  // ─── Section 1: brand header (circular logo seal + title) ───
  const brandTop = 18;
  const sealR = 15;
  const sealCy = brandTop + sealR;
  doc.setFillColor(...CARD);
  doc.circle(CENTER, sealCy, sealR - 1, "F");
  if (logo) {
    // The image renders circular: a vector clip masks the rectangle to the
    // seal's inscribed circle, scaled so the shorter side fills it.
    const clipR = sealR - 1.5;
    const logoH = clipR * 2;
    const logoW = logoH * (logo.width / logo.height);
    doc.saveGraphicsState();
    // null style = build the path without painting, so it can clip the image.
    doc.circle(CENTER, sealCy, clipR, null as unknown as string);
    doc.clip();
    doc.discardPath();
    doc.addImage(logo.data, logo.format, CENTER - logoW / 2, sealCy - logoH / 2, logoW, logoH);
    doc.restoreGraphicsState();
  } else {
    doc.setFont("times", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...GOLD);
    doc.text("A", CENTER, sealCy + 1.5, { align: "center" });
    doc.setDrawColor(...GOLD_DIM);
    doc.setLineWidth(0.5);
    doc.setLineDashPattern([1.3, 1.1], 0);
    doc.circle(CENTER, sealCy, sealR - 3.5, "S");
    doc.setLineDashPattern([], 0);
  }
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.9);
  doc.circle(CENTER, sealCy, sealR, "S");

  // Title. NOTE: jsPDF's align:"center" anchors on the UNSPACED width, so
  // tracked text is drawn left-aligned at a manually computed center (the
  // title once rendered 13.7mm off-center), with -s/2 for the trailing
  // character-space.
  doc.setFont("times", "bold");
  doc.setFontSize(14.5);
  doc.setTextColor(...GOLD);
  const brandTitle = "ALFAWZAAN'S ENTERPRISE";
  const brandTitleCS = 1.3;
  const titleBase = sealCy + sealR + 6 + capHeight(14.5);
  doc.text(brandTitle, CENTER - spacedWidth(doc, brandTitle, brandTitleCS) / 2 - brandTitleCS / 2, titleBase, { charSpace: brandTitleCS });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...SUB);
  doc.text("FRAGRANCES & ISLAMIC ESSENTIALS", CENTER, titleBase + 5.5, { align: "center" });
  const headerBottom = titleBase + 7;

  // ─── Status capsule (single verification message) ───
  const pillText = verified ? "ORDER VERIFIED" : "AWAITING VERIFICATION";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  const pillCS = 0.6;
  const pillW = spacedWidth(doc, pillText, pillCS) + 15.5;
  const pillH = 6.8;
  const pillX = CENTER - pillW / 2;
  const pillY = headerBottom + 6;
  doc.setFillColor(...(verified ? VERIFIED_BG : GOLD));
  doc.roundedRect(pillX, pillY, pillW, pillH, pillH / 2, pillH / 2, "F");
  const pillBase = pillY + pillH / 2 + capHeight(7.5) / 2;
  if (verified) {
    doc.setFillColor(...MINT);
    doc.circle(pillX + 6, pillY + pillH / 2, 1.1, "F");
    doc.setTextColor(...MINT);
    doc.text(pillText, pillX + 9.5, pillBase, { charSpace: pillCS });
  } else {
    doc.setDrawColor(...ON_GOLD);
    doc.setLineWidth(0.45);
    diamond(doc, pillX + 6, pillY + pillH / 2, 1.5, ON_GOLD);
    doc.setTextColor(...ON_GOLD);
    doc.text(pillText, pillX + 9.5, pillBase, { charSpace: pillCS });
  }

  // ─── Order details plate ───
  const manY = pillY + pillH + 7.5;
  const manH = 26;
  doc.setFillColor(...PLATE);
  doc.roundedRect(LEFT, manY, RIGHT - LEFT, manH, 2.5, 2.5, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...SUB);
  doc.text(`ORDER DETAILS — ${outlet.toUpperCase()} STORE`, LEFT + 7, manY + 5.5);
  doc.text(`ORDER #${orderRef}`, RIGHT - 7, manY + 5.5, { align: "right" });
  doc.setFontSize(6.8);
  doc.setTextColor(...TERT);
  doc.text("PREPARED EXCLUSIVELY FOR", CENTER, manY + 11, { align: "center" });
  doc.setFont("times", "bold");
  doc.setTextColor(...INK);
  const nameFit = fitText(doc, receiver.toUpperCase(), RIGHT - LEFT - 16, 11.5, 8.5);
  doc.setFontSize(nameFit.size);
  doc.text(nameFit.text, CENTER, manY + 17, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...SUB);
  doc.text("ORDER CHANNEL — WHATSAPP", LEFT + 7, manY + 22.5);
  doc.text(dateLabel.toUpperCase(), RIGHT - 7, manY + 22.5, { align: "right" });

  // ─── Ledger ───
  const QTY_X = 112;
  const UNIT_X = 156;
  const drawLedgerHeader = (hy: number) => {
    doc.setFillColor(...HIGH);
    doc.roundedRect(LEFT, hy, RIGHT - LEFT, 6.5, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...SUB);
    doc.text("ITEM", LEFT + 5, hy + 4.3);
    doc.text("QTY", QTY_X, hy + 4.3, { align: "center" });
    doc.text("UNIT", UNIT_X, hy + 4.3, { align: "right" });
    doc.text("TOTAL", RIGHT, hy + 4.3, { align: "right" });
  };
  drawLedgerHeader(manY + manH + 2.5);
  let y = manY + manH + 14.5;

  const drawItemRow = (item: { name: string; quantity: number; unitPrice: number }, index: number) => {
    // Font must be set BEFORE measuring, or splitTextToSize wraps against the
    // previously-active size and longer lines overflow the columns.
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.3);
    let lines: string[] = doc.splitTextToSize(item.name, 92);
    if (lines.length > 2) {
      lines = [lines[0], `${lines[1].slice(0, Math.max(1, lines[1].length - 1))}…`];
    }
    const rowH = Math.max(7, lines.length * 4.6 + 3);
    if (y + rowH > CONTENT_LIMIT) {
      doc.addPage();
      paintPage(true);
      // Balance continuation pages: start lower when little content remains.
      const remaining = items.length - index;
      const estimated = remaining * 7 + 9 + 15.5 + (items.length > 2 ? 63 : 0) + 40;
      y = Math.min(64, Math.max(36.5, 19 + (263 - estimated) / 2));
      drawLedgerHeader(24.5);
    }
    if (index % 2 === 1) {
      doc.setFillColor(...ROW_ALT);
      doc.rect(LEFT - 2, y - 4.2, RIGHT - LEFT + 4, rowH, "F");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.3);
    doc.setTextColor(...INK);
    doc.text(lines, LEFT, y);
    doc.setTextColor(...SUB);
    doc.text(String(item.quantity), QTY_X, y, { align: "center" });
    doc.setTextColor(...INK);
    nairaAmount(doc, item.unitPrice, UNIT_X, y);
    doc.setFont("helvetica", "bold");
    nairaAmount(doc, item.quantity * item.unitPrice, RIGHT, y);
    y += rowH;
  };

  items.forEach((item, index) => drawItemRow(item, index));

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...SUB);
  doc.text(`${items.length} ITEM${items.length !== 1 ? "S" : ""} IN THIS ORDER`, LEFT, y + 4);
  doc.setTextColor(...TERT);
  doc.text("AUTHENTIC ALFAWZAAN'S RECEIPT", RIGHT, y + 4, { align: "right" });
  y += 9;

  // ─── TOTAL band ───
  if (y + 15.5 > CONTENT_LIMIT) {
    doc.addPage();
    paintPage(true);
    y = 30;
  }
  doc.setFillColor(...PLATE);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.5);
  doc.roundedRect(LEFT, y, RIGHT - LEFT, 15.5, 3, 3, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...GOLD);
  doc.text("ORDER SUMMARY", LEFT + 7, y + 5.5);
  doc.setFont("times", "bold");
  doc.setFontSize(11.5);
  doc.setTextColor(...INK);
  doc.text("TOTAL ORDER VALUE", LEFT + 7, y + 11.5);
  doc.setFont("times", "bold");
  doc.setFontSize(19);
  nairaAmount(doc, total, RIGHT - 7, y + 12);
  y += 15.5;

  // ─── Fragrance profile (donut + bars) ───
  const tierTotals = computeTierTotals(items);
  const tiersPresent = TIERS.filter((tier) => (tierTotals[tier.key] ?? 0) > 0);
  let profileBottom = 0;
  let giftCode: string | null = null;
  if (tiersPresent.length > 0 && total > 0) {
    const dominantKey = dominantTierKey(items) ?? "normal";
    const dominant = TIERS.find((t) => t.key === dominantKey) ?? TIERS[0];
    const dominantPct = Math.round(((tierTotals[dominantKey] ?? 0) / total) * 100);
    const cardH = 62;
    if (y + 5 + cardH > CONTENT_LIMIT) {
      doc.addPage();
      paintPage(true);
      y = 30;
    }
    const cardY = y + 5;
    profileBottom = cardY + cardH;
    doc.setFillColor(...PLATE);
    doc.roundedRect(LEFT, cardY, RIGHT - LEFT, cardH, 3, 3, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.setTextColor(...TERT);
    doc.text("YOUR ORDER AT A GLANCE", LEFT + 7, cardY + 7.5);
    doc.setFont("times", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...INK);
    doc.text("YOUR FRAGRANCE PROFILE", LEFT + 7, cardY + 14);
    const badgeText = dominant.label.toUpperCase();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    const bCS = 0.6;
    const bW = spacedWidth(doc, badgeText, bCS) + 13;
    const badgeX = Math.max(LEFT + 7 + 74, RIGHT - 7 - bW);
    doc.setFillColor(...GOLD);
    doc.roundedRect(badgeX, cardY + 8, bW, 6.8, 3.4, 3.4, "F");
    diamond(doc, badgeX + 4.5, cardY + 11.4, 1.4, ON_GOLD);
    doc.setTextColor(...ON_GOLD);
    doc.text(badgeText, badgeX + 8, cardY + 11.4 + capHeight(7) / 2, { charSpace: bCS });

    doc.setFont("times", "italic");
    doc.setFontSize(8.8);
    doc.setTextColor(...INK);
    let taglineLines: string[] = doc.splitTextToSize(`"${TAGLINES[dominant.key]}"`, RIGHT - LEFT - 20);
    if (taglineLines.length > 2) {
      doc.setFontSize(7.8);
      taglineLines = doc.splitTextToSize(`"${TAGLINES[dominant.key]}"`, RIGHT - LEFT - 20);
    }
    if (taglineLines.length > 2) {
      taglineLines = [taglineLines[0], `${taglineLines[1].slice(0, Math.max(1, taglineLines[1].length - 1))}…`];
    }
    taglineLines.forEach((line, i) => {
      doc.text(line, CENTER, cardY + 21 + i * 4.3, { align: "center" });
    });

    const halfW = (RIGHT - LEFT) / 2;
    const dCx = LEFT + halfW / 2;
    const dCy = cardY + 43;
    doc.setDrawColor(...HIGH);
    doc.setLineWidth(6);
    doc.circle(dCx, dCy, 12.5, "S");
    let angle = -Math.PI / 2;
    for (const tier of tiersPresent) {
      const end = angle + ((tierTotals[tier.key] ?? 0) / total) * Math.PI * 2;
      donutSlice(doc, dCx, dCy, 15.5, 9.5, angle, end, tier.color);
      for (const a of [angle, end]) {
        doc.setFillColor(...tier.color);
        doc.circle(dCx + 12.5 * Math.cos(a), dCy + 12.5 * Math.sin(a), 3, "F");
      }
      angle = end;
    }
    doc.setFont("times", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...GOLD);
    doc.text(`${dominantPct}%`, dCx, dCy + 1.2, { align: "center" });
    doc.setFont("helvetica", "normal");
    const donutLabel = fitText(doc, dominant.label.toUpperCase(), 15, 5.8, 4.2);
    doc.setFontSize(donutLabel.size);
    doc.setTextColor(...SUB);
    doc.text(donutLabel.text, dCx, dCy + 5.2, { align: "center" });

    const rx = LEFT + halfW + 6;
    let barY = cardY + 32;
    for (const tier of tiersPresent) {
      const amount = tierTotals[tier.key] ?? 0;
      const percent = Math.round((amount / total) * 100);
      doc.setFillColor(...tier.color);
      doc.circle(rx + 1.5, barY - 1, 1.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.8);
      doc.setTextColor(...INK);
      const labelFit = fitText(doc, tier.barLabel, RIGHT - 7 - (rx + 5) - 12, 6.8, 5.4);
      doc.setFontSize(labelFit.size);
      doc.text(labelFit.text, rx + 5, barY);
      doc.setTextColor(...tier.color);
      doc.text(`${percent}%`, RIGHT - 7, barY, { align: "right" });
      const trackX = rx;
      const trackW = RIGHT - 7 - rx;
      doc.setFillColor(...HIGH);
      doc.roundedRect(trackX, barY + 1.8, trackW, 1.6, 0.8, 0.8, "F");
      doc.setFillColor(...tier.color);
      doc.roundedRect(trackX, barY + 1.8, Math.max(1.6, trackW * (percent / 100)), 1.6, 0.8, 0.8, "F");
      barY += 9;
    }
    y = profileBottom;

    // Gift eligibility: dominant tier Extravaganza AND total ≥ the gift floor
    // earns a claimable code — but only VERIFIED receipts print it. A pending
    // receipt carries a neutral store QR instead: the code is not live until
    // verifyOrder registers it, so printing "scan to claim" on an unverified
    // order would promise something the claim card would then disavow.
    if (dominantKey === "special" && total >= GIFT_MIN_RECEIPT_TOTAL && verified) {
      giftCode = `ALF-${orderRef}`;
    }
  } else {
    y += 6;
  }

  // ─── Authenticity block + footer (flows below content) ───
  const BOTTOM_LIMIT = 282;
  if (y + 8 + 31 > BOTTOM_LIMIT) {
    doc.addPage();
    paintPage(true);
    y = 30;
  }
  const authY = y + 8;

  const qrUrl = giftCode ? `https://${WEBSITE}/store?gift=${giftCode}` : `https://${WEBSITE}/store`;
  const qrX = LEFT;
  const qrSize = 18;
  // Dark modules on a warm off-white plate: scanners need dark-on-light.
  let qrDataUrl: string | null = null;
  try {
    qrDataUrl = await QRCode.toDataURL(qrUrl, {
      margin: 2,
      width: 512,
      errorCorrectionLevel: "M",
      color: { dark: "#1a1a1e", light: "#faf7f0" },
    });
  } catch { /* decorative fallback keeps the layout intact */ }
  if (qrDataUrl) {
    doc.addImage(qrDataUrl, "PNG", qrX, authY, qrSize, qrSize);
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.45);
    doc.roundedRect(qrX - 1.25, authY - 1.25, qrSize + 2.5, qrSize + 2.5, 2, 2, "S");
  } else {
    doc.setFillColor(...HIGH);
    doc.roundedRect(qrX, authY, qrSize, qrSize, 2, 2, "F");
    const rand = seededRandom(data.orderId);
    doc.setFillColor(...GOLD);
    const cell = 1.3;
    const finder = (fx: number, fy: number) => {
      doc.setDrawColor(...GOLD);
      doc.setLineWidth(0.7);
      doc.rect(fx, fy, 5.2, 5.2);
      doc.setFillColor(...GOLD);
      doc.rect(fx + 1.6, fy + 1.6, 2, 2, "F");
    };
    finder(qrX + 1.2, authY + 1.2);
    finder(qrX + qrSize - 6.4, authY + 1.2);
    finder(qrX + 1.2, authY + qrSize - 6.4);
    for (let gx = 0; gx < 10; gx += 1) {
      for (let gy = 0; gy < 10; gy += 1) {
        const inFinder = (gx < 5 && gy < 5) || (gx >= 5 && gy < 5 && gx > 6) || (gx < 5 && gy > 4 && gy > 5);
        if (inFinder) continue;
        if (rand() < 0.42) {
          doc.rect(qrX + 7.6 + gx * cell * 0.9, authY + 7.4 + gy * cell * 0.9, 1, 1, "F");
        }
      }
    }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...GOLD);
  doc.text(giftCode ? "SCAN TO CLAIM YOUR GIFT" : "AUTHENTICATED RECEIPT", qrX + 24, authY + 4.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...SUB);
  doc.text(giftCode ? "Show this code at our boutique" : "Visit our store to verify this order", qrX + 24, authY + 9);
  doc.setFont("helvetica", "bold");
  if (giftCode) {
    doc.setFontSize(8.5);
    doc.setTextColor(...INK);
    doc.text(giftCode, qrX + 24, authY + 14);
  }
  doc.setFontSize(7.5);
  doc.setTextColor(...INK);
  doc.text(WEBSITE, qrX + 24, giftCode ? authY + 19 : authY + 14);

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.5);
  const shX = RIGHT - 44;
  doc.lines([[2, 0], [2, 2], [0, 2], [-2, 2], [-2, 0], [0, -2.5]], shX, authY + 2, [1, 1], "S", true);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.8);
  doc.setTextColor(...TERT);
  doc.text("AUTHENTIC ORDER", RIGHT, authY + 8.5, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...SUB);
  doc.text("Alfawzaan's Enterprise", RIGHT, authY + 12.5, { align: "right" });

  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.3);
  doc.line(LEFT, authY + 21, RIGHT, authY + 21);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.6);
  doc.setTextColor(...INK);
  doc.text(
    verified ? "Your order has been verified. We appreciate your business." : "Your order is awaiting payment and stock verification by the store team.",
    CENTER,
    authY + 26,
    { align: "center" },
  );
  doc.setFontSize(7.5);
  doc.setTextColor(...GOLD);
  doc.textWithLink(WEBSITE, CENTER, authY + 31, { align: "center", url: `https://${WEBSITE}` });

  return {
    pages: doc.getNumberOfPages(),
    contentEndY: y,
    profileBottom,
    footerEndY: authY + 31,
    giftCode,
  };
}

/** Load the brand logo in the browser: fetch → data URL + true dimensions. */
async function loadLogo(): Promise<ReceiptLogo | null> {
  for (const src of ["/alfawzaans-logo.jpg", "/alfawzaans-logo.png"]) {
    try {
      const response = await fetch(src);
      if (!response.ok) continue;
      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) continue;
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => reject(new Error("logo decode failed"));
        img.src = data;
      });
      return {
        data,
        format: blob.type === "image/png" ? "PNG" : "JPEG",
        width: dims.width,
        height: dims.height,
      };
    } catch { /* try the next candidate */ }
  }
  return null;
}

export async function downloadReceiptPdf(data: ReceiptPdfData): Promise<ReceiptLayoutResult> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await loadLogo();
  const result = await buildReceiptLayout(doc, data, logo);
  doc.save(`alfawzaan-receipt-${data.orderId.slice(0, 8)}.pdf`);
  return result;
}
