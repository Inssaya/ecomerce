"use client";

/**
 * One piece, with the room to actually work on it.
 *
 * The old screen buried this four levels down — expand the row, pick a tab,
 * open "Edit the words" — and the Arabic story was write-only: you could type
 * it and never read it back. Here both languages are readable and editable in
 * the same place.
 *
 * Two dangers are handled out loud rather than discovered:
 *  · adding to a batch notifies everyone waiting, irreversibly
 *  · removing a piece renumbers the whole run (04/12 becomes 04/11)
 */
import { useCallback, useEffect, useState } from "react";
import Image from "next/image";

import { api, type AdminCategory, type AdminPiece, type AdminProduct } from "@/lib/console/api";
import { useConsoleQuery, useMutation } from "@/lib/console/query";

import {
  ArabicInput,
  Button,
  Card,
  CardHead,
  Field,
  LinkButton,
  Money,
  Pill,
  Text,
  useConfirm,
  useDirtyGuard,
} from "../ui/primitives";

const STATE_TONE = {
  available: "console-tally-here",
  sold: "console-tally-sold",
  reserved: "console-tally-reserved",
  kept: "console-tally-kept",
} as const;

export function PieceInspector({
  product,
  categories,
  onChanged,
}: {
  product: AdminProduct;
  categories: AdminCategory[];
  onChanged: () => void;
}) {
  const { mutate, busy, problem } = useMutation();
  const confirm = useConfirm();

  const pieces = useConsoleQuery(
    product.kind === "shelf" ? `pieces:${product.id}` : null,
    useCallback(() => api.pieces(product.id), [product.id]),
  );
  const waiting = useConsoleQuery(
    `waiting:${product.id}`,
    useCallback(() => api.waitingOn(product.id), [product.id]),
  );

  const waitingCount = waiting.data?.waiting ?? 0;
  const live = product.status === "active";
  const noPhoto = product.images.length === 0;

  // Why publishing is blocked, said before the click rather than after.
  const blocker = noPhoto
    ? "Needs a real photo first"
    : product.kind === "workshop" && !product.lead_time_days
      ? "Needs a lead time first"
      : product.kind === "shelf" && !product.available
        ? "Nothing on the shelf to sell"
        : null;

  return (
    <div className="console-stack">
      {problem ? <p className="console-error">{problem}</p> : null}

      <Card>
        <CardHead
          title={<Text>{product.title_en}</Text>}
          sub={
            <>
              <Money value={product.price} /> ·{" "}
              {product.kind === "workshop" ? `made to order in ${product.lead_time_days ?? "?"} days` : `${product.available ?? 0} on the shelf`}
            </>
          }
          actions={
            <>
              {live ? (
                <Button
                  disabled={busy}
                  onClick={() => void mutate(() => api.updateProduct(product.id, { status: "draft" }), { invalidates: ["pieceChanged"], onDone: onChanged })}
                >
                  Take it down
                </Button>
              ) : (
                <Button
                  variant="primary"
                  disabled={busy || Boolean(blocker)}
                  title={blocker ?? undefined}
                  onClick={() => void mutate(() => api.updateProduct(product.id, { status: "active" }), { invalidates: ["pieceChanged"], onDone: onChanged })}
                >
                  Publish
                </Button>
              )}
              {live ? (
                <LinkButton href={`/en/piece/${product.slug}`} target="_blank" rel="noreferrer" icon="external" size="sm">
                  See the page
                </LinkButton>
              ) : (
                <Button size="sm" disabled title={product.status === "archived" ? "Archived — it is gone from the shop" : "Not published yet"}>
                  See the page
                </Button>
              )}
            </>
          }
        />
        {blocker && !live ? <p className="console-note">{blocker}.</p> : null}
      </Card>

      <Photos product={product} onChanged={onChanged} />

      <Words product={product} categories={categories} onChanged={onChanged} />

      {product.kind === "shelf" ? (
        <Card>
          <CardHead
            title="The batch"
            sub={
              waitingCount > 0
                ? `${waitingCount} ${waitingCount === 1 ? "person is" : "people are"} waiting — adding will tell them.`
                : "One mark per object you made."
            }
          />

          {(pieces.data ?? []).length > 0 ? (
            <>
              <div className="console-tally">
                {(pieces.data ?? []).map((piece) => (
                  <span key={piece.id} className={`console-tally-mark ${STATE_TONE[piece.state]}`} title={`${piece.label} · ${piece.state}`}>
                    {String(piece.number).padStart(2, "0")}
                  </span>
                ))}
              </div>
              {/* Reserved, sold and kept used to render identically. */}
              <div className="console-tally-legend">
                <span><span className="console-tally-mark console-tally-here" style={{ minWidth: 18, height: 14 }} /> here</span>
                <span><span className="console-tally-mark console-tally-sold" style={{ minWidth: 18, height: 14 }} /> sold</span>
                <span><span className="console-tally-mark console-tally-reserved" style={{ minWidth: 18, height: 14 }} /> reserved</span>
                <span><span className="console-tally-mark console-tally-kept" style={{ minWidth: 18, height: 14 }} /> kept</span>
              </div>
            </>
          ) : (
            <p className="console-muted">Nothing made yet.</p>
          )}

          <AddPieces
            productId={product.id}
            waiting={waitingCount}
            busy={busy}
            onAdd={(quantity) =>
              mutate(() => api.addPieces(product.id, quantity), {
                invalidates: ["batchChanged"],
                onDone: () => {
                  pieces.reload();
                  waiting.reload();
                  onChanged();
                },
              })
            }
          />

          {(pieces.data ?? []).some((piece) => piece.state === "available") ? (
            <details>
              <summary className="console-caps" style={{ cursor: "pointer" }}>Miscounted? Remove a piece</summary>
              <p className="console-muted" style={{ marginTop: 6 }}>
                Removing one renumbers the whole run — 04/12 becomes 04/11.
              </p>
              <div className="console-row" style={{ marginTop: 8 }}>
                {(pieces.data ?? [])
                  .filter((piece) => piece.state === "available")
                  .map((piece) => (
                    <Button
                      key={piece.id}
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        confirm({
                          title: `Remove piece ${piece.label}?`,
                          body: "This renumbers the whole run — the pieces after it move down by one.",
                          confirmLabel: "Remove it",
                          danger: true,
                          onConfirm: () =>
                            mutate(() => api.removePiece(piece.id), {
                              invalidates: ["batchChanged"],
                              onDone: () => {
                                pieces.reload();
                                onChanged();
                              },
                            }),
                        })
                      }
                    >
                      {String(piece.number).padStart(2, "0")} ×
                    </Button>
                  ))}
              </div>
            </details>
          ) : null}
        </Card>
      ) : null}

      <Variants product={product} onChanged={onChanged} />
    </div>
  );
}

function AddPieces({
  productId,
  waiting,
  busy,
  onAdd,
}: {
  productId: string;
  waiting: number;
  busy: boolean;
  onAdd: (quantity: number) => void;
}) {
  const [quantity, setQuantity] = useState("1");
  const confirm = useConfirm();

  return (
    <form
      className="console-row"
      onSubmit={(event) => {
        event.preventDefault();
        const count = Number(quantity);
        if (!(count >= 1)) return;
        // Telling thirty people something is back in stock cannot be undone.
        if (waiting > 0) {
          confirm({
            title: `Add ${count} to the shelf?`,
            body: `${waiting} ${waiting === 1 ? "person is" : "people are"} waiting on this piece. Adding tells all of them straight away, and that cannot be taken back.`,
            confirmLabel: `Add ${count} and tell them`,
            onConfirm: () => onAdd(count),
          });
          return;
        }
        onAdd(count);
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
        id={`quantity-${productId}`}
      />
      <Button type="submit" variant="primary" disabled={busy}>
        Add to the shelf
      </Button>
    </form>
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

      <div className="console-row" style={{ gap: 10 }}>
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
                <Button size="sm" disabled={busy} onClick={() => void mutate(() => api.setCoverPhoto(photo.id), { invalidates: ["mediaChanged"], onDone: onChanged })}>
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
                    onConfirm: () => mutate(() => api.removePhoto(photo.id), { invalidates: ["mediaChanged"], onDone: onChanged }),
                  })
                }
              />
            </div>
            <AltText photo={photo} onChanged={onChanged} />
          </div>
        ))}

        <label
          style={{
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
        if (dirty) void mutate(() => api.updatePhoto(photo.id, { alt_en: value }), { invalidates: ["mediaChanged"], onDone: onChanged });
      }}
    />
  );
}

function Words({
  product,
  categories,
  onChanged,
}: {
  product: AdminProduct;
  categories: AdminCategory[];
  onChanged: () => void;
}) {
  const { mutate, busy, problem } = useMutation();
  const [form, setForm] = useState({
    title_en: product.title_en,
    title_ar: product.title_ar,
    description_en: product.description_en,
    description_ar: product.description_ar,
    story_en: product.story_en,
    story_ar: product.story_ar,
    price: String(product.price),
    lead_time_days: product.lead_time_days ? String(product.lead_time_days) : "",
    category_id: product.category_id ?? "",
    show_piece_numbers: product.show_piece_numbers,
  });

  useEffect(() => {
    setForm({
      title_en: product.title_en,
      title_ar: product.title_ar,
      description_en: product.description_en,
      description_ar: product.description_ar,
      story_en: product.story_en,
      story_ar: product.story_ar,
      price: String(product.price),
      lead_time_days: product.lead_time_days ? String(product.lead_time_days) : "",
      category_id: product.category_id ?? "",
      show_piece_numbers: product.show_piece_numbers,
    });
  }, [product]);

  const dirty =
    form.title_en !== product.title_en ||
    form.title_ar !== product.title_ar ||
    form.description_en !== product.description_en ||
    form.description_ar !== product.description_ar ||
    form.story_en !== product.story_en ||
    form.story_ar !== product.story_ar ||
    Number(form.price) !== product.price ||
    form.category_id !== (product.category_id ?? "") ||
    form.show_piece_numbers !== product.show_piece_numbers;

  useDirtyGuard(dirty);

  // Arabic typed into an English field is invisible until the shop looks wrong.
  const arabicInEnglish = /[؀-ۿ]/.test(form.title_en);

  return (
    <Card>
      <CardHead title="The words" sub="Both languages, readable — not just editable." actions={dirty ? <Pill tone="warning">unsaved</Pill> : null} />
      {problem ? <p className="console-error">{problem}</p> : null}

      <div className="console-form-grid console-form-2">
        <Field label="Name" htmlFor={`t-en-${product.id}`} error={arabicInEnglish ? "This looks like Arabic — did you mean the Arabic field?" : undefined}>
          <input id={`t-en-${product.id}`} value={form.title_en} onChange={(event) => setForm({ ...form, title_en: event.target.value })} maxLength={300} />
        </Field>
        <Field label="Name · Arabic" htmlFor={`t-ar-${product.id}`}>
          <ArabicInput id={`t-ar-${product.id}`} value={form.title_ar} onChange={(event) => setForm({ ...form, title_ar: event.target.value })} maxLength={300} />
        </Field>
      </div>

      <div className="console-form-grid console-form-2">
        <Field label="Description" htmlFor={`d-en-${product.id}`}>
          <textarea id={`d-en-${product.id}`} rows={3} value={form.description_en} onChange={(event) => setForm({ ...form, description_en: event.target.value })} />
        </Field>
        <Field label="Description · Arabic" htmlFor={`d-ar-${product.id}`}>
          <textarea id={`d-ar-${product.id}`} rows={3} dir="rtl" lang="ar" value={form.description_ar} onChange={(event) => setForm({ ...form, description_ar: event.target.value })} />
        </Field>
      </div>

      <div className="console-form-grid console-form-2">
        <Field label="How it was made" htmlFor={`s-en-${product.id}`}>
          <textarea id={`s-en-${product.id}`} rows={3} value={form.story_en} onChange={(event) => setForm({ ...form, story_en: event.target.value })} />
        </Field>
        <Field label="How it was made · Arabic" htmlFor={`s-ar-${product.id}`}>
          <textarea id={`s-ar-${product.id}`} rows={3} dir="rtl" lang="ar" value={form.story_ar} onChange={(event) => setForm({ ...form, story_ar: event.target.value })} />
        </Field>
      </div>

      <div className="console-form-grid console-form-2">
        <Field label="Price" htmlFor={`p-${product.id}`} hint="Open orders keep the price they were placed at.">
          <input id={`p-${product.id}`} type="number" min={1} value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} />
        </Field>
        <Field label="Category" htmlFor={`c-${product.id}`}>
          <select id={`c-${product.id}`} value={form.category_id} onChange={(event) => setForm({ ...form, category_id: event.target.value })}>
            <option value="">No category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name_en}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {product.kind === "shelf" ? (
        <label className="console-check-row">
          <input type="checkbox" checked={form.show_piece_numbers} onChange={(event) => setForm({ ...form, show_piece_numbers: event.target.checked })} />
          Show the piece numbers (01/04) on the shop
        </label>
      ) : null}

      <div className="console-row">
        <Button
          variant="primary"
          disabled={busy || !dirty}
          onClick={() =>
            void mutate(
              () =>
                api.updateProduct(product.id, {
                  title_en: form.title_en,
                  title_ar: form.title_ar,
                  description_en: form.description_en,
                  description_ar: form.description_ar,
                  story_en: form.story_en,
                  story_ar: form.story_ar,
                  price: Number(form.price),
                  category_id: form.category_id || null,
                  show_piece_numbers: form.show_piece_numbers,
                }),
              { invalidates: ["pieceChanged"], onDone: onChanged },
            )
          }
        >
          {busy ? "Saving…" : "Save"}
        </Button>
        {dirty ? <span className="console-muted">Unsaved changes.</span> : null}
      </div>
    </Card>
  );
}

function Variants({ product, onChanged }: { product: AdminProduct; onChanged: () => void }) {
  const { mutate, busy, problem } = useMutation();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);

  return (
    <Card>
      <CardHead
        title="Variants"
        sub={product.variants.length ? undefined : "No variants — this piece sells as one option."}
        actions={
          <Button size="sm" icon="plus" onClick={() => setAdding((was) => !was)}>
            {adding ? "Cancel" : "Add"}
          </Button>
        }
      />
      {problem ? <p className="console-error">{problem}</p> : null}

      {product.variants.map((variant) => (
        <div key={variant.id} className="console-row-between">
          <span>
            <Text className="console-strong">{variant.option}</Text>
            <span className="console-cell-sub"> {variant.sku}</span>
          </span>
          <span className="console-row" style={{ gap: 8 }}>
            {variant.price !== product.price ? <Money value={variant.price} /> : <span className="console-muted">same price</span>}
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                confirm({
                  title: `Retire "${variant.option}"?`,
                  body: "It stops being offered on the shop. Orders that already chose it keep it.",
                  confirmLabel: "Retire it",
                  danger: true,
                  onConfirm: () => mutate(() => api.retireVariant(variant.id), { invalidates: ["variantChanged"], onDone: onChanged }),
                })
              }
            >
              Retire
            </Button>
          </span>
        </div>
      ))}

      {adding ? (
        <form
          className="console-row"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const sku = String(data.get("sku") ?? "").trim();
            const option = String(data.get("option") ?? "").trim();
            const priceRaw = String(data.get("price") ?? "").trim();
            if (!sku || !option) return;
            void mutate(
              () => api.addVariant(product.id, { sku, option_en: option, price: priceRaw ? Number(priceRaw) : null }),
              {
                invalidates: ["variantChanged"],
                onDone: () => {
                  setAdding(false);
                  onChanged();
                },
              },
            );
          }}
        >
          <input name="sku" placeholder="SKU" required maxLength={60} style={{ width: 120 }} aria-label="SKU" />
          <input name="option" placeholder="e.g. M · Matte black" required maxLength={160} style={{ flex: 1, minWidth: 160 }} aria-label="Option" />
          <input name="price" type="number" min={1} placeholder={`${product.price}`} style={{ width: 120 }} aria-label="Price if different" />
          <Button type="submit" variant="primary" disabled={busy}>
            Add
          </Button>
        </form>
      ) : null}
    </Card>
  );
}
