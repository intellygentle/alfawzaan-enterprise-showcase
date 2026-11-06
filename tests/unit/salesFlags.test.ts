import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveDiscrepancyType,
  describeDiscrepancy,
  computeRecurrence,
  flagAgeDays,
  isOverdue,
  OVERDUE_AFTER_DAYS,
  CHRONIC_FLAG_THRESHOLD,
  SALES_FLAG_TYPE_LABEL,
  filterSalesFlags,
  type SalesFlag,
} from "../../lib/salesFlags";

test("resolveDiscrepancyType reads the online vs physical gap", () => {
  // Online shows fewer units than the shelf.
  assert.equal(resolveDiscrepancyType(2, 5), "number_less");
  // Online shows more units than the shelf.
  assert.equal(resolveDiscrepancyType(7, 3), "number_more");
  // Equal counts are not a discrepancy.
  assert.equal(resolveDiscrepancyType(4, 4), "match");
  assert.equal(resolveDiscrepancyType(0, 0), "match");
  assert.equal(resolveDiscrepancyType(0, 1), "number_less");
  assert.equal(resolveDiscrepancyType(1, 0), "number_more");
});

test("describeDiscrepancy reports the unit gap with correct pluralisation", () => {
  assert.equal(
    describeDiscrepancy("number_less", 2, 5),
    "Online shows 3 fewer units than the physical count.",
  );
  assert.equal(
    describeDiscrepancy("number_less", 2, 3),
    "Online shows 1 fewer unit than the physical count.",
  );
  assert.equal(
    describeDiscrepancy("number_more", 7, 3),
    "Online shows 4 more units than the physical count.",
  );
  assert.equal(
    describeDiscrepancy("number_more", 3, 2),
    "Online shows 1 more unit than the physical count.",
  );
  assert.equal(describeDiscrepancy("match", 4, 4), "Online and physical counts match.");
});

test("every flag type has a display label", () => {
  assert.equal(SALES_FLAG_TYPE_LABEL.number_less, "Number less");
  assert.equal(SALES_FLAG_TYPE_LABEL.number_more, "Number more");
  assert.equal(SALES_FLAG_TYPE_LABEL.match, "Matches");
});

test("computeRecurrence ignores open flags and the row being reopened", () => {
  const history = [
    // The ongoing open flag is not a prior correction.
    { id: "open", flag_date: "2026-10-01", status: "open", resolved_at: null, flagged_at: "2026-10-01T10:00:00Z" },
    // A resolved flag on the date being flagged is the row itself, not a prior.
    { id: "same-day", flag_date: "2026-10-05", status: "resolved", resolved_at: "2026-10-05T09:00:00Z", flagged_at: "2026-10-05T08:00:00Z" },
  ];
  const info = computeRecurrence(history, "2026-10-05");
  assert.equal(info.is_recurrence, false);
  assert.equal(info.recurrence_count, 0);
  assert.equal(info.previous_resolved_at, null);
  assert.equal(info.previous_flag_id, null);
});

test("computeRecurrence counts prior resolved flags and links the newest", () => {
  const history = [
    { id: "old", flag_date: "2026-09-01", status: "resolved", resolved_at: "2026-09-02T09:00:00Z", flagged_at: "2026-09-01T08:00:00Z" },
    { id: "newer", flag_date: "2026-09-20", status: "resolved", resolved_at: "2026-09-21T09:00:00Z", flagged_at: "2026-09-20T08:00:00Z" },
    { id: "current-open", flag_date: "2026-09-25", status: "open", resolved_at: null, flagged_at: "2026-09-25T08:00:00Z" },
  ];
  const info = computeRecurrence(history, "2026-10-05");
  assert.equal(info.is_recurrence, true);
  assert.equal(info.recurrence_count, 2);
  assert.equal(info.previous_resolved_at, "2026-09-21T09:00:00Z");
  assert.equal(info.previous_flag_id, "newer");
});

test("computeRecurrence on an empty history is not a recurrence", () => {
  const info = computeRecurrence([], "2026-10-05");
  assert.equal(info.is_recurrence, false);
  assert.equal(info.recurrence_count, 0);
});

test("flagAgeDays floors the age in whole days", () => {
  const now = new Date("2026-10-05T12:00:00Z").getTime();
  assert.equal(flagAgeDays("2026-10-05T09:00:00Z", now), 0); // 3 hours
  assert.equal(flagAgeDays("2026-10-04T12:00:00Z", now), 1);
  assert.equal(flagAgeDays("2026-10-01T12:00:00Z", now), 4);
  // A future/malformed timestamp never reports negative age.
  assert.equal(flagAgeDays("2026-10-06T12:00:00Z", now), 0);
  assert.equal(flagAgeDays("not-a-date", now), 0);
});

test("isOverdue only applies to open flags past the window", () => {
  const now = new Date("2026-10-05T12:00:00Z").getTime();
  assert.equal(isOverdue({ status: "open", flagged_at: "2026-10-05T09:00:00Z" }, now), false);
  assert.equal(isOverdue({ status: "open", flagged_at: "2026-10-03T09:00:00Z" }, now), true);
  // Resolved flags are never overdue.
  assert.equal(isOverdue({ status: "resolved", flagged_at: "2026-01-01T09:00:00Z" }, now), false);
  assert.equal(OVERDUE_AFTER_DAYS, 2);
});

test("the chronic threshold is a positive, sensible value", () => {
  assert.equal(CHRONIC_FLAG_THRESHOLD, 3);
});

function makeFlag(overrides: Partial<SalesFlag>): SalesFlag {
  return {
    id: "flag-1",
    flag_date: "2026-10-01",
    outlet: "unilorin",
    product_id: "product-1",
    product_name: "Alpha",
    grade: "normal",
    online_remaining: 1,
    physical_remaining: 3,
    discrepancy_type: "number_less",
    note: null,
    status: "open",
    flagged_by: null,
    flagged_at: "2026-10-01T09:00:00Z",
    resolved_by: null,
    resolved_at: null,
    resolution_note: null,
    ...overrides,
  };
}

test("filterSalesFlags selects the requested status and store", () => {
  const flags = [
    makeFlag({ id: "u-open", outlet: "unilorin", status: "open" }),
    makeFlag({ id: "u-resolved", outlet: "unilorin", status: "resolved" }),
    makeFlag({ id: "t-open", outlet: "tanke", status: "open" }),
    makeFlag({ id: "t-resolved", outlet: "tanke", status: "resolved" }),
  ];

  assert.deepEqual(
    filterSalesFlags(flags, { status: "open", outlet: "tanke" }).map((flag) => flag.id),
    ["t-open"],
  );
  assert.deepEqual(
    filterSalesFlags(flags, { status: "resolved", outlet: "all" }).map((flag) => flag.id),
    ["u-resolved", "t-resolved"],
  );
  assert.deepEqual(
    filterSalesFlags(flags, { status: "all", outlet: "all" }).map((flag) => flag.id),
    ["u-open", "u-resolved", "t-open", "t-resolved"],
  );
});

test("filterSalesFlags does not mutate the source list", () => {
  const flags = [makeFlag({ id: "only" })];
  const selected = filterSalesFlags(flags, { status: "resolved", outlet: "all" });
  assert.deepEqual(selected, []);
  assert.equal(flags.length, 1);
});
