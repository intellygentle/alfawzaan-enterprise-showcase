// app/actions/getCategories.ts
"use server";

import { getAllCategories } from "@/lib/master/categories";

/**
 * Fetch all categories from the DB for client-side use.
 * Returns an array of { name, slug } objects.
 */
export async function fetchCategories() {
  const categories = await getAllCategories();
  return categories.map((c) => ({ name: c.name, slug: c.slug }));
}


