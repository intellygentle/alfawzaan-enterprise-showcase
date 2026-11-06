/** Narrow, ordered reads with a hard ceiling; never silently accept PostgREST's row cap. */
export async function readPulsePages<T>(
  read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  label: string,
  maxRows = 20_000,
  pageSize = 1_000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from <= maxRows; from += pageSize) {
    const { data, error } = await read(from, Math.min(from + pageSize - 1, maxRows));
    if (error) throw new Error(`Sales Pulse ${label}: ${error.message}`);
    if (!data) throw new Error(`Sales Pulse ${label}: no result returned.`);
    rows.push(...data);
    if (rows.length > maxRows) throw new Error(`Sales Pulse ${label} exceeds ${maxRows} rows. An aggregated history source is required.`);
    if (data.length < Math.min(pageSize, maxRows - from + 1)) return rows;
  }
  return rows;
}
