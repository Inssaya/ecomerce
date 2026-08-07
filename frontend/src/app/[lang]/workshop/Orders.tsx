"use client";

/**
 * The owner's morning.
 *
 * Until this screen existed, an order placed on the site could be taken, paid
 * for and never moved — the endpoints were all there and tested, but the only
 * way to reach them was curl, and the person who has to reach them is standing
 * in a workshop holding a phone. This is the most important screen in the
 * panel for that reason alone.
 *
 * Three decisions shape it:
 *
 * 1. **One button per legal move, and no others.** The transitions are a
 *    mirror of the server's table, so nothing is offered that will fail. A
 *    delivered order shows no buttons at all, because it is finished.
 * 2. **The phone number is the first thing after the name.** Every order here
 *    is cash on delivery, which means every order involves a phone call before
 *    a courier is paid. Tapping it dials; the WhatsApp link opens the thread.
 * 3. **Moving an order tells the customer.** The server sends that, not this
 *    screen — but the owner should know it happened, so the button says what
 *    the customer will see rather than naming a database state.
 */
import { useCallback, useEffect, useState } from "react";

import { admin, NEXT_STATUSES, NotSignedIn, type AdminOrder } from "@/lib/admin";
import { type Lang, money, statusLabel } from "@/lib/i18n";

/** The states worth filtering by, in the order the work happens. */
const FILTERS = [
  ["", "All", "الكل"],
  ["placed", "New", "جديد"],
  ["confirmed", "Confirmed", "مؤكَّد"],
  ["preparing", "Being made", "قيد الصنع"],
  ["ready", "Finished", "جاهز"],
  ["out_for_delivery", "On its way", "في الطريق"],
  ["delivered", "Delivered", "سُلّم"],
] as const;

export function Orders({ lang, onExpire }: { lang: Lang; onExpire: () => void }) {
  const ar = lang === "ar";
  const [filter, setFilter] = useState<string>("");
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setOrders(await admin.orders(lang, filter || undefined));
    } catch (error) {
      if (error instanceof NotSignedIn) onExpire();
      else setProblem(ar ? "تعذّر التحميل" : "Could not load");
    }
    // `onExpire` is a fresh function each render; depending on it would reload
    // the list constantly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, filter]);

  useEffect(() => {
    setOrders(null);
    void load();
  }, [load]);

  async function move(reference: string, status: string) {
    setBusy(reference);
    setProblem(null);
    try {
      await admin.moveOrder(lang, reference, status);
      await load();
    } catch (error) {
      if (error instanceof NotSignedIn) onExpire();
      // The server is the authority on transitions; if it refuses, say so
      // rather than leaving a button that silently did nothing.
      else setProblem(ar ? "لم يقبل الخادم هذا الانتقال" : "The server refused that move");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map(([value, en, arabic]) => (
          <button
            key={value || "all"}
            type="button"
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
            // The chips and the action buttons share their labels — "Confirmed"
            // is both a state to filter by and a move to make. On screen the
            // two are obviously different things; read aloud they are the same
            // word twice, and one of them changes a customer's order. The
            // accessible name says which is which.
            aria-label={ar ? `أظهر: ${arabic}` : `Show ${en.toLowerCase()} orders`}
            className={`tap shrink-0 rounded-2xl px-4 text-[13px] font-medium transition-colors duration-gentle ${
              filter === value ? "bg-clay text-white" : "bg-clay-soft text-ink"
            }`}
          >
            {ar ? arabic : en}
          </button>
        ))}
      </div>

      {problem ? <p className="text-[13px] text-warn">{problem}</p> : null}

      {orders === null ? (
        <div className="h-32" aria-hidden />
      ) : orders.length === 0 ? (
        <p className="text-[14px] text-ink-soft">{ar ? "لا شيء هنا." : "Nothing here."}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((order) => (
            <li key={order.reference} className="card p-4 shadow-soft">
              <button
                type="button"
                onClick={() => setOpen(open === order.reference ? null : order.reference)}
                aria-expanded={open === order.reference}
                className="w-full text-start"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="stamp text-[15px] font-semibold">{order.reference}</span>
                  <span className="stamp text-[15px] font-semibold tabular-nums">
                    {money(order.total, lang)}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="text-ink-soft">
                    {order.customer_name} · {order.city}
                  </span>
                  <span className="font-medium text-clay">
                    {statusLabel(lang, "orderStatus", order.status)}
                  </span>
                </div>
              </button>

              {open === order.reference ? (
                <div className="mt-4 flex flex-col gap-4 border-t border-sand pt-4">
                  {/* Cash on delivery means a phone call before a courier is
                      paid, so the number is a tap, not text to copy. */}
                  <div className="flex flex-wrap gap-2">
                    <a href={`tel:${order.customer_phone}`} className="btn-quiet">
                      {order.customer_phone}
                    </a>
                    {order.whatsapp_url ? (
                      <a
                        href={order.whatsapp_url}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-quiet"
                      >
                        WhatsApp
                      </a>
                    ) : null}
                  </div>

                  <div className="text-[14px] leading-relaxed">
                    <p className="text-ink-soft">{ar ? "العنوان" : "Address"}</p>
                    <p>{order.address?.line1}</p>
                    <p>{order.address?.city}</p>
                    {order.address?.notes ? (
                      <p className="mt-1 text-ink-soft">{order.address.notes}</p>
                    ) : null}
                  </div>

                  <ul className="flex flex-col gap-1.5 text-[14px]">
                    {order.items.map((item, index) => (
                      <li key={index} className="flex items-baseline justify-between gap-3">
                        <span>
                          {item.title}
                          {item.piece_label ? (
                            <span className="stamp text-[12px] text-ink-soft"> {item.piece_label}</span>
                          ) : null}
                          {item.variant_label ? (
                            <span className="text-ink-soft"> · {item.variant_label}</span>
                          ) : null}
                        </span>
                        <span className="stamp tabular-nums shrink-0">
                          {item.quantity > 1 ? `${item.quantity} × ` : ""}
                          {money(item.unit_price, lang)}
                        </span>
                      </li>
                    ))}
                    <li className="flex items-baseline justify-between gap-3 text-ink-soft">
                      <span>{ar ? "التوصيل" : "Delivery"}</span>
                      <span className="stamp tabular-nums">{money(order.delivery_fee, lang)}</span>
                    </li>
                  </ul>

                  {/*
                    What happens next. The labels are what the customer will be
                    told, not the names of database states — "On its way", not
                    "out_for_delivery" — because that is the thing the owner is
                    actually deciding to send.
                  */}
                  <div className="flex flex-wrap gap-2">
                    {(NEXT_STATUSES[order.status] ?? []).map((next) => {
                      const undoing = ["cancelled", "failed", "returned"].includes(next);
                      return (
                        <button
                          key={next}
                          type="button"
                          disabled={busy === order.reference}
                          onClick={() => void move(order.reference, next)}
                          // Named for what it does to which order, so it is
                          // never confused with the filter chip of the same
                          // word — and so the confirmation a screen reader
                          // announces is the order, not just a state.
                          aria-label={
                            ar
                              ? `${order.reference}: ${statusLabel(lang, "orderStatus", next)}`
                              : `Move ${order.reference} to ${statusLabel(lang, "orderStatus", next)}`
                          }
                          className={undoing ? "btn-quiet" : "btn-primary"}
                        >
                          {statusLabel(lang, "orderStatus", next)}
                        </button>
                      );
                    })}
                    {(NEXT_STATUSES[order.status] ?? []).length === 0 ? (
                      <p className="text-[13px] text-ink-soft">
                        {ar ? "انتهى هذا الطلب." : "This one is finished."}
                      </p>
                    ) : null}
                  </div>
                  <p className="text-[12px] text-ink-soft">
                    {ar
                      ? "يُخطر الزبون تلقائياً عند كل تغيير."
                      : "The customer is told automatically on every change."}
                  </p>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
