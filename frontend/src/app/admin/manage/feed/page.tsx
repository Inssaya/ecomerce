"use client";

/**
 * Manage · Feed — what the shop pushes.
 *
 * The endpoints have existed the whole time and nothing ever called them, so
 * the lever the owner was promised has been unreachable since it was built.
 *
 * Three things this screen is careful about:
 *  · levers apply on **Save**, not on drag — every change is live to real
 *    shoppers, and dragging a slider should not reshape the shop mid-thought
 *  · fatigue is *subtracted*, so it is labelled by what it does, not by its
 *    name, or the mental model inverts
 *  · the preview is computed for a **fresh visitor**. The feed is
 *    personalised, so previewing it as the owner would show the owner's own
 *    feed — the one audience whose feed does not matter.
 */
import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/console/api";
import { useConsoleQuery, useMutation } from "@/lib/console/query";

import { ManageSwitch } from "../ManageSwitch";
import {
  Button,
  Card,
  CardHead,
  ControlStrip,
  EmptyState,
  LoadError,
  Pill,
  Skeleton,
  Stale,
  Text,
  useConfirm,
  useDirtyGuard,
} from "../../ui/primitives";

/** Named by effect. "Fatigue: 0.6" tells the owner nothing. */
const LABELS: Record<string, string> = {
  affinity: "Follow their own browsing",
  semantic: "Show things that feel similar",
  popular: "Favour what everyone is looking at",
  fresh: "Push what we made recently",
  business: "Respect your own boost",
  fatigue: "Push down what they have already seen",
};

const DEFAULTS: Record<string, number> = {
  affinity: 1.0,
  semantic: 0.8,
  popular: 0.4,
  fresh: 0.3,
  business: 0.5,
  fatigue: 0.6,
};

export default function Feed() {
  const weights = useConsoleQuery("feed:weights", useCallback(() => api.feedWeights(), []));
  const preview = useConsoleQuery("feed:preview", useCallback(() => api.feedPreview(20), []));
  const { mutate, busy, problem } = useMutation();
  const confirm = useConfirm();

  const [draft, setDraft] = useState<Record<string, number>>({});
  useEffect(() => {
    if (weights.data) setDraft(Object.fromEntries(weights.data.map((weight) => [weight.key, weight.value])));
  }, [weights.data]);

  const saved = Object.fromEntries((weights.data ?? []).map((weight) => [weight.key, weight.value]));
  const dirty = Object.keys(draft).some((key) => draft[key] !== saved[key]);
  useDirtyGuard(dirty);

  const allZero = Object.values(draft).length > 0 && Object.values(draft).every((value) => value === 0);

  function save() {
    const body = Object.entries(draft).map(([key, value]) => ({ key, value }));
    const run = () =>
      mutate(() => api.setFeedWeights(body), {
        invalidates: ["feedChanged"],
        onDone: () => {
          weights.reload();
          preview.reload();
        },
      });

    if (allZero) {
      confirm({
        title: "Turn every lever off?",
        body: "With all six at zero the ranking has nothing to go on and the order of the shop becomes arbitrary.",
        confirmLabel: "Save anyway",
        danger: true,
        onConfirm: run,
      });
      return;
    }
    void run();
  }

  return (
    <>
      <ControlStrip
        groups={[]}
        trailing={
          <>
            {dirty ? <Pill tone="warning">unsaved</Pill> : null}
            <ManageSwitch current="feed" />
          </>
        }
      />

      {weights.error && !weights.data ? <LoadError message={weights.error} onRetry={weights.reload} /> : null}
      {weights.loading ? <Skeleton height={320} /> : null}
      {problem ? <p className="console-error">{problem}</p> : null}

      {weights.data ? (
        <Stale stale={weights.stale}>
          <div className="console-grid console-grid-2">
            <Card>
              <CardHead
                title="The levers"
                sub="Every change here is live to real shoppers the moment you save."
                actions={
                  <Button size="sm" disabled={busy} onClick={() => setDraft({ ...DEFAULTS })}>
                    Reset to defaults
                  </Button>
                }
              />

              {weights.data.map((weight) => {
                const value = draft[weight.key] ?? weight.value;
                const changed = value !== saved[weight.key];
                return (
                  <div key={weight.key} className="console-stack-sm">
                    <div className="console-row-between">
                      <span className="console-strong">{LABELS[weight.key] ?? weight.key}</span>
                      <span className="console-row" style={{ gap: 8 }}>
                        {changed ? <span className="console-muted console-num">was {saved[weight.key]}</span> : null}
                        <span className="console-num console-strong">{value.toFixed(1)}</span>
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={5}
                      step={0.1}
                      value={value}
                      aria-label={LABELS[weight.key] ?? weight.key}
                      onChange={(event) => setDraft({ ...draft, [weight.key]: Number(event.target.value) })}
                    />
                    {/* Written for the owner in the backend — used verbatim. */}
                    <p className="console-muted">{weight.explains}</p>
                  </div>
                );
              })}

              <div className="console-row">
                <Button variant="primary" disabled={busy || !dirty} onClick={save}>
                  {busy ? "Saving…" : "Save the levers"}
                </Button>
                {dirty ? (
                  <Button disabled={busy} onClick={() => setDraft({ ...saved })}>
                    Discard
                  </Button>
                ) : null}
              </div>
            </Card>

            <Card>
              <CardHead
                title="What the shop is pushing"
                sub="As a first-time visitor sees it — not as you see it, which your own browsing has already reshaped."
                actions={
                  <Button size="sm" icon="refresh" disabled={preview.stale} onClick={preview.reload}>
                    Refresh
                  </Button>
                }
              />
              {preview.loading ? (
                <Skeleton height={200} />
              ) : (preview.data?.items ?? []).length === 0 ? (
                <EmptyState title="Nothing to rank yet." hint="Publish a piece and it appears here in order." />
              ) : (
                <ol className="console-stack-sm">
                  {(preview.data?.items ?? []).map((item, index) => (
                    <li key={item.product_id} className="console-row-between" style={{ fontSize: "var(--t-md)", flexWrap: "nowrap", gap: 10 }}>
                      <span className="console-row" style={{ gap: 8, minWidth: 0, flexWrap: "nowrap" }}>
                        <span className="console-num console-muted" style={{ width: 22, flex: "none" }}>
                          {index + 1}
                        </span>
                        {/* A 90-character title must not push the score onto
                            its own line and break the ranking's rhythm. */}
                        <span dir="auto" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.title}>
                          {item.title}
                        </span>
                      </span>
                      <span className="console-num console-muted" style={{ flex: "none" }}>{item.score.toFixed(2)}</span>
                    </li>
                  ))}
                </ol>
              )}
              {dirty ? <p className="console-note">Save the levers to see this reorder.</p> : null}
            </Card>
          </div>

          <Card>
            <CardHead
              title="Semantic search"
              sub="Similar-feeling pieces are the second-heaviest term in the ranking — but only for pieces that have been read."
              actions={
                <Button
                  size="sm"
                  icon="refresh"
                  disabled={busy}
                  onClick={() => void mutate(() => api.refreshEmbeddings(false), { invalidates: ["feedChanged"] })}
                >
                  Read what changed
                </Button>
              }
            />
            <p className="console-muted">
              Run this after adding or rewording pieces. Anything whose words have not changed is skipped.
            </p>
          </Card>
        </Stale>
      ) : null}
    </>
  );
}
