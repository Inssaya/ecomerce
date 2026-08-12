"use client";

/**
 * Manage · Products — the catalogue as a table.
 *
 * This replaced a two-pane split: a narrow scannable list on the left and a
 * tall inspector on the right. The split made the list too poor to answer
 * anything on its own — you could not see what a piece cost against what its
 * neighbour cost, or which ones had a reduction running, without opening each
 * of them in turn. A table can be read down a column, and every column here
 * sorts.
 *
 * Detail moved into a popup rather than a panel, which is also what let the
 * form get wide enough to hold both languages, a price, a reduction and a
 * list of measures without scrolling for a minute.
 */
import { useCallback, useMemo, useState } from "react";
import Image from "next/image";

import { api, type AdminProduct } from "@/lib/console/api";
import { useConsoleQuery, useMutation } from "@/lib/console/query";
import type { Range } from "@/lib/console/api";

import { AddPopup } from "./AddPopup";
import { NewPiece } from "./NewPiece";
import { ProductAnalyticsPopup } from "./ProductAnalyticsPopup";
import { ProductPopup } from "./ProductPopup";
import {
  Button,
  Card,
  ConsoleHeader,
  DataTable,
  DateRangeFilter,
  EmptyState,
  Icon,
  LoadError,
  Money,
  Num,
  Pill,
  Skeleton,
  Stale,
  Swatch,
  Text,
  useConfirm,
  useDebounced,
  useTableSort,
  type Column,
} from "../ui/primitives";

const PAGES = [
  { href: "/admin/manage", label: "Products", active: true },
  { href: "/admin/manage/customers", label: "Customers" },
  { href: "/admin/manage/feed", label: "Feed" },
];

const STATUSES = [
  { value: "", label: "Working" },
  { value: "active", label: "Live" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Archived" },
];

/** "12 Aug" — the column is scanned, not read. */
function day(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Whether a piece has been touched since it was made, to the minute. */
function wasModified(product: AdminProduct): boolean {
  return new Date(product.updated_at).getTime() - new Date(product.created_at).getTime() > 60_000;
}

export default function ManageProducts() {
  const confirm = useConfirm();
  const { mutate, busy, problem } = useMutation();

  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<Range | null>(null);
  const settled = useDebounced(query, 250);

  // Which popup is up. One at a time — three booleans would eventually be two
  // popups at once and nobody would know which one Escape closes.
  const [open, setOpen] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [makingIn, setMakingIn] = useState<string | null | false>(false);

  const products = useConsoleQuery(
    `pieces:${status}:${settled}:${range?.from ?? ""}:${range?.to ?? ""}`,
    useCallback(
      () => api.products({ status: status || undefined, q: settled || undefined, range }),
      [status, settled, range],
    ),
  );
  const categories = useConsoleQuery("categories", useCallback(() => api.categories(), []));

  const rows = useMemo(() => {
    const all = products.data ?? [];
    // "Working" means the live catalogue — archived pieces are retired on
    // purpose and would otherwise sit at the top of a newest-first list.
    return status === "" ? all.filter((product) => product.status !== "archived") : all;
  }, [products.data, status]);

  const { sorted, sort, onSort } = useTableSort(
    rows,
    {
      created: (row) => row.created_at,
      title: (row) => row.title_en,
      category: (row) => row.category_name ?? "",
      subcategory: (row) => row.subcategory_name ?? "",
      price: (row) => row.effective_price,
      delivery: (row) => row.delivery_days ?? 0,
      saves: (row) => row.total_saves,
      likes: (row) => row.total_likes,
    },
    { key: "created", asc: false },
  );

  const selected = rows.find((product) => product.id === open) ?? null;
  const forAnalytics = rows.find((product) => product.id === analytics) ?? null;

  const columns: Column<AdminProduct>[] = [
    {
      key: "photo",
      header: "",
      width: 52,
      render: (product) => (
        <span
          style={{
            position: "relative",
            display: "block",
            width: 40,
            height: 40,
            borderRadius: 6,
            overflow: "hidden",
            background: "var(--bg2)",
          }}
        >
          {product.images[0] ? (
            <Image src={product.images[0].url} alt="" fill sizes="40px" style={{ objectFit: "cover" }} />
          ) : (
            <span style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--ink3)" }}>
              <Icon name="image" size={16} />
            </span>
          )}
        </span>
      ),
    },
    {
      key: "created",
      header: "Made",
      sortable: true,
      render: (product) => (
        <>
          <span className="console-num">{day(product.created_at)}</span>
          {/* Only when it says something the creation date does not. */}
          {wasModified(product) ? (
            <span className="console-modified" style={{ display: "block" }} title={new Date(product.updated_at).toLocaleString()}>
              edited {day(product.updated_at)}
            </span>
          ) : null}
        </>
      ),
    },
    {
      key: "title",
      header: "Name",
      sortable: true,
      render: (product) => (
        <>
          <Text className="console-strong">{product.title_en}</Text>
          <span className="console-cell-sub" style={{ display: "block" }}>
            {product.status === "active" ? "live" : product.status}
            {product.kind === "shelf" ? ` · ${product.available ?? 0} here` : " · made to order"}
          </span>
        </>
      ),
    },
    { key: "category", header: "Category", sortable: true, render: (product) => product.category_name ?? "—" },
    {
      key: "subcategory",
      header: "Sub-category",
      sortable: true,
      render: (product) => product.subcategory_name ?? "—",
    },
    {
      key: "price",
      header: "Price",
      align: "right",
      sortable: true,
      render: (product) =>
        product.discount_active ? (
          <>
            <span className="console-was">
              <Money value={product.price} />
            </span>
            <Money value={product.effective_price} />
          </>
        ) : (
          <Money value={product.price} />
        ),
    },
    {
      key: "delivery",
      header: "Delivery",
      align: "right",
      sortable: true,
      render: (product) =>
        product.delivery_days ? (
          <span className="console-num">{product.delivery_days}d</span>
        ) : (
          <span className="console-muted">—</span>
        ),
    },
    {
      key: "what",
      header: "What it is",
      render: (product) =>
        product.attributes.length === 0 ? (
          <span className="console-muted">—</span>
        ) : (
          <span className="console-spec">
            {product.attributes.slice(0, 4).map((attribute) => (
              <span key={attribute.id} className="console-spec" title={attribute.label}>
                <Swatch hex={attribute.hex} label={attribute.value} />
                <span className="console-cell-sub">{attribute.value}</span>
              </span>
            ))}
            {product.attributes.length > 4 ? (
              <span className="console-cell-sub">+{product.attributes.length - 4}</span>
            ) : null}
          </span>
        ),
    },
    { key: "saves", header: "Saves", align: "right", sortable: true, render: (product) => <Num value={product.total_saves} /> },
    { key: "likes", header: "Likes", align: "right", sortable: true, render: (product) => <Num value={product.total_likes} /> },
    {
      key: "actions",
      header: "",
      width: 190,
      render: (product) => (
        // The row itself opens the piece; these must not do it a second time.
        <span className="console-row-actions" onClick={(event) => event.stopPropagation()}>
          <Button size="sm" onClick={() => setOpen(product.id)}>
            Open
          </Button>
          <Button size="sm" onClick={() => setAnalytics(product.id)}>
            Analytics
          </Button>
          <Button
            size="sm"
            iconOnly
            icon="trash"
            aria-label={`Archive ${product.title_en}`}
            disabled={busy}
            onClick={() =>
              confirm({
                title: `Archive "${product.title_en}"?`,
                body: "It leaves the shop. Nothing is deleted — orders that include it still read correctly, and you can bring it back from the Archived view.",
                confirmLabel: "Archive it",
                danger: true,
                onConfirm: () =>
                  mutate(() => api.archiveProduct(product.id), {
                    invalidates: ["pieceChanged"],
                    onDone: products.reload,
                  }),
              })
            }
          />
        </span>
      ),
    },
  ];

  return (
    <>
      <ConsoleHeader
        filters={
          <>
            <DateRangeFilter value={range} onChange={setRange} ariaLabel="When it was made" />
            <select
              className="console-select"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              aria-label="Which pieces"
            >
              {STATUSES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>
              Add
            </Button>
          </>
        }
        search={{ value: query, onChange: setQuery, placeholder: "Name or description", ariaLabel: "Search products" }}
        pages={PAGES}
        trailing={<Pill tone="neutral">{rows.length}</Pill>}
      />

      {problem ? <p className="console-error">{problem}</p> : null}
      {products.error && !products.data ? <LoadError message={products.error} onRetry={products.reload} /> : null}
      {products.loading ? <Skeleton height={320} /> : null}

      {products.data ? (
        <Stale stale={products.stale}>
          <Card pad="sm" flush>
            <DataTable
              columns={columns}
              rows={sorted}
              rowKey={(product) => product.id}
              onRowClick={(product) => setOpen(product.id)}
              selectedKey={open}
              sort={sort}
              onSort={onSort}
              minWidth={1080}
              empty={
                <EmptyState
                  title={settled || range ? "No piece matches that." : "Nothing here yet."}
                  hint={settled || range ? undefined : "Start with one piece."}
                  action={
                    settled || range ? (
                      <Button
                        onClick={() => {
                          setQuery("");
                          setRange(null);
                        }}
                      >
                        Clear
                      </Button>
                    ) : (
                      <Button variant="primary" onClick={() => setAdding(true)}>
                        Add
                      </Button>
                    )
                  }
                />
              }
            />
          </Card>
        </Stale>
      ) : null}

      {selected ? (
        <ProductPopup
          product={selected}
          categories={categories.data ?? []}
          onClose={() => setOpen(null)}
          onChanged={products.reload}
        />
      ) : null}

      {forAnalytics ? <ProductAnalyticsPopup product={forAnalytics} onClose={() => setAnalytics(null)} /> : null}

      {adding ? (
        <AddPopup
          categories={categories.data ?? []}
          onClose={() => setAdding(false)}
          onChanged={() => {
            categories.reload();
            products.reload();
          }}
          onNewProduct={(categoryId) => {
            setAdding(false);
            setMakingIn(categoryId);
          }}
        />
      ) : null}

      {makingIn !== false ? (
        <NewPiece
          categories={categories.data ?? []}
          initialCategoryId={makingIn}
          onClose={() => setMakingIn(false)}
          onCreated={(id) => {
            setMakingIn(false);
            products.reload();
            // Straight into the piece — a new row with no photos and no words
            // is not somewhere to leave someone.
            setOpen(id);
          }}
        />
      ) : null}
    </>
  );
}
