"use client";

/**
 * Custom — someone describing a thing that does not exist yet.
 *
 * The modal is in the Aptiv intervention shape: a pill row for status and
 * category, a key/value list for the facts (desires, contact channels), the
 * reference photos, then the quote form. Pricing a bespoke job blind — which
 * is what happened before the photos were actually wired up — is guessing.
 *
 * Note what is *not* here: an Approve button. Approval is the customer
 * accepting the quote — the server records it with `actor="customer"` — so
 * offering it to the owner would be inventing a move that is not theirs.
 */
import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";

import { api, NEXT_REQUEST_STATUSES, type AdminRequest, type Range } from "@/lib/console/api";
import { useConsoleQuery, useMutation } from "@/lib/console/query";
import { statusLabel } from "@/lib/i18n";

import {
  Age,
  Button,
  Card,
  ConsoleHeader,
  DataTable,
  DateRangeFilter,
  EmptyState,
  Field,
  LinkButton,
  LoadError,
  Money,
  Pill,
  Popup,
  Skeleton,
  Stale,
  Text,
  useConfirm,
  type Column,
} from "../../ui/primitives";
import { HEAVY_REQUEST_MOVES, requestTone } from "../../ui/status";

const PAGES = [
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/orders/commissions", label: "Custom", active: true },
  { href: "/admin/orders/messages", label: "Messages" },
];

const STATUSES = [
  { value: "", label: "All statuses" },
  { value: "requested", label: "Needs a price" },
  { value: "quoted", label: "Waiting on them" },
  { value: "approved", label: "Agreed" },
  { value: "in_production", label: "Being made" },
  { value: "ready", label: "Finished" },
  { value: "delivered", label: "Delivered" },
  { value: "declined", label: "Declined" },
  { value: "withdrawn", label: "Withdrawn" },
];

export default function Commissions() {
  const router = useRouter();
  const params = useSearchParams();
  const confirm = useConfirm();
  const { mutate, busy } = useMutation();

  const status = params.get("status") ?? "";
  const open = params.get("open");
  const [categoryId, setCategoryId] = useState("");
  const [range, setRange] = useState<Range | null>(null);
  const [hidden, setHidden] = useState(false);

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      router.replace(`/admin/orders/commissions?${next.toString()}`, { scroll: false });
    },
    [params, router],
  );

  const { data, error, loading, stale, reload } = useConsoleQuery(
    `commissions:${status}:${categoryId}:${range?.from ?? ""}:${range?.to ?? ""}:${hidden}`,
    useCallback(
      () => api.requests({ status: status || undefined, categoryId: categoryId || undefined, range, hidden }),
      [status, categoryId, range, hidden],
    ),
  );
  const categories = useConsoleQuery("categories", useCallback(() => api.categories(), []));

  const rows = data ?? [];
  const selected = rows.find((request) => request.reference === open) ?? null;

  const columns: Column<AdminRequest>[] = [
    { key: "date", header: "Date", width: 90, render: (request) => <Age iso={request.created_at} /> },
    { key: "reference", header: "Ref", render: (request) => <span className="console-num console-strong">{request.reference}</span> },
    {
      key: "customer",
      header: "Customer",
      render: (request) => (
        <>
          <Text>{request.customer_name}</Text>
        </>
      ),
    },
    { key: "city", header: "City", render: (request) => request.city ?? "—" },
    { key: "category", header: "Category", render: (request) => request.category_name ?? "—" },
    {
      key: "status",
      header: "Status",
      render: (request) => <Pill tone={requestTone(request.status)}>{statusLabel("en", "requestStatus", request.status)}</Pill>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: 150,
      render: (request) => (
        <span className="console-row-actions" onClick={(event) => event.stopPropagation()}>
          <Button size="sm" onClick={() => setParam("open", request.reference)}>
            Open
          </Button>
          {hidden ? (
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                void mutate(() => api.unhideRequest(request.reference), { invalidates: ["commissionChanged"], onDone: reload })
              }
            >
              Restore
            </Button>
          ) : (
            <Button
              size="sm"
              iconOnly
              icon="trash"
              aria-label={`Archive request ${request.reference}`}
              disabled={busy}
              onClick={() =>
                confirm({
                  title: `Archive request ${request.reference}?`,
                  body: "It leaves this queue. Nothing is deleted, and you can bring it back from the Hidden view.",
                  confirmLabel: "Archive it",
                  danger: true,
                  onConfirm: () =>
                    mutate(() => api.hideRequest(request.reference), { invalidates: ["commissionChanged"], onDone: reload }),
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
            <DateRangeFilter value={range} onChange={setRange} ariaLabel="When it was asked" />
            <select className="console-select" value={status} onChange={(event) => setParam("status", event.target.value || null)} aria-label="Status">
              {STATUSES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select className="console-select" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} aria-label="Category">
              <option value="">All categories</option>
              {(categories.data ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.parent_id ? "— " : ""}
                  {category.name_en}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={() => setHidden((was) => !was)}>
              {hidden ? "Show live queue" : "Show archived"}
            </Button>
          </>
        }
        pages={PAGES}
        trailing={<Pill tone="neutral">{rows.length} shown</Pill>}
      />

      {error && !data ? <LoadError message={error} onRetry={reload} /> : null}
      {loading ? <Skeleton height={260} /> : null}

      {data ? (
        <Stale stale={stale}>
          <Card pad="sm" flush>
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(request) => request.reference}
              selectedKey={open}
              onRowClick={(request) => setParam("open", request.reference)}
              minWidth={860}
              empty={<EmptyState title={hidden ? "Nothing archived." : "Nothing waiting on you."} hint={hidden ? undefined : "Custom requests from the shop land here."} />}
            />
          </Card>
        </Stale>
      ) : null}

      {selected ? <CommissionPopup request={selected} onClose={() => setParam("open", null)} onChanged={reload} /> : null}
    </>
  );
}

function CommissionPopup({
  request,
  onClose,
  onChanged,
}: {
  request: AdminRequest;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { mutate, busy, problem } = useMutation();
  const confirm = useConfirm();
  const moves = (NEXT_REQUEST_STATUSES[request.status] ?? []).filter((next) => next !== "quoted");

  function move(next: string) {
    const label = statusLabel("en", "requestStatus", next);
    const run = () =>
      mutate(() => api.moveRequest(request.reference, next), { invalidates: ["commissionMoved"], onDone: onChanged });

    if (HEAVY_REQUEST_MOVES.has(next)) {
      confirm({
        title: `${label} — ${request.reference}?`,
        body:
          next === "declined" || next === "withdrawn" ? (
            <>
              This closes the request and tells {request.customer_name}. There is no way back from it — a new
              request would have to start again.
            </>
          ) : (
            <>This tells {request.customer_name} the piece is {label.toLowerCase()}.</>
          ),
        confirmLabel: label,
        danger: next === "declined" || next === "withdrawn",
        onConfirm: run,
      });
      return;
    }
    void run();
  }

  return (
    <Popup
      open
      title={<span className="console-num">{request.reference}</span>}
      sub={
        <>
          <Text>{request.customer_name}</Text>
          {request.city ? ` · ${request.city}` : ""} · waited <Age iso={request.created_at} />
        </>
      }
      width={780}
      onClose={onClose}
      actions={
        <>
          {/* The pill row: status first, category beside it — the two facts
              the Aptiv intervention header always leads with. */}
          <Pill tone={requestTone(request.status)}>{statusLabel("en", "requestStatus", request.status)}</Pill>
          {request.category_name ? <Pill tone="neutral">{request.category_name}</Pill> : null}
          {moves.map((next) => (
            <Button key={next} variant={HEAVY_REQUEST_MOVES.has(next) ? "default" : "primary"} disabled={busy} onClick={() => move(next)}>
              {statusLabel("en", "requestStatus", next)}
            </Button>
          ))}
          {!request.hidden ? (
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                confirm({
                  title: `Archive request ${request.reference}?`,
                  body: "It leaves the working queue. You can bring it back from the Hidden view.",
                  confirmLabel: "Archive it",
                  danger: true,
                  onConfirm: () =>
                    mutate(() => api.hideRequest(request.reference), { invalidates: ["commissionChanged"], onDone: onChanged }),
                })
              }
            >
              Archive
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void mutate(() => api.unhideRequest(request.reference), { invalidates: ["commissionChanged"], onDone: onChanged })}
            >
              Restore
            </Button>
          )}
        </>
      }
    >
      {problem ? <p className="console-error">{problem}</p> : null}

      {/* Contact channels, as the key/value list. */}
      <section className="console-detail-list">
        <div>
          <dt>Phone</dt>
          <dd>
            <LinkButton href={`tel:${request.customer_phone}`} icon="phone" size="sm">
              {request.customer_phone}
            </LinkButton>
          </dd>
        </div>
        {request.whatsapp_url ? (
          <div>
            <dt>WhatsApp</dt>
            <dd>
              <LinkButton href={request.whatsapp_url} target="_blank" rel="noreferrer" icon="whatsapp" size="sm">
                Message
              </LinkButton>
            </dd>
          </div>
        ) : null}
        {request.customer_email ? (
          <div>
            <dt>Email</dt>
            <dd>
              <LinkButton href={`mailto:${request.customer_email}`} icon="external" size="sm">
                {request.customer_email}
              </LinkButton>
            </dd>
          </div>
        ) : null}
        <div>
          <dt>What they want</dt>
          <dd style={{ maxWidth: "60%", textAlign: "start" }}>
            <Text>{request.description}</Text>
          </dd>
        </div>
        <div>
          <dt>Budget mentioned</dt>
          <dd>{request.budget ? <Money value={request.budget} /> : "none given"}</dd>
        </div>
      </section>

      {/* The reference photos. Pricing a bespoke piece without them is guessing. */}
      <section className="console-stack-sm">
        <p className="console-caps">What they sent</p>
        {request.references.length === 0 ? (
          <p className="console-muted">No photos sent — the description above is all there is.</p>
        ) : (
          <div className="console-row" style={{ gap: 8 }}>
            {request.references.map((url, index) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noreferrer"
                style={{
                  position: "relative",
                  width: 96,
                  height: 96,
                  borderRadius: "var(--r-sm)",
                  overflow: "hidden",
                  background: "var(--bg2)",
                  border: "1px solid var(--line)",
                  flex: "none",
                }}
              >
                <Image src={url} alt={`Reference photo ${index + 1}`} fill sizes="96px" style={{ objectFit: "cover" }} unoptimized />
              </a>
            ))}
          </div>
        )}
      </section>

      {request.quote_price ? (
        <p className="console-note">
          You sent <Money value={request.quote_price} />
          {request.promised_for ? ` · ready by ${new Date(request.promised_for).toLocaleDateString()}` : ""}
          {request.order_reference ? (
            <>
              {" · became order "}
              <a href={`/admin/orders?open=${request.order_reference}`} className="console-num" style={{ textDecoration: "underline" }}>
                {request.order_reference}
              </a>
            </>
          ) : null}
        </p>
      ) : null}

      {request.status === "requested" || request.status === "quoted" ? (
        <QuoteForm request={request} onDone={onChanged} />
      ) : null}
    </Popup>
  );
}

function QuoteForm({ request, onDone }: { request: AdminRequest; onDone: () => void }) {
  const { mutate, busy, problem } = useMutation();
  const confirm = useConfirm();
  const [price, setPrice] = useState(request.quote_price ? String(request.quote_price) : "");
  const [days, setDays] = useState(request.lead_time_days ? String(request.lead_time_days) : "");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<{ price?: string; days?: string }>({});

  const reQuoting = request.status === "quoted";

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: { price?: string; days?: string } = {};
    const priceValue = Number(price);
    const dayValue = Number(days);
    if (!(priceValue > 0)) nextErrors.price = "A price above zero";
    if (!(dayValue >= 1 && dayValue <= 365)) nextErrors.days = "Between 1 and 365 days";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const send = () =>
      mutate(() => api.quote(request.reference, priceValue, dayValue, note), {
        invalidates: ["quoteSent"],
        onDone,
      });

    if (reQuoting) {
      confirm({
        title: "Send a new price?",
        body: <>This replaces the price {request.customer_name} already has, and tells them again.</>,
        confirmLabel: "Send the new price",
        onConfirm: send,
      });
      return;
    }
    void send();
  }

  return (
    <form onSubmit={submit} className="console-stack">
      <p className="console-caps">{reQuoting ? "Send a different price" : "Send a price"}</p>
      <div className="console-form-grid console-form-2">
        <Field label="Price" htmlFor={`price-${request.reference}`} error={errors.price}>
          <input
            id={`price-${request.reference}`}
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            aria-invalid={Boolean(errors.price)}
          />
        </Field>
        <Field label="Ready in (days)" htmlFor={`days-${request.reference}`} error={errors.days} hint="A real date reads as competence; vagueness does not.">
          <input
            id={`days-${request.reference}`}
            type="number"
            min={1}
            max={365}
            inputMode="numeric"
            value={days}
            onChange={(event) => setDays(event.target.value)}
            aria-invalid={Boolean(errors.days)}
          />
        </Field>
      </div>
      <Field label="A note to them (optional)" htmlFor={`note-${request.reference}`}>
        <textarea id={`note-${request.reference}`} rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
      {problem ? <p className="console-error">{problem}</p> : null}
      <Button type="submit" variant="primary" disabled={busy}>
        {busy ? "Sending…" : reQuoting ? "Send the new price" : "Send the price"}
      </Button>
      <p className="console-muted">Nothing is owed until they agree — agreeing is what creates the order.</p>
    </form>
  );
}
