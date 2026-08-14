"use client";

/**
 * Logs — deliberately plain.
 *
 * No cards, no charts, no chrome beyond a level filter — the owner asked for
 * simple. Danger rows read in red without opening anything; opening one
 * shows the device that caused it and offers to stop it.
 */
import { useCallback, useState } from "react";

import { api, type SecurityEvent, type SecurityLevel } from "@/lib/console/api";
import { useConsoleQuery, useMutation } from "@/lib/console/query";

import {
  Button,
  Card,
  ControlStrip,
  DataTable,
  EmptyState,
  Field,
  LoadError,
  Pill,
  Popup,
  Segmented,
  Skeleton,
  Stale,
  Text,
  type Column,
} from "../ui/primitives";

const LEVELS = [
  { value: "" as const, label: "All" },
  { value: "info" as const, label: "Info" },
  { value: "warn" as const, label: "Warn" },
  { value: "danger" as const, label: "Danger" },
];

const LEVEL_TONE: Record<SecurityLevel, "neutral" | "warning" | "danger"> = {
  info: "neutral",
  warn: "warning",
  danger: "danger",
};

export default function Logs() {
  const [level, setLevel] = useState<"" | SecurityLevel>("");
  const [open, setOpen] = useState<string | null>(null);

  const { data, error, loading, stale, reload } = useConsoleQuery(
    `security-logs:${level}`,
    useCallback(() => api.securityLogs({ level: level || undefined }), [level]),
  );

  const rows = data ?? [];
  const selected = rows.find((event) => event.id === open) ?? null;

  const columns: Column<SecurityEvent>[] = [
    {
      key: "time",
      header: "Time",
      width: 150,
      render: (event) => (
        <time className="console-num" dateTime={event.created_at}>
          {new Date(event.created_at).toLocaleString()}
        </time>
      ),
    },
    {
      key: "level",
      header: "Level",
      width: 90,
      render: (event) => <Pill tone={LEVEL_TONE[event.level]}>{event.level}</Pill>,
    },
    { key: "kind", header: "Kind", width: 160, render: (event) => <span className="console-num">{event.kind}</span> },
    { key: "message", header: "Message", render: (event) => <Text>{event.message}</Text> },
    { key: "ip", header: "IP", width: 140, render: (event) => (event.ip ? <span className="console-num">{event.ip}</span> : "—") },
  ];

  return (
    <>
      <ControlStrip
        groups={[
          {
            label: "Show",
            controls: <Segmented options={LEVELS} value={level} onChange={setLevel} ariaLabel="Which level" />,
          },
        ]}
        trailing={<Pill tone="neutral">{rows.length}</Pill>}
      />

      {error && !data ? <LoadError message={error} onRetry={reload} /> : null}
      {loading ? <Skeleton height={300} /> : null}

      {data ? (
        <Stale stale={stale}>
          <Card pad="sm" flush>
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(event) => event.id}
              selectedKey={open}
              onRowClick={(event) => setOpen(event.id)}
              minWidth={900}
              rowClassName={(event) => (event.level === "danger" ? "console-row-danger" : undefined)}
              empty={<EmptyState title="Nothing logged yet." hint="Rate-limit trips and other notable events land here." />}
            />
          </Card>
        </Stale>
      ) : null}

      {selected ? <EventPopup event={selected} onClose={() => setOpen(null)} onChanged={reload} /> : null}
    </>
  );
}

function EventPopup({
  event,
  onClose,
  onChanged,
}: {
  event: SecurityEvent;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [blocking, setBlocking] = useState(false);

  return (
    <Popup
      open
      title={<Pill tone={LEVEL_TONE[event.level]}>{event.level}</Pill>}
      sub={new Date(event.created_at).toLocaleString()}
      width={620}
      onClose={onClose}
      actions={
        (event.ip || event.visitor_id) && !blocking ? (
          <Button variant="danger" onClick={() => setBlocking(true)}>
            Block device
          </Button>
        ) : undefined
      }
    >
      <section className="console-detail-list">
        <div>
          <dt>Kind</dt>
          <dd className="console-num">{event.kind}</dd>
        </div>
        <div>
          <dt>Message</dt>
          <dd style={{ maxWidth: "60%", textAlign: "start" }}>
            <Text>{event.message}</Text>
          </dd>
        </div>
        <div>
          <dt>IP</dt>
          <dd className="console-num">{event.ip ?? "—"}</dd>
        </div>
        <div>
          <dt>Device fingerprint</dt>
          <dd className="console-num">{event.visitor_id ?? "—"}</dd>
        </div>
        <div>
          <dt>Account</dt>
          <dd className="console-num">{event.user_id ?? "—"}</dd>
        </div>
      </section>

      {event.meta ? (
        <details>
          <summary className="console-caps" style={{ cursor: "pointer" }}>
            Raw detail
          </summary>
          <pre className="console-cell-sub" style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>
            {JSON.stringify(event.meta, null, 2)}
          </pre>
        </details>
      ) : null}

      {blocking ? (
        <BlockForm ip={event.ip} visitorId={event.visitor_id} onDone={() => { setBlocking(false); onChanged(); }} onCancel={() => setBlocking(false)} />
      ) : null}
    </Popup>
  );
}

function BlockForm({
  ip,
  visitorId,
  onDone,
  onCancel,
}: {
  ip: string | null;
  visitorId: string | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { mutate, busy, problem } = useMutation();
  const [reason, setReason] = useState("");
  const [includeIp, setIncludeIp] = useState(false);
  const [includeVisitor, setIncludeVisitor] = useState(Boolean(visitorId));

  return (
    <section className="console-stack-sm" style={{ borderTop: "1px solid var(--line)", paddingTop: "var(--space-4)" }}>
      <p className="console-caps">Block this device</p>
      {problem ? <p className="console-error">{problem}</p> : null}

      <Field label="Reason" htmlFor="log-block-reason">
        <textarea id="log-block-reason" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
      </Field>

      {visitorId ? (
        <label className="console-check-row">
          <input type="checkbox" checked={includeVisitor} onChange={(event) => setIncludeVisitor(event.target.checked)} />
          Block the fingerprint — <span className="console-num">{visitorId}</span> — until lifted
        </label>
      ) : null}
      {ip ? (
        <label className="console-check-row">
          <input type="checkbox" checked={includeIp} onChange={(event) => setIncludeIp(event.target.checked)} />
          Also block the address — <span className="console-num">{ip}</span> — for 24 hours
        </label>
      ) : null}

      <div className="console-row">
        <Button
          variant="danger"
          disabled={busy || !reason.trim() || (!includeIp && !includeVisitor)}
          onClick={() =>
            void mutate(
              () =>
                api.createBlock({
                  reason: reason.trim(),
                  visitor_id: includeVisitor ? visitorId : null,
                  ip: includeIp ? ip : null,
                }),
              { invalidates: ["securityChanged"], onDone },
            )
          }
        >
          {busy ? "Blocking…" : "Block"}
        </Button>
        <Button disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </section>
  );
}
