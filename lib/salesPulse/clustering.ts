import type { AgedStockItem, PromotionSegment, SalesPulseReport } from "./types";

const distance = (a: number[], b: number[]) => a.reduce((sum, value, i) => sum + (value - b[i]) ** 2, 0);

/**
 * Small, deterministic k-means fitted to this snapshot, entirely in-process.
 * Log transforms tame the value/quantity tail; z-scores put the four features
 * on comparable scales. Labels describe the learned groups, not a prediction
 * of sales or promotion uplift. No remote model, key, training upload or cost.
 */
export function categorizeStock(items: AgedStockItem[]): SalesPulseReport["model"] {
  const sample = items.filter((item) => item.stockValue > 0).sort((a, b) => a.key.localeCompare(b.key));
  const fallback = (): SalesPulseReport["model"] => {
    for (const item of items) {
      item.segment = item.valueBand === "A" ? "value-recovery"
        : item.availableUnits >= 6 && item.availableUnits > item.units90 * 2 ? "stock-heavy" : "rediscovery";
    }
    return { method: sample.length ? "rules" : "none", sampleSize: sample.length, clusterCount: 0 };
  };
  if (sample.length < 6) return fallback();

  const raw = sample.map((item) => [item.idleDays, item.stockValue, item.availableUnits, item.units90].map(Math.log1p));
  const means = raw[0].map((_, i) => raw.reduce((sum, vector) => sum + vector[i], 0) / raw.length);
  const scales = means.map((mean, i) => Math.sqrt(raw.reduce((sum, vector) => sum + (vector[i] - mean) ** 2, 0) / raw.length) || 1);
  const vectors = raw.map((vector) => vector.map((value, i) => (value - means[i]) / scales[i]));
  if (new Set(vectors.map((vector) => vector.join(","))).size < 3) return fallback();

  // Farthest-first seeding, with a stable catalogue key as the tie-breaker.
  let first = 0;
  for (let i = 1; i < sample.length; i++) if (sample[i].stockValue > sample[first].stockValue) first = i;
  let centers = [vectors[first]];
  while (centers.length < 3) {
    let next = 0;
    let farthest = -1;
    for (let i = 0; i < vectors.length; i++) {
      const nearest = Math.min(...centers.map((center) => distance(vectors[i], center)));
      if (nearest > farthest) { farthest = nearest; next = i; }
    }
    centers.push(vectors[next]);
  }

  let assignments: number[] = [];
  for (let iteration = 0; iteration < 40; iteration++) {
    const next = vectors.map((vector) => {
      let nearest = 0;
      for (let i = 1; i < centers.length; i++) if (distance(vector, centers[i]) < distance(vector, centers[nearest])) nearest = i;
      return nearest;
    });
    if (next.every((cluster, i) => cluster === assignments[i])) break;
    assignments = next;
    const groups = centers.map((_, cluster) => vectors.filter((_, i) => assignments[i] === cluster));
    if (groups.some((group) => group.length === 0)) return fallback();
    centers = groups.map((group) => group[0].map((_, feature) => group.reduce((sum, vector) => sum + vector[feature], 0) / group.length));
  }

  const groups = centers.map((_, cluster) => {
    const members = sample.filter((_, i) => assignments[i] === cluster);
    return {
      cluster,
      value: members.reduce((sum, item) => sum + item.stockValue, 0) / members.length,
      pressure: members.reduce((sum, item) => sum + item.availableUnits / (1 + item.units90), 0) / members.length,
    };
  });
  const highValue = [...groups].sort((a, b) => b.value - a.value || a.cluster - b.cluster)[0];
  const stockHeavy = groups.filter((group) => group !== highValue).sort((a, b) => b.pressure - a.pressure || a.cluster - b.cluster)[0];
  const names = new Map<number, PromotionSegment>(groups.map((group) => [
    group.cluster, group === highValue ? "value-recovery" : group === stockHeavy ? "stock-heavy" : "rediscovery",
  ]));
  sample.forEach((item, i) => { item.segment = names.get(assignments[i])!; });
  return { method: "kmeans", sampleSize: sample.length, clusterCount: 3 };
}
