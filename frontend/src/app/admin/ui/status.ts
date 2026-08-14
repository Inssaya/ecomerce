import type { Tone } from "./primitives";

/**
 * Where each status lands on the pill palette — grouped by what it means to
 * the owner, not by the raw string. "Delivered" and "confirmed" are both good
 * news; "cancelled", "failed" and "returned" all mean the money did not land.
 */
const ORDER_TONE: Record<string, Tone> = {
  placed: "info",
  confirmed: "brand",
  preparing: "brand",
  ready: "brand",
  out_for_delivery: "brand",
  delivered: "success",
  cancelled: "neutral",
  failed: "danger",
  returned: "warning",
};

const REQUEST_TONE: Record<string, Tone> = {
  requested: "info",
  quoted: "brand",
  approved: "brand",
  in_production: "brand",
  ready: "brand",
  delivered: "success",
  declined: "neutral",
  withdrawn: "neutral",
};

/** A status the client has never heard of still gets a readable pill. */
export function orderTone(status: string): Tone {
  return ORDER_TONE[status] ?? "neutral";
}

export function requestTone(status: string): Tone {
  return REQUEST_TONE[status] ?? "neutral";
}

/** Moves that end the line or tell the customer something irreversible. */
export const HEAVY_ORDER_MOVES = new Set(["delivered", "cancelled", "failed", "returned"]);
export const HEAVY_REQUEST_MOVES = new Set(["declined", "withdrawn", "delivered"]);

/** What the customer is told when an order moves — named in the confirm. */
export const ORDER_MOVE_MEANS: Record<string, string> = {
  confirmed: "tells them the order is confirmed",
  preparing: "tells them you have started making it",
  ready: "tells them it is finished",
  out_for_delivery: "tells them it is on its way",
  delivered: "tells them it was delivered",
  cancelled: "tells them the order was cancelled",
  failed: "records that it could not be handed over",
  returned: "records that it came back to the workshop",
};
