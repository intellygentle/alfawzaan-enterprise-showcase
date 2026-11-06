import type { Grade, StockCheck } from './types';
export type { Grade, StockCheck };

/**
 * Validates if a specific shelf has stock.
 * Returns alternatives if the requested shelf is empty.
 */
export const validateShelfStock = (
  currentStock: StockCheck,
  requestedShelf: Grade,
  amount: number
) => {
  if (currentStock[requestedShelf] >= amount) {
    return { success: true, message: "Stock available", alternatives: [] as Grade[] };
  }

  const alternatives = (Object.entries(currentStock) as [Grade, number][])
    .filter(([shelf, qty]) => shelf !== requestedShelf && qty >= amount)
    .map(([shelf]) => shelf);

  return {
    success: false,
    message: `${requestedShelf} shelf has only ${currentStock[requestedShelf]} items.`,
    alternatives,
  };
};

/**
 * Finds the best alternative shelf when primary is empty.
 * Priority: Special -> Extra -> Normal
 */
export const suggestAlternative = (
  currentStock: StockCheck,
  amount: number
): Grade | null => {
  const grades: Grade[] = ['special', 'extra', 'normal'];
  return grades.find(g => currentStock[g] >= amount) ?? null;
};

