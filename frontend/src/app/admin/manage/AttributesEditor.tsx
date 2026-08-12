"use client";

/**
 * What a piece is: its measures, its colours, what it is made of.
 *
 * This is what replaced variants. A variant was one buyable configuration as a
 * single string, so a piece in four colours and three sizes was twelve rows to
 * type and twelve to correct. These are independent lines of description; a
 * piece can carry all three groups, one, or none.
 *
 * Two shapes, in one row of inputs:
 *
 *   typed   Width  →  10 cm
 *   plain          →  M
 *
 * The value is free text and stays free text. "10 cm" is something to print,
 * not a quantity to compute with, and the moment it becomes a number with a
 * unit somebody has to decide what happens when a piece is 10 cm by 4 inches.
 *
 * The dropdowns are suggestions, never a closed list — the server offers the
 * presets plus everything the shop already says, and typing something new is
 * always allowed. That is the whole reason there is no vocabulary to
 * administer.
 */
import { useCallback, useState } from "react";

import { api, type AdminProduct, type AttributeGroup, type ProductAttribute } from "@/lib/console/api";
import { useConsoleQuery, useMutation } from "@/lib/console/query";

import { Button, Card, CardHead, Field, Swatch, Text, useConfirm } from "../ui/primitives";

const GROUPS: { value: AttributeGroup; label: string; hint: string }[] = [
  { value: "measure", label: "Measure", hint: "M, or Width → 10 cm" },
  { value: "color", label: "Colour", hint: "Shown as a circle on the shop" },
  { value: "material", label: "Material", hint: "Wood, Cotton 100%" },
];

export function AttributesEditor({ product, onChanged }: { product: AdminProduct; onChanged: () => void }) {
  const { mutate, busy, problem } = useMutation();
  const confirm = useConfirm();

  const [group, setGroup] = useState<AttributeGroup>("measure");
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [hex, setHex] = useState("#B4785A");

  const suggestions = useConsoleQuery(
    "attribute-suggestions",
    useCallback(() => api.attributeSuggestions(), []),
  );

  // Which list feeds which box. Colours suggest a value and a swatch together,
  // so they get their own path below.
  const names =
    group === "measure"
      ? (suggestions.data?.measure_names ?? [])
      : group === "material"
        ? (suggestions.data?.material_names ?? [])
        : [];
  const values =
    group === "measure"
      ? (suggestions.data?.measure_values ?? [])
      : group === "material"
        ? (suggestions.data?.material_values ?? [])
        : (suggestions.data?.colors ?? []).map((color) => color.value);

  const add = () => {
    const cleanValue = value.trim();
    if (!cleanValue) return;
    void mutate(
      () =>
        api.addAttribute(product.id, {
          group,
          name: name.trim() || null,
          value: cleanValue,
          hex: group === "color" ? hex : null,
        }),
      {
        invalidates: ["attributeChanged"],
        onDone: () => {
          setName("");
          setValue("");
          // The list the dropdowns read has just grown by one.
          suggestions.reload();
          onChanged();
        },
      },
    );
  };

  const remove = (attribute: ProductAttribute) =>
    confirm({
      title: `Remove "${attribute.label}"?`,
      body: "It stops being shown on the shop. Orders that already chose it keep what they were sold.",
      confirmLabel: "Remove it",
      danger: true,
      onConfirm: () =>
        mutate(() => api.removeAttribute(attribute.id), { invalidates: ["attributeChanged"], onDone: onChanged }),
    });

  return (
    <Card>
      <CardHead
        title="What it is"
        sub="Measures, colours and materials. Add as many or as few as the piece actually has — the shop shows exactly these and nothing else."
      />
      {problem ? <p className="console-error">{problem}</p> : null}

      {GROUPS.map((definition) => {
        const mine = product.attributes.filter((attribute) => attribute.group === definition.value);
        if (mine.length === 0) return null;
        return (
          <div key={definition.value} className="console-stack-sm">
            <span className="console-caps">{definition.label}</span>
            <div className="console-row" style={{ gap: 6 }}>
              {mine.map((attribute) => (
                <span key={attribute.id} className="console-chip console-spec">
                  <Swatch hex={attribute.hex} label={attribute.value} />
                  {attribute.name ? <span className="console-spec-sub">{attribute.name}</span> : null}
                  <Text>{attribute.value}</Text>
                  <button
                    type="button"
                    aria-label={`Remove ${attribute.label}`}
                    disabled={busy}
                    onClick={() => remove(attribute)}
                    style={{ color: "var(--ink3)", padding: "0 2px" }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        );
      })}

      {product.attributes.length === 0 ? (
        <p className="console-muted">Nothing said about this piece yet.</p>
      ) : null}

      <form
        className="console-row"
        style={{ alignItems: "flex-end", gap: "var(--space-2)" }}
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <Field label="Kind" htmlFor="attr-group">
          <select
            id="attr-group"
            className="console-select"
            value={group}
            onChange={(event) => {
              setGroup(event.target.value as AttributeGroup);
              // The old name belongs to the old group — "Width" on a colour is
              // a field nobody meant to fill in.
              setName("");
              setValue("");
            }}
          >
            {GROUPS.map((definition) => (
              <option key={definition.value} value={definition.value}>
                {definition.label}
              </option>
            ))}
          </select>
        </Field>

        {group !== "color" ? (
          <Field label="Label (optional)" htmlFor="attr-name">
            <input
              id="attr-name"
              list="attr-name-options"
              value={name}
              maxLength={60}
              placeholder={group === "measure" ? "Width" : "Fabric"}
              onChange={(event) => setName(event.target.value)}
              style={{ width: 150 }}
            />
            <datalist id="attr-name-options">
              {names.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </Field>
        ) : null}

        <Field label="Value" htmlFor="attr-value">
          <input
            id="attr-value"
            list="attr-value-options"
            value={value}
            maxLength={120}
            placeholder={group === "measure" ? "10 cm — or M" : group === "color" ? "Matte black" : "Wood"}
            onChange={(event) => {
              setValue(event.target.value);
              // Picking a suggested colour brings its swatch with it, so the
              // shop's blacks are the same black.
              if (group === "color") {
                const known = (suggestions.data?.colors ?? []).find(
                  (color) => color.value.toLowerCase() === event.target.value.trim().toLowerCase(),
                );
                if (known?.hex) setHex(known.hex);
              }
            }}
            style={{ width: 180 }}
          />
          <datalist id="attr-value-options">
            {values.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </Field>

        {group === "color" ? (
          <Field label="Swatch" htmlFor="attr-hex">
            <input
              id="attr-hex"
              type="color"
              value={hex}
              onChange={(event) => setHex(event.target.value)}
              style={{ width: 56, padding: 4 }}
            />
          </Field>
        ) : null}

        <Button type="submit" icon="plus" disabled={busy || !value.trim()}>
          Add
        </Button>
      </form>
      <p className="console-field-hint">{GROUPS.find((definition) => definition.value === group)?.hint}</p>
    </Card>
  );
}
