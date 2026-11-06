import "server-only";

import { timingSafeEqual, createHmac } from "crypto";
import { cookies } from "next/headers";
import { getMasterServer } from "@/lib/supabase/server";
import type { RepresentativePermissions } from "@/lib/representatives";

const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function getSessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error("ADMIN_SESSION_SECRET is not configured.");
  }
  return secret;
}

function signatureFor(message: string): string {
  return createHmac("sha256", getSessionSecret()).update(message).digest("hex");
}

function signaturesMatch(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function validateTimestamp(timestamp: string): void {
  if (!/^\d+$/.test(timestamp)) throw new Error("Invalid session.");
  const createdAt = Number(timestamp);
  const age = Date.now() - createdAt;
  if (!Number.isSafeInteger(createdAt) || age < 0 || age > SESSION_MAX_AGE_MS) {
    throw new Error("Session expired. Please log in again.");
  }
}

export async function requireAdminSession(): Promise<void> {
  const cookie = (await cookies()).get("admin_session");
  if (!cookie?.value) throw new Error("Not authenticated. Please log in again.");

  const [timestamp, signature] = cookie.value.split(".");
  if (!timestamp || !signature) throw new Error("Invalid session. Please log in again.");
  validateTimestamp(timestamp);

  if (!signaturesMatch(signature, signatureFor(timestamp))) {
    throw new Error("Invalid session signature. Please log in again.");
  }
}

/**
 * Signature-and-expiry check for one session cookie value, with no DB read.
 * `hasPayload` distinguishes the rep cookie (timestamp.payload.signature) from
 * the admin cookie (timestamp.signature).
 */
function isSignedSessionValue(value: string | undefined, hasPayload: boolean): boolean {
  if (!value) return false;
  try {
    const parts = value.split(".");
    if (hasPayload ? parts.length !== 3 : parts.length !== 2) return false;

    const timestamp = parts[0];
    const signature = parts[parts.length - 1];
    const message = hasPayload ? `${timestamp}.${parts[1]}` : timestamp;

    validateTimestamp(timestamp);
    return signaturesMatch(signature, signatureFor(message));
  } catch {
    return false;
  }
}

/**
 * Cookie-only proof that SOME staff session exists (admin or representative).
 *
 * Why this exists: a "use server" module exposes EVERY export as a callable
 * HTTP endpoint, and the catalog/inventory/showcase modules are imported by
 * admin client components, so their mutations are reachable directly. The
 * action layer that normally calls them (app/admin/dashboard/actions.ts,
 * app/representative/actions.ts) already re-validates active status and
 * permissions; this inner guard only has to reject a caller with no signed
 * staff cookie.
 *
 * It deliberately does NOT read the database — an HMAC check is enough for
 * that job, so hardening these paths costs zero Supabase reads (the admin path
 * already passed a full check upstream, and an anonymous caller is rejected
 * before touching any data).
 */
export async function requireStaffSession(): Promise<void> {
  const cookieStore = await cookies();
  const staff =
    isSignedSessionValue(cookieStore.get("admin_session")?.value, false) ||
    isSignedSessionValue(cookieStore.get("rep_session")?.value, true);

  if (!staff) throw new Error("Not authenticated. Please log in again.");
}

export interface VerifiedRepresentativeSession {
  id: string;
  name: string;
  outlet: "unilorin" | "tanke";
  permissions: RepresentativePermissions;
}

export async function requireRepresentativeSession(): Promise<VerifiedRepresentativeSession> {
  const cookie = (await cookies()).get("rep_session");
  if (!cookie?.value) throw new Error("Not authenticated. Please log in again.");

  const parts = cookie.value.split(".");
  if (parts.length !== 3) throw new Error("Invalid session. Please log in again.");

  const [timestamp, payloadBase64, signature] = parts;
  validateTimestamp(timestamp);
  const payload = Buffer.from(payloadBase64, "base64url").toString("utf8");
  if (!signaturesMatch(signature, signatureFor(`${timestamp}.${payload}`))) {
    throw new Error("Invalid session signature. Please log in again.");
  }

  let session: { id?: string };
  try {
    session = JSON.parse(payload) as { id?: string };
  } catch {
    throw new Error("Invalid session. Please log in again.");
  }
  if (!session.id) throw new Error("Invalid session. Please log in again.");

  const { data: rep, error } = await getMasterServer()
    .from("representatives")
    .select("id, display_name, outlet, permissions, is_active")
    .eq("id", session.id)
    .maybeSingle();

  if (error || !rep || !rep.is_active) {
    throw new Error("Representative account is inactive or no longer exists.");
  }

  return {
    id: rep.id,
    name: rep.display_name,
    outlet: rep.outlet,
    permissions: rep.permissions as RepresentativePermissions,
  };
}

export function requirePermission(
  permissions: RepresentativePermissions,
  permission: keyof RepresentativePermissions,
): void {
  if (!permissions[permission]) throw new Error(`Permission denied: ${permission}`);
}
