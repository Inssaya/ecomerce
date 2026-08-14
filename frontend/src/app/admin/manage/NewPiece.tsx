"use client";

/**
 * A new piece.
 *
 * Deliberately forgiving: Arabic is optional because blocking on it means
 * fewer pieces get made, and a missing translation is a thing to fix later,
 * not a wall.
 *
 * Two kinds, because the server has two: **shelf** for a piece the shop sells
 * like any store sells anything, and **workshop** for one made to order. Which
 * fields are required follows from the kind — a workshop piece without a lead
 * time has nothing honest to put on the page, and switching kind clears what
 * no longer applies rather than letting the save fail.
 *
 * The one thing that is *not* here any more is a stock field. There isn't
 * one: this shop does not count units.
 */
import { useState } from "react";

import { api, type AdminCategory } from "@/lib/console/api";
import { useMutation } from "@/lib/console/query";

import { ArabicInput, Button, Drawer, Field, Segmented } from "../ui/primitives";

export function NewPiece({
  categories,
  initialCategoryId,
  onClose,
  onCreated,
}: {
  categories: AdminCategory[];
  /** Pre-filled when the Add popup already asked which line of work. */
  initialCategoryId?: string | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { mutate, busy, problem } = useMutation();
  const [kind, setKind] = useState<"shelf" | "workshop">("shelf");
  const [form, setForm] = useState({
    title_en: "",
    title_ar: "",
    description_en: "",
    price: "",
    lead_time_days: "",
    delivery_days: "",
    category_id: initialCategoryId ?? "",
  });
  const [errors, setErrors] = useState<{ title?: string; price?: string; lead?: string }>({});

  const arabicInEnglish = /[؀-ۿ]/.test(form.title_en);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: typeof errors = {};
    if (!form.title_en.trim()) next.title = "A name";
    if (!(Number(form.price) > 0)) next.price = "A price above zero";
    if (kind === "workshop" && !(Number(form.lead_time_days) >= 1)) next.lead = "How many days it takes to make";
    setErrors(next);
    if (Object.keys(next).length) return;

    void mutate(
      () =>
        api.createProduct({
          kind,
          title_en: form.title_en.trim(),
          title_ar: form.title_ar.trim(),
          description_en: form.description_en,
          description_ar: "",
          price: Number(form.price),
          category_id: form.category_id || null,
          // The server refuses a lead time on a shelf piece and requires one on
          // a workshop piece. Sending the field that fits keeps the API honest.
          lead_time_days: kind === "workshop" ? Number(form.lead_time_days) : null,
          delivery_days: form.delivery_days ? Number(form.delivery_days) : null,
        }),
      {
        invalidates: ["pieceChanged"],
        onDone: (created) => created && onCreated(created.id),
      },
    );
  }

  return (
    <Drawer open onClose={onClose} title="A new piece" sub="It stays a draft until it has a real photo.">
      <form onSubmit={submit} className="console-stack">
        <Field label="Which kind">
          <Segmented
            options={[
              { value: "shelf" as const, label: "Shelf — a normal product" },
              { value: "workshop" as const, label: "Workshop — made to order" },
            ]}
            value={kind}
            onChange={(next) => {
              setKind(next);
              // Clear what no longer applies, visibly, rather than sending it.
              if (next === "shelf") setForm((current) => ({ ...current, lead_time_days: "" }));
            }}
            ariaLabel="Kind"
          />
        </Field>

        <Field
          label="Name"
          htmlFor="new-title"
          error={errors.title ?? (arabicInEnglish ? "This looks like Arabic — did you mean the Arabic field below?" : undefined)}
        >
          <input id="new-title" value={form.title_en} onChange={(event) => setForm({ ...form, title_en: event.target.value })} maxLength={300} autoFocus />
        </Field>

        <Field label="Name · Arabic" htmlFor="new-title-ar" hint="Optional — but the shop is bilingual, and a piece without it shows English to Arabic shoppers.">
          <ArabicInput id="new-title-ar" value={form.title_ar} onChange={(event) => setForm({ ...form, title_ar: event.target.value })} maxLength={300} />
        </Field>

        <div className="console-form-grid console-form-2">
          <Field label="Price" htmlFor="new-price" error={errors.price}>
            <input id="new-price" type="number" min={1} value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} aria-invalid={Boolean(errors.price)} />
          </Field>
          {kind === "workshop" ? (
            <Field label="Ready in (days)" htmlFor="new-lead" error={errors.lead} hint="How long the making takes.">
              <input id="new-lead" type="number" min={1} max={365} value={form.lead_time_days} onChange={(event) => setForm({ ...form, lead_time_days: event.target.value })} aria-invalid={Boolean(errors.lead)} />
            </Field>
          ) : (
            <Field label="Delivery time (days)" htmlFor="new-delivery" hint="Needed before you can publish it — not to save a draft.">
              <input id="new-delivery" type="number" min={1} max={365} value={form.delivery_days} onChange={(event) => setForm({ ...form, delivery_days: event.target.value })} />
            </Field>
          )}
        </div>

        <Field label="Description" htmlFor="new-description">
          <textarea id="new-description" rows={3} value={form.description_en} onChange={(event) => setForm({ ...form, description_en: event.target.value })} />
        </Field>

        <Field label="Category" htmlFor="new-category">
          <select id="new-category" value={form.category_id} onChange={(event) => setForm({ ...form, category_id: event.target.value })}>
            <option value="">Choose later</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name_en}
              </option>
            ))}
          </select>
        </Field>

        {problem ? <p className="console-error">{problem}</p> : null}

        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Creating…" : "Create as a draft"}
        </Button>
        <p className="console-muted">Nobody sees it until you add a photo and publish it.</p>
      </form>
    </Drawer>
  );
}
