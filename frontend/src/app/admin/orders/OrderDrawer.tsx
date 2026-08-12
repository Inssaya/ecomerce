"use client";

/**
 * One order, over the list.
 *
 * The actions live at the top. In the old panel they sat below the item list
 * and the event log, which meant on a six-item order the thing you opened the
 * row to do was off-screen by the time it appeared.
 */
import Image from "next/image";

import { api, type AdminOrder } from "@/lib/console/api";
import { useMutation } from "@/lib/console/query";
import { statusLabel } from "@/lib/i18n";

import { Button, Drawer, LinkButton, Money, Pill, Text } from "../ui/primitives";
import { HEAVY_ORDER_MOVES, ORDER_MOVE_MEANS, orderTone } from "../ui/status";
import { NEXT_ORDER_STATUSES } from "@/lib/console/types";
import { useConfirm } from "../ui/primitives";

export function OrderDrawer({
  order,
  onClose,
  onMoved,
}: {
  order: AdminOrder;
  onClose: () => void;
  onMoved: () => void;
}) {
  const { mutate, busy, problem } = useMutation();
  const confirm = useConfirm();

  const moves = NEXT_ORDER_STATUSES[order.status] ?? [];

  function move(next: string) {
    const label = statusLabel("en", "orderStatus", next);
    const run = () =>
      mutate(() => api.moveOrder(order.reference, next), { invalidates: ["orderMoved"], onDone: onMoved });

    // A move that ends the line, or that sends the customer something they
    // cannot un-read, gets a sentence naming the consequence first.
    if (HEAVY_ORDER_MOVES.has(next)) {
      confirm({
        title: `Move ${order.reference} to ${label}?`,
        body: (
          <>
            This {ORDER_MOVE_MEANS[next] ?? "changes the order"} — {order.customer_name} is told automatically by email
            and WhatsApp. It cannot be undone.
          </>
        ),
        confirmLabel: label,
        danger: next !== "delivered",
        onConfirm: run,
      });
      return;
    }
    void run();
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={<span className="console-num">{order.reference}</span>}
      sub={
        <>
          <Text>{order.customer_name}</Text> · {order.city}
        </>
      }
      actions={
        <>
          {moves.map((next) => (
            <Button
              key={next}
              variant={HEAVY_ORDER_MOVES.has(next) ? "default" : "primary"}
              disabled={busy}
              onClick={() => move(next)}
            >
              {statusLabel("en", "orderStatus", next)}
            </Button>
          ))}
          {moves.length === 0 ? <Pill tone={orderTone(order.status)}>{statusLabel("en", "orderStatus", order.status)}</Pill> : null}
        </>
      }
    >
      {problem ? <p className="console-error">{problem}</p> : null}

      <div className="console-row">
        <LinkButton href={`tel:${order.customer_phone}`} icon="phone">
          {order.customer_phone}
        </LinkButton>
        {order.whatsapp_url ? (
          <LinkButton href={order.whatsapp_url} target="_blank" rel="noreferrer" icon="whatsapp">
            WhatsApp
          </LinkButton>
        ) : null}
        {order.tracking_token ? (
          <LinkButton href={`/en/track/${order.tracking_token}`} target="_blank" rel="noreferrer" icon="external" size="sm">
            What the customer sees
          </LinkButton>
        ) : null}
      </div>

      {/* The delivery note is how the courier finds the door — it was the
          lowest-contrast text on the old card. */}
      <section className="console-stack-sm">
        <p className="console-caps">Where it goes</p>
        <p style={{ fontSize: "var(--t-md)", lineHeight: 1.6 }}>
          <Text>{order.address?.line1}</Text>
          <br />
          <Text>{order.address?.city ?? order.city}</Text>
        </p>
        {order.address?.notes ? (
          <p className="console-note brand">
            <Text>{order.address.notes}</Text>
          </p>
        ) : null}
      </section>

      <section className="console-stack-sm">
        <p className="console-caps">What to pack</p>
        {order.items.length === 0 ? (
          <p className="console-muted">No items recorded on this order.</p>
        ) : (
          <ul className="console-stack-sm">
            {order.items.map((item, index) => (
              <li key={index} className="console-row" style={{ gap: 10, flexWrap: "nowrap" }}>
                <span
                  style={{
                    position: "relative",
                    width: 44,
                    height: 44,
                    flex: "none",
                    borderRadius: "var(--r-sm)",
                    overflow: "hidden",
                    background: "var(--bg2)",
                  }}
                >
                  {item.image_url ? <Image src={item.image_url} alt="" fill sizes="44px" style={{ objectFit: "cover" }} /> : null}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <Text className="console-strong">{item.title}</Text>
                  <span className="console-cell-sub" style={{ display: "block" }}>
                    {item.piece_label ? `${item.piece_label} · ` : ""}
                    {item.variant_label || "one option"}
                  </span>
                </span>
                <span style={{ flex: "none", textAlign: "end" }}>
                  <span className="console-num" style={{ display: "block" }}>
                    {item.quantity > 1 ? `${item.quantity} × ` : ""}
                    <Money value={item.unit_price} />
                  </span>
                  <span className="console-cell-sub">
                    <Money value={item.subtotal} />
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Subtotal → delivery → total, so the arithmetic visibly closes. */}
      <section className="console-stack-sm">
        <div className="console-row-between">
          <span className="console-muted">Items</span>
          <Money value={order.subtotal} />
        </div>
        <div className="console-row-between">
          <span className="console-muted">Delivery</span>
          <Money value={order.delivery_fee} />
        </div>
        <div className="console-row-between console-strong" style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
          <span>Total</span>
          <Money value={order.total} />
        </div>
      </section>

      <section className="console-stack-sm">
        <p className="console-caps">What happened</p>
        <ul className="console-stack-sm">
          {order.events.map((event, index) => (
            <li key={index} className="console-row-between" style={{ fontSize: "var(--t-sm)" }}>
              <span>
                {statusLabel("en", "orderStatus", event.status)}
                {/* The 48-hour sweep is not the owner — say which it was. */}
                <span className="console-muted"> · {event.actor === "workshop" ? "you" : event.actor}</span>
              </span>
              <time className="console-num console-muted" dateTime={event.created_at}>
                {new Date(event.created_at).toLocaleString()}
              </time>
            </li>
          ))}
        </ul>
      </section>

      <p className="console-muted">The customer is told automatically on every change.</p>
    </Drawer>
  );
}
