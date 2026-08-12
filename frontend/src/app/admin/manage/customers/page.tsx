"use client";

/**
 * Manage · Customers.
 *
 * Nobody needs an account to buy here, so "the customers" are the distinct
 * people behind orders — most of them a phone number, not a row in `users`.
 *
 * Two honesty notes carried into the UI. A guest's id *is* their phone, so
 * the account control is gated on actually having an account. And where one
 * phone covers more than one person — a family, a shared handset — the list
 * says so instead of presenting a merged history as fact.
 */
import { useCallback, useMemo, useState } from "react";

import { api, type Customer } from "@/lib/console/api";
import { useConsoleQuery, useMutation } from "@/lib/console/query";
import { money, statusLabel } from "@/lib/i18n";

import { ManageSwitch } from "../ManageSwitch";
import {
  Age,
  Button,
  Card,
  ControlStrip,
  DataTable,
  Drawer,
  EmptyState,
  LinkButton,
  LoadError,
  Money,
  Num,
  Pill,
  SearchInput,
  Skeleton,
  Stale,
  Text,
  useConfirm,
  useDebounced,
  type Column,
} from "../../ui/primitives";
import { orderTone } from "../../ui/status";

export default function Customers() {
  const [query, setQuery] = useState("");
  // A longer debounce than elsewhere: this endpoint walks the whole orders
  // table in Python, so every keystroke is genuinely expensive.
  const settled = useDebounced(query, 500);
  const [open, setOpen] = useState<string | null>(null);

  const { data, error, loading, stale, reload } = useConsoleQuery(
    `customers:${settled}`,
    useCallback(() => api.customers(settled || undefined), [settled]),
  );

  const rows = data ?? [];

  // One phone, more than one person — say it rather than silently merging.
  const sharedPhones = useMemo(() => {
    const seen = new Map<string, number>();
    rows.forEach((customer) => seen.set(customer.phone, (seen.get(customer.phone) ?? 0) + 1));
    return seen;
  }, [rows]);

  const selected = rows.find((customer) => customer.id === open) ?? null;

  const columns: Column<Customer>[] = [
    {
      key: "name",
      header: "Who",
      render: (customer) => (
        <>
          <span className="console-row" style={{ gap: 6 }}>
            <Text className="console-strong">{customer.name}</Text>
            {customer.has_account ? <Pill tone="brand">account</Pill> : <Pill tone="neutral">guest</Pill>}
            {customer.is_active === false ? <Pill tone="warning">deactivated</Pill> : null}
          </span>
          <span className="console-cell-sub">
            {customer.phone}
            {(sharedPhones.get(customer.phone) ?? 0) > 1 ? " · shared number" : ""}
          </span>
        </>
      ),
    },
    { key: "orders", header: "Orders", align: "right", width: 80, render: (customer) => <Num value={customer.orders_count} /> },
    { key: "spent", header: "Spent", align: "right", width: 110, render: (customer) => money(customer.revenue_mad, "en") },
    {
      key: "refused",
      header: "Refused",
      align: "right",
      width: 90,
      render: (customer) =>
        customer.products_cancelled > 0 ? <span style={{ color: "var(--warn)" }}>{customer.products_cancelled}</span> : <span className="console-muted">—</span>,
    },
    {
      key: "call",
      header: "",
      align: "right",
      width: 56,
      render: (customer) => (
        <span onClick={(event) => event.stopPropagation()}>
          <LinkButton href={`tel:${customer.phone}`} size="sm" icon="phone" aria-label={`Call ${customer.name}`} />
        </span>
      ),
    },
  ];

  return (
    <>
      <ControlStrip
        groups={[{ label: "Find", controls: <SearchInput value={query} onChange={setQuery} placeholder="Name, phone or email" ariaLabel="Search customers" /> }]}
        trailing={
          <>
            <Pill tone="neutral">{rows.length}</Pill>
            <ManageSwitch current="customers" />
          </>
        }
      />

      {error && !data ? <LoadError message={error} onRetry={reload} /> : null}
      {loading ? <Skeleton height={260} /> : null}

      {data ? (
        <Stale stale={stale}>
          <Card pad="sm">
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(customer) => customer.id}
              selectedKey={open}
              onRowClick={(customer) => setOpen(customer.id)}
              empty={<EmptyState title={settled ? "Nobody matches that." : "No customers yet."} />}
            />
          </Card>
        </Stale>
      ) : null}

      {selected ? <CustomerDrawer customer={selected} shared={(sharedPhones.get(selected.phone) ?? 0) > 1} onClose={() => setOpen(null)} onChanged={reload} /> : null}
    </>
  );
}

function CustomerDrawer({
  customer,
  shared,
  onClose,
  onChanged,
}: {
  customer: Customer;
  shared: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { mutate, busy, problem } = useMutation();
  const confirm = useConfirm();
  const orders = useConsoleQuery(
    `customer-orders:${customer.phone}`,
    useCallback(() => api.orders(undefined, customer.phone), [customer.phone]),
  );

  return (
    <Drawer
      open
      onClose={onClose}
      title={<Text>{customer.name}</Text>}
      sub={customer.has_account ? "Has an account" : "Checked out as a guest"}
      actions={
        customer.has_account ? (
          <Button
            variant={customer.is_active ? "default" : "primary"}
            disabled={busy}
            onClick={() =>
              confirm({
                title: customer.is_active ? "Deactivate this account?" : "Reactivate this account?",
                body: customer.is_active
                  ? "They will not be able to sign in. They can still buy as a guest — deactivating an account does not stop someone ordering."
                  : "They will be able to sign in again.",
                confirmLabel: customer.is_active ? "Deactivate" : "Reactivate",
                danger: Boolean(customer.is_active),
                onConfirm: () =>
                  mutate(() => api.setCustomerActive(customer.id, !customer.is_active), { invalidates: ["customerChanged"], onDone: onChanged }),
              })
            }
          >
            {customer.is_active ? "Deactivate account" : "Reactivate account"}
          </Button>
        ) : (
          <span className="console-muted">No account to manage.</span>
        )
      }
    >
      {problem ? <p className="console-error">{problem}</p> : null}

      <div className="console-row">
        <LinkButton href={`tel:${customer.phone}`} icon="phone">
          {customer.phone}
        </LinkButton>
        {customer.email ? (
          <LinkButton href={`mailto:${customer.email}`} icon="external" size="sm">
            {customer.email}
          </LinkButton>
        ) : null}
      </div>

      {shared ? (
        <p className="console-note">
          More than one customer record uses this number. They are probably not the same person — a household often
          shares one phone — so treat this history as the number&apos;s, not one individual&apos;s.
        </p>
      ) : null}

      <div className="console-stat-grid cols-4">
        <div className="console-stat">
          <span className="console-caps">Spent</span>
          <span className="console-metric"><Money value={customer.revenue_mad} /></span>
          <span className="console-stat-caption">delivered only</span>
        </div>
        <div className="console-stat">
          <span className="console-caps">Bought</span>
          <span className="console-metric"><Num value={customer.products_bought} /></span>
        </div>
        <div className="console-stat">
          <span className="console-caps">Refused</span>
          <span className="console-metric"><Num value={customer.products_cancelled} /></span>
        </div>
        <div className="console-stat">
          <span className="console-caps">Account since</span>
          <span className="console-metric" style={{ fontSize: "var(--t-lg)" }}>
            {customer.created_account_at ? new Date(customer.created_account_at).toLocaleDateString() : "—"}
          </span>
          {!customer.has_account ? <span className="console-stat-caption">guest — nothing to date</span> : null}
        </div>
      </div>

      <section className="console-stack-sm">
        <p className="console-caps">Their orders</p>
        {orders.loading ? (
          <Skeleton height={80} />
        ) : (orders.data ?? []).length === 0 ? (
          <p className="console-muted">No orders found for this number.</p>
        ) : (
          <ul className="console-stack-sm">
            {(orders.data ?? []).map((order) => (
              <li key={order.reference} className="console-row-between" style={{ fontSize: "var(--t-md)" }}>
                <span className="console-row" style={{ gap: 8 }}>
                  <span className="console-num">{order.reference}</span>
                  <Pill tone={orderTone(order.status)}>{statusLabel("en", "orderStatus", order.status)}</Pill>
                </span>
                <span className="console-row" style={{ gap: 8 }}>
                  <Money value={order.total} />
                  <span className="console-muted">
                    <Age iso={order.created_at} />
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {customer.time_on_site_seconds === null ? (
        <p className="console-muted">
          Time on site is only measurable for a signed-in account — a guest checkout has nothing to tie browsing back to.
        </p>
      ) : null}
    </Drawer>
  );
}
