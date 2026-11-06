import assert from "node:assert/strict";
import test from "node:test";

const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";

async function get(path: string) {
  try {
    return await fetch(new URL(path, baseUrl));
  } catch (error) {
    throw new Error(`Could not reach ${baseUrl}. Start the app with npm run dev or npm run start before running smoke tests.`, { cause: error });
  }
}

test("public pages load successfully", async () => {
  for (const path of ["/", "/store", "/delivery"]) {
    const response = await get(path);
    assert.equal(response.status, 200, `${path} returned HTTP ${response.status}`);
    assert.match(response.headers.get("content-type") || "", /text\/html/);
  }
});

test("landing page returns the refreshed SEO metadata", async () => {
  const response = await get("/");
  const html = await response.text();
  assert.match(html, /Alfawzaan&#x27;s Enterprise \| Premium Fragrances in Ilorin/);
  assert.match(html, /og:description/);
  assert.match(html, /canonical/);
});

test("session endpoints respond without exposing privileged data", async () => {
  for (const path of ["/api/admin/check-session", "/api/rep/check-session"]) {
    const response = await get(path);
    assert.equal(response.status, 200, `${path} returned HTTP ${response.status}`);
    const body = await response.json() as Record<string, unknown>;
    assert.equal(typeof body.authenticated, "boolean");
    assert.equal("password_hash" in body, false);
  }
});
