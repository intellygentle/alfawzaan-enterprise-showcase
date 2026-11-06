"use server";

import { ADMIN_PHONES } from "@/lib/constants";

export async function getPhoneNumbers(): Promise<Record<string, string>> {
  return ADMIN_PHONES;
}
