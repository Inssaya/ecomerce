"use client";

/**
 * Commissions — someone describing a thing that does not exist yet.
 *
 * Two things were badly wrong here. The customer's reference photos were
 * fetched and thrown away, so the owner priced a bespoke job blind. And the
 * lifecycle was half-built: the list could filter to "In production" while
 * the only wired transition was "declined", so there was no button that could
 * reach the state you were looking at.
 *
 * Note what is *not* here: an Approve button. Approval is the customer
 * accepting the quote — the server records it with `actor="customer"` — so
 * offering it to the owner would be inventing a move that is not theirs.
 */
import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";

import { api, NEXT_REQUEST_STATUSES, type AdminRequest } from "@/lib/console/api";
import { useConsoleQuery, useMutation } from "@/lib/console/query";
import { statusLabel } from "@/lib/i18n";

import { SectionSwitch } from "../SectionSwitch";
import {
  Age,
  Button,
  Card,
  Clamp,
  ControlStrip,
  DataTable,
  Drawer,
  EmptyState,
  Field,
  LinkButton,
  LoadError,
  Money,
  Pill,
  Segmented,
  Skeleton,
  Stale,
  Text,
  useConfirm,
  type Column,
} from "../../ui/primitives";
import { HEAVY_REQUEST_MOVES, requestTone } from "../../ui/status";

const FILTERS = [
  { value: "requested", label: "Needs a price" },
  { value: "quoted", label: "Waiting on them" },
  { value: "approved", label: "Agreed" },
  { value: "in_production", label: "Being made" },
  { value: "", label: "All" },
] as const;

export default function Commissions() {
  const router = useRouter();
  const params = useSearchParams();
  const status = params.get("status") ?? "requested";
  const open = params.get("open");

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
    `commissions:${status}`,
    useCallback(() => api.requests(status || undefined), [status]),
  );

  const rows = data ?? [];
  const selected = rows.find((request) => request.reference === open) ?? null;

  const columns: Column<AdminRequest>[] = [
    { key: "age", header: "Waited", align: "right", width: 66, render: (request) => <Age iso={request.created_at} /> },
    { key: "reference", header: "Reference", render: (request) => <span className="console-num console-strong">{request.reference}</span> },
    {
      key: "customer",
      header: "Who",
      render: (request) => (
        <>
          <Text>{request.customer_name}</Text>
          <div className="console-cell-sub">{request.city ?? "no city given"}</div>
        </>
      ),
    },
    {
      key: "what",
      header: "What they asked for",
      render: (request) => (
        <span style={{ display: "block", maxWidth: 280 }}>
          <Text>{request.description.slice(0, 90)}</Text>
          {request.description.length > 90 ? "…" : ""}
        </span>
      ),
    },
    {
      key: "photos",
      header: "Photos",
      align: "right",
      width: 70,
      render: (request) => (request.references.length ? <span className="console-num">{request.references.length}</span> : <span className="console-muted">—</span>),
    },
    {
      key: "status",
      header: "Status",
      render: (request) => <Pill tone={requestTone(request.status)}>{statusLabel("en", "requestStatus", request.status)}</Pill>,
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
                ariaLabel="Which commissions"
              />
            ),
          },
        ]}
        trailing={
          <>
            <Pill tone="neutral">{rows.length} shown</Pill>
            <SectionSwitch current="commissions" />
          </>
        }
      />

      {error && !data ? <LoadError message={error} onRetry={reload} /> : null}
      {loading ? <Skeleton height={240} /> : null}

      {data ? (
        <Stale stale={stale}>
          <Card pad="sm">
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(request) => request.reference}
              selectedKey={open}
              onRowClick={(request) => setParam("open", request.reference)}
              minWidth={760}
              empty={<EmptyState title="Nothing waiting on you." hint="Custom requests from the shop land here." />}
            />
          </Card>
        </Stale>
      ) : null}

      {selected ? <CommissionDrawer request={selected} onClose={() => setParam("open", null)} onChanged={reload} /> : null}
    </>
  );
}

function CommissionDrawer({
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
              This closes the request and tells {request.customer_name}. There is no way back from it — a new request
              would have to start again.
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
    <Drawer
      open
      onClose={onClose}
      title={<span className="console-num">{request.reference}</span>}
      sub={
        <>
          <Text>{request.customer_name}</Text>
          {request.city ? ` · ${request.city}` : ""} · waited <Age iso={request.created_at} />
        </>
      }
      actions={
        <>
          {moves.map((next) => (
            <Button key={next} variant={HEAVY_REQUEST_MOVES.has(next) ? "default" : "primary"} disabled={busy} onClick={() => move(next)}>
              {statusLabel("en", "requestStatus", next)}
            </Button>
          ))}
          <Pill tone={requestTone(request.status)}>{statusLabel("en", "requestStatus", request.status)}</Pill>
        </>
      }
    >
      {problem ? <p className="console-error">{problem}</p> : null}

      <div className="console-row">
        <LinkButton href={`tel:${request.customer_phone}`} icon="phone">
          {request.customer_phone}
        </LinkButton>
        {request.whatsapp_url ? (
          <LinkButton href={request.whatsapp_url} target="_blank" rel="noreferrer" icon="whatsapp">
            WhatsApp
          </LinkButton>
        ) : null}
        {request.customer_email ? (
          <LinkButton href={`mailto:${request.customer_email}`} icon="external" size="sm">
            {request.customer_email}
          </LinkButton>
        ) : null}
      </div>

      {/* The photos. Pricing a bespoke piece without them is guessing. */}
      <section className="console-stack-sm">
        <p className="console-caps">What they sent</p>
        {request.references.length === 0 ? (
          <p className="console-muted">No photos sent — the description is all there is.</p>
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

      <section className="console-stack-sm">
        <p className="console-caps">In their words</p>
        <p style={{ fontSize: "var(--t-md)", lineHeight: 1.65 }}>
          <Clamp lines={8}>{request.description}</Clamp>
        </p>
        {request.budget ? (
          <p className="console-muted">
            Budget mentioned: <Money value={request.budget} />
          </p>
        ) : (
          <p className="console-muted">No budget given.</p>
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
    </Drawer>
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
    // Mirror the server's bounds so a mistake is caught beside the field
    // rather than after a round trip.
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
