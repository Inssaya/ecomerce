"use client";

/**
 * Manage · Customers — a table, and three popups.
 *
 * Nobody needs an account to buy here, so "the customers" are the distinct
 * people behind orders — most of them a phone number, not a row in `users`.
 * Saves and likes read as real numbers for a guest too, because every order
 * now carries the device fingerprint it was placed from — see the backend's
 * `customers.py` for the join that makes that true.
 *
 * Three actions, three popups: Open is the profile, Analytics is their
 * behaviour, Block is one confirm that can flip the account off and stop
 * every device they have ordered from, in the same action.
 */
import { useCallback, useMemo, useState } from "react";

import { api, type Customer, type CustomerAnalytics } from "@/lib/console/api";
import { useConsoleQuery, useMutation } from "@/lib/console/query";
import { money, statusLabel } from "@/lib/i18n";

import {
  Age,
  Button,
  Card,
  ConsoleHeader,
  DataTable,
  EmptyState,
  Field,
  LinkButton,
  LoadError,
  Money,
  Num,
  Pill,
  Popup,
  Skeleton,
  Stale,
  Text,
  useConfirm,
  useDebounced,
  type Column,
} from "../../ui/primitives";
import { orderTone } from "../../ui/status";

const PAGES = [
  { href: "/admin/manage", label: "Products" },
  { href: "/admin/manage/customers", label: "Customers", active: true },
  { href: "/admin/manage/feed", label: "Feed" },
];

export default function Customers() {
  const [query, setQuery] = useState("");
  // A longer debounce than elsewhere: this endpoint walks the whole orders
  // table in Python, so every keystroke is genuinely expensive.
  const settled = useDebounced(query, 500);
  const [open, setOpen] = useState<string | null>(null);
  const [analyticsFor, setAnalyticsFor] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<string | null>(null);

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
  const forAnalytics = rows.find((customer) => customer.id === analyticsFor) ?? null;
  const forBlock = rows.find((customer) => customer.id === blocking) ?? null;

  const columns: Column<Customer>[] = [
    {
      key: "created",
      header: "Created",
      width: 90,
      render: (customer) => (
        <time className="console-num" dateTime={customer.created_at} title={new Date(customer.created_at).toLocaleString()}>
          {new Date(customer.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
        </time>
      ),
    },
    {
      key: "name",
      header: "Name",
      render: (customer) => (
        <>
          <Text className="console-strong">{customer.name}</Text>
          {(sharedPhones.get(customer.phone) ?? 0) > 1 ? <span className="console-cell-sub"> shared number</span> : null}
        </>
      ),
    },
    { key: "phone", header: "Phone", render: (customer) => customer.phone },
    { key: "email", header: "Email", render: (customer) => customer.email ?? "—" },
    {
      key: "type",
      header: "Type",
      render: (customer) => (
        <Pill tone={customer.type === "auth" ? "brand" : "neutral"}>{customer.type === "auth" ? "Verified" : "Guest"}</Pill>
      ),
    },
    { key: "spent", header: "Total spent", align: "right", render: (customer) => money(customer.revenue_mad, "en") },
    { key: "products", header: "Total products", align: "right", render: (customer) => <Num value={customer.total_products} /> },
    { key: "saves", header: "Saves", align: "right", render: (customer) => <Num value={customer.total_saves} /> },
    { key: "likes", header: "Likes", align: "right", render: (customer) => <Num value={customer.total_likes} /> },
    {
      key: "actions",
      header: "",
      align: "right",
      width: 210,
      render: (customer) => (
        <span className="console-row-actions" onClick={(event) => event.stopPropagation()}>
          <Button size="sm" onClick={() => setOpen(customer.id)}>
            Open
          </Button>
          <Button size="sm" onClick={() => setAnalyticsFor(customer.id)}>
            Analytics
          </Button>
          <Button size="sm" variant="danger" disabled={customer.is_active === false} onClick={() => setBlocking(customer.id)}>
            {customer.is_active === false ? "Blocked" : "Block"}
          </Button>
        </span>
      ),
    },
  ];

  return (
    <>
      <ConsoleHeader
        search={{ value: query, onChange: setQuery, placeholder: "Name, phone or email", ariaLabel: "Search customers" }}
        pages={PAGES}
        trailing={<Pill tone="neutral">{rows.length}</Pill>}
      />

      {error && !data ? <LoadError message={error} onRetry={reload} /> : null}
      {loading ? <Skeleton height={280} /> : null}

      {data ? (
        <Stale stale={stale}>
          <Card pad="sm" flush>
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(customer) => customer.id}
              selectedKey={open}
              onRowClick={(customer) => setOpen(customer.id)}
              minWidth={1080}
              empty={<EmptyState title={settled ? "Nobody matches that." : "No customers yet."} />}
            />
          </Card>
        </Stale>
      ) : null}

      {selected ? (
        <CustomerPopup
          customer={selected}
          shared={(sharedPhones.get(selected.phone) ?? 0) > 1}
          onClose={() => setOpen(null)}
          onChanged={reload}
        />
      ) : null}

      {forAnalytics ? <CustomerAnalyticsPopup customer={forAnalytics} onClose={() => setAnalyticsFor(null)} /> : null}

      {forBlock ? (
        <BlockPopup
          customer={forBlock}
          onClose={() => setBlocking(null)}
          onChanged={() => {
            setBlocking(null);
            reload();
          }}
        />
      ) : null}
    </>
  );
}

function CustomerPopup({
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
    useCallback(() => api.orders({ q: customer.phone }), [customer.phone]),
  );

  return (
    <Popup
      open
      title={<Text>{customer.name}</Text>}
      sub={
        <>
          <Pill tone={customer.type === "auth" ? "brand" : "neutral"}>{customer.type === "auth" ? "Verified" : "Guest"}</Pill>
          {customer.city ? ` · ${customer.city}` : ""}
        </>
      }
      width={760}
      onClose={onClose}
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
                  mutate(() => api.setCustomerActive(customer.id, !customer.is_active), {
                    invalidates: ["customerChanged"],
                    onDone: onChanged,
                  }),
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
          <span className="console-caps">Products</span>
          <span className="console-metric"><Num value={customer.total_products} /></span>
          <span className="console-stat-caption">distinct pieces ordered</span>
        </div>
        <div className="console-stat">
          <span className="console-caps">Refused</span>
          <span className="console-metric"><Num value={customer.products_cancelled} /></span>
        </div>
        <div className="console-stat">
          <span className="console-caps">{customer.has_account ? "Account since" : "First seen"}</span>
          <span className="console-metric" style={{ fontSize: "var(--t-lg)" }}>
            {new Date(customer.has_account && customer.created_account_at ? customer.created_account_at : customer.created_at).toLocaleDateString()}
          </span>
          {!customer.has_account ? <span className="console-stat-caption">guest — from their first order</span> : null}
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
    </Popup>
  );
}

function CustomerAnalyticsPopup({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const analytics = useConsoleQuery(
    `customer-analytics:${customer.id}`,
    useCallback(() => api.customerAnalytics(customer.id), [customer.id]),
  );
  const data: CustomerAnalytics | undefined = analytics.data;

  return (
    <Popup open title={<Text>{customer.name}</Text>} sub="Behaviour, all time" width={680} onClose={onClose}>
      {analytics.error && !data ? <LoadError message={analytics.error} onRetry={analytics.reload} /> : null}
      {analytics.loading ? <Skeleton height={200} /> : null}

      {data ? (
        data.visits === 0 && data.liked.length === 0 && data.saved.length === 0 ? (
          <EmptyState title="Nothing recorded yet." hint="No browsing signal has come in for this person's devices." />
        ) : (
          <>
            <div className="console-stat-grid cols-3">
              <div className="console-stat">
                <span className="console-caps">Visits</span>
                <span className="console-metric"><Num value={data.visits} /></span>
              </div>
              <div className="console-stat">
                <span className="console-caps">Opened a piece</span>
                <span className="console-metric"><Num value={data.opened} /></span>
              </div>
              <div className="console-stat">
                <span className="console-caps">Stayed to read</span>
                <span className="console-metric"><Num value={data.stayed} /></span>
              </div>
              <div className="console-stat">
                <span className="console-caps">Added to cart</span>
                <span className="console-metric"><Num value={data.added_to_cart} /></span>
              </div>
              <div className="console-stat">
                <span className="console-caps">Bought</span>
                <span className="console-metric"><Num value={data.purchased} /></span>
              </div>
              <div className="console-stat">
                <span className="console-caps">Time reading</span>
                <span className="console-metric">{Math.round(data.dwell_seconds / 60)}m</span>
              </div>
            </div>

            <section className="console-stack-sm">
              <p className="console-caps">Liked</p>
              {data.liked.length === 0 ? (
                <p className="console-muted">Nothing hearted yet.</p>
              ) : (
                <div className="console-row" style={{ gap: 6 }}>
                  {data.liked.map((piece) => (
                    <a key={piece.id} href={`/admin/manage?open=${piece.id}`} className="console-chip">
                      <Text>{piece.title}</Text>
                    </a>
                  ))}
                </div>
              )}
            </section>

            <section className="console-stack-sm">
              <p className="console-caps">Saved for later</p>
              {data.saved.length === 0 ? (
                <p className="console-muted">Nothing saved yet.</p>
              ) : (
                <div className="console-row" style={{ gap: 6 }}>
                  {data.saved.map((piece) => (
                    <a key={piece.id} href={`/admin/manage?open=${piece.id}`} className="console-chip">
                      <Text>{piece.title}</Text>
                    </a>
                  ))}
                </div>
              )}
            </section>
          </>
        )
      ) : null}
    </Popup>
  );
}

function BlockPopup({
  customer,
  onClose,
  onChanged,
}: {
  customer: Customer;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { mutate, busy, problem } = useMutation();
  const [reason, setReason] = useState("");
  const [deactivate, setDeactivate] = useState(true);

  return (
    <Popup open title={`Block ${customer.name}?`} width={520} onClose={onClose}>
      {problem ? <p className="console-error">{problem}</p> : null}
      <p style={{ fontSize: "var(--t-md)", lineHeight: 1.6 }}>
        This stops every device this customer has ordered from — {customer.type === "auth" ? "and can also lock the account they sign in with." : "there is no account here to lock."}
      </p>

      <Field label="Reason" htmlFor="block-reason" hint="Kept on the block record — not shown to the customer.">
        <textarea id="block-reason" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
      </Field>

      {customer.has_account ? (
        <label className="console-check-row">
          <input type="checkbox" checked={deactivate} onChange={(event) => setDeactivate(event.target.checked)} />
          Also deactivate their account
        </label>
      ) : null}

      <div className="console-row">
        <Button
          variant="danger"
          block
          disabled={busy || !reason.trim()}
          onClick={() =>
            void mutate(() => api.blockCustomer(customer.id, reason.trim(), deactivate), {
              invalidates: ["customerChanged", "securityChanged"],
              onDone: onChanged,
            })
          }
        >
          {busy ? "Blocking…" : "Block this customer"}
        </Button>
        <Button block disabled={busy} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Popup>
  );
}
