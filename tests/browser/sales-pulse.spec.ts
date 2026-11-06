import { expect, test, type Page } from "@playwright/test";
import { buildWeeklyPromotionPlan, DEFAULT_PULSE_FILTERS } from "../../lib/salesPulse/promotions";
import { CONTENT_CATEGORIES, CONTENT_CATEGORY_LABEL } from "../../lib/salesPulse/contentCategories";
import { formatPulseDate } from "../../lib/salesPulse/dates";
import { contentFixture, PULSE_NOW, pulseFixture } from "../fixtures/salesPulse";

async function enterSalesPulse(page: Page) {
  await page.goto("/admin/dashboard");
  await page.getByRole("button", { name: "Sales Pulse", exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(PULSE_NOW));
  await page.addInitScript(() => localStorage.setItem("admin_last_activity", Date.now().toString()));
  // Only the bootstrap configuration action runs on the real server (env
  // strings, no DB read). All operational actions are blocked. The dashboard's
  // session check and Sales Pulse are fixture-backed; no live stock is read.
  let bootstrapSent = false;
  await page.route("**/*", (route) => {
    if (route.request().method() === "POST" && route.request().headers()["next-action"]) {
      if (!bootstrapSent) { bootstrapSent = true; return route.continue(); }
      return route.fulfill({ status: 401, body: "Fixture dashboard: operational action disabled" });
    }
    if (new URL(route.request().url()).hostname.endsWith(".supabase.co")) return route.abort();
    return route.continue();
  });
  await page.route("**/api/admin/check-session", (route) => route.fulfill({ json: { authenticated: true } }));
});

test("one snapshot powers period changes, stock filters, week selection and skipping goods", async ({ page }, testInfo) => {
  let reads = 0;
  const report = contentFixture(90);
  const current = buildWeeklyPromotionPlan(report, { filters: DEFAULT_PULSE_FILTERS, week: "current", now: new Date(PULSE_NOW) });
  await page.route("**/api/admin/sales-pulse", (route) => { reads++; return route.fulfill({ json: report }); });
  await page.goto("/admin/dashboard");
  await expect(page.getByRole("button", { name: "Sales Pulse", exact: true })).toBeVisible();
  expect(reads).toBe(0);
  await page.getByRole("button", { name: "Sales Pulse", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Worth another spotlight" })).toBeVisible();
  const plan = page.getByRole("region", { name: "Your weekly content handoff" });
  await expect(plan.getByRole("button", { name: /ZIP/ })).toHaveCount(0);
  await expect(plan.getByLabel("Responsible team", { exact: true })).toHaveCount(0);
  await expect(plan.getByRole("group", { name: "Content days" }).getByRole("button")).toHaveCount(5);
  await expect(plan.getByRole("heading", { name: "Daily posts required", exact: true })).toBeVisible();
  for (const category of Object.values(CONTENT_CATEGORY_LABEL)) await expect(plan.getByRole("region", { name: category, exact: true })).toBeVisible();
  await expect(plan.getByRole("region", { name: "100ml fragrances", exact: true }).getByText(/Snap this item separately/).first()).toBeVisible();
  const groupedDay = current.days.find((entry) => entry.groupShots > 0);
  expect(groupedDay).toBeDefined();
  await plan.getByRole("button", { name: `Content for ${formatPulseDate(groupedDay!.date, true)}`, exact: true }).click();
  await expect(plan.getByText(/Snap \d+ goods together/).first()).toBeVisible();
  expect(reads).toBe(1);
  await plan.screenshot({ path: testInfo.outputPath("daily-category-plan.png") });

  await plan.getByRole("combobox", { name: "Coverage week", exact: true }).selectOption("1");
  await expect(plan.getByText("9 Nov 2026 – 15 Nov 2026", { exact: true })).toBeVisible();
  await plan.getByRole("combobox", { name: "Daily shoot budget", exact: true }).selectOption("light");
  await expect(plan.getByRole("combobox", { name: "Coverage week", exact: true })).toHaveValue("0");

  await page.getByRole("button", { name: "year", exact: true }).click();
  await page.getByRole("button", { name: "day", exact: true }).click();
  await page.getByRole("combobox", { name: "Boutique", exact: true }).selectOption("unilorin");
  await page.getByRole("combobox", { name: "Minimum sales gap", exact: true }).selectOption("90");
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  await expect(plan.getByRole("group", { name: "Content days" }).getByRole("button")).toHaveCount(7);
  await expect(plan.getByText("9 Nov 2026 – 15 Nov 2026", { exact: true })).toBeVisible();

  await page.getByLabel("Search goods").fill("Oud Selection 01 100ml");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(plan.getByRole("link", { name: "Oud Selection 01 100ml", exact: true })).toHaveCount(1);
  await expect(plan.getByRole("button", { name: "Download Miniatures & small sizes snapshot (PNG)", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Skip Oud Selection 01 100ml in weekly plan", exact: true }).click();
  await expect(plan.getByText("No goods are ready for this plan.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Download weekly brief (PDF)" })).toBeDisabled();
  await page.getByRole("button", { name: "Restore 1 skipped goods" }).click();
  await expect(plan.getByRole("link", { name: "Oud Selection 01 100ml", exact: true })).toHaveCount(1);
  expect(reads).toBe(1);

  // At the mobile viewport, controls and cards must not create page-level
  // horizontal scrolling (the dashboard's tab strip scrolls internally).
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("each daily category downloads its own PNG with scoped counts and no responsible-team label", async ({ page }, testInfo) => {
  let reads = 0;
  const report = contentFixture(8);
  const expected = buildWeeklyPromotionPlan(report, { filters: DEFAULT_PULSE_FILTERS, week: "next", now: new Date(PULSE_NOW) });
  await page.addInitScript(() => {
    const target = window as typeof window & { contentCanvasText: string[] };
    target.contentCanvasText = [];
    const draw = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      target.contentCanvasText.push(String(text));
      if (maxWidth === undefined) draw.call(this, text, x, y);
      else draw.call(this, text, x, y, maxWidth);
    };
  });
  await page.route("**/api/admin/sales-pulse", (route) => { reads++; return route.fulfill({ json: report }); });
  await enterSalesPulse(page);
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  const plan = page.getByRole("region", { name: "Your weekly content handoff" });
  await expect(plan.getByLabel("Responsible team", { exact: true })).toHaveCount(0);
  await expect(plan.getByRole("button", { name: /ZIP|Download day snapshot/ })).toHaveCount(0);

  // Every category on Monday, followed by miniatures on Tuesday: no picture
  // may contain another category's goods or the previous day's assignments.
  const selections = [
    ...CONTENT_CATEGORIES.map((category) => ({ date: "2026-11-09", category })),
    { date: "2026-11-10", category: "miniatures" as const },
  ];
  for (const { date, category } of selections) {
    await plan.getByRole("button", { name: `Content for ${formatPulseDate(date, true)}`, exact: true }).click();
    await page.evaluate(() => { (window as typeof window & { contentCanvasText: string[] }).contentCanvasText = []; });
    const selected = expected.days.find((day) => day.date === date)!.categories.find((entry) => entry.category === category)!;
    const products = selected.posts.flatMap((post) => post.products);
    expect(products.length).toBeGreaterThan(0);
    const downloaded = page.waitForEvent("download");
    await plan.getByRole("button", { name: `Download ${CONTENT_CATEGORY_LABEL[category]} snapshot (PNG)`, exact: true }).click();
    const download = await downloaded;
    expect(download.suggestedFilename()).toBe(`alfawzaan-content-${date}-${category}.png`);
    await download.saveAs(testInfo.outputPath(`${date}-${category}.png`));
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    expect(bytes.length).toBeGreaterThan(5_000);
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(bytes.readUInt32BE(16)).toBe(1_200);
    expect(bytes.readUInt32BE(20)).toBeLessThanOrEqual(8_000);
    const drawn = await page.evaluate(() => (window as typeof window & { contentCanvasText: string[] }).contentCanvasText.join(" "));
    expect(drawn).toContain(CONTENT_CATEGORY_LABEL[category]);
    expect(drawn).toContain(formatPulseDate(date, true));
    expect(drawn).toContain(`${selected.posts.length} POSTS REQUIRED`);
    expect(drawn).toContain(`${selected.productCount} GOODS TO SNAP`);
    expect(drawn).not.toMatch(/Responsible team:|Team:/i);
    for (const product of products) expect(drawn).toContain(product.productName);
    const selectedIds = new Set(products.map((product) => product.productId));
    for (const product of expected.posts.flatMap((post) => post.products).filter((product) => !selectedIds.has(product.productId))) {
      expect(drawn).not.toContain(product.productName);
    }
    if (category === "100ml") expect(drawn).toContain("SNAP THIS ITEM SEPARATELY");
    if (selected.groupShots) expect(drawn).toContain("SNAP THESE");
  }
  const pdfReady = page.waitForEvent("download");
  await plan.getByRole("button", { name: "Download weekly brief (PDF)", exact: true }).click();
  const pdf = await pdfReady;
  expect(pdf.suggestedFilename()).toBe("alfawzaan-content-week-2026-11-09.pdf");
  await pdf.saveAs(testInfo.outputPath("weekly-content.pdf"));
  const pdfChunks: Buffer[] = [];
  for await (const chunk of (await pdf.createReadStream())!) pdfChunks.push(Buffer.from(chunk));
  const pdfBytes = Buffer.concat(pdfChunks);
  expect(pdfBytes.subarray(0, 4).toString()).toBe("%PDF");
  expect(pdfBytes.toString()).not.toMatch(/Responsible team:|Team:/i);
  expect(reads).toBe(1);
  await expect(page.getByRole("region", { name: "Your weekly content handoff" }).getByRole("alert")).toHaveCount(0);
});

test("failed refresh retains an explicit dated snapshot and initial failure can retry", async ({ page }) => {
  let reads = 0;
  await page.route("**/api/admin/sales-pulse", (route) => {
    reads++;
    return reads === 2 ? route.fulfill({ json: pulseFixture() }) : route.fulfill({ status: 503, json: { error: "Snapshot temporarily unavailable." } });
  });
  await enterSalesPulse(page);
  await expect(page.getByRole("alert").filter({ hasText: "Snapshot temporarily unavailable." })).toBeVisible();
  await page.getByRole("button", { name: "Retry Sales Pulse" }).click();
  await expect(page.getByRole("heading", { name: "Worth another spotlight" })).toBeVisible();
  await page.getByRole("button", { name: "Refresh snapshot" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Showing the snapshot from" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your weekly content handoff" })).toBeVisible();
  expect(reads).toBe(3);
});

test("empty stock and missing-price selections do not create filler posts", async ({ page }) => {
  const report = pulseFixture();
  await page.route("**/api/admin/sales-pulse", (route) => route.fulfill({ json: report }));
  await enterSalesPulse(page);
  await page.getByRole("combobox", { name: "Value band", exact: true }).selectOption("unpriced");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByText("Catalogue price needed", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download weekly brief (PDF)" })).toBeDisabled();
  report.agedStock = [];
  await page.getByRole("button", { name: "Refresh snapshot" }).click();
  await expect(page.getByText("No eligible aged stock in this snapshot.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Download weekly brief (PDF)" })).toBeDisabled();
});

test("long category pictures expose individual PNG sheets without a ZIP fallback", async ({ page }) => {
  const report = contentFixture(8);
  for (const item of report.agedStock.filter((entry) => entry.category === "100MLs")) item.productName += ` ${"Detailed product packaging and edition ".repeat(250)}`;
  await page.route("**/api/admin/sales-pulse", (route) => route.fulfill({ json: report }));
  await enterSalesPulse(page);
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  const fullSize = page.getByRole("region", { name: "100ml fragrances", exact: true });
  const downloads: string[] = [];
  page.on("download", (download) => downloads.push(download.suggestedFilename()));
  await fullSize.getByRole("button", { name: "Download 100ml fragrances snapshot (PNG)", exact: true }).click();
  await expect(fullSize.getByRole("status")).toContainText("PNG sheets are ready for 100ml fragrances");
  expect(downloads).toEqual([]);
  const sheets = fullSize.getByRole("button", { name: /Download 100ml fragrances sheet \d+ of \d+ \(PNG\)/ });
  const count = await sheets.count();
  expect(count).toBeGreaterThan(1);
  for (let index = 0; index < count; index++) {
    const downloaded = page.waitForEvent("download");
    await sheets.nth(index).click();
    const download = await downloaded;
    expect(download.suggestedFilename()).toBe(`alfawzaan-content-2026-11-09-100ml-${String(index + 1).padStart(2, "0")}-of-${String(count).padStart(2, "0")}.png`);
    const chunks: Buffer[] = [];
    for await (const chunk of (await download.createReadStream())!) chunks.push(Buffer.from(chunk));
    const png = Buffer.concat(chunks);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(png.readUInt32BE(20)).toBeLessThanOrEqual(8_000);
  }
  expect(downloads.every((name) => name.endsWith(".png"))).toBe(true);
  await page.getByRole("button", { name: "Content for Tue, 10 Nov 2026", exact: true }).click();
  await expect(page.getByRole("button", { name: /Download 100ml fragrances sheet/ })).toHaveCount(0);
});

test("changing the content day cancels a pending category picture instead of saving stale assignments", async ({ page }) => {
  let reads = 0;
  await page.route("**/api/admin/sales-pulse", (route) => { reads++; return route.fulfill({ json: contentFixture(8) }); });
  await enterSalesPulse(page);
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  await page.evaluate(() => {
    const target = window as typeof window & { releaseCategoryPicture?: () => void; categoryPictureReleased?: boolean };
    const render = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      HTMLCanvasElement.prototype.toBlob = render;
      target.releaseCategoryPicture = () => render.call(this, (blob) => { callback(blob); target.categoryPictureReleased = true; }, type, quality);
    };
  });
  const downloads: string[] = [];
  page.on("download", (download) => downloads.push(download.suggestedFilename()));
  await page.getByRole("button", { name: "Download 100ml fragrances snapshot (PNG)", exact: true }).click();
  await page.waitForFunction(() => typeof (window as typeof window & { releaseCategoryPicture?: () => void }).releaseCategoryPicture === "function");
  await page.getByRole("button", { name: "Content for Tue, 10 Nov 2026", exact: true }).click();
  await page.evaluate(() => (window as typeof window & { releaseCategoryPicture: () => void }).releaseCategoryPicture());
  await page.waitForFunction(() => (window as typeof window & { categoryPictureReleased?: boolean }).categoryPictureReleased);
  expect(downloads).toEqual([]);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download 100ml fragrances snapshot (PNG)", exact: true }).click();
  expect((await downloaded).suggestedFilename()).toBe("alfawzaan-content-2026-11-10-100ml.png");
  expect(reads).toBe(1);
});

test("anonymous API requests cannot read even a cached report", async ({ request }) => {
  const response = await request.get("/api/admin/sales-pulse");
  expect(response.status()).toBe(401);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await response.json()).toEqual({ error: "Please sign in again to view Sales Pulse." });
});
