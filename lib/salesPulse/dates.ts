const DAY_MS = 86_400_000;
const LAGOS_DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit",
});

/** Date arithmetic is always on the boutiques' calendar, not the server's timezone. */
export function lagosDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid Sales Pulse date.");
  const parts = LAGOS_DATE_FORMAT.formatToParts(date);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function shiftDate(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export function calendarDays(from: string, to: string): number {
  return Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS));
}

export function lagosMidnight(date: string): string {
  return new Date(`${date}T00:00:00+01:00`).toISOString();
}

export function formatPulseDate(date: string, weekday = false): string {
  return new Date(`${date.slice(0, 10)}T12:00:00+01:00`).toLocaleDateString("en-GB", {
    timeZone: "Africa/Lagos", day: "numeric", month: "short", year: "numeric",
    ...(weekday ? { weekday: "short" as const } : {}),
  });
}

export function formatPulseTimestamp(value: string): string {
  return new Date(value).toLocaleString("en-GB", {
    timeZone: "Africa/Lagos", day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
