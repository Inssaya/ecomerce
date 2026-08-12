"use client";

/**
 * One product, opened from the table.
 *
 * Replaces the two-pane inspector. Everything about a piece is in here —
 * photos, both languages, what it costs, and what it is made of — because a
 * list that is only a list can afford to be a list, and the detail gets a
 * proper surface instead of a third of the screen.
 *
 * The words are behind a language dropdown rather than in side-by-side pairs.
 * Both are still authored (BRAND.md §9 — Arabic is written, never generated),
 * and both are still readable; picking the language first just means the form
 * is four fields instead of eight.
 *
 * Two sections the old inspector had are deliberately gone: the batch tally
 * and variants. Variants are replaced by `AttributesEditor`; the tally's
 * *function* survives as one quiet line, because a shelf piece with nothing
 * on the shelf cannot be published and removing the only way to say "I made
 * four" would take publishing away with it.
 */
import { useCallback, useEffect, useState } from "react";
import Image from "next/image";

import { api, type AdminCategory, type AdminProduct } from "@/lib/console/api";
import { useConsoleQuery, useMutation } from "@/lib/console/query";

import { AttributesEditor } from "./AttributesEditor";
import {
  ArabicInput,
  Button,
  Card,
  CardHead,
  Field,
  LinkButton,
  Money,
  Num,
  Pill,
  Popup,
  Text,
  useConfirm,
  useDirtyGuard,
} from "../ui/primitives";

type Lang = "en" | "ar";

const LANGUAGES: { value: Lang; label: string }[] = [
  { value: "en", label: "English" },
  { value: "ar", label: "العربية" },
];

/** Everything the save button sends, as strings — inputs speak strings. */
function formOf(product: AdminProduct) {
  return {
    title_en: product.title_en,
    title_ar: product.title_ar,
    description_en: product.description_en,
    description_ar: product.description_ar,
    price: String(product.price),
    category_id: product.category_id ?? "",
    delivery_days: product.delivery_days ? String(product.delivery_days) : "",
    discount_kind: product.discount_kind ?? "",
    discount_value: product.discount_value != null ? String(product.discount_value) : "",
    discount_active: product.discount_active,
    personalizable: product.personalizable,
    personalization_markup_pct: String(product.personalization_markup_pct ?? 0),
  };
}

export function ProductPopup({
  product,
  categories,
  onClose,
  onChanged,
}: {
  product: AdminProduct;
  categories: AdminCategory[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { mutate, busy, problem } = useMutation();
  const [lang, setLang] = useState<Lang>("en");
  const [form, setForm] = useState(() => formOf(product));

  // The row can be refetched under us — after a photo upload, say. Take the
  // server's version rather than leaving a stale form on screen.
  useEffect(() => setForm(formOf(product)), [product]);

  const dirty = JSON.stringify(form) !== JSON.stringify(formOf(product));
  // Guards the reload and the navigation away; `guard` guards the close.
  const guard = useDirtyGuard(dirty);

  const live = product.status === "active";
  const blocker =
    product.images.length === 0
      ? "Needs a real photo first"
      : product.kind === "workshop" && !product.lead_time_days
        ? "Needs a lead time first"
        : product.kind === "shelf" && !product.available
          ? "Nothing on the shelf to sell"
          : null;

  const save = () =>
    void mutate(
      () =>
        api.updateProduct(product.id, {
          title_en: form.title_en,
          title_ar: form.title_ar,
          description_en: form.description_en,
          description_ar: form.description_ar,
          price: Number(form.price),
          category_id: form.category_id || null,
          delivery_days: form.delivery_days ? Number(form.delivery_days) : null,
          // A reduction is off and empty, or on and complete. Sending a kind
          // without a value is the one combination the server refuses.
          discount_kind: form.discount_kind || null,
          discount_value: form.discount_value ? Number(form.discount_value) : null,
          discount_active: form.discount_active,
          personalizable: form.personalizable,
          personalization_markup_pct: Number(form.personalization_markup_pct || 0),
        }),
      { invalidates: ["pieceChanged"], onDone: onChanged },
    );

  return (
    <Popup
      open
      title={<Text>{product.title_en}</Text>}
      sub={
        <>
          {product.category_name ?? "No category"}
          {product.subcategory_name ? ` · ${product.subcategory_name}` : ""} ·{" "}
          {product.discount_active ? (
            <>
              <span className="console-was">
                <Money value={product.price} />
              </span>
              <Money value={product.effective_price} />
            </>
          ) : (
            <Money value={product.price} />
          )}
        </>
      }
      onClose={() => guard(onClose)}
      actions={
        <>
          <Button variant="primary" disabled={busy || !dirty} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </Button>
          {live ? (
            <Button
              disabled={busy}
              onClick={() =>
                void mutate(() => api.updateProduct(product.id, { status: "draft" }), {
                  invalidates: ["pieceChanged"],
                  onDone: onChanged,
                })
              }
            >
              Take it down
            </Button>
          ) : (
            <Button
              disabled={busy || Boolean(blocker)}
              title={blocker ?? undefined}
              onClick={() =>
                void mutate(() => api.updateProduct(product.id, { status: "active" }), {
                  invalidates: ["pieceChanged"],
                  onDone: onChanged,
                })
              }
            >
              Publish
            </Button>
          )}
          {live ? (
            <LinkButton href={`/en/piece/${product.slug}`} target="_blank" rel="noreferrer" icon="external" size="sm">
              See the page
            </LinkButton>
          ) : null}
          {dirty ? <Pill tone="warning">unsaved</Pill> : null}
          {blocker && !live ? <span className="console-muted">{blocker}.</span> : null}
        </>
      }
    >
      {problem ? <p className="console-error">{problem}</p> : null}

      <Photos product={product} onChanged={onChanged} />

      {/* ── The words, one language at a time ── */}
      <Card>
        <CardHead
          title="The words"
          sub="Pick a language, then write it. Both are authored — neither is a translation of the other."
          actions={
            <select
              className="console-select"
              value={lang}
              onChange={(event) => setLang(event.target.value as Lang)}
              aria-label="Which language"
            >
              {LANGUAGES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          }
        />

        {lang === "en" ? (
          <>
            <Field label="Name" htmlFor="pp-title-en">
              <input
                id="pp-title-en"
                value={form.title_en}
                maxLength={300}
                onChange={(event) => setForm({ ...form, title_en: event.target.value })}
              />
            </Field>
            <Field label="Description" htmlFor="pp-desc-en">
              <textarea
                id="pp-desc-en"
                rows={4}
                value={form.description_en}
                onChange={(event) => setForm({ ...form, description_en: event.target.value })}
              />
            </Field>
          </>
        ) : (
          <>
            <Field label="Name · Arabic" htmlFor="pp-title-ar">
              <ArabicInput
                id="pp-title-ar"
                value={form.title_ar}
                maxLength={300}
                onChange={(event) => setForm({ ...form, title_ar: event.target.value })}
              />
            </Field>
            <Field label="Description · Arabic" htmlFor="pp-desc-ar">
              <textarea
                id="pp-desc-ar"
                rows={4}
                dir="rtl"
                lang="ar"
                value={form.description_ar}
                onChange={(event) => setForm({ ...form, description_ar: event.target.value })}
              />
            </Field>
          </>
        )}

        <Field label="Category" htmlFor="pp-category">
          <select
            id="pp-category"
            value={form.category_id}
            onChange={(event) => setForm({ ...form, category_id: event.target.value })}
          >
            <option value="">No category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.parent_id ? "— " : ""}
                {category.name_en}
              </option>
            ))}
          </select>
        </Field>
      </Card>

      {/* ── What it costs, and how long it takes ── */}
      <Card>
        <CardHead title="Price and delivery" sub="Open orders keep the price they were placed at." />

        <div className="console-form-grid console-form-2">
          <Field label="Price" htmlFor="pp-price">
            <input
              id="pp-price"
              type="number"
              min={1}
              value={form.price}
              onChange={(event) => setForm({ ...form, price: event.target.value })}
            />
          </Field>
          <Field label="Delivery time (days)" htmlFor="pp-delivery" hint="What the shop promises on this piece.">
            <input
              id="pp-delivery"
              type="number"
              min={1}
              max={365}
              value={form.delivery_days}
              onChange={(event) => setForm({ ...form, delivery_days: event.target.value })}
            />
          </Field>
        </div>

        <div className="console-form-grid console-form-2">
          <Field label="Reduction" htmlFor="pp-discount-kind">
            <select
              id="pp-discount-kind"
              value={form.discount_kind}
              onChange={(event) => setForm({ ...form, discount_kind: event.target.value })}
            >
              <option value="">None</option>
              <option value="percent">Percent off</option>
              <option value="fixed">Dirhams off</option>
            </select>
          </Field>
          <Field
            label={form.discount_kind === "fixed" ? "How many dirhams" : "How many percent"}
            htmlFor="pp-discount-value"
          >
            <input
              id="pp-discount-value"
              type="number"
              min={1}
              max={form.discount_kind === "percent" ? 100 : undefined}
              disabled={!form.discount_kind}
              value={form.discount_value}
              onChange={(event) => setForm({ ...form, discount_value: event.target.value })}
            />
          </Field>
        </div>

        <label className="console-check-row">
          <input
            type="checkbox"
            disabled={!form.discount_kind}
            checked={form.discount_active}
            onChange={(event) => setForm({ ...form, discount_active: event.target.checked })}
          />
          The reduction is live on the shop
        </label>
        {/* Said before saving, not discovered on the storefront afterwards. */}
        {form.discount_active && form.discount_kind && form.discount_value ? (
          <p className="console-note brand">
            Buyers will see{" "}
            {form.discount_kind === "percent"
              ? Math.max(0, Math.round(Number(form.price) * (1 - Number(form.discount_value) / 100)))
              : Math.max(0, Math.round(Number(form.price) - Number(form.discount_value)))}{" "}
            MAD instead of {Math.round(Number(form.price))} MAD.
          </p>
        ) : null}

        <label className="console-check-row">
          <input
            type="checkbox"
            checked={form.personalizable}
            onChange={(event) => setForm({ ...form, personalizable: event.target.checked })}
          />
          They can put their name on it
        </label>
        {form.personalizable ? (
          <Field
            label="How much more it costs (%)"
            htmlFor="pp-markup"
            hint="Applied to the reduced price, so a piece on offer stays on offer."
          >
            <input
              id="pp-markup"
              type="number"
              min={0}
              max={500}
              step="0.5"
              value={form.personalization_markup_pct}
              onChange={(event) => setForm({ ...form, personalization_markup_pct: event.target.value })}
            />
          </Field>
        ) : null}
      </Card>

      <AttributesEditor product={product} onChanged={onChanged} />

      {/* ── What it earns, and what is left of it ── */}
      <Card>
        <CardHead title="Reach" sub="Hearts and buy-later saves, from the shop." />
        <div className="console-row" style={{ gap: "var(--space-5)" }}>
          <span>
            <span className="console-caps">Likes</span> <Num value={product.total_likes} />
          </span>
          <span>
            <span className="console-caps">Saves</span> <Num value={product.total_saves} />
          </span>
        </div>
        {product.kind === "shelf" ? <Shelf product={product} onChanged={onChanged} /> : null}
      </Card>
    </Popup>
  );
}

/**
 * How many exist, and one way to say you made more.
 *
 * What is left of the batch section. The tally of numbered marks is gone — it
 * was a wall of squares nobody read — but a shelf piece with no pieces cannot
 * be published, so the count and the "I made more" action stay. Adding still
 * tells everyone who asked to be told, and that is still irreversible, so it
 * still asks first.
 */
function Shelf({ product, onChanged }: { product: AdminProduct; onChanged: () => void }) {
  const { mutate, busy } = useMutation();
  const confirm = useConfirm();
  const [quantity, setQuantity] = useState("1");

  const waiting = useConsoleQuery(
    `waiting:${product.id}`,
    useCallback(() => api.waitingOn(product.id), [product.id]),
  );
  const waitingCount = waiting.data?.waiting ?? 0;
  const pieces = useConsoleQuery(
    `pieces:${product.id}`,
    useCallback(() => api.pieces(product.id), [product.id]),
  );
  const made = pieces.data?.length ?? 0;

  const add = (count: number) =>
    mutate(() => api.addPieces(product.id, count), {
      invalidates: ["batchChanged"],
      onDone: () => {
        pieces.reload();
        waiting.reload();
        onChanged();
      },
    });

  return (
    <div className="console-stack-sm" style={{ marginTop: "var(--space-3)" }}>
      <span className="console-caps">On the shelf</span>
      <p className="console-muted">
        <Num value={product.available ?? 0} /> of {made} still here.
        {waitingCount > 0 ? ` ${waitingCount} ${waitingCount === 1 ? "person is" : "people are"} waiting.` : ""}
      </p>
      <form
        className="console-row"
        onSubmit={(event) => {
          event.preventDefault();
          const count = Number(quantity);
          if (!(count >= 1)) return;
          if (waitingCount > 0) {
            confirm({
              title: `Add ${count} to the shelf?`,
              body: `${waitingCount} ${waitingCount === 1 ? "person is" : "people are"} waiting on this piece. Adding tells all of them straight away, and that cannot be taken back.`,
              confirmLabel: `Add ${count} and tell them`,
              onConfirm: () => add(count),
            });
            return;
          }
          void add(count);
        }}
      >
        <input
          type="number"
          min={1}
          max={200}
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          style={{ width: 90 }}
          aria-label="How many you made"
        />
        <Button type="submit" size="sm" disabled={busy}>
          I made more
        </Button>
      </form>
    </div>
  );
}

function Photos({ product, onChanged }: { product: AdminProduct; onChanged: () => void }) {
  const { mutate, busy, problem } = useMutation();
  const confirm = useConfirm();
  const [uploadError, setUploadError] = useState<string | null>(null);

  const onlyPhoto = product.images.length === 1;
  const live = product.status === "active";

  return (
    <Card>
      <CardHead title="Photos" sub="The picture is the product. Alt text is what a screen reader reads out." />
      {problem ? <p className="console-error">{problem}</p> : null}
      {uploadError ? <p className="console-error">{uploadError}</p> : null}

      <div className="console-row" style={{ gap: 10, alignItems: "flex-start" }}>
        {product.images.map((photo) => (
          <div key={photo.id} className="console-stack-sm" style={{ width: 120 }}>
            <span
              style={{
                position: "relative",
                width: 120,
                height: 120,
                borderRadius: "var(--r-sm)",
                overflow: "hidden",
                background: "var(--bg2)",
                outline: photo.is_primary ? "2px solid var(--accent)" : "1px solid var(--line)",
                outlineOffset: photo.is_primary ? 1 : 0,
              }}
            >
              <Image src={photo.url} alt={photo.alt || ""} fill sizes="120px" style={{ objectFit: "cover" }} />
            </span>
            <div className="console-row" style={{ gap: 4 }}>
              {photo.is_primary ? (
                <Pill tone="brand">cover</Pill>
              ) : (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void mutate(() => api.setCoverPhoto(photo.id), { invalidates: ["mediaChanged"], onDone: onChanged })
                  }
                >
                  Cover
                </Button>
              )}
              <Button
                size="sm"
                iconOnly
                icon="trash"
                aria-label="Remove photo"
                // Blocked before the click, not explained after it.
                disabled={busy || (onlyPhoto && live)}
                title={onlyPhoto && live ? "A live piece must keep at least one photo" : undefined}
                onClick={() =>
                  confirm({
                    title: "Remove this photo?",
                    body: "It is deleted from the shop. The piece keeps its other photos.",
                    confirmLabel: "Remove it",
                    danger: true,
                    onConfirm: () =>
                      mutate(() => api.removePhoto(photo.id), { invalidates: ["mediaChanged"], onDone: onChanged }),
                  })
                }
              />
            </div>
            <AltText photo={photo} onChanged={onChanged} />
          </div>
        ))}

        <label
          style={{
            position: "relative",
            width: 120,
            height: 120,
            borderRadius: "var(--r-sm)",
            border: "1px dashed var(--line2)",
            display: "grid",
            placeItems: "center",
            color: "var(--ink3)",
            cursor: "pointer",
            fontSize: "var(--t-sm)",
          }}
        >
          + photo
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              // Refuse locally rather than after a 12MB upload fails.
              setUploadError(null);
              if (file.size > 12 * 1024 * 1024) {
                setUploadError("That photo is larger than 12 MB — the shop won't take it.");
                return;
              }
              if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
                setUploadError("Photos must be JPEG, PNG or WebP.");
                return;
              }
              void mutate(() => api.addPhoto(product.id, file), { invalidates: ["mediaChanged"], onDone: onChanged });
            }}
          />
        </label>
      </div>

      {product.images.length === 0 ? <p className="console-muted">At least one real photo before it can go live.</p> : null}
    </Card>
  );
}

function AltText({ photo, onChanged }: { photo: AdminProduct["images"][number]; onChanged: () => void }) {
  const { mutate, busy } = useMutation();
  const [value, setValue] = useState(photo.alt ?? "");
  const dirty = value !== (photo.alt ?? "");

  return (
    <input
      value={value}
      disabled={busy}
      placeholder="alt text"
      aria-label="Alt text"
      dir="auto"
      style={{ height: 30, fontSize: "var(--t-xs)" }}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        if (dirty)
          void mutate(() => api.updatePhoto(photo.id, { alt_en: value }), {
            invalidates: ["mediaChanged"],
            onDone: onChanged,
          });
      }}
    />
  );
}
