"use client";

/**
 * Orders, custom requests, and messages — three things a customer sends the
 * workshop, sharing one screen and its sub-tabs.
 *
 * Orders and Custom requests are ported from the deleted workshop's
 * `Orders.tsx`/`Requests.tsx`: one status button per legal move (mirroring
 * the server's transition table, so nothing offered ever fails), and the
 * phone number as the first thing after the name — every order here is cash
 * on delivery, which means a phone call before a courier is paid. Messages is
 * new: contact-form submissions that used to only open a mailto:/WhatsApp
 * link and vanish if the visitor didn't follow through now land here.
 */
import { useCallback, useEffect, useState } from "react";

import { admin, NEXT_STATUSES, type AdminOrder, type AdminRequest, type ContactMessage } from "@/lib/admin/client";
import { NotSignedIn, bounceToSignIn } from "@/lib/admin/session";
import { money, statusLabel } from "@/lib/i18n";

export default function OrdersPage() {
  const [tab, setTab] = useState<"orders" | "requests" | "messages">("orders");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[24px] font-semibold tracking-tight">Orders</h1>
        <div className="flex gap-1 rounded-2xl bg-clay-soft p-1">
          {(["orders", "requests", "messages"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setTab(option)}
              aria-pressed={tab === option}
              className={`tap rounded-xl px-3 py-1.5 text-[13px] font-medium capitalize transition-colors duration-gentle ${
                tab === option ? "bg-clay text-white" : "text-ink"
              }`}
            >
              {option === "requests" ? "Custom requests" : option}
            </button>
          ))}
        </div>
      </div>

      {tab === "orders" ? <Orders /> : null}
      {tab === "requests" ? <Requests /> : null}
      {tab === "messages" ? <Messages /> : null}
    </div>
  );
}

// ── Orders ───────────────────────────────────────────────────────────────────

const ORDER_FILTERS = ["", "placed", "confirmed", "preparing", "ready", "out_for_delivery", "delivered"] as const;

function Orders() {
  const [filter, setFilter] = useState<string>("");
  const [query, setQuery] = useState("");
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setOrders(await admin.orders(filter || undefined, query.trim() || undefined));
    } catch (error) {
      if (error instanceof NotSignedIn) bounceToSignIn();
      else setProblem("Could not load");
    }
  }, [filter, query]);

  useEffect(() => {
    setOrders(null);
    const timer = setTimeout(() => void load(), query ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  async function move(reference: string, status: string) {
    setBusy(reference);
    setProblem(null);
    try {
      await admin.moveOrder(reference, status);
      await load();
    } catch (error) {
      if (error instanceof NotSignedIn) bounceToSignIn();
      else setProblem("The server refused that move");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {ORDER_FILTERS.map((value) => (
          <button
            key={value || "all"}
            type="button"
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
            className={`tap shrink-0 rounded-2xl px-4 text-[13px] font-medium capitalize transition-colors duration-gentle ${
              filter === value ? "bg-clay text-white" : "bg-clay-soft text-ink"
            }`}
          >
            {value ? statusLabel("en", "orderStatus", value) : "All"}
          </button>
        ))}
      </div>

      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="Search by reference, phone or name"
        placeholder="Reference, phone, or name"
        className="field"
      />

      {problem ? <p className="text-[13px] text-warn">{problem}</p> : null}

      {orders === null ? (
        <div className="h-32" aria-hidden />
      ) : orders.length === 0 ? (
        <p className="text-[14px] text-ink-soft">{query.trim() ? "No order matches that." : "Nothing here."}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((order) => (
            <li key={order.reference} className="card p-4 shadow-soft">
              <button type="button" onClick={() => setOpen(open === order.reference ? null : order.reference)} aria-expanded={open === order.reference} className="w-full text-start">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="stamp text-[15px] font-semibold">{order.reference}</span>
                  <span className="stamp text-[15px] font-semibold tabular-nums">{money(order.total, "en")}</span>
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="text-ink-soft">
                    {order.customer_name} · {order.city}
                  </span>
                  <span className="font-medium text-clay">{statusLabel("en", "orderStatus", order.status)}</span>
                </div>
              </button>

              {open === order.reference ? (
                <div className="mt-4 flex flex-col gap-4 border-t border-sand pt-4">
                  <div className="flex flex-wrap gap-2">
                    <a href={`tel:${order.customer_phone}`} className="btn-quiet">
                      {order.customer_phone}
                    </a>
                    {order.whatsapp_url ? (
                      <a href={order.whatsapp_url} target="_blank" rel="noreferrer" className="btn-quiet">
                        WhatsApp
                      </a>
                    ) : null}
                  </div>

                  <div className="text-[14px] leading-relaxed">
                    <p className="text-ink-soft">Address</p>
                    <p>{order.address?.line1}</p>
                    <p>{order.address?.city}</p>
                    {order.address?.notes ? <p className="mt-1 text-ink-soft">{order.address.notes}</p> : null}
                  </div>

                  <ul className="flex flex-col gap-1.5 text-[14px]">
                    {order.items.map((item, index) => (
                      <li key={index} className="flex items-baseline justify-between gap-3">
                        <span>
                          {item.title}
                          {item.piece_label ? <span className="stamp text-[12px] text-ink-soft"> {item.piece_label}</span> : null}
                          {item.variant_label ? <span className="text-ink-soft"> · {item.variant_label}</span> : null}
                        </span>
                        <span className="stamp tabular-nums shrink-0">
                          {item.quantity > 1 ? `${item.quantity} × ` : ""}
                          {money(item.unit_price, "en")}
                        </span>
                      </li>
                    ))}
                    <li className="flex items-baseline justify-between gap-3 text-ink-soft">
                      <span>Delivery</span>
                      <span className="stamp tabular-nums">{money(order.delivery_fee, "en")}</span>
                    </li>
                  </ul>

                  <ul className="text-[12.5px] text-ink-soft">
                    {order.events.map((event, index) => (
                      <li key={index}>
                        {statusLabel("en", "orderStatus", event.status)} · {new Date(event.created_at).toLocaleString()}
                      </li>
                    ))}
                  </ul>

                  <div className="flex flex-wrap gap-2">
                    {(NEXT_STATUSES[order.status] ?? []).map((next) => {
                      const undoing = ["cancelled", "failed", "returned"].includes(next);
                      return (
                        <button
                          key={next}
                          type="button"
                          disabled={busy === order.reference}
                          onClick={() => void move(order.reference, next)}
                          aria-label={`Move ${order.reference} to ${statusLabel("en", "orderStatus", next)}`}
                          className={undoing ? "btn-quiet" : "btn-primary"}
                        >
                          {statusLabel("en", "orderStatus", next)}
                        </button>
                      );
                    })}
                    {(NEXT_STATUSES[order.status] ?? []).length === 0 ? (
                      <p className="text-[13px] text-ink-soft">This one is finished.</p>
                    ) : null}
                  </div>
                  <p className="text-[12px] text-ink-soft">The customer is told automatically on every change.</p>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Custom requests ───────────────────────────────────────────────────────────

const REQUEST_FILTERS = ["requested", "quoted", "approved", "in_production", ""] as const;

function Requests() {
  const [filter, setFilter] = useState<string>("requested");
  const [requests, setRequests] = useState<AdminRequest[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRequests(await admin.requests(filter || undefined));
    } catch (error) {
      if (error instanceof NotSignedIn) bounceToSignIn();
      else setProblem("Could not load");
    }
  }, [filter]);

  useEffect(() => {
    setRequests(null);
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {REQUEST_FILTERS.map((value) => (
          <button
            key={value || "all"}
            type="button"
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
            className={`tap shrink-0 rounded-2xl px-4 text-[13px] font-medium transition-colors duration-gentle ${
              filter === value ? "bg-clay text-white" : "bg-clay-soft text-ink"
            }`}
          >
            {value ? statusLabel("en", "requestStatus", value) : "All"}
          </button>
        ))}
      </div>

      {problem ? <p className="text-[13px] text-warn">{problem}</p> : null}

      {requests === null ? (
        <div className="h-32" aria-hidden />
      ) : requests.length === 0 ? (
        <p className="text-[14px] text-ink-soft">Nothing waiting on you.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {requests.map((request) => (
            <li key={request.reference} className="card p-4 shadow-soft">
              <button type="button" onClick={() => setOpen(open === request.reference ? null : request.reference)} aria-expanded={open === request.reference} className="w-full text-start">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="stamp text-[15px] font-semibold">{request.reference}</span>
                  <span className="text-[13px] font-medium text-clay">{statusLabel("en", "requestStatus", request.status)}</span>
                </div>
                <p className="mt-1.5 text-[14px] leading-relaxed line-clamp-2">{request.description}</p>
              </button>

              {open === request.reference ? (
                <div className="mt-4 flex flex-col gap-4 border-t border-sand pt-4">
                  <p className="text-[15px] leading-relaxed whitespace-pre-line">{request.description}</p>

                  {request.whatsapp_url ? (
                    <a href={request.whatsapp_url} target="_blank" rel="noreferrer" className="btn-quiet self-start">
                      WhatsApp
                    </a>
                  ) : null}

                  {request.quote_price ? (
                    <p className="text-[14px]">
                      We sent <span className="stamp font-semibold">{money(request.quote_price, "en")}</span>
                      {request.promised_for ? (
                        <>
                          {" · ready on "}
                          <span className="stamp">{request.promised_for}</span>
                        </>
                      ) : null}
                    </p>
                  ) : null}

                  {request.status === "requested" || request.status === "quoted" ? (
                    <QuoteForm reference={request.reference} onDone={load} />
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QuoteForm({ reference, onDone }: { reference: string; onDone: () => Promise<void> }) {
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const form = new FormData(event.currentTarget);
    const price = Number(form.get("price"));
    const days = Number(form.get("days"));
    if (!(price > 0) || !(days >= 1)) {
      setProblem("Both a price and a number of days");
      return;
    }
    setSending(true);
    setProblem(null);
    try {
      await admin.quote(reference, price, days, String(form.get("note") ?? ""));
      await onDone();
    } catch (error) {
      if (error instanceof NotSignedIn) bounceToSignIn();
      else setProblem("That would not send");
      setSending(false);
    }
  }

  async function decline() {
    setSending(true);
    try {
      await admin.moveRequest(reference, "declined");
      await onDone();
    } catch (error) {
      if (error instanceof NotSignedIn) bounceToSignIn();
      setSending(false);
    }
  }

  return (
    <form onSubmit={send} className="flex flex-col gap-3">
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="label" htmlFor={`price-${reference}`}>
            Price
          </label>
          <input id={`price-${reference}`} name="price" type="number" min={1} step={1} inputMode="numeric" required className="field" />
        </div>
        <div className="flex-1">
          <label className="label" htmlFor={`days-${reference}`}>
            In how many days
          </label>
          <input id={`days-${reference}`} name="days" type="number" min={1} max={365} inputMode="numeric" required className="field" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor={`note-${reference}`}>
          A note to them (optional)
        </label>
        <textarea id={`note-${reference}`} name="note" rows={2} className="field resize-none" />
      </div>
      {problem ? <p className="text-[13px] text-warn">{problem}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={sending} className="btn-primary">
          Send the price
        </button>
        <button type="button" disabled={sending} onClick={() => void decline()} className="btn-quiet">
          We can&apos;t make this
        </button>
      </div>
      <p className="text-[12px] text-ink-soft">Nothing is owed until they agree. Agreeing is what creates the order.</p>
    </form>
  );
}

// ── Messages ─────────────────────────────────────────────────────────────────

function Messages() {
  const [messages, setMessages] = useState<ContactMessage[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(() => {
    admin
      .contactMessages()
      .then(setMessages)
      .catch((error) => {
        if (error instanceof NotSignedIn) bounceToSignIn();
        else setProblem("Could not load");
      });
  }, []);

  useEffect(load, [load]);

  async function markRead(id: string) {
    try {
      await admin.markMessageRead(id);
      load();
    } catch (error) {
      if (error instanceof NotSignedIn) bounceToSignIn();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {problem ? <p className="text-[13px] text-warn">{problem}</p> : null}
      {messages === null ? (
        <div className="h-32" aria-hidden />
      ) : messages.length === 0 ? (
        <p className="text-[14px] text-ink-soft">No messages yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {messages.map((message) => (
            <li key={message.id} className={`card p-4 shadow-soft ${message.read_at ? "" : "border border-clay/40"}`}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[15px] font-medium">{message.name}</span>
                <span className="text-[12px] text-ink-soft">{new Date(message.created_at).toLocaleString()}</span>
              </div>
              <p className="mt-1 text-[13px] text-ink-soft">
                {[message.email, message.phone].filter(Boolean).join(" · ")}
              </p>
              <p className="mt-2 text-[14px] leading-relaxed whitespace-pre-line">{message.message}</p>
              {!message.read_at ? (
                <button type="button" onClick={() => void markRead(message.id)} className="mt-3 text-[12.5px] text-ink-soft underline underline-offset-4">
                  Mark as read
                </button>
              ) : (
                <p className="mt-3 text-[12px] text-ink-soft">Read {new Date(message.read_at).toLocaleString()}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
