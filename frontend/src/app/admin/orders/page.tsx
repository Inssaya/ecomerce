"use client";

/**
 * Orders — the queue, as a table.
 *
 * Every column sorts, because a queue skimmed for "what needs me" is read
 * down a column, not a row at a time. A cancelled order's whole row turns
 * red — the money did not land, and that should be visible without reading
 * the status pill. Delete archives rather than deletes: an order is an
 * accounting record, and "gone" is never the right word for one.
 */
import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { api, type AdminOrder, type Range } from "@/lib/console/api";
import { useConsoleQuery, useMutation } from "@/lib/console/query";
import { money, statusLabel } from "@/lib/i18n";

import { OrderPopup } from "./OrderPopup";
import {
  Button,
  Card,
  ConsoleHeader,
  DataTable,
  DateRangeFilter,
  EmptyState,
  LoadError,
  Num,
  Pill,
  Skeleton,
  Stale,
  Text,
  useConfirm,
  useDebounced,
  useTableSort,
  type Column,
} from "../ui/primitives";
import { orderTone } from "../ui/status";

const PAGES = [
  { href: "/admin/orders", label: "Orders", active: true },
  { href: "/admin/orders/commissions", label: "Custom" },
  { href: "/admin/orders/messages", label: "Messages" },
];

const STATUSES = [
  { value: "", label: "All statuses" },
  { value: "placed", label: "New" },
  { value: "confirmed", label: "Confirmed" },
  { value: "preparing", label: "Being made" },
  { value: "ready", label: "Finished" },
  { value: "out_for_delivery", label: "On its way" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
  { value: "failed", label: "Failed" },
  { value: "returned", label: "Returned" },
];

/** All items on one order, consolidated: "2 × Oak hook, 1 × Brass hook". */
function productCell(order: AdminOrder): string {
  return order.items.map((item) => `${item.quantity} × ${item.title}`).join(", ");
}

function totalQuantity(order: AdminOrder): number {
  return order.items.reduce((sum, item) => sum + item.quantity, 0);
}

/** Days left until the promise, or how overdue it is — read at a glance. */
function Countdown({ promisedFor }: { promisedFor: string | null }) {
  if (!promisedFor) return <span className="console-muted">—</span>;
  const days = Math.ceil((new Date(promisedFor).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return <Pill tone="danger">{Math.abs(days)}d overdue</Pill>;
  if (days === 0) return <Pill tone="warning">today</Pill>;
  return <span className="console-num">{days}d left</span>;
}

export default function Orders() {
  const router = useRouter();
  const params = useSearchParams();
  const confirm = useConfirm();
  const { mutate, busy } = useMutation();

  const status = params.get("status") ?? "";
  const open = params.get("open");
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [range, setRange] = useState<Range | null>(null);
  const [hidden, setHidden] = useState(false);
  const settled = useDebounced(query, 350);

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      router.replace(`/admin/orders?${next.toString()}`, { scroll: false });
    },
    [params, router],
  );

  const key = `orders:${status}:${settled}:${city}:${range?.from ?? ""}:${range?.to ?? ""}:${hidden}`;
  const { data, error, loading, stale, reload } = useConsoleQuery(
    key,
    useCallback(
      () => api.orders({ status: status || undefined, q: settled || undefined, city: city || undefined, range, hidden }),
      [status, settled, city, range, hidden],
    ),
  );
  const cities = useConsoleQuery("order-cities", useCallback(() => api.orderCities(), []));

  const rows = data ?? [];
  const { sorted, sort, onSort } = useTableSort(
    rows,
    {
      date: (row) => row.created_at,
      reference: (row) => row.reference,
      customer: (row) => row.customer_name,
      city: (row) => row.city,
      qty: (row) => totalQuantity(row),
      total: (row) => row.total,
      countdown: (row) => (row.promised_for ? new Date(row.promised_for).getTime() : Infinity),
      status: (row) => row.status,
    },
    { key: "date", asc: false },
  );

  const selected = rows.find((order) => order.reference === open) ?? null;

  const columns: Column<AdminOrder>[] = [
    {
      key: "date",
      header: "Date",
      sortable: true,
      render: (order) => (
        <time className="console-num" dateTime={order.created_at} title={new Date(order.created_at).toLocaleString()}>
          {new Date(order.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
        </time>
      ),
    },
    {
      key: "reference",
      header: "Ref",
      sortable: true,
      render: (order) => <span className="console-num console-strong">{order.reference}</span>,
    },
    {
      key: "customer",
      header: "Customer",
      sortable: true,
      render: (order) => <Text>{order.customer_name}</Text>,
    },
    { key: "city", header: "City", sortable: true, render: (order) => order.city },
    {
      key: "product",
      header: "Product",
      render: (order) => (
        <span style={{ display: "block", maxWidth: 260 }} title={productCell(order)}>
          {productCell(order)}
        </span>
      ),
    },
    { key: "qty", header: "Qty", align: "right", sortable: true, render: (order) => <Num value={totalQuantity(order)} /> },
    { key: "total", header: "Total", align: "right", sortable: true, render: (order) => money(order.total, "en") },
    {
      key: "countdown",
      header: "Delivery",
      align: "right",
      sortable: true,
      render: (order) => <Countdown promisedFor={order.promised_for} />,
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (order) => <Pill tone={orderTone(order.status)}>{statusLabel("en", "orderStatus", order.status)}</Pill>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: 150,
      render: (order) => (
        <span className="console-row-actions" onClick={(event) => event.stopPropagation()}>
          <Button size="sm" onClick={() => setParam("open", order.reference)}>
            Open
          </Button>
          {hidden ? (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void mutate(() => api.unhideOrder(order.reference), { invalidates: ["orderChanged"], onDone: reload })}
            >
              Restore
            </Button>
          ) : (
            <Button
              size="sm"
              iconOnly
              icon="trash"
              aria-label={`Archive order ${order.reference}`}
              disabled={busy}
              onClick={() =>
                confirm({
                  title: `Archive order ${order.reference}?`,
                  body: "It leaves this queue. Nothing is deleted — the order stays exactly as it is, and you can bring it back from the Hidden view.",
                  confirmLabel: "Archive it",
                  danger: true,
                  onConfirm: () =>
                    mutate(() => api.hideOrder(order.reference), { invalidates: ["orderChanged"], onDone: reload }),
                })
              }
            />
          )}
        </span>
      ),
    },
  ];

  return (
    <>
      <ConsoleHeader
        filters={
          <>
            <DateRangeFilter value={range} onChange={setRange} ariaLabel="When it was placed" />
            <select className="console-select" value={status} onChange={(event) => setParam("status", event.target.value || null)} aria-label="Status">
              {STATUSES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select className="console-select" value={city} onChange={(event) => setCity(event.target.value)} aria-label="City">
              <option value="">All cities</option>
              {(cities.data ?? []).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={() => setHidden((was) => !was)}>
              {hidden ? "Show live queue" : "Show archived"}
            </Button>
          </>
        }
        search={{ value: query, onChange: setQuery, placeholder: "Reference, phone or name", ariaLabel: "Search orders" }}
        pages={PAGES}
        trailing={<Pill tone="neutral">{rows.length} shown</Pill>}
      />

      {error && !data ? <LoadError message={error} onRetry={reload} /> : null}
      {loading ? <Skeleton height={280} /> : null}

      {data ? (
        <Stale stale={stale}>
          <Card pad="sm" flush>
            <DataTable
              columns={columns}
              rows={sorted}
              rowKey={(order) => order.reference}
              selectedKey={open}
              onRowClick={(order) => setParam("open", order.reference)}
              sort={sort}
              onSort={onSort}
              minWidth={1080}
              rowClassName={(order) => (order.status === "cancelled" ? "console-row-cancelled" : undefined)}
              empty={
                <EmptyState
                  title={settled ? "No order matches that." : hidden ? "Nothing archived." : "No orders yet."}
                  hint={settled ? "Try a different reference, phone or name." : undefined}
                />
              }
            />
          </Card>
        </Stale>
      ) : null}

      {selected ? <OrderPopup order={selected} onClose={() => setParam("open", null)} onChanged={reload} /> : null}
    </>
  );
}
