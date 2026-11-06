// lib/salesFlags.ts — pure helpers for daily-sales discrepancy flags.
//
// A flag records a mismatch between the units remaining ONLINE (branch
// inventory) and the units counted PHYSICALLY in the store. The direction is
// always derived from the two counts, never trusted from the client, so the
// action and the modal agree on the same rule.

export type SalesFlagType = 'number_less' | 'number_more' | 'match';
export type SalesFlagStatus = 'open' | 'resolved';

export interface SalesFlag {
  id: string;
  flag_date: string;
  outlet: string;
  product_id: string;
  product_name: string | null;
  grade: string;
  online_remaining: number;
  physical_remaining: number;
  discrepancy_type: SalesFlagType;
  note: string | null;
  status: SalesFlagStatus;
  flagged_by: string | null;
  flagged_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  /** True when this item had earlier flags that were resolved before this one was raised. */
  is_recurrence?: boolean;
  /** Number of prior resolved flags for the same goods item at the time this flag was raised. */
  recurrence_count?: number;
  /** When the most recent prior flag for the same item was resolved. */
  previous_resolved_at?: string | null;
  /** Id of the most recent prior resolved flag for the same item. */
  previous_flag_id?: string | null;
}

export const SALES_FLAG_TYPE_LABEL: Record<SalesFlagType, string> = {
  number_less: 'Number less',
  number_more: 'Number more',
  match: 'Matches',
};

/**
 * Classify the mismatch between the online and physical counts.
 *   online < physical -> 'number_less' (online shows fewer than the shelf)
 *   online > physical -> 'number_more' (online shows more than the shelf)
 *   equal             -> 'match'
 */
export function resolveDiscrepancyType(online: number, physical: number): SalesFlagType {
  if (online < physical) return 'number_less';
  if (online > physical) return 'number_more';
  return 'match';
}

/** Human-readable explanation of a discrepancy, including the unit gap. */
export function describeDiscrepancy(type: SalesFlagType, online: number, physical: number): string {
  const diff = Math.abs(physical - online);
  if (type === 'number_less') {
    return `Online shows ${diff} fewer unit${diff === 1 ? '' : 's'} than the physical count.`;
  }
  if (type === 'number_more') {
    return `Online shows ${diff} more unit${diff === 1 ? '' : 's'} than the physical count.`;
  }
  return 'Online and physical counts match.';
}

export interface FlagHistoryRow {
  id: string;
  flag_date: string;
  status: string;
  resolved_at: string | null;
  flagged_at: string;
}

export interface RecurrenceInfo {
  is_recurrence: boolean;
  recurrence_count: number;
  previous_resolved_at: string | null;
  previous_flag_id: string | null;
}

/**
 * Summarise the prior flag history for a goods item at the moment a new flag is
 * raised. Only *resolved* flags count as "prior" — a flag still open is the same
 * ongoing discrepancy, not a repeat. A resolved flag on the current sale date is
 * also excluded because it is the row being reopened.
 */
export function computeRecurrence(history: FlagHistoryRow[], currentDate: string): RecurrenceInfo {
  const priorResolved = history
    .filter((row) => row.status === 'resolved' && row.flag_date !== currentDate)
    .sort((a, b) => (b.resolved_at ?? '').localeCompare(a.resolved_at ?? ''));
  const last = priorResolved[0];
  return {
    is_recurrence: priorResolved.length > 0,
    recurrence_count: priorResolved.length,
    previous_resolved_at: last?.resolved_at ?? null,
    previous_flag_id: last?.id ?? null,
  };
}

/** An open flag older than this many days is considered overdue. */
export const OVERDUE_AFTER_DAYS = 2;
/** An item flagged this many times (open or resolved) is considered a chronic offender. */
export const CHRONIC_FLAG_THRESHOLD = 3;

/** Whole days since a flag was raised, floored at zero. */
export function flagAgeDays(flaggedAt: string, now: number = Date.now()): number {
  const time = new Date(flaggedAt).getTime();
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, Math.floor((now - time) / 86_400_000));
}

/** True when an open flag has been sitting unresolved past the overdue window. */
export function isOverdue(
  flag: { status: string; flagged_at: string },
  now: number = Date.now(),
  thresholdDays: number = OVERDUE_AFTER_DAYS,
): boolean {
  return flag.status === 'open' && flagAgeDays(flag.flagged_at, now) >= thresholdDays;
}

export type SalesFlagReportStatus = 'all' | 'open' | 'resolved';
export type SalesFlagReportOutlet = 'all' | 'unilorin' | 'tanke';

export interface SalesFlagReportFilter {
  status: SalesFlagReportStatus;
  outlet: SalesFlagReportOutlet;
}

/**
 * Narrow a flag list to the rows an exported report should contain. Kept pure
 * and separate from the PDF/renderer so both the on-screen preview count and
 * the document body always agree on what "resolved, Tanke only" means.
 */
export function filterSalesFlags(
  flags: SalesFlag[],
  filter: SalesFlagReportFilter,
): SalesFlag[] {
  return flags.filter((flag) => {
    if (filter.status !== 'all' && flag.status !== filter.status) return false;
    if (filter.outlet !== 'all' && flag.outlet !== filter.outlet) return false;
    return true;
  });
}
