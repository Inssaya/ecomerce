"use client";

/**
 * Add — the one place new things are made.
 *
 * Three steps down the same popup, in the order the shop is actually built:
 * a category, then a subcategory under it, then a piece filed in one of them.
 * Categories used to be their own page, which meant setting up a new line of
 * work was two screens and a route change; here it is one popup and you can
 * see what you are filing into while you file it.
 *
 * Modify and Delete are dull until a row is selected, and then they are not —
 * a control that is live before it has anything to act on is a control that
 * asks "which one?" after the click instead of before it.
 */
import { useState } from "react";

import { api, type AdminCategory } from "@/lib/console/api";
import { useMutation } from "@/lib/console/query";

import { ArabicInput, Button, Field, Popup, Text, useConfirm } from "../ui/primitives";

/**
 * `CategoryWrite` is a **full replace** — every field must ride along or the
 * server nulls it. A partial patch here silently wipes the Arabic name.
 */
function whole(category: AdminCategory) {
  return {
    name_en: category.name_en,
    name_ar: category.name_ar,
    parent_id: category.parent_id,
    display_order: category.display_order,
    is_active: category.is_active,
  };
}

export function AddPopup({
  categories,
  onClose,
  onChanged,
  onNewProduct,
}: {
  categories: AdminCategory[];
  onClose: () => void;
  onChanged: () => void;
  /** Handing the piece over to the product form — the same one Open uses. */
  onNewProduct: (categoryId: string | null) => void;
}) {
  const [category, setCategory] = useState<string>("");
  const [subcategory, setSubcategory] = useState<string>("");

  const roots = categories
    .filter((item) => !item.parent_id)
    .sort((a, b) => a.display_order - b.display_order);
  const children = categories
    .filter((item) => item.parent_id === category)
    .sort((a, b) => a.display_order - b.display_order);

  return (
    <Popup open title="Add" sub="A line of work, a branch of one, or a piece." width={720} onClose={onClose}>
      <Tier
        label="Category"
        options={roots}
        selected={category}
        onSelect={(id) => {
          setCategory(id);
          // The old branch belongs to the old line of work.
          setSubcategory("");
        }}
        parentId={null}
        onChanged={onChanged}
      />

      <Tier
        label="Sub-category"
        options={children}
        selected={subcategory}
        onSelect={setSubcategory}
        parentId={category || null}
        disabledReason={category ? null : "Pick a category first."}
        onChanged={onChanged}
      />

      <div className="console-stack-sm">
        <span className="console-caps">Product</span>
        <p className="console-muted">
          {subcategory
            ? "Filed under the sub-category."
            : category
              ? "Filed under the category."
              : "Filed under no category — you can set one later."}
        </p>
        <div className="console-row">
          <Button
            variant="primary"
            icon="plus"
            onClick={() => onNewProduct(subcategory || category || null)}
          >
            New piece
          </Button>
        </div>
      </div>
    </Popup>
  );
}

/**
 * One level of the tree: a dropdown, and the three things you can do to it.
 */
function Tier({
  label,
  options,
  selected,
  onSelect,
  parentId,
  disabledReason,
  onChanged,
}: {
  label: string;
  options: AdminCategory[];
  selected: string;
  onSelect: (id: string) => void;
  parentId: string | null;
  disabledReason?: string | null;
  onChanged: () => void;
}) {
  const { mutate, busy, problem } = useMutation();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);

  const chosen = options.find((option) => option.id === selected) ?? null;
  const locked = Boolean(disabledReason);

  return (
    <div className="console-stack-sm">
      <span className="console-caps">{label}</span>
      {problem ? <p className="console-error">{problem}</p> : null}

      <div className="console-row" style={{ gap: "var(--space-2)" }}>
        <select
          className="console-select"
          value={selected}
          disabled={locked}
          aria-label={label}
          onChange={(event) => {
            onSelect(event.target.value);
            setEditing(false);
          }}
        >
          <option value="">{locked ? disabledReason : `No ${label.toLowerCase()}`}</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name_en}
            </option>
          ))}
        </select>

        <Button
          size="sm"
          icon="plus"
          disabled={locked || busy}
          onClick={() => {
            setAdding((was) => !was);
            setEditing(false);
          }}
        >
          Add
        </Button>

        {/* Dull until there is something to modify. */}
        <Button
          size="sm"
          icon="edit"
          disabled={!chosen || busy}
          onClick={() => {
            setEditing((was) => !was);
            setAdding(false);
          }}
        >
          Modify
        </Button>

        <Button
          size="sm"
          variant={chosen ? "danger" : "default"}
          icon="trash"
          disabled={!chosen || busy}
          onClick={() =>
            chosen &&
            confirm({
              title: `Delete "${chosen.name_en}"?`,
              body: "Pieces in it are not deleted, but they lose their category and drop out of the storefront's filter until you give them a new one.",
              confirmLabel: "Delete it",
              danger: true,
              onConfirm: () =>
                mutate(() => api.deleteCategory(chosen.id), {
                  invalidates: ["categoryChanged"],
                  onDone: () => {
                    onSelect("");
                    onChanged();
                  },
                }),
            })
          }
        >
          Delete
        </Button>
      </div>

      {adding ? (
        <NameForm
          submitLabel="Add it"
          busy={busy}
          onCancel={() => setAdding(false)}
          onSubmit={(nameEn, nameAr) =>
            void mutate(
              () => api.createCategory({ name_en: nameEn, name_ar: nameAr, parent_id: parentId }),
              {
                invalidates: ["categoryChanged"],
                onDone: (created) => {
                  setAdding(false);
                  onSelect(created.id);
                  onChanged();
                },
              },
            )
          }
        />
      ) : null}

      {editing && chosen ? (
        <NameForm
          submitLabel="Save"
          busy={busy}
          initial={chosen}
          onCancel={() => setEditing(false)}
          onSubmit={(nameEn, nameAr) =>
            void mutate(
              () => api.updateCategory(chosen.id, { ...whole(chosen), name_en: nameEn, name_ar: nameAr }),
              {
                invalidates: ["categoryChanged"],
                onDone: () => {
                  setEditing(false);
                  onChanged();
                },
              },
            )
          }
        />
      ) : null}

      {chosen && !chosen.name_ar ? (
        <p className="console-note">
          <Text>{chosen.name_en}</Text> has no Arabic name — the shop will show the English one to Arabic readers.
        </p>
      ) : null}
    </div>
  );
}

function NameForm({
  submitLabel,
  busy,
  initial,
  onCancel,
  onSubmit,
}: {
  submitLabel: string;
  busy: boolean;
  initial?: AdminCategory;
  onCancel: () => void;
  onSubmit: (nameEn: string, nameAr: string) => void;
}) {
  const [nameEn, setNameEn] = useState(initial?.name_en ?? "");
  const [nameAr, setNameAr] = useState(initial?.name_ar ?? "");

  return (
    <form
      className="console-stack-sm"
      onSubmit={(event) => {
        event.preventDefault();
        if (!nameEn.trim()) return;
        onSubmit(nameEn.trim(), nameAr.trim());
      }}
    >
      <div className="console-form-grid console-form-2">
        <Field label="Name" htmlFor="tier-en">
          <input id="tier-en" value={nameEn} onChange={(event) => setNameEn(event.target.value)} maxLength={160} autoFocus />
        </Field>
        <Field label="Name · Arabic" htmlFor="tier-ar">
          <ArabicInput id="tier-ar" value={nameAr} onChange={(event) => setNameAr(event.target.value)} maxLength={160} />
        </Field>
      </div>
      <div className="console-row">
        <Button type="submit" variant="primary" size="sm" disabled={busy || !nameEn.trim()}>
          {submitLabel}
        </Button>
        <Button type="button" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
