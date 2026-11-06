// app\actions\orderActions.ts
"use server";

import { createOrder } from "@/lib/archive/ledger";
import { getArchiveServer } from "@/lib/supabase/server";
import { generateWhatsAppLink } from "@/utils/whatsappLinkGenerator";
import { revalidatePath } from "next/cache";
import type { PlaceOrderInput } from "@/lib/types";
import { resolveActiveDiscount } from "@/lib/types";
import { ADMIN_PHONES } from "@/lib/constants";
import {
  GIFT_CREDIT_NAIRA,
  canonicalGiftCode,
  giftCreditPrice,
  giftOrderNote,
  isGiftEligibleProduct,
} from "@/lib/gifts";
import { getGiftCodeStatus } from "@/lib/archive/giftCodes";
import { ambassadorOrderNote, ambassadorPrice, canonicalAmbassadorCode } from "@/lib/ambassadors";
import { getAmbassadorByCode, resolveAmbassadorProductIds } from "@/lib/master/ambassadors";
import { recordAmbassadorRedemption } from "@/lib/archive/ambassadorRedemptions";
import {
  reserveStock,
  releaseReservation,
} from "@/lib/outlets/reservations";
import { getMasterServer, getOutletDB } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { clientIpFromHeaders, rateLimit } from "@/lib/rate-limit";

type PlaceOrderResult =
  | { success: true; orders: Array<{ id: string; outlet: string; total: number; itemCount: number }>; whatsappLinks: Array<{ outlet: string; url: string; phone: string; text: string; total: number; itemCount: number }>; message: string }
  | { success: false; message: string };

/** Max time for the entire placeOrder to complete — prevents hanging on slow Supabase */
const PLACE_ORDER_TIMEOUT_MS = 25_000;

/**
 * Place an order from the cart. Handles reservation, cleanup, and WhatsApp link generation.
 * Parallelizes reserveStock calls per outlet for speed, and has a hard timeout to
 * prevent hanging on transient Supabase slowdowns.
 */
export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  // ─── Overall timeout race ───
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error("Order is taking longer than expected. Please try again — your cart items are still available.")),
      PLACE_ORDER_TIMEOUT_MS
    )
  );

  async function doPlaceOrder() {
    if (!input.items.length) {
      throw new Error("Your cart is empty.");
    }
    if (input.items.length > 50) {
      throw new Error("Too many items in one order.");
    }

    // Abuse gate. Checkout is public by design, and every call writes to
    // Archive plus reserves stock, so a scripted loop burns the Supabase quota
    // the storefront shares. Counted per IP in process memory, which costs no
    // database reads; generous enough that a normal shopping session (1–2
    // calls, or a few more across both outlets) is never affected.
    const checkoutGate = rateLimit(
      `checkout:${clientIpFromHeaders(await headers())}`,
      30,
      10 * 60_000,
    );
    if (checkoutGate.limited) {
      throw new Error(
        `Too many orders have come from this connection. Please try again in about ${checkoutGate.retryAfterSeconds} seconds, or message us on WhatsApp.`,
      );
    }

    const validOutlets = new Set(["unilorin", "tanke"]);
    const productIds = [...new Set(input.items.map((item) => item.productId))];
    // Discount columns ride along so checkout charges the same price the
    // storefront displays during a sale window (migration 016 fields).
    const { data: products, error: productsError } = await getMasterServer()
      .from("products")
      .select("id, name, price, discount_price, discount_expires_at")
      .in("id", productIds);
    if (productsError) throw new Error(`Could not validate products: ${productsError.message}`);

    const productMap = new Map((products ?? []).map((product) => [product.id, product]));
    if (productMap.size !== productIds.length) {
      throw new Error("One or more products are no longer available.");
    }

    // ─── Gift-code claim (the QR printed on an Extravaganza receipt) ───
    // The code is validated here and normalised to its canonical ALF- form
    // BEFORE it reaches the ledger: getGiftCodeStatus, the order note, the
    // WhatsApp message and the audit entry all key on "ALF-XXXXXXXX", so
    // handing them the bare reference missed the gift_codes row and rejected a
    // live code as "not active yet". The credit always comes from
    // GIFT_CREDIT_NAIRA, never from the browser. claimGiftCode() in
    // lib/archive/giftCodes.ts is still the single redemption point for the
    // code itself — placing the order only announces the credit.
    const giftCode = input.giftCode ? canonicalGiftCode(input.giftCode) : null;
    if (input.giftCode && !giftCode) {
      throw new Error("That gift code is not valid.");
    }
    if (giftCode) {
      if (input.items.length !== 1) {
        throw new Error("A gift code can only be used on a single-product order.");
      }
      const status = await getGiftCodeStatus(giftCode);
      if (status !== "available") {
        throw new Error(
          status === "claimed"
            ? "This gift code has already been redeemed."
            : "This gift code is not active yet — it unlocks once the receipt that carries it is verified.",
        );
      }
    }

    // ─── Ambassador link (the QR printed on an ambassador's card) ───
    // Reusable and multi-item: every item in the global ambassador set is
    // charged the ambassador price, derived server-side from the product's
    // stored discount price (base + 1000 - 500) — never from the browser.
    // Mutually exclusive with a gift code, which is a different campaign.
    const ambassadorCode = input.ambassadorCode ? canonicalAmbassadorCode(input.ambassadorCode) : null;
    if (input.ambassadorCode && !ambassadorCode) {
      throw new Error("That ambassador link is not valid.");
    }
    if (ambassadorCode && giftCode) {
      throw new Error("Use either a gift code or an ambassador link — not both.");
    }
    let ambassador: Awaited<ReturnType<typeof getAmbassadorByCode>> = null;
    let ambassadorProductIds: Set<string> | null = null;
    if (ambassadorCode) {
      ambassador = await getAmbassadorByCode(ambassadorCode);
      if (!ambassador || !ambassador.is_active) {
        throw new Error("This ambassador link is no longer active.");
      }
      ambassadorProductIds = new Set(await resolveAmbassadorProductIds());
    }

    const normalizedItems = input.items.map((item) => {
      if (!validOutlets.has(item.outlet)) throw new Error("Invalid store selected.");
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100) {
        throw new Error("Each item quantity must be a positive whole number.");
      }
      if (item.grade !== "pending" && !["special", "extra", "normal"].includes(item.grade)) {
        throw new Error("Invalid product grade.");
      }

      const product = productMap.get(item.productId);
      // Authoritative price: the active discount when one is running
      // (positive, below normal, unexpired — the exact rule the storefront
      // display uses via resolveActiveDiscount), otherwise the normal price.
      // Browser-sent prices are never trusted (handoff §5.1).
      const activeDiscount = product ? resolveActiveDiscount(product) : null;
      const catalogUnitPrice = activeDiscount ? activeDiscount.discountPrice : Number(product?.price ?? 0);
      if (!Number.isFinite(catalogUnitPrice) || catalogUnitPrice < 0) {
        throw new Error(`Invalid price configured for ${product?.name ?? "a product"}.`);
      }

      const productName = product?.name ?? item.productName;
      // The gift credit applies to the qualifying FA 50ml line — the only item
      // a single-code order may contain. catalogUnitPrice is kept so the order
      // message can still show the representative the real price.
      const giftApplied = Boolean(giftCode) && isGiftEligibleProduct(productName);
      // Ambassador pricing applies to every item in the global ambassador set,
      // and only when it actually beats the price the customer would otherwise
      // pay (so the link never makes an item more expensive).
      const ambPrice = ambassadorProductIds?.has(item.productId)
        ? ambassadorPrice(Number(product?.price ?? 0), product?.discount_price ?? null)
        : null;
      const ambassadorApplied = ambPrice != null && ambPrice < catalogUnitPrice;
      const unitPrice = ambassadorApplied
        ? (ambPrice as number)
        : giftApplied
        ? giftCreditPrice(catalogUnitPrice)
        : catalogUnitPrice;

      return {
        ...item,
        productName,
        unitPrice,
        totalPrice: unitPrice * item.quantity,
        catalogUnitPrice,
        giftApplied,
        ambassadorApplied,
      };
    });

    if (giftCode && !normalizedItems.some((item) => item.giftApplied)) {
      throw new Error("That gift code only applies to the qualifying FA 50ml perfume.");
    }
    if (ambassadorCode && !normalizedItems.some((item) => item.ambassadorApplied)) {
      throw new Error("This ambassador link no longer has an active offer for these products.");
    }

    // Validate against a fresh outlet snapshot before creating any Archive row.
    // reserveStock repeats the check atomically, so this is a useful early error
    // while the reservation update remains the final concurrency boundary.
    for (const outlet of ["unilorin", "tanke"] as const) {
      const outletItems = normalizedItems.filter((item) => item.outlet === outlet);
      const ids = [...new Set(outletItems.map((item) => item.productId))];
      if (!ids.length) continue;
      const { data: inventory, error: inventoryError } = await getOutletDB(outlet)
        .from("inventory")
        .select("product_id, quantity, reserved_quantity")
        .in("product_id", ids);
      if (inventoryError) throw new Error(`Could not validate ${outlet} stock: ${inventoryError.message}`);

      for (const productId of ids) {
        const requested = outletItems
          .filter((item) => item.productId === productId)
          .reduce((sum, item) => sum + item.quantity, 0);
        const available = (inventory ?? [])
          .filter((row) => row.product_id === productId)
          .reduce(
            (largest, row) => Math.max(
              largest,
              Math.max(0, row.quantity - (row.reserved_quantity ?? 0)),
            ),
            0,
          );
        if (available < requested) {
          const product = productMap.get(productId);
          throw new Error(`${product?.name ?? "A product"} has only ${available} available at ${outlet}.`);
        }
      }
    }

    // The admin verifies orders by hand, so the claim has to survive on the
    // order itself: the note prints the code and the prices actually charged.
    const giftItem = normalizedItems.find((item) => item.giftApplied);
    const giftNote = giftCode && giftItem
      ? giftOrderNote({
          code: giftCode,
          originalPrice: giftItem.catalogUnitPrice,
          creditPrice: giftItem.unitPrice,
        })
      : null;
    const ambassadorDiscountTotal = normalizedItems.reduce(
      (sum, item) => sum + Math.max(0, item.catalogUnitPrice - item.unitPrice),
      0,
    );
    const ambassadorNote = ambassadorCode && ambassador
      ? ambassadorOrderNote(ambassadorCode, ambassador.name, ambassadorDiscountTotal)
      : null;
    const orderNotes = [input.notes?.trim(), giftNote, ambassadorNote].filter(Boolean).join(" · ") || undefined;

    const validatedInput = { ...input, items: normalizedItems };
    // ─── 1. Group items by outlet ───
    const groupedByOutlet = validatedInput.items.reduce((acc, item) => {
      if (!acc[item.outlet]) acc[item.outlet] = [];
      acc[item.outlet].push(item);
      return acc;
    }, {} as Record<string, typeof validatedInput.items>);

    const orders: Array<{ id: string; outlet: string; total: number; itemCount: number }> = [];
    const whatsappLinks: { outlet: string; url: string; phone: string; text: string; total: number; itemCount: number }[] = [];

    // Track created order IDs so we can clean them up if a later outlet fails
    const createdOrderIds: string[] = [];

    // Ambassador attribution, written only after every outlet has succeeded.
    const ambassadorRedemptions: Array<{ orderId: string; outlet: string; total: number; itemCount: number }> = [];

    // ─── 2. Process each outlet's order ───
    for (const [outlet, outletItems] of Object.entries(groupedByOutlet)) {
      const totalAmount = outletItems.reduce((sum, item) => sum + item.totalPrice, 0);
      const checkoutId = validatedInput.checkoutId
        ? `${validatedInput.checkoutId}:${outlet}`
        : undefined;

      // Create order in archive/ledger first to get the order ID
      const order = await createOrder(
        {
          customer_name: validatedInput.customerName,
          customer_phone: validatedInput.customerPhone || '',
          customer_email: validatedInput.customerEmail,
          outlet: outlet as "unilorin" | "tanke",
          total_amount: totalAmount,
          whatsapp_link: "",
          notes: orderNotes,
          checkout_id: checkoutId,
          receipt_requested: Boolean(validatedInput.receiptRequested),
          receipt_name: validatedInput.receiptRequested ? validatedInput.receiptName?.trim() : undefined,
        },
        outletItems.map((item) => ({
          product_id: item.productId,
          product_name: item.productName,
          grade: item.grade,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          total_price: item.totalPrice,
          outlet: item.outlet,
        }))
      );
      createdOrderIds.push(order.id);

      // ─── 2b. Reserve stock for ALL items in parallel ───
      // Items within the same outlet don't depend on each other, so parallel is safe.
      // The optimistic concurrency in reserveStock handles any rare same-product conflicts.
      const reserveResults = await Promise.all(
        outletItems.map((item) =>
          reserveStock(
            outlet as "unilorin" | "tanke",
            order.id,
            item.productId,
            item.quantity
          )
        )
      );

      // Check if any reservation failed
      const failedIndex = reserveResults.findIndex((r) => !r.success);
      if (failedIndex !== -1) {
        const failedItem = outletItems[failedIndex];
        // Release all reservations for THIS order and cancel it
        await Promise.all([
          releaseReservation(order.id),
          getArchiveServer()
            .from("orders")
            .update({ status: "cancelled", checkout_id: null })
            .eq("id", order.id),
        ]);

        // Also clean up ALL previously created orders (from other outlets)
        // so no orphaned orders with active reservations are left behind
        const previousOrderIds = createdOrderIds.filter(id => id !== order.id);
        await Promise.all(
          previousOrderIds.map(prevOrderId =>
            Promise.all([
              releaseReservation(prevOrderId),
              getArchiveServer()
                .from("orders")
                .update({ status: "cancelled", checkout_id: null })
                .eq("id", prevOrderId),
            ])
          )
        );

        return {
          success: false,
          message: `Sorry, ${failedItem.productName} is no longer available at ${outlet}. ${reserveResults[failedIndex].error || ""}`,
        };
      }

      // ─── 3. Generate WhatsApp link for this outlet ───
      // Item lines keep the REAL price (pre-credit): the discount block below
      // reconciles them down to what the customer actually pays, which is what
      // the representative needs to see for a discounted order.
      const cartItems = outletItems.map((item) => ({
        name: item.productName,
        price: item.catalogUnitPrice,
        quantity: item.quantity,
        location: item.outlet,
      }));

      const creditApplied = outletItems.reduce(
        (sum, item) => sum + Math.max(0, item.catalogUnitPrice - item.unitPrice),
        0,
      );
      const discountInfo = creditApplied > 0
        ? giftCode
          ? { code: giftCode, amount: creditApplied }
          : ambassadorCode
          ? { code: ambassadorCode, amount: creditApplied, title: "AMBASSADOR" }
          : undefined
        : undefined;
      const wa = generateWhatsAppLink(cartItems, ADMIN_PHONES[outlet], discountInfo);
      const whatsappUrl = wa.url;

      // Update order with WhatsApp link (fire-and-forget is fine — it's non-critical)
      await getArchiveServer()
        .from("orders")
        .update({ whatsapp_link: whatsappUrl })
        .eq("id", order.id);

      orders.push({
        id: order.id,
        outlet: outlet.charAt(0).toUpperCase() + outlet.slice(1),
        total: totalAmount,
        itemCount: outletItems.length,
      });

      if (ambassador) {
        ambassadorRedemptions.push({
          orderId: order.id,
          outlet,
          total: totalAmount,
          itemCount: outletItems.length,
        });
      }

      whatsappLinks.push({
        outlet: outlet.charAt(0).toUpperCase() + outlet.slice(1),
        url: whatsappUrl,
        phone: wa.phone,
        text: wa.text,
        total: totalAmount,
        itemCount: outletItems.length,
      });
    }

    // Record attribution now that every outlet succeeded — a partial failure
    // returned above and cancelled the earlier orders, so nothing stale lands
    // in the ledger. Best-effort: recordAmbassadorRedemption never throws.
    if (ambassador) {
      await Promise.all(
        ambassadorRedemptions.map((entry) =>
          recordAmbassadorRedemption({
            orderId: entry.orderId,
            code: ambassador!.code,
            outlet: entry.outlet,
            totalAmount: entry.total,
            itemCount: entry.itemCount,
          }),
        ),
      );
    }

    // Revalidate paths
    revalidatePath("/admin/dashboard");
    revalidatePath("/store");

    return {
      success: true,
      orders,
      whatsappLinks,
      message: `Order placed successfully across ${orders.length} store(s)`,
    };
  }

  try {
    return await Promise.race([doPlaceOrder(), timeoutPromise]) as PlaceOrderResult;
  } catch (error: any) {
    console.error("Order placement error:", error);
    // Give a helpful message instead of the raw "unexpected response" error
    const msg = error.message || "";
    if (msg.includes("timed out") || msg.includes("timeout") || msg.includes("taking longer")) {
      return {
        success: false,
        message: "The order server is busy. Please try again — your cart is still intact.",
      };
    }
    return {
      success: false,
      message: msg || "Failed to place order. Please try again.",
    };
  }
}
