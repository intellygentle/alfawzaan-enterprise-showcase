import assert from "node:assert/strict";
import test from "node:test";
import { jsPDF } from "jspdf";
import {
  buildReceiptLayout,
  type ReceiptPdfItem,
  type ReceiptPdfData,
  type ReceiptAuditEntry,
} from "../../lib/receiptPdf";

// Layout invariants for the flex receipt, enforced via the builder's audit
// hook: every text draw must stay inside the gold frame and the content
// margins, no two draws may overlap on the same baseline, and the footer must
// fit the page. The 13-item case is the historical overlap regression.

function makeItem(index: number, unitPrice: number, longName = false): ReceiptPdfItem {
  const base = longName
    ? `Extremely Long Premium Fragrance Name Number ${index} With Extra Descriptive Words`
    : `Fragrance ${index}`;
  return { name: base, quantity: 1, unitPrice, totalPrice: unitPrice };
}

function makeData(orderId: string, items: ReceiptPdfItem[]): ReceiptPdfData {
  return {
    orderId,
    customerName: "Test Customer",
    outlet: "unilorin",
    status: "pending",
    total: items.reduce((sum, item) => sum + item.totalPrice, 0),
    items,
    createdAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
  };
}

interface BuildOutcome {
  pages: number;
  profileBottom: number;
  footerEndY: number;
  giftCode: string | null;
}

/** Build a receipt, collect every text draw, and assert the core invariants. */
async function buildAndAssert(items: ReceiptPdfItem[], label: string, orderId = "test-order-0001", verified = false): Promise<BuildOutcome> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const draws: ReceiptAuditEntry[] = [];
  const data = makeData(orderId, items);
  if (verified) data.status = "paid";
  const result = await buildReceiptLayout(doc, data, null, (entry) => draws.push(entry));

  // Frame: outer border at 11mm, inner hairline at 12.4mm.
  const FRAME_L = 11, FRAME_R = 199, FRAME_T = 11, FRAME_B = 286;
  const LEFT = 16, RIGHT = 194;
  let issues = 0;
  for (const c of draws) {
    const msgs: string[] = [];
    if (c.y < FRAME_T + 1) msgs.push(`above frame (y=${c.y.toFixed(1)})`);
    if (c.y > FRAME_B - 1) msgs.push(`below frame (y=${c.y.toFixed(1)})`);
    if (c.drawX < LEFT - 3) msgs.push(`left of margins (x=${c.drawX.toFixed(1)})`);
    if (c.endX > RIGHT + 3) msgs.push(`right overflow (ends ${c.endX.toFixed(1)})`);
    if (msgs.length) {
      issues++;
      console.error(`  ${label} p${c.page} ${msgs.join("; ")} — "${c.text.slice(0, 50)}"`);
    }
  }
  assert.equal(issues, 0, `${label}: all text inside the frame and margins`);

  // Same-page, same-baseline overlaps with true measured widths.
  const byPage = new Map<number, ReceiptAuditEntry[]>();
  for (const c of draws) {
    const list = byPage.get(c.page) ?? [];
    list.push(c);
    byPage.set(c.page, list);
  }
  let collisions = 0;
  for (const list of byPage.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (Math.abs(a.y - b.y) < 3 && a.drawX < b.endX && b.drawX < a.endX) {
          collisions++;
          console.error(`  ${label} OVERLAP: "${a.text.slice(0, 35)}" × "${b.text.slice(0, 35)}" @ y~${a.y.toFixed(1)}`);
        }
      }
    }
  }
  assert.equal(collisions, 0, `${label}: no text overlaps`);

  // Footer must fit inside the inner frame line (284.6mm).
  assert.ok(result.footerEndY <= 284.6, `${label}: footer ends at ${result.footerEndY.toFixed(1)} ≤ 284.6`);

  return { pages: result.pages, profileBottom: result.profileBottom, footerEndY: result.footerEndY, giftCode: result.giftCode };
}

test("receipt layout: 1 item — single page, no overlap, gift code for VERIFIED extravaganza spend", async () => {
  const out = await buildAndAssert([makeItem(1, 50_000)], "1 item", "a1b2c3d4-e5f6-7890-abcd-ef1234567890", true);
  assert.equal(out.pages, 1, "short receipt fits one page");
  assert.equal(out.giftCode, "ALF-A1B2C3D4", "dominant special tier earns the gift code");
});

test("receipt layout: PENDING extravaganza order prints no gift code — codes go live at verification", async () => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const result = await buildReceiptLayout(
    doc,
    // makeData defaults to status "pending"
    makeData("a1b2c3d4-e5f6-7890-abcd-ef1234567890", [makeItem(1, 100_000)]),
    null,
  );
  assert.equal(result.giftCode, null, "pending receipts must not promise a claimable gift");
});

test("receipt layout: VERIFIED extravaganza order prints the gift code", async () => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const data = makeData("a1b2c3d4-e5f6-7890-abcd-ef1234567890", [makeItem(1, 100_000)]);
  data.status = "paid";
  const result = await buildReceiptLayout(doc, data, null);
  assert.equal(result.giftCode, "ALF-A1B2C3D4");
});

test("receipt layout: 2 and 5 items — no overlap, nothing clipped", async () => {
  await buildAndAssert([makeItem(1, 5_000), makeItem(2, 40_000)], "2 items");
  await buildAndAssert(
    Array.from({ length: 5 }, (_, i) => makeItem(i + 1, [5_000, 20_000, 50_000, 12_000, 35_000][i])),
    "5 items",
  );
});

test("receipt layout: 13 items (historical overlap regression) — paginates cleanly", async () => {
  const items = Array.from({ length: 13 }, (_, i) => makeItem(i + 1, 10_000 + i * 2_000));
  const out = await buildAndAssert(items, "13 items");
  assert.ok(out.pages >= 2, "13 items paginate instead of overlapping");
});

test("receipt layout: 30 items with long two-line names — nothing clipped", async () => {
  const items = Array.from({ length: 30 }, (_, i) => makeItem(i + 1, 8_000 + i * 1_500, i % 2 === 0));
  const out = await buildAndAssert(items, "30 items");
  assert.ok(out.pages >= 2, "30 long items require multiple pages");
});

test("receipt layout: zero-value order — no profile, no gift, footer still fits", async () => {
  const out = await buildAndAssert([{ name: "Gift", quantity: 1, unitPrice: 0, totalPrice: 0 }], "zero total");
  assert.equal(out.giftCode, null, "no spend → no gift code");
  assert.equal(out.profileBottom, 0, "no profile section on a zero-value order");
});

test("receipt layout: verified extravaganza-dominant multi-item order earns the gift code", async () => {
  const items = [
    makeItem(1, 100_000), // special
    makeItem(2, 27_000),  // extra
    makeItem(3, 4_000),   // normal ×2
    makeItem(4, 4_000),
  ];
  const out = await buildAndAssert(items, "extravaganza", "9f8e7d6c-b5a4-4321-fedc-ba9876543210", true);
  assert.equal(out.giftCode, "ALF-9F8E7D6C");
});
