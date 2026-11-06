"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { clientIpFromHeaders, rateLimit } from "@/lib/rate-limit";
import { getArchiveServer } from "@/lib/supabase/server";
import {
  createDeliveryRequest,
  getDeliveryRequestsByPhone,
  getApprovedRequestsByArea,
  getAllApprovedRequests,
  getDeliveryRequestsByOrderIds,
  createDeliveryPairWithRequests,
} from "@/lib/archive/delivery";

/**
 * Every export here is reachable by an anonymous visitor — /delivery is a public
 * page. These gates cap how fast a script can use them, counted per IP in
 * process memory so they add no Supabase reads. Limits are set for real people:
 * one lookup or request at a time, a handful per session.
 */
async function deliveryGate(scope: string, limit: number, windowMs: number) {
  const ip = clientIpFromHeaders(await headers());
  const { limited, retryAfterSeconds } = rateLimit(`delivery:${scope}:${ip}`, limit, windowMs);
  return { limited, message: `Too many requests. Please try again in about ${retryAfterSeconds} seconds.` };
}

// ─── LOOKUP ORDERS BY PHONE ───

export async function lookupOrdersByPhone(phoneNumber: string) {
  if (!phoneNumber || phoneNumber.trim().length < 5) {
    return { success: false, message: "Please enter a valid phone number.", orders: [] };
  }

  // This is also the one endpoint that can enumerate a customer's orders from a
  // phone number alone, so it is the tightest of the delivery limits.
  const gate = await deliveryGate("lookup", 12, 10 * 60_000);
  if (gate.limited) {
    return { success: false, message: gate.message, orders: [], deliveryRequests: [] };
  }

  const phone = phoneNumber.trim();

  // Find orders matching this phone. Bounded: this runs anonymously, so an
  // uncapped select both dumps a customer's whole order history to anyone who
  // knows the number and lets a script pull the table in 1,000-row pages.
  const { data: orders, error } = await getArchiveServer()
    .from("orders")
    .select("id, customer_name, customer_phone, status, outlet, total_amount, created_at, order_items(*)")
    .eq("customer_phone", phone)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw error;
  if (!orders || orders.length === 0) {
    return { success: true, orders: [], deliveryRequests: [], message: "No orders found for this phone number." };
  }

  // Fetch existing delivery requests for these orders
  const orderIds = orders.map((o) => o.id);
  const deliveryRequests = await getDeliveryRequestsByOrderIds(orderIds);

  return {
    success: true,
    orders,
    deliveryRequests,
  };
}

// ─── SUBMIT DELIVERY REQUEST ───

export async function submitDeliveryRequest(
  orderId: string,
  phoneNumber: string,
  address: string,
  area: string,
  preferredTime?: string,
  notes?: string
) {
  const gate = await deliveryGate("submit", 8, 30 * 60_000);
  if (gate.limited) return { success: false, message: gate.message };

  // Validate order exists and is in correct status
  const { data: order, error: orderError } = await getArchiveServer()
    .from("orders")
    .select("id, status, customer_phone")
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    return { success: false, message: "Order not found." };
  }

  if (order.status !== "paid" && order.status !== "shipping") {
    return {
      success: false,
      message: `Delivery can only be requested for paid or shipping orders. This order is "${order.status}".`,
    };
  }

  // Check if a delivery request already exists for this order
  const { data: existing } = await getArchiveServer()
    .from("delivery_requests")
    .select("id")
    .eq("order_id", orderId)
    .not("status", "eq", "rejected")
    .maybeSingle();

  if (existing) {
    return { success: false, message: "A delivery request already exists for this order." };
  }

  // Create the delivery request
  const request = await createDeliveryRequest(phoneNumber, address, area, orderId, preferredTime, notes);

  revalidatePath("/delivery");
  revalidatePath("/admin/dashboard");

  return { success: true, request, message: "Delivery request submitted successfully!" };
}

// ─── SUBMIT STANDALONE DELIVERY REQUEST (no order required) ───

export async function submitStandaloneDeliveryRequest(
  phoneNumber: string,
  address: string,
  area: string,
  preferredTime?: string,
  notes?: string
) {
  if (!phoneNumber || phoneNumber.trim().length < 5) {
    return { success: false, message: "Please enter a valid phone number." };
  }
  if (!address || address.trim().length < 3) {
    return { success: false, message: "Please enter a valid address." };
  }
  if (!area || area.trim().length < 2) {
    return { success: false, message: "Please select an area." };
  }

  const gate = await deliveryGate("submit", 8, 30 * 60_000);
  if (gate.limited) return { success: false, message: gate.message };

  const request = await createDeliveryRequest(
    phoneNumber.trim(),
    address.trim(),
    area.trim(),
    undefined,
    preferredTime?.trim() || undefined,
    notes?.trim() || undefined
  );

  revalidatePath("/delivery");
  revalidatePath("/admin/dashboard");

  return { success: true, request, message: "Delivery request submitted! An admin will review it shortly." };
}

// ─── GET ALL APPROVED REQUESTS ───

export async function getApprovedDeliveryRequests() {
  const gate = await deliveryGate("list", 30, 10 * 60_000);
  if (gate.limited) return { success: false, requests: [], message: gate.message };

  const requests = await getAllApprovedRequests();
  return { success: true, requests };
}

// ─── BROWSE PEER DELIVERY REQUESTS ───

export async function browsePendingRequestsInArea(area: string, excludeRequestId?: string) {
  if (!area || area.trim().length < 2) {
    return { success: false, requests: [], message: "Please provide an area name." };
  }

  const gate = await deliveryGate("list", 30, 10 * 60_000);
  if (gate.limited) return { success: false, requests: [], message: gate.message };

  // Only show admin-approved requests for peer pairing
  const requests = await getApprovedRequestsByArea(area.trim(), excludeRequestId);

  return { success: true, requests };
}

// ─── REQUEST PAIR WITH ANOTHER DELIVERY ───

export async function requestPairWith(
  myRequestId: string,
  otherRequestId: string
) {
  const gate = await deliveryGate("pair", 15, 10 * 60_000);
  if (gate.limited) return { success: false, message: gate.message };

  // Validate both requests exist and are pending
  const archive = getArchiveServer();

  const { data: myReq, error: myError } = await archive
    .from("delivery_requests")
    .select("id, order_id, area, status, phone_number")
    .eq("id", myRequestId)
    .single();

  const { data: otherReq, error: otherError } = await archive
    .from("delivery_requests")
    .select("id, order_id, area, status")
    .eq("id", otherRequestId)
    .single();

  if (myError || !myReq) {
    return { success: false, message: "Your delivery request not found." };
  }
  if (otherError || !otherReq) {
    return { success: false, message: "The selected delivery request was not found." };
  }

  // Visitor's own request can be pending (just submitted) or already approved
  if (myReq.status !== "pending" && myReq.status !== "approved") {
    return { success: false, message: "Your delivery request is no longer active." };
  }
  // The other request must be admin-approved to be available for pairing
  if (otherReq.status !== "approved") {
    return { success: false, message: "That delivery request is not available for pairing." };
  }

  if (myReq.area.toLowerCase() !== otherReq.area.toLowerCase()) {
    return { success: false, message: "Both delivery requests must be in the same area to pair." };
  }

  if (!myReq.order_id || !otherReq.order_id) {
    return { success: false, message: "Peer pairing requires both requests to be linked to orders." };
  }

  // Check if a pair already exists between these two requests
  const { data: existingPair } = await archive
    .from("delivery_pairs")
    .select("id")
    .or(
      `and(delivery_request_id_1.eq.${myRequestId},delivery_request_id_2.eq.${otherRequestId}),and(delivery_request_id_1.eq.${otherRequestId},delivery_request_id_2.eq.${myRequestId})`
    )
    .maybeSingle();

  if (existingPair) {
    return { success: false, message: "A pairing request already exists between these deliveries." };
  }

  // Create the pair
  const pair = await createDeliveryPairWithRequests(
    myReq.order_id,
    otherReq.order_id,
    myReq.area,
    myRequestId,
    otherRequestId
  );

  revalidatePath("/delivery");
  revalidatePath("/admin/dashboard");

  return { success: true, pair, message: "Pairing request sent! An admin will review and approve." };
}
