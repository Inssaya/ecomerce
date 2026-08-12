"use client";

/**
 * Messages — the contact form, made durable.
 *
 * Two fixes beyond the styling. The email and phone were inert text, so the
 * one thing you want to do with a message — reply to it — took a copy and a
 * paste. And there was no delete and no archive, which meant one run of spam
 * left the unread badge permanently meaningless; archiving files a message
 * away without throwing away a lead.
 */
import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { api } from "@/lib/console/api";
import { useConsoleQuery, useMutation } from "@/lib/console/query";

import { SectionSwitch } from "../SectionSwitch";
import {
  Age,
  Button,
  Card,
  Clamp,
  ControlStrip,
  EmptyState,
  LinkButton,
  LoadError,
  Pill,
  Segmented,
  Skeleton,
  Stale,
  Text,
} from "../../ui/primitives";

const VIEWS = [
  { value: "unread", label: "Unread" },
  { value: "all", label: "All" },
  { value: "archived", label: "Archived" },
] as const;

export default function Messages() {
  const router = useRouter();
  const params = useSearchParams();
  const view = (params.get("view") ?? (params.get("unread") ? "unread" : "all")) as "unread" | "all" | "archived";

  const setView = useCallback(
    (next: string) => router.replace(`/admin/orders/messages?view=${next}`, { scroll: false }),
    [router],
  );

  const { data, error, loading, stale, reload } = useConsoleQuery(
    `messages:${view}`,
    useCallback(() => api.messages({ unread: view === "unread", archived: view === "archived" }), [view]),
  );

  const { mutate, busy } = useMutation();
  const rows = data ?? [];
  const unread = rows.filter((message) => !message.read_at).length;

  return (
    <>
      <ControlStrip
        groups={[{ label: "Show", controls: <Segmented options={VIEWS} value={view} onChange={setView} ariaLabel="Which messages" /> }]}
        trailing={
          <>
            <Pill tone="neutral">{rows.length} shown</Pill>
            <SectionSwitch current="messages" unread={view === "archived" ? undefined : unread} />
          </>
        }
      />

      {error && !data ? <LoadError message={error} onRetry={reload} /> : null}
      {loading ? <Skeleton height={200} /> : null}

      {data ? (
        <Stale stale={stale}>
          <div className="console-stack-sm">
            {rows.length === 0 ? (
              <EmptyState
                title={view === "unread" ? "Nothing unread." : view === "archived" ? "Nothing archived." : "No messages yet."}
                hint={view === "all" ? "Anything sent through the contact form lands here." : undefined}
              />
            ) : (
              rows.map((message) => (
                <Card key={message.id} pad="sm">
                  <div className="console-row-between">
                    <span className="console-row" style={{ gap: 8 }}>
                      <Text className="console-strong">{message.name}</Text>
                      {!message.read_at ? <Pill tone="brand">new</Pill> : null}
                    </span>
                    <span className="console-muted">
                      <Age iso={message.created_at} />
                    </span>
                  </div>

                  <p style={{ fontSize: "var(--t-md)", lineHeight: 1.65 }}>
                    <Clamp lines={4}>{message.message}</Clamp>
                  </p>

                  <div className="console-row">
                    {message.email ? (
                      <LinkButton href={`mailto:${message.email}?subject=Re: your message to M-StyLe`} size="sm" icon="external">
                        {message.email}
                      </LinkButton>
                    ) : null}
                    {message.phone ? (
                      <LinkButton href={`tel:${message.phone}`} size="sm" icon="phone">
                        {message.phone}
                      </LinkButton>
                    ) : null}
                    {!message.email && !message.phone ? <span className="console-muted">No way to reply — they left neither.</span> : null}

                    <span style={{ marginInlineStart: "auto" }} className="console-row">
                      {!message.read_at ? (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => void mutate(() => api.markMessageRead(message.id), { invalidates: ["messageRead"], onDone: reload })}
                        >
                          Mark read
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void mutate(() => api.archiveMessage(message.id, !message.archived_at), {
                            invalidates: ["messageArchived"],
                            onDone: reload,
                          })
                        }
                      >
                        {message.archived_at ? "Bring back" : "Archive"}
                      </Button>
                    </span>
                  </div>
                </Card>
              ))
            )}
          </div>
        </Stale>
      ) : null}
    </>
  );
}
