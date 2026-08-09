"use client";

/**
 * Every customer, registered or not.
 *
 * Buying never requires an account here — most customers are a phone number
 * on an order, not a row in `users` — so this list is built from orders,
 * grouped by account where there is one and by phone where there isn't
 * (`admin/customers.py`). A guest and a registered account both count as one
 * person; the "account" badge is the one thing that tells them apart.
 *
 * Time on site is blank for guests on purpose: it comes from browsing signals
 * tied to a signed-in `user_id`, and a guest checkout has nothing on the
 * order to join those signals back to. Decided out of scope for this pass
 * rather than adding a column to `orders` to close it.
 */
import { useCallback, useEffect, useState } from "react";

import { admin, type AdminOrder, type Customer } from "@/lib/admin/client";
import { NotSignedIn, bounceToSignIn } from "@/lib/admin/session";
import { money, statusLabel } from "@/lib/i18n";

export default function Users() {
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setCustomers(await admin.customers(query.trim() || undefined));
    } catch (error) {
      if (error instanceof NotSignedIn) bounceToSignIn();
      else setProblem("Could not load");
    }
  }, [query]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), query ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[24px] font-semibold tracking-tight">Users</h1>

      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Name, phone, or email"
        aria-label="Search customers"
        className="field max-w-sm"
      />

      {problem ? <p className="text-[13px] text-warn">{problem}</p> : null}

      {customers === null ? (
        <div className="h-40" aria-hidden />
      ) : customers.length === 0 ? (
        <p className="text-[14px] text-ink-soft">No customers match that.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {customers.map((customer) => (
            <li key={customer.id} className="card p-4 shadow-soft">
              <button
                type="button"
                onClick={() => setOpen(open === customer.id ? null : customer.id)}
                aria-expanded={open === customer.id}
                className="w-full text-start flex items-center gap-3"
              >
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-[15px] font-medium truncate">{customer.name}</span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${
                        customer.has_account ? "bg-clay text-white" : "bg-sand text-ink-soft"
                      }`}
                    >
                      {customer.has_account ? "account" : "guest"}
                    </span>
                    {customer.is_active === false ? (
                      <span className="shrink-0 rounded-full bg-warn/15 px-2 py-0.5 text-[10.5px] font-medium text-warn">inactive</span>
                    ) : null}
                  </span>
                  <span className="block text-[12.5px] text-ink-soft">
                    {customer.phone}
                    {customer.email ? ` · ${customer.email}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-end">
                  <span className="stamp block text-[15px] font-semibold tabular-nums">{money(customer.revenue_mad, "en")}</span>
                  <span className="block text-[11.5px] text-ink-soft">{customer.orders_count} orders</span>
                </span>
              </button>

              {open === customer.id ? <CustomerDetail customer={customer} onChanged={load} /> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CustomerDetail({ customer, onChanged }: { customer: Customer; onChanged: () => Promise<void> }) {
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    admin
      .orders(undefined, customer.phone)
      .then((rows) => !cancelled && setOrders(rows))
      .catch((error) => error instanceof NotSignedIn && bounceToSignIn());
    return () => {
      cancelled = true;
    };
  }, [customer.phone]);

  async function toggleActive() {
    setBusy(true);
    setProblem(null);
    try {
      await admin.setCustomerActive(customer.id, !customer.is_active);
      await onChanged();
    } catch (error) {
      if (error instanceof NotSignedIn) bounceToSignIn();
      else setProblem("Could not change that");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-4 border-t border-sand pt-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure label="Products bought" value={String(customer.products_bought)} />
        <Figure label="Products cancelled" value={String(customer.products_cancelled)} />
        <Figure label="Time on site" value={formatSeconds(customer.time_on_site_seconds)} />
        <Figure label="Account since" value={customer.created_account_at ? new Date(customer.created_account_at).toLocaleDateString() : "—"} />
      </div>

      <div>
        <p className="label">Orders</p>
        {orders === null ? (
          <div className="h-16" aria-hidden />
        ) : orders.length === 0 ? (
          <p className="text-[13px] text-ink-soft">No orders found for this number.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {orders.map((order) => (
              <li key={order.reference} className="flex items-baseline justify-between gap-3 text-[14px]">
                <span>
                  <span className="stamp">{order.reference}</span> · {statusLabel("en", "orderStatus", order.status)}
                </span>
                <span className="stamp tabular-nums text-ink-soft">{money(order.total, "en")}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {customer.has_account ? (
        <div className="flex items-center gap-3">
          <button type="button" disabled={busy} onClick={() => void toggleActive()} className={customer.is_active ? "btn-quiet" : "btn-primary"}>
            {customer.is_active ? "Deactivate account" : "Reactivate account"}
          </button>
          {problem ? <p className="text-[13px] text-warn">{problem}</p> : null}
        </div>
      ) : (
        <p className="text-[12.5px] text-ink-soft">No account to manage — this customer checked out as a guest.</p>
      )}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-clay-soft/40 p-3">
      <p className="text-[12px] text-ink-soft">{label}</p>
      <p className="stamp mt-0.5 text-[16px] font-semibold">{value}</p>
    </div>
  );
}

function formatSeconds(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}
