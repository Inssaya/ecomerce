"use client";

/**
 * Categories and products, in one place.
 *
 * Ported from the deleted workshop's `Pieces.tsx`, which already got the hard
 * parts right — the real sequence a workshop works in (write it, photograph
 * it, count what was made, publish it), a category field that can name a new
 * line without leaving the form, and a two-tap delete so one misplaced thumb
 * never costs the photo the shop leads with. New here: a Batch sub-tab that
 * also manages variants (the old screen only handled numbered pieces), and a
 * Report sub-tab, which adds no new backend call — it composes three
 * already-existing endpoints (`analytics`, `waiting`, `forecast`) filtered to
 * the open product.
 */
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

import { Meter, Table } from "@/components/charts";
import {
  admin,
  type AdminCategory,
  type AdminPiece,
  type AdminProduct,
  type Analytics,
  type ForecastRow,
  type Variant,
} from "@/lib/admin/client";
import { NotSignedIn, bounceToSignIn } from "@/lib/admin/session";
import { money } from "@/lib/i18n";

export default function Management() {
  const [tab, setTab] = useState<"products" | "categories">("products");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[24px] font-semibold tracking-tight">Management</h1>
        <div className="flex gap-1 rounded-2xl bg-clay-soft p-1">
          {(["products", "categories"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setTab(option)}
              aria-pressed={tab === option}
              className={`tap rounded-xl px-3 py-1.5 text-[13px] font-medium capitalize transition-colors duration-gentle ${
                tab === option ? "bg-clay text-white" : "text-ink"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {tab === "products" ? <Products /> : <Categories />}
    </div>
  );
}

// ── Categories ───────────────────────────────────────────────────────────────

function Categories() {
  const [categories, setCategories] = useState<AdminCategory[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(() => {
    admin
      .categories()
      .then(setCategories)
      .catch((error) => {
        if (error instanceof NotSignedIn) bounceToSignIn();
        else setProblem("Could not load");
      });
  }, []);

  useEffect(load, [load]);

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={() => setAdding(!adding)} className={adding ? "btn-quiet self-start" : "btn-primary self-start"}>
        {adding ? "Cancel" : "New category"}
      </button>

      {adding ? (
        <form
          className="card p-5 shadow-soft flex flex-col gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const nameEn = String(form.get("name_en") ?? "").trim();
            if (!nameEn) return;
            try {
              await admin.createCategory(nameEn, String(form.get("name_ar") ?? "").trim());
              setAdding(false);
              load();
            } catch (error) {
              if (error instanceof NotSignedIn) bounceToSignIn();
              else setProblem(error instanceof Error ? error.message : "Could not add it");
            }
          }}
        >
          <div>
            <label className="label" htmlFor="name_en">
              Name, English
            </label>
            <input id="name_en" name="name_en" required maxLength={160} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="name_ar">
              Name, Arabic
            </label>
            <input id="name_ar" name="name_ar" maxLength={160} dir="rtl" className="field" />
          </div>
          <button type="submit" className="btn-primary self-start">
            Add it
          </button>
        </form>
      ) : null}

      {problem ? <p className="text-[13px] text-warn">{problem}</p> : null}

      {categories === null ? (
        <div className="h-24" aria-hidden />
      ) : categories.length === 0 ? (
        <p className="text-[14px] text-ink-soft">No categories yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {categories.map((category) => (
            <li key={category.id} className="card flex items-center justify-between gap-3 p-4 shadow-soft">
              <div>
                <p className="text-[15px] font-medium">{category.name_en}</p>
                {category.name_ar ? <p className="text-[13px] text-ink-soft" dir="rtl">{category.name_ar}</p> : null}
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await admin.updateCategory(category.id, { is_active: !category.is_active, name_en: category.name_en, name_ar: category.name_ar, parent_id: category.parent_id, display_order: category.display_order });
                    load();
                  } catch (error) {
                    if (error instanceof NotSignedIn) bounceToSignIn();
                  }
                }}
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                  category.is_active ? "bg-clay text-white" : "bg-sand text-ink-soft"
                }`}
              >
                {category.is_active ? "active" : "inactive"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Products ─────────────────────────────────────────────────────────────────

function Products() {
  const [products, setProducts] = useState<AdminProduct[] | null>(null);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [shelf, lines] = await Promise.all([admin.products(), admin.categories()]);
      setProducts(shelf);
      setCategories(lines);
    } catch (error) {
      if (error instanceof NotSignedIn) bounceToSignIn();
      else setProblem("Could not load");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remember = useCallback((category: AdminCategory) => setCategories((all) => [...all, category]), []);

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={() => setMaking(!making)} className={making ? "btn-quiet self-start" : "btn-primary self-start"}>
        {making ? "Cancel" : "New product"}
      </button>

      {making ? (
        <NewProduct
          categories={categories}
          onCategoryCreated={remember}
          onDone={async (id) => {
            setMaking(false);
            await load();
            setOpen(id);
          }}
        />
      ) : null}

      {problem ? <p className="text-[13px] text-warn">{problem}</p> : null}

      {products === null ? (
        <div className="h-32" aria-hidden />
      ) : products.length === 0 ? (
        <p className="text-[14px] text-ink-soft">Nothing here yet. Start with one product.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {products.map((product) => (
            <li key={product.id} className="card p-4 shadow-soft">
              <button
                type="button"
                onClick={() => setOpen(open === product.id ? null : product.id)}
                aria-expanded={open === product.id}
                className="w-full text-start flex items-center gap-3"
              >
                <span className="relative h-12 w-12 shrink-0 rounded-xl overflow-hidden bg-clay-soft">
                  {product.images[0] ? (
                    <Image src={product.images[0].url} alt="" fill sizes="48px" className="object-cover" />
                  ) : null}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-medium truncate">{product.title_en}</span>
                  <span className="block text-[12.5px] text-ink-soft">
                    {money(product.price, "en")} ·{" "}
                    {product.kind === "workshop" ? "made to order" : `${product.available} on the shelf`}
                  </span>
                </span>
                <StatusBadge status={product.status} />
              </button>

              {open === product.id ? (
                <ProductDetail
                  product={product}
                  categories={categories}
                  onCategoryCreated={remember}
                  onChanged={load}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${status === "active" ? "bg-clay text-white" : "bg-sand text-ink-soft"}`}>
      {status === "active" ? "live" : status}
    </span>
  );
}

function CategoryField({
  categories,
  value,
  onChange,
  onCreated,
  disabled,
}: {
  categories: AdminCategory[];
  value: string | null;
  onChange: (id: string | null) => void;
  onCreated: (category: AdminCategory) => void;
  disabled?: boolean;
}) {
  const NEW = "__new__";
  const [naming, setNaming] = useState(false);
  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!nameEn.trim()) return;
    setBusy(true);
    try {
      const created = await admin.createCategory(nameEn.trim(), nameAr.trim());
      onCreated(created);
      onChange(created.id);
      setNaming(false);
      setNameEn("");
      setNameAr("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label className="label" htmlFor="category">
        Category
      </label>
      <select
        id="category"
        className="field"
        disabled={disabled || busy}
        value={naming ? NEW : (value ?? "")}
        onChange={(event) => {
          const picked = event.target.value;
          setNaming(picked === NEW);
          if (picked !== NEW) onChange(picked || null);
        }}
      >
        <option value="">Choose…</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name_en}
          </option>
        ))}
        <option value={NEW}>+ New category</option>
      </select>
      {naming ? (
        <div className="mt-2 flex flex-col gap-2">
          <input placeholder="Hooks" value={nameEn} onChange={(event) => setNameEn(event.target.value)} maxLength={160} className="field" />
          <input placeholder="Arabic name" dir="rtl" value={nameAr} onChange={(event) => setNameAr(event.target.value)} maxLength={160} className="field" />
          <button type="button" disabled={busy || !nameEn.trim()} onClick={() => void create()} className="btn-quiet self-start">
            Add it
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ArmedRemove({ label, onConfirm, disabled }: { label: string; onConfirm: () => Promise<void>; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  if (armed) {
    return (
      <span className="absolute inset-0 flex flex-col items-stretch justify-center gap-1 bg-ink/80 p-1">
        <button type="button" disabled={disabled} onClick={() => { setArmed(false); void onConfirm(); }} className="rounded-lg bg-warn py-1 text-[11px] font-medium leading-none text-white">
          Remove
        </button>
        <button type="button" onClick={() => setArmed(false)} className="rounded-lg bg-white/90 py-1 text-[11px] font-medium leading-none text-ink">
          No
        </button>
      </span>
    );
  }
  return (
    <button type="button" disabled={disabled} aria-label={label} onClick={() => setArmed(true)} className="absolute end-0 top-0 h-5 w-5 rounded-bl-lg bg-ink/60 text-[12px] leading-none text-white">
      ×
    </button>
  );
}

function ProductDetail({
  product,
  categories,
  onCategoryCreated,
  onChanged,
}: {
  product: AdminProduct;
  categories: AdminCategory[];
  onCategoryCreated: (category: AdminCategory) => void;
  onChanged: () => Promise<void>;
}) {
  const [tab, setTab] = useState<"photos" | "batch" | "report">("photos");
  const published = product.status === "active";

  return (
    <div className="mt-4 flex flex-col gap-4 border-t border-sand pt-4">
      <div className="flex gap-1 rounded-2xl bg-clay-soft p-1 self-start">
        {(["photos", "batch", "report"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setTab(option)}
            aria-pressed={tab === option}
            className={`tap rounded-xl px-3 py-1.5 text-[12.5px] font-medium capitalize transition-colors duration-gentle ${
              tab === option ? "bg-clay text-white" : "text-ink"
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      {tab === "photos" ? <PhotosTab product={product} onChanged={onChanged} /> : null}
      {tab === "batch" ? (
        <BatchTab product={product} categories={categories} onCategoryCreated={onCategoryCreated} onChanged={onChanged} />
      ) : null}
      {tab === "report" ? <ReportTab product={product} /> : null}

      <EditWords product={product} onChanged={onChanged} />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={async () => {
            try {
              await admin.updateProduct(product.id, { status: published ? "draft" : "active" });
              await onChanged();
            } catch (error) {
              if (error instanceof NotSignedIn) bounceToSignIn();
            }
          }}
          className={published ? "btn-quiet" : "btn-primary"}
        >
          {published ? "Take it down" : "Publish it"}
        </button>
        {published ? (
          <a href={`/en/piece/${product.slug}`} target="_blank" rel="noreferrer" className="btn-quiet">
            See the page
          </a>
        ) : null}
      </div>
    </div>
  );
}

function PhotosTab({ product, onChanged }: { product: AdminProduct; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function guarded(work: () => Promise<unknown>, failure: string) {
    setBusy(true);
    setProblem(null);
    try {
      await work();
      await onChanged();
    } catch (error) {
      if (error instanceof NotSignedIn) bounceToSignIn();
      else setProblem(error instanceof Error ? error.message : failure);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {product.images.map((photo) => (
          <span key={photo.id} className={`relative h-16 w-16 rounded-xl overflow-hidden bg-clay-soft ${photo.is_primary ? "ring-2 ring-clay ring-offset-2 ring-offset-surface" : ""}`}>
            <Image src={photo.url} alt="" fill sizes="64px" className="object-cover" />
            {photo.is_primary ? (
              <span className="absolute inset-x-0 bottom-0 bg-clay/85 text-center text-[10px] font-medium text-white">cover</span>
            ) : (
              <button
                type="button"
                disabled={busy}
                aria-label="Make this the cover photo"
                onClick={() => void guarded(() => admin.setCoverPhoto(photo.id), "Could not change the cover")}
                className="absolute inset-0"
              />
            )}
            <ArmedRemove
              disabled={busy}
              label="Remove this photo"
              onConfirm={() => guarded(() => admin.removePhoto(photo.id), "Could not remove it")}
            />
          </span>
        ))}
        <label className="tap h-16 w-16 rounded-xl border border-dashed border-sand flex items-center justify-center text-[22px] text-ink-soft cursor-pointer">
          +
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void guarded(() => admin.addPhoto(product.id, file), "That photo would not upload");
            }}
          />
        </label>
      </div>
      {product.images.length === 0 ? (
        <p className="mt-1.5 text-[12.5px] text-ink-soft">At least one real photo before it can go live.</p>
      ) : null}
      {problem ? <p className="mt-2 text-[13px] text-warn">{problem}</p> : null}
    </div>
  );
}

function BatchTab({
  product,
  categories,
  onCategoryCreated,
  onChanged,
}: {
  product: AdminProduct;
  categories: AdminCategory[];
  onCategoryCreated: (category: AdminCategory) => void;
  onChanged: () => Promise<void>;
}) {
  const [pieces, setPieces] = useState<AdminPiece[]>([]);
  const [waiting, setWaiting] = useState(0);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [batch, queue] = await Promise.all([
        product.kind === "shelf" ? admin.pieces(product.id) : Promise.resolve([]),
        admin.waiting(product.id).catch(() => ({ waiting: 0 })),
      ]);
      setPieces(batch);
      setWaiting(queue.waiting);
    } catch (error) {
      if (error instanceof NotSignedIn) bounceToSignIn();
    }
  }, [product.id, product.kind]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function guarded(work: () => Promise<unknown>, failure: string) {
    setBusy(true);
    setProblem(null);
    try {
      await work();
      await refresh();
      await onChanged();
    } catch (error) {
      if (error instanceof NotSignedIn) bounceToSignIn();
      else setProblem(error instanceof Error ? error.message : failure);
    } finally {
      setBusy(false);
    }
  }

  const removable = pieces.filter((piece) => piece.state === "available");

  return (
    <div className="flex flex-col gap-4">
      <CategoryField
        categories={categories}
        value={product.category_id}
        disabled={busy}
        onCreated={onCategoryCreated}
        onChange={(id) => void guarded(() => admin.updateProduct(product.id, { category_id: id }), "Could not change that")}
      />

      <VariantsSection product={product} busy={busy} onChanged={onChanged} />

      {product.kind === "shelf" ? (
        <div>
          <p className="label">How many you made</p>
          {pieces.length > 0 ? (
            <>
              <div className="tally mb-2.5">
                {pieces.map((piece) => (
                  <span key={piece.id} className={piece.state === "available" ? "tally-here" : "tally-gone"} title={piece.state}>
                    {String(piece.number).padStart(2, "0")}
                  </span>
                ))}
              </div>
              {removable.length > 0 ? (
                <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-[12.5px] text-ink-soft">Miscounted? Remove</span>
                  {removable.map((piece) => (
                    <button
                      key={piece.id}
                      type="button"
                      disabled={busy}
                      aria-label={`Remove piece number ${piece.number}`}
                      onClick={() => void guarded(() => admin.removePiece(piece.id), "Could not remove it")}
                      className="tap rounded-lg bg-clay-soft px-2 text-[12px] font-medium text-ink"
                    >
                      {String(piece.number).padStart(2, "0")} ×
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const quantity = Number(form.get("quantity"));
              if (quantity >= 1) void guarded(() => admin.addPieces(product.id, quantity), "Could not add those");
            }}
          >
            <input name="quantity" type="number" min={1} max={200} defaultValue={1} inputMode="numeric" className="field w-24" aria-label="How many" />
            <button type="submit" disabled={busy} className="btn-quiet">
              Add to the shelf
            </button>
          </form>
          {waiting > 0 ? (
            <p className="mt-2 text-[13px] text-clay font-medium">
              {waiting} people are waiting on this — they are told the moment you add more.
            </p>
          ) : null}
        </div>
      ) : null}

      {problem ? <p className="text-[13px] text-warn">{problem}</p> : null}
    </div>
  );
}

function VariantsSection({ product, busy, onChanged }: { product: AdminProduct; busy: boolean; onChanged: () => Promise<void> }) {
  const [adding, setAdding] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function retire(variant: Variant) {
    try {
      await admin.retireVariant(variant.id);
      await onChanged();
    } catch (error) {
      if (error instanceof NotSignedIn) bounceToSignIn();
    }
  }

  return (
    <div>
      <p className="label">Variants</p>
      {product.variants.length > 0 ? (
        <ul className="mb-2 flex flex-col gap-1.5">
          {product.variants.map((variant) => (
            <li key={variant.id} className="flex items-center justify-between gap-3 text-[14px]">
              <span>
                {variant.option} <span className="stamp text-[12px] text-ink-soft">{variant.sku}</span>
              </span>
              <button type="button" onClick={() => void retire(variant)} className="text-[12.5px] text-ink-soft underline underline-offset-4">
                retire
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-2 text-[13px] text-ink-soft">No variants — this product sells as one option.</p>
      )}

      {adding ? (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const sku = String(form.get("sku") ?? "").trim();
            const option = String(form.get("option") ?? "").trim();
            if (!sku || !option) return;
            try {
              await admin.addVariant(product.id, { sku, option_en: option });
              setAdding(false);
              await onChanged();
            } catch (error) {
              if (error instanceof NotSignedIn) bounceToSignIn();
              else setProblem(error instanceof Error ? error.message : "Could not add it");
            }
          }}
        >
          <input name="sku" placeholder="SKU" required maxLength={60} className="field w-28" />
          <input name="option" placeholder="e.g. M · Matte black" required maxLength={160} className="field flex-1" />
          <button type="submit" disabled={busy} className="btn-quiet">
            Add
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="text-[13px] text-ink-soft underline underline-offset-4">
          Add a variant
        </button>
      )}
      {problem ? <p className="mt-1 text-[13px] text-warn">{problem}</p> : null}
    </div>
  );
}

function ReportTab({ product }: { product: AdminProduct }) {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [waiting, setWaiting] = useState<number | null>(null);
  const [forecastRow, setForecastRow] = useState<ForecastRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([admin.analytics(30), admin.waiting(product.id).catch(() => ({ waiting: 0 })), admin.forecast()]).then(
      ([a, w, f]) => {
        if (cancelled) return;
        setAnalytics(a);
        setWaiting(w.waiting);
        setForecastRow(f.items.find((row) => row.product_id === product.id) ?? null);
      },
      (error) => error instanceof NotSignedIn && bounceToSignIn(),
    );
    return () => {
      cancelled = true;
    };
  }, [product.id]);

  if (!analytics || waiting === null) return <div className="h-24" aria-hidden />;

  const row = analytics.products.items.find((item) => item.product_id === product.id);

  return (
    <div className="flex flex-col gap-4">
      {row ? (
        <Table head={["", "Saw", "Opened", "Stayed", "Bought"]}>
          <tr className="border-t border-sand">
            <th scope="row" className="py-2 pe-3 text-start font-medium">
              Last 30 days
            </th>
            <td className="py-2 ps-3 text-end">
              <Meter value={row.saw} of={Math.max(row.saw, 1)}>
                {row.saw}
              </Meter>
            </td>
            <td className="py-2 ps-3 text-end stamp tabular-nums">
              {row.opened} <span className="text-ink-soft">· {row.opened_pct}%</span>
            </td>
            <td className="py-2 ps-3 text-end stamp tabular-nums text-ink-soft">
              {row.avg_seconds ? `${Math.round(row.avg_seconds)}s` : "—"}
            </td>
            <td className="py-2 ps-3 text-end stamp tabular-nums">
              {row.bought} {row.opened ? <span className="text-ink-soft">· {row.bought_pct}%</span> : null}
            </td>
          </tr>
        </Table>
      ) : (
        <p className="text-[14px] text-ink-soft">No traffic recorded yet.</p>
      )}

      <p className="text-[14px]">
        <span className="text-ink-soft">Waiting on it: </span>
        <span className="stamp font-medium">{waiting}</span>
      </p>

      {forecastRow ? (
        <div className="rounded-2xl bg-clay-soft/40 p-4">
          <p className="text-[13px] text-ink-soft">Next 7 days, expected</p>
          <p className="stamp text-[18px] font-semibold">
            {forecastRow.range[0]}–{forecastRow.range[1]}
          </p>
          <p className="mt-1 text-[13px] text-ink-soft leading-relaxed">{forecastRow.because}</p>
        </div>
      ) : null}
    </div>
  );
}

function NewProduct({
  categories,
  onCategoryCreated,
  onDone,
}: {
  categories: AdminCategory[];
  onCategoryCreated: (category: AdminCategory) => void;
  onDone: (id: string) => Promise<void>;
}) {
  const [kind, setKind] = useState<"shelf" | "workshop">("shelf");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setProblem(null);
    try {
      const created = await admin.createProduct({
        kind,
        title_en: String(form.get("title_en") ?? "").trim(),
        title_ar: String(form.get("title_ar") ?? "").trim(),
        description_en: String(form.get("description_en") ?? ""),
        description_ar: String(form.get("description_ar") ?? ""),
        price: Number(form.get("price")),
        category_id: categoryId,
        lead_time_days: kind === "workshop" ? Number(form.get("lead_time_days")) : null,
      });
      await onDone(created.id);
    } catch (error) {
      if (error instanceof NotSignedIn) bounceToSignIn();
      else setProblem("Check the fields");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={create} className="card p-5 shadow-soft flex flex-col gap-4">
      <div className="flex gap-2">
        {(
          [
            ["shelf", "The Shelf", "already made"],
            ["workshop", "The Workshop", "made to order"],
          ] as const
        ).map(([value, label, hint]) => (
          <button
            key={value}
            type="button"
            onClick={() => setKind(value)}
            aria-pressed={kind === value}
            className={`tap flex-1 flex-col rounded-2xl px-3 py-2 text-[14px] font-medium transition-colors duration-gentle ${
              kind === value ? "bg-clay text-white" : "bg-clay-soft text-ink"
            }`}
          >
            <span>{label}</span>
            <span className={`text-[11px] ${kind === value ? "text-white/75" : "text-ink-soft"}`}>{hint}</span>
          </button>
        ))}
      </div>

      <div>
        <label className="label" htmlFor="title_en">
          Name
        </label>
        <input id="title_en" name="title_en" required maxLength={300} className="field" />
      </div>
      <div>
        <label className="label" htmlFor="title_ar">
          Name, Arabic (optional)
        </label>
        <input id="title_ar" name="title_ar" maxLength={300} className="field" dir="rtl" />
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="label" htmlFor="price">
            Price
          </label>
          <input id="price" name="price" type="number" min={1} step={1} required inputMode="numeric" className="field" />
        </div>
        {kind === "workshop" ? (
          <div className="flex-1">
            <label className="label" htmlFor="lead_time_days">
              In how many days
            </label>
            <input id="lead_time_days" name="lead_time_days" type="number" min={1} max={365} required inputMode="numeric" className="field" />
          </div>
        ) : null}
      </div>

      <div>
        <label className="label" htmlFor="description_en">
          Description
        </label>
        <textarea id="description_en" name="description_en" rows={2} className="field resize-none" />
      </div>
      <div>
        <label className="label" htmlFor="description_ar">
          Description, Arabic (optional)
        </label>
        <textarea id="description_ar" name="description_ar" rows={2} dir="rtl" className="field resize-none" />
      </div>

      <CategoryField categories={categories} value={categoryId} onChange={setCategoryId} onCreated={onCategoryCreated} disabled={busy} />

      {problem ? <p className="text-[13px] text-warn">{problem}</p> : null}

      <button type="submit" disabled={busy} className="btn-primary">
        Create it as a draft
      </button>
      <p className="text-[12px] text-ink-soft">Nobody sees it until you add a real photo and publish it.</p>
    </form>
  );
}

function EditWords({ product, onChanged }: { product: AdminProduct; onChanged: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "");
    const changes: Record<string, unknown> = {};
    for (const field of ["title_en", "title_ar", "description_en", "description_ar", "story_en", "story_ar"] as const) {
      if (text(field) !== (product[field] ?? "")) changes[field] = text(field);
    }
    const price = Number(form.get("price"));
    if (price > 0 && price !== product.price) changes.price = price;
    if (product.kind === "workshop") {
      const days = Number(form.get("lead_time_days"));
      if (days >= 1 && days !== product.lead_time_days) changes.lead_time_days = days;
    }
    const numbered = form.get("show_piece_numbers") === "on";
    if (numbered !== product.show_piece_numbers) changes.show_piece_numbers = numbered;

    if (Object.keys(changes).length === 0) {
      setOpen(false);
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await admin.updateProduct(product.id, changes);
      await onChanged();
      setOpen(false);
    } catch (error) {
      if (error instanceof NotSignedIn) bounceToSignIn();
      else setProblem("That would not save");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="tap self-start text-[13px] text-ink-soft underline underline-offset-4">
        Edit the words and the price
      </button>
    );
  }

  const field = (name: keyof AdminProduct, label: string, opts: { rows?: number; rtl?: boolean } = {}) => (
    <div>
      <label className="label" htmlFor={`${name}-${product.id}`}>
        {label}
      </label>
      {opts.rows ? (
        <textarea id={`${name}-${product.id}`} name={name} rows={opts.rows} dir={opts.rtl ? "rtl" : undefined} defaultValue={String(product[name] ?? "")} className="field resize-none" />
      ) : (
        <input id={`${name}-${product.id}`} name={name} maxLength={300} dir={opts.rtl ? "rtl" : undefined} defaultValue={String(product[name] ?? "")} className="field" />
      )}
    </div>
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl bg-clay-soft/40 p-4">
      {field("title_en", "Name")}
      {field("title_ar", "Name, Arabic", { rtl: true })}
      {field("description_en", "Description", { rows: 2 })}
      {field("description_ar", "Description, Arabic", { rows: 2, rtl: true })}
      {field("story_en", "How it was made", { rows: 2 })}
      {field("story_ar", "How it was made, Arabic", { rows: 2, rtl: true })}

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="label" htmlFor={`price-${product.id}`}>
            Price
          </label>
          <input id={`price-${product.id}`} name="price" type="number" min={1} step={1} inputMode="numeric" defaultValue={product.price} className="field" />
        </div>
        {product.kind === "workshop" ? (
          <div className="flex-1">
            <label className="label" htmlFor={`lead-${product.id}`}>
              In how many days
            </label>
            <input id={`lead-${product.id}`} name="lead_time_days" type="number" min={1} max={365} inputMode="numeric" defaultValue={product.lead_time_days ?? undefined} className="field" />
          </div>
        ) : null}
      </div>

      {product.kind === "shelf" ? (
        <label className="flex items-center gap-2 text-[14px]">
          <input type="checkbox" name="show_piece_numbers" defaultChecked={product.show_piece_numbers} className="h-4 w-4" />
          Show the piece numbers (01/04)
        </label>
      ) : null}

      {problem ? <p className="text-[13px] text-warn">{problem}</p> : null}

      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="btn-primary">
          Save
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-quiet">
          Cancel
        </button>
      </div>
    </form>
  );
}
