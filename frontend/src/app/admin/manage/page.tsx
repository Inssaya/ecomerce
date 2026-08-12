"use client";

/**
 * Manage · Pieces — a narrow list, a big inspector.
 *
 * Details get the room, not the lists. The list carries only what you scan
 * by: the photo, the name, the category (which used to be invisible until you
 * opened the piece), the price, and a mark when something is stopping it from
 * going live.
 */
import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";

import { api, type AdminProduct } from "@/lib/console/api";
import { useConsoleQuery } from "@/lib/console/query";

import { ManageSwitch } from "./ManageSwitch";
import { NewPiece } from "./NewPiece";
import { PieceInspector } from "./PieceInspector";
import {
  Button,
  Card,
  ControlStrip,
  EmptyState,
  Icon,
  LoadError,
  Money,
  Pill,
  SearchInput,
  Segmented,
  Skeleton,
  Stale,
  Text,
  useDebounced,
} from "../ui/primitives";

const STATUSES = [
  { value: "", label: "Working" },
  { value: "active", label: "Live" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Archived" },
] as const;

/** What is stopping this piece from being sold, if anything. */
function blockerFor(product: AdminProduct): string | null {
  if (product.images.length === 0) return "no photo";
  if (product.kind === "workshop" && !product.lead_time_days) return "no lead time";
  if (product.kind === "shelf" && !product.available && product.status === "active") return "nothing left";
  return null;
}

export default function ManagePieces() {
  const router = useRouter();
  const params = useSearchParams();
  const status = params.get("status") ?? "";
  const open = params.get("open");
  const [query, setQuery] = useState("");
  const [making, setMaking] = useState(false);
  const settled = useDebounced(query, 250);

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      router.replace(`/admin/manage?${next.toString()}`, { scroll: false });
    },
    [params, router],
  );

  const products = useConsoleQuery(
    `pieces:${status}`,
    useCallback(() => api.products(status || undefined), [status]),
  );
  const categories = useConsoleQuery("categories", useCallback(() => api.categories(), []));

  const categoryName = useMemo(() => {
    const map = new Map((categories.data ?? []).map((category) => [category.id, category.name_en]));
    return (id: string | null) => (id ? (map.get(id) ?? "—") : "—");
  }, [categories.data]);

  const rows = useMemo(() => {
    const all = products.data ?? [];
    // "Working" means the live catalogue — archived pieces are retired on
    // purpose and would otherwise sit at the top of a newest-first list.
    const scoped = status === "" ? all.filter((product) => product.status !== "archived") : all;
    const needle = settled.trim().toLowerCase();
    if (!needle) return scoped;
    return scoped.filter(
      (product) =>
        product.title_en.toLowerCase().includes(needle) ||
        product.title_ar.includes(needle) ||
        product.slug.toLowerCase().includes(needle),
    );
  }, [products.data, status, settled]);

  const selected = rows.find((product) => product.id === open) ?? null;
  const needAttention = rows.filter((product) => blockerFor(product)).length;

  return (
    <>
      <ControlStrip
        groups={[
          {
            label: "Show",
            controls: (
              <Segmented
                options={STATUSES}
                value={status as (typeof STATUSES)[number]["value"]}
                onChange={(next) => setParam("status", next || null)}
                ariaLabel="Which pieces"
              />
            ),
          },
          {
            label: "Find",
            controls: <SearchInput value={query} onChange={setQuery} placeholder="Name or slug" ariaLabel="Search pieces" />,
          },
        ]}
        trailing={
          <>
            {needAttention > 0 ? <Pill tone="warning">{needAttention} need attention</Pill> : null}
            <Pill tone="neutral">{rows.length}</Pill>
            <ManageSwitch current="pieces" />
            <Button variant="primary" icon="plus" onClick={() => setMaking(true)}>
              New piece
            </Button>
          </>
        }
      />

      {products.error && !products.data ? <LoadError message={products.error} onRetry={products.reload} /> : null}
      {products.loading ? <Skeleton height={300} /> : null}

      {products.data ? (
        <Stale stale={products.stale}>
          <div className="console-split">
            <Card pad="sm" className="console-split-list">
              {rows.length === 0 ? (
                <EmptyState
                  title={settled ? "No piece matches that." : "Nothing here yet."}
                  hint={settled ? undefined : "Start with one piece."}
                  action={settled ? <Button onClick={() => setQuery("")}>Clear</Button> : <Button variant="primary" onClick={() => setMaking(true)}>New piece</Button>}
                />
              ) : (
                <ul>
                  {rows.map((product) => {
                    const blocker = blockerFor(product);
                    const active = product.id === open;
                    return (
                      <li key={product.id}>
                        <button
                          type="button"
                          onClick={() => setParam("open", product.id)}
                          className="console-row"
                          style={{
                            width: "100%",
                            textAlign: "start",
                            padding: "8px 6px",
                            borderRadius: "var(--r-sm)",
                            gap: 10,
                            flexWrap: "nowrap",
                            background: active ? "var(--accent-dim)" : undefined,
                          }}
                        >
                          <span style={{ position: "relative", width: 40, height: 40, flex: "none", borderRadius: 6, overflow: "hidden", background: "var(--bg2)" }}>
                            {product.images[0] ? (
                              <Image src={product.images[0].url} alt="" fill sizes="40px" style={{ objectFit: "cover" }} />
                            ) : (
                              <span style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--ink3)" }}>
                                <Icon name="image" size={16} />
                              </span>
                            )}
                          </span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <Text className="console-strong">{product.title_en}</Text>
                            <span className="console-cell-sub" style={{ display: "block" }}>
                              {categoryName(product.category_id)} · <Money value={product.price} />
                            </span>
                          </span>
                          {blocker ? (
                            <span title={blocker} style={{ color: "var(--warn)", flex: "none" }}>
                              <Icon name="alert" size={16} />
                            </span>
                          ) : product.status === "active" ? (
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--ok)", flex: "none" }} title="live" />
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <div className="console-split-detail">
              {selected ? (
                <PieceInspector product={selected} categories={categories.data ?? []} onChanged={products.reload} />
              ) : (
                <Card>
                  <EmptyState title="Pick a piece." hint="Its photos, words, batch and variants open here." />
                </Card>
              )}
            </div>
          </div>
        </Stale>
      ) : null}

      {making ? (
        <NewPiece
          categories={categories.data ?? []}
          onClose={() => setMaking(false)}
          onCreated={(id) => {
            setMaking(false);
            products.reload();
            setParam("open", id);
          }}
        />
      ) : null}
    </>
  );
}
