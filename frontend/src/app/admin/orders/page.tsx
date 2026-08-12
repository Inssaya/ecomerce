"use client";

/**
 * Orders — the queue.
 *
 * It opens on what needs you, not on everything newest-first. The age is a
 * column, because an order placed five minutes ago and one placed three weeks
 * ago used to look identical. The phone number is on the row, because every
 * order here is cash on delivery and settling one starts with a call.
 */
import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { api, type AdminOrder } from "@/lib/console/api";
import { useConsoleQuery } from "@/lib/console/query";
import { money, statusLabel } from "@/lib/i18n";

import { OrderDrawer } from "./OrderDrawer";
import { SectionSwitch } from "./SectionSwitch";
import {
  Age,
  Button,
  Card,
  ControlStrip,
  DataTable,
  EmptyState,
  LinkButton,
  LoadError,
  Pill,
  SearchInput,
  Segmented,
  Skeleton,
  Stale,
  Text,
  useDebounced,
  type Column,
} from "../ui/primitives";
import { orderTone } from "../ui/status";

const FILTERS = [
  { value: "open", label: "Needs you" },
  { value: "", label: "All" },
  { value: "placed", label: "New" },
  { value: "preparing", label: "Being made" },
  { value: "out_for_delivery", label: "On its way" },
  { value: "delivered", label: "Delivered" },
] as const;

/** Anything not finished, from the owner's point of view. */
const OPEN = new Set(["placed", "confirmed", "preparing", "ready", "out_for_delivery"]);

export default function Orders() {
  const router = useRouter();
  const params = useSearchParams();

  const status = params.get("status") ?? "open";
  const open = params.get("open");
  const [query, setQuery] = useState("");
  const settled = useDebounced(query, 350);

  // Filters live in the URL, so a filtered queue is a link you can send.
  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      router.replace(`/admin/orders?${next.toString()}`, { scroll: false });
    },
    [params, router],
  );

  const serverStatus = status === "open" ? undefined : status || undefined;
  const { data, error, loading, stale, reload } = useConsoleQuery(
    `orders:${status}:${settled}`,
    useCallback(() => api.orders(serverStatus, settled || undefined), [serverStatus, settled]),
  );

  const rows = useMemo(() => {
    const all = data ?? [];
    return status === "open" ? all.filter((order) => OPEN.has(order.status)) : all;
  }, [data, status]);

  const selected = rows.find((order) => order.reference === open) ?? null;

  const columns: Column<AdminOrder>[] = [
    { key: "age", header: "Age", align: "right", width: 62, render: (order) => <Age iso={order.created_at} /> },
    {
      key: "reference",
      header: "Reference",
      render: (order) => <span className="console-num console-strong">{order.reference}</span>,
    },
    {
      key: "customer",
      header: "Customer",
      render: (order) => (
        <>
          <Text>{order.customer_name}</Text>
          <div className="console-cell-sub">{order.city}</div>
        </>
      ),
    },
    { key: "total", header: "Total", align: "right", render: (order) => money(order.total, "en") },
    {
      key: "status",
      header: "Status",
      render: (order) => <Pill tone={orderTone(order.status)}>{statusLabel("en", "orderStatus", order.status)}</Pill>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: 108,
      render: (order) => (
        <span className="console-row-actions" onClick={(event) => event.stopPropagation()}>
          <LinkButton href={`tel:${order.customer_phone}`} size="sm" icon="phone" aria-label={`Call ${order.customer_name}`} />
          {order.whatsapp_url ? (
            <LinkButton href={order.whatsapp_url} target="_blank" rel="noreferrer" size="sm" icon="whatsapp" aria-label="WhatsApp" />
          ) : null}
        </span>
      ),
    },
  ];

  return (
    <>
      <ControlStrip
        groups={[
          {
            label: "Show",
            controls: (
              <Segmented
                options={FILTERS}
                value={status as (typeof FILTERS)[number]["value"]}
                onChange={(next) => setParam("status", next || null)}
                ariaLabel="Which orders"
              />
            ),
          },
          {
            label: "Find",
            controls: <SearchInput value={query} onChange={setQuery} placeholder="Reference, phone or name" ariaLabel="Search orders" />,
          },
        ]}
        trailing={
          <>
            <Pill tone="neutral">{rows.length} shown</Pill>
            <SectionSwitch current="orders" />
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
              rowKey={(order) => order.reference}
              selectedKey={open}
              onRowClick={(order) => setParam("open", order.reference)}
              empty={
                <EmptyState
                  title={settled ? "No order matches that." : status === "open" ? "Nothing is waiting on you." : "No orders yet."}
                  hint={settled ? "Try a different reference, phone or name." : undefined}
                  action={settled ? <Button onClick={() => setQuery("")}>Clear the search</Button> : undefined}
                />
              }
            />
          </Card>
        </Stale>
      ) : null}

      {selected ? <OrderDrawer order={selected} onClose={() => setParam("open", null)} onMoved={reload} /> : null}
    </>
  );
}
