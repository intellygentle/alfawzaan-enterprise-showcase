// Loaded on download only. Both formats use the already-visible plan; no API,
// image, font, AI, storage upload or Supabase request is made by these exports.
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { CONTENT_CATEGORY_DESCRIPTION, CONTENT_CATEGORY_LABEL } from "./contentCategories";
import { formatPulseDate, formatPulseTimestamp, lagosDate } from "./dates";
import { idleLabel, outletLabel, promotionWeekLabel, pulseMoney, selectDailyCategorySnapshot, stockDetail } from "./promotions";
import { SEGMENT_LABEL, type ContentCategory, type DailyCategorySnapshot, type WeeklyPromotionPlan } from "./types";

const fileName = (plan: WeeklyPromotionPlan, extension: string) => `alfawzaan-content-week-${plan.weekStart}.${extension}`;
const pdfText = (text: string) => text.replace(/₦/g, "NGN ").replace(/[–—·]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
const assertPosts = (plan: WeeklyPromotionPlan) => { if (!plan.posts.length) throw new Error("There are no scheduled products to download."); };

export function buildPromotionPdf(plan: WeeklyPromotionPlan): { doc: jsPDF; fileName: string } {
  assertPosts(plan);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const margin = 14;
  const width = doc.internal.pageSize.getWidth() - margin * 2;
  const paragraph = (text: string, y: number, size = 9, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(pdfText(text), width) as string[];
    doc.text(lines, margin, y);
    return y + lines.length * size * 0.42 + 3;
  };

  doc.setTextColor(20, 20, 20);
  let y = paragraph("ALFAWZAAN'S ENTERPRISE | Weekly content handoff", 18, 17, true);
  y = paragraph(promotionWeekLabel(plan), y, 12, true);
  y = paragraph(`${plan.scheduledProducts} distinct goods | ${plan.posts.length} required content posts | Coverage week ${plan.coverageWeek + 1} of ${plan.coverageWeeks.length}`, y);
  y = paragraph(`Snapshot: ${formatPulseTimestamp(plan.sourceGeneratedAt)} WAT | Prepared: ${formatPulseTimestamp(plan.generatedAt)} WAT`, y);
  y = paragraph(plan.scope, y, 8);
  y = paragraph(`Daily capacity: up to ${plan.dailyShootBudget} photo/post sets per boutique. Every 100ml product gets a SEPARATE photo and post. Other goods at ${pulseMoney(plan.lowValueLimit)} or less each can share a GROUP photo (up to ${plan.maxGroupSize} goods, same category and boutique). Higher-value goods are photographed separately.`, y, 8, true);

  autoTable(doc, {
    startY: y, margin: { left: margin, right: margin, bottom: 17 },
    head: [["Content day / due (WAT)", "Goods to snap", "Posts required", "Separate shots", "Group photos", "Unilorin / Tanke sets"]],
    body: plan.days.map((day) => [
      `${formatPulseDate(day.date, true)} / 18:00`, String(day.productCount), String(day.requiredPosts),
      String(day.individualShots), String(day.groupShots), `${day.outletPosts.unilorin} / ${day.outletPosts.tanke}`,
    ]),
    styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: [25, 25, 25], textColor: [230, 199, 99] },
    alternateRowStyles: { fillColor: [249, 246, 236] },
    columnStyles: { 0: { cellWidth: 58 }, 1: { halign: "center" }, 2: { halign: "center" }, 3: { halign: "center" }, 4: { halign: "center" }, 5: { halign: "center" } },
    rowPageBreak: "avoid",
  });

  for (const day of plan.days.filter((entry) => entry.requiredPosts > 0)) {
    doc.addPage();
    doc.setTextColor(20);
    y = paragraph(`${formatPulseDate(day.date, true)} | Daily posts required: ${day.requiredPosts}`, 18, 16, true);
    y = paragraph(`${day.productCount} goods | ${day.individualShots} separate shots + ${day.groupShots} group photos | Due by 18:00 WAT | Unilorin ${day.outletPosts.unilorin}/${plan.dailyShootBudget} sets; Tanke ${day.outletPosts.tanke}/${plan.dailyShootBudget} sets`, y, 9);
    y = paragraph("A photo set is one content post reused for Instagram and WhatsApp Status. Products with the same GROUP post reference are photographed together at the stated boutique. Product names link to the storefront.", y, 8);
    for (const category of day.categories) {
      if (y > 145) {
        doc.addPage();
        y = paragraph(`${formatPulseDate(day.date, true)} - daily content continued`, 16, 10, true);
      }
      y = paragraph(`${CONTENT_CATEGORY_LABEL[category.category]} | ${category.productCount} goods / ${category.posts.length} posts`, y + 2, 11, true);
      if (!category.posts.length) { y = paragraph("No additional goods allocated to this category today.", y, 8); continue; }
      y = paragraph(category.category === "100ml"
        ? "SNAP SEPARATELY: each 100ml product below needs its own hero shot, label/size close-up and individual post."
        : `GROUP rows: arrange only the listed lower-value goods in one frame, with clear labels and individual prices. SEPARATE rows: one product per photo and post.`, y, 8);
      const rows = category.posts.flatMap((post, index) => post.products.map((product, productIndex) => ({
        post, product,
        cells: [
          `Post ${index + 1} - ${outletLabel(post.outlet)}\n${post.shootMode === "group" ? `GROUP ${productIndex + 1}/${post.products.length}` : "SEPARATE"}`,
          pdfText(`${product.productName}\n${product.category} | ${SEGMENT_LABEL[product.segment]} | Attention ${product.attentionScore}/100`),
          pdfText(`Each: ${pulseMoney(product.unitPrice)}\nStock value: ${pulseMoney(product.stockValue)}`),
          pdfText(product.items.map((item) => `${stockDetail(item)} | ${idleLabel(item)}`).join("\n")),
        ],
      })));
      autoTable(doc, {
        startY: y, margin: { top: 25, left: margin, right: margin, bottom: 17 },
        head: [["Photo / post reference", `Goods - ${CONTENT_CATEGORY_LABEL[category.category]}`, "Regular price / value", "Availability / inactivity"]],
        body: rows.map((row) => row.cells),
        styles: { fontSize: 7.5, cellPadding: 2.5, overflow: "linebreak" },
        headStyles: { fillColor: [25, 25, 25], textColor: [230, 199, 99] },
        columnStyles: { 0: { cellWidth: 37 }, 1: { cellWidth: 81 }, 2: { cellWidth: 43 }, 3: { cellWidth: "auto" } },
        rowPageBreak: "avoid",
        willDrawPage: (data) => {
          if (data.pageNumber > 1) { doc.setFontSize(9); doc.text(`${formatPulseDate(day.date, true)} - daily content continued`, margin, 16); }
        },
        didParseCell: (data) => {
          if (data.section === "body" && rows[data.row.index]?.post.shootMode === "group") data.cell.styles.fillColor = [249, 246, 236];
        },
        didDrawCell: (data) => {
          if (data.section === "body" && data.column.index === 1) {
            const product = rows[data.row.index]?.product;
            if (product) doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: product.productUrl });
          }
        },
      });
      y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    }
  }

  doc.addPage();
  y = paragraph("Shooting notes, captions and planning method", 18, 16, true);
  y = paragraph(`100ml goods are always individual. Other items above ${pulseMoney(plan.lowValueLimit)} each are individual too. Group only the lower-value goods listed under the same post, at the same boutique, with a maximum of ${plan.maxGroupSize} products per photo. A group is a photo arrangement, not an automatic price bundle.`, y, 9);
  y = paragraph("Individual starter caption: Take a closer look at [product]. Regular retail price: [listed price]. Ask [boutique] about availability or explore it on our website.", y, 9);
  y = paragraph("Group starter caption: Explore today's [category] selection: [listed product names and individual regular prices]. Ask [capture boutique] about availability.", y, 9);
  y = paragraph(`Each category aims for 2-8 goods per boutique daily (100ml: up to 6), within a budget of ${plan.dailyShootBudget} photo/post sets per boutique. Category quantity depends on remaining goods, remaining days and an attention score with equal weight for inactivity (capped at 180 days) and relative log retail stock value.`, y, 9);
  y = paragraph(`This week covers ${plan.scheduledProducts} goods. Earlier planned weeks contain ${plan.plannedBeforeThisWeek}; later weeks contain ${plan.remainingProducts}. The full ${plan.coverageWeeks.length}-week plan covers ${plan.eligibleProducts} distinct eligible goods once each. These are planned batches; the team records actual completion.`, y, 9);
  y = paragraph(`History starts ${formatPulseDate(lagosDate(plan.historyStart))}. Sales gaps describe recorded inactivity, not physical shelf age. Available stock excludes reservations; prices are regular catalogue prices before discounts. Stock-pattern segments use ${plan.modelMethod === "kmeans" ? "locally fitted ML clustering" : "the labelled rule-based fallback"}.`, y, 8);
  if (y > 140) { doc.addPage(); y = 18; }
  y = paragraph("Category coverage - planned goods, not completed shoots", y + 3, 11, true);
  autoTable(doc, {
    startY: y, margin: { left: margin, right: margin, bottom: 17 },
    head: [["Content category", "Eligible goods", "Earlier weeks", "This week", "Later weeks"]],
    body: plan.categorySummary.map((category) => [CONTENT_CATEGORY_LABEL[category.category], category.eligible, category.earlierWeeks, category.thisWeek, category.laterWeeks]),
    styles: { fontSize: 8, cellPadding: 2 }, headStyles: { fillColor: [25, 25, 25], textColor: [230, 199, 99] },
  });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(110);
    doc.text("Content handoff | Use current boutique availability and prices when preparing content.", margin, doc.internal.pageSize.getHeight() - 8);
    doc.text(`${page} / ${pages}`, doc.internal.pageSize.getWidth() - margin, doc.internal.pageSize.getHeight() - 8, { align: "right" });
  }
  return { doc, fileName: fileName(plan, "pdf") };
}

export function downloadPromotionPdf(plan: WeeklyPromotionPlan): void {
  const output = buildPromotionPdf(plan);
  output.doc.save(output.fileName);
}

interface TextBlock { text: string; size: number; color: string; bold?: boolean }

function wrapCanvasText(context: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width <= width) { line = candidate; continue; }
    if (line) { lines.push(line); line = ""; }
    // Product names can contain long codes/URLs with no spaces. Wrap those too.
    for (const letter of word) {
      if (line && context.measureText(line + letter).width > width) { lines.push(line); line = ""; }
      line += letter;
    }
  }
  if (line) lines.push(line);
  return lines;
}

interface MeasuredLine extends TextBlock { height: number }

/** Text-only, bounded-size PNG sheets: no image downloads, DOM screenshots or fonts. */
async function renderSnapshotPages(header: TextBlock[], cards: TextBlock[][], footer: TextBlock[]): Promise<Blob[]> {
  const canvas = document.createElement("canvas");
  canvas.width = 1_200;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image downloads are unavailable in this browser. Please use the PDF brief.");
  const contentWidth = 1_020;
  const font = (block: TextBlock) => `${block.bold ? "700" : "400"} ${block.size}px Arial, sans-serif`;
  const measure = (blocks: TextBlock[]): MeasuredLine[] => blocks.flatMap((block) => {
    context.font = font(block);
    const lines = wrapCanvasText(context, block.text, contentWidth);
    return lines.map((text, index) => ({ ...block, text, height: block.size * 1.4 + (index === lines.length - 1 ? 9 : 0) }));
  });
  const heading = measure(header);
  const ending = measure(footer);
  const height = (lines: MeasuredLine[]) => lines.reduce((sum, line) => sum + line.height, 0);
  const headerHeight = height(heading) + 80;
  const bodyLimit = 8_000 - headerHeight - height(ending) - 110;
  if (bodyLimit < 200) throw new Error("The snapshot header is too long. Please use the PDF brief.");
  const pages: MeasuredLine[][][] = [[]];
  let used = 0;
  for (const card of cards.map(measure)) {
    let remaining = [...card];
    if (used && height(remaining) + 50 > bodyLimit - used && height(remaining) + 50 <= bodyLimit) { pages.push([]); used = 0; }
    while (remaining.length) {
      const segment: MeasuredLine[] = [];
      let segmentHeight = 50;
      while (remaining.length && segmentHeight + remaining[0].height <= bodyLimit - used) {
        const line = remaining.shift()!;
        segment.push(line);
        segmentHeight += line.height;
      }
      if (segment.length) { pages[pages.length - 1].push(segment); used += segmentHeight; }
      if (remaining.length) { pages.push([]); used = 0; }
    }
  }
  const draw = (lines: MeasuredLine[], startY: number) => {
    let y = startY;
    for (const line of lines) {
      context.font = font(line);
      context.fillStyle = line.color;
      context.fillText(line.text, 90, y);
      y += line.height;
    }
    return y;
  };
  const blobs: Blob[] = [];
  for (const [index, page] of pages.entries()) {
    canvas.height = Math.ceil(headerHeight + page.reduce((sum, card) => sum + height(card) + 50, 0) + height(ending) + 110);
    context.fillStyle = "#f7f4ee";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#141414";
    context.fillRect(0, 0, canvas.width, headerHeight);
    context.textBaseline = "top";
    draw(heading, 40);
    let y = headerHeight + 20;
    for (const card of page) {
      context.fillStyle = "#ffffff";
      context.fillRect(60, y, 1_080, height(card) + 32);
      draw(card, y + 16);
      y += height(card) + 50;
    }
    y = draw(ending, y + 10);
    context.font = "400 16px Arial, sans-serif";
    context.fillStyle = "#666666";
    context.fillText(`Sheet ${index + 1} of ${pages.length}`, 90, y + 6);
    blobs.push(await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Could not create the snapshot image.")), "image/png")));
  }
  canvas.width = 0;
  canvas.height = 0;
  return blobs;
}

function snapshotHeader(plan: WeeklyPromotionPlan, snapshot: DailyCategorySnapshot): TextBlock[] {
  return [
    { text: "ALFAWZAAN'S ENTERPRISE", size: 22, color: "#d4af37", bold: true },
    { text: CONTENT_CATEGORY_LABEL[snapshot.category], size: 38, color: "#ffffff", bold: true },
    { text: `${formatPulseDate(snapshot.date, true)} · ${snapshot.posts.length} POSTS REQUIRED`, size: 24, color: "#e3d29a", bold: true },
    { text: `${snapshot.productCount} GOODS TO SNAP · ${snapshot.individualShots} separate shots / ${snapshot.groupShots} group photos · DUE 18:00 WAT`, size: 20, color: "#ffffff" },
    { text: `Unilorin: ${snapshot.outletPosts.unilorin} posts · Tanke: ${snapshot.outletPosts.tanke} posts`, size: 18, color: "#cccccc" },
    { text: `Stock & sales snapshot: ${formatPulseTimestamp(plan.sourceGeneratedAt)} WAT`, size: 17, color: "#cccccc" },
    { text: plan.scope, size: 17, color: "#cccccc" },
  ];
}

function snapshotFooter(plan: WeeklyPromotionPlan, category: ContentCategory): TextBlock[] {
  return [
    { text: category === "100ml"
      ? "Photograph every listed fragrance separately. Each product requires its own individual photo and content post."
      : `Only the lower-value goods listed in the same photo set may be snapped together: up to ${plan.maxGroupSize} items priced at ${pulseMoney(plan.lowValueLimit)} or less each, at the same boutique. Keep individual-photo entries separate.`, size: 18, color: "#444444", bold: true },
    { text: "Each photo set produces one required content post for Instagram / WhatsApp Status. Use current availability and regular prices when preparing content.", size: 17, color: "#666666" },
    { text: `Prepared ${formatPulseTimestamp(plan.generatedAt)} WAT · Planned batches, not completed shoots. Download the PDF for source evidence and linked product names.`, size: 17, color: "#666666" },
  ];
}

function categoryCards(snapshot: DailyCategorySnapshot): TextBlock[][] {
  return [
    [
      { text: CONTENT_CATEGORY_DESCRIPTION[snapshot.category], size: 18, color: "#555555" },
    ],
    ...snapshot.posts.map((post, index): TextBlock[] => [
      { text: `Post ${index + 1} · ${outletLabel(post.outlet)}`, size: 20, color: "#82671c", bold: true },
      { text: post.shootMode === "group" ? `SNAP THESE ${post.products.length} GOODS TOGETHER — 1 PHOTO / 1 POST` : "SNAP THIS ITEM SEPARATELY — 1 PHOTO / 1 POST", size: 20, color: "#141414", bold: true },
      ...post.products.flatMap((product): TextBlock[] => [
        { text: product.productName, size: 24, color: "#141414", bold: true },
        { text: `${pulseMoney(product.unitPrice)} each · ${pulseMoney(product.stockValue)} stock value · Attention ${product.attentionScore}/100 · ${SEGMENT_LABEL[product.segment]}`, size: 18, color: "#404040" },
        ...product.items.map((item) => ({ text: `${stockDetail(item)} | ${idleLabel(item)}`, size: 17, color: "#555555" })),
      ]),
    ]),
  ];
}

export interface CategorySnapshotPicture {
  blob: Blob;
  fileName: string;
}

/** Only one requested category/day enters the picture renderer. No ZIP fallback. */
export async function buildDailyCategoryPictures(
  plan: WeeklyPromotionPlan,
  date: string,
  category: ContentCategory,
): Promise<CategorySnapshotPicture[]> {
  const snapshot = selectDailyCategorySnapshot(plan, date, category);
  const blobs = await renderSnapshotPages(snapshotHeader(plan, snapshot), categoryCards(snapshot), snapshotFooter(plan, category));
  const prefix = `alfawzaan-content-${date}-${category}`;
  return blobs.map((blob, index) => ({
    blob,
    fileName: blobs.length === 1 ? `${prefix}.png`
      : `${prefix}-${String(index + 1).padStart(2, "0")}-of-${String(blobs.length).padStart(2, "0")}.png`,
  }));
}
