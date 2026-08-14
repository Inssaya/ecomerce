"use client";

/**
 * One order, in full — replaces the side drawer.
 *
 * A drawer suited reading six lines and moving a status. This order also
 * shows what the buyer picked (attributes, a name on the piece), a promise
 * that can move, and an invoice to print — enough that the record needed the
 * room a centred popup gives it, the same shape `ProductPopup` uses.
 */
import { useState } from "react";
import Image from "next/image";

import { api, type AdminOrder } from "@/lib/console/api";
import { NEXT_ORDER_STATUSES } from "@/lib/console/types";
import { useMutation } from "@/lib/console/query";
import { statusLabel } from "@/lib/i18n";

import { Button, LinkButton, Money, Pill, Popup, Text, useConfirm } from "../ui/primitives";
import { HEAVY_ORDER_MOVES, ORDER_MOVE_MEANS, orderTone } from "../ui/status";

/** "Width: 10 cm", "Red", or their name — however the line reads best. */
function pickLabel(pick: NonNullable<AdminOrder["items"][number]["selection"]>[number]): string {
  return pick.name ? `${pick.name}: ${pick.value}` : pick.value;
}

function daysLeft(promisedFor: string): number {
  return Math.ceil((new Date(promisedFor).getTime() - Date.now()) / 86_400_000);
}

export function OrderPopup({
  order,
  onClose,
  onChanged,
}: {
  order: AdminOrder;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { mutate, busy, problem } = useMutation();
  const confirm = useConfirm();
  const [promiseDraft, setPromiseDraft] = useState(order.promised_for ?? "");

  const moves = NEXT_ORDER_STATUSES[order.status] ?? [];
  const promiseDirty = promiseDraft !== (order.promised_for ?? "");

  function move(next: string) {
    const label = statusLabel("en", "orderStatus", next);
    const run = () =>
      mutate(() => api.moveOrder(order.reference, next), { invalidates: ["orderMoved"], onDone: onChanged });

    if (HEAVY_ORDER_MOVES.has(next)) {
      confirm({
        title: `Move ${order.reference} to ${label}?`,
        body: (
          <>
            This {ORDER_MOVE_MEANS[next] ?? "changes the order"} — {order.customer_name} is told automatically by
            email and WhatsApp. It cannot be undone.
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

  const printInvoice = () => window.print();

  return (
    <Popup
      open
      title={<span className="console-num">{order.reference}</span>}
      sub={
        <>
          <Text>{order.customer_name}</Text> · {order.city} ·{" "}
          <Pill tone={order.has_account ? "brand" : "neutral"}>{order.has_account ? "Verified" : "Guest"}</Pill>
        </>
      }
      width={880}
      onClose={onClose}
      actions={
        <>
          {moves.map((next) => (
            <Button key={next} variant={HEAVY_ORDER_MOVES.has(next) ? "default" : "primary"} disabled={busy} onClick={() => move(next)}>
              {statusLabel("en", "orderStatus", next)}
            </Button>
          ))}
          {moves.length === 0 ? <Pill tone={orderTone(order.status)}>{statusLabel("en", "orderStatus", order.status)}</Pill> : null}
          <Button size="sm" onClick={printInvoice}>
            Print invoice
          </Button>
          {order.hidden ? (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void mutate(() => api.unhideOrder(order.reference), { invalidates: ["orderChanged"], onDone: onChanged })}
            >
              Restore
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                confirm({
                  title: `Archive order ${order.reference}?`,
                  body: "It leaves the working queue. You can bring it back from the Hidden view.",
                  confirmLabel: "Archive it",
                  danger: true,
                  onConfirm: () =>
                    mutate(() => api.hideOrder(order.reference), { invalidates: ["orderChanged"], onDone: onChanged }),
                })
              }
            >
              Archive
            </Button>
          )}
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
        {order.customer_email ? (
          <LinkButton href={`mailto:${order.customer_email}`} icon="external" size="sm">
            {order.customer_email}
          </LinkButton>
        ) : null}
        {order.tracking_token ? (
          <LinkButton href={`/en/track/${order.tracking_token}`} target="_blank" rel="noreferrer" icon="external" size="sm">
            What the customer sees
          </LinkButton>
        ) : null}
      </div>

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
        <p className="console-caps">Delivery promise</p>
        <div className="console-row" style={{ gap: "var(--space-2)" }}>
          <input
            type="date"
            className="console-date"
            value={promiseDraft}
            onChange={(event) => setPromiseDraft(event.target.value)}
            aria-label="Promised for"
          />
          {order.promised_for ? (
            (() => {
              const left = daysLeft(order.promised_for);
              return left < 0 ? (
                <Pill tone="danger">{Math.abs(left)}d overdue</Pill>
              ) : left === 0 ? (
                <Pill tone="warning">today</Pill>
              ) : (
                <span className="console-num">{left}d left</span>
              );
            })()
          ) : (
            <span className="console-muted">No promise set yet.</span>
          )}
          <Button
            size="sm"
            disabled={busy || !promiseDirty || !promiseDraft}
            onClick={() =>
              void mutate(() => api.setOrderPromise(order.reference, promiseDraft), {
                invalidates: ["orderChanged"],
                onDone: onChanged,
              })
            }
          >
            Save
          </Button>
        </div>
      </section>

      <section className="console-stack-sm">
        <p className="console-caps">What to pack</p>
        {order.items.length === 0 ? (
          <p className="console-muted">No items recorded on this order.</p>
        ) : (
          <ul className="console-stack-sm">
            {order.items.map((item, index) => (
              <li key={index} className="console-row" style={{ gap: 10, flexWrap: "nowrap", alignItems: "flex-start" }}>
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
                    {[item.category, item.subcategory].filter(Boolean).join(" · ") || "no category"}
                  </span>
                  {item.piece_label || item.variant_label ? (
                    <span className="console-cell-sub" style={{ display: "block" }}>
                      {[item.piece_label, item.variant_label].filter(Boolean).join(" · ")}
                    </span>
                  ) : null}
                  {item.selection && item.selection.length > 0 ? (
                    <span className="console-spec" style={{ marginTop: 4 }}>
                      {item.selection.map((pick, pickIndex) => (
                        <span key={pickIndex} className="console-chip" style={{ padding: "2px 8px", fontSize: "var(--t-xs)" }}>
                          {pick.hex ? <span className="console-swatch" style={{ background: pick.hex }} aria-hidden /> : null}
                          {pickLabel(pick)}
                        </span>
                      ))}
                    </span>
                  ) : null}
                  {item.personalization ? (
                    <p className="console-note brand" style={{ marginTop: 4 }}>
                      Personalised: “{item.personalization}”
                    </p>
                  ) : null}
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
                <span className="console-muted"> · {event.actor === "workshop" ? "you" : event.actor}</span>
              </span>
              <time className="console-num console-muted" dateTime={event.created_at}>
                {new Date(event.created_at).toLocaleString()}
              </time>
            </li>
          ))}
        </ul>
      </section>

      <p className="console-muted">The customer is told automatically on every status change.</p>

      <Invoice order={order} />
    </Popup>
  );
}

/**
 * Printed, not screened — see `console.css`'s `.console-invoice-sheet` rule.
 * Always in the DOM so `window.print()` has something to print without a
 * new tab or a server-rendered PDF; hidden on screen either way.
 */
function Invoice({ order }: { order: AdminOrder }) {
  return (
    <div className="console-invoice-sheet">
      <h1>M-Style — Invoice {order.reference}</h1>
      <p className="console-invoice-meta">
        {new Date(order.created_at).toLocaleDateString()} · {order.customer_name} · {order.customer_phone} ·{" "}
        {order.address?.line1}, {order.city}
      </p>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Unit</th>
            <th>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item, index) => (
            <tr key={index}>
              <td>
                {item.title}
                {item.selection && item.selection.length > 0
                  ? ` — ${item.selection.map(pickLabel).join(", ")}`
                  : ""}
                {item.personalization ? ` — "${item.personalization}"` : ""}
              </td>
              <td>{item.quantity}</td>
              <td>{Math.round(item.unit_price)} MAD</td>
              <td>{Math.round(item.subtotal)} MAD</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="console-invoice-totals">
        <div>
          <span>Items</span>
          <span>{Math.round(order.subtotal)} MAD</span>
        </div>
        <div>
          <span>Delivery</span>
          <span>{Math.round(order.delivery_fee)} MAD</span>
        </div>
        <div className="total">
          <span>Total</span>
          <span>{Math.round(order.total)} MAD</span>
        </div>
      </div>
    </div>
  );
}
