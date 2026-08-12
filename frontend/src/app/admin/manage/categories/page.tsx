"use client";

/**
 * Manage · Categories — the tree the storefront's rail and filter read.
 *
 * Two real bugs fixed here. Reordering had no error handling at all, so a
 * half-failed swap left the order inconsistent and said nothing. And the
 * active toggle was a `display:contents` button hidden inside a status pill,
 * which looked exactly like a passive badge — the one control on the row
 * nobody could find.
 */
import { useCallback, useState } from "react";
import Image from "next/image";

import { api, type AdminCategory } from "@/lib/console/api";
import { useConsoleQuery, useMutation } from "@/lib/console/query";

import { ManageSwitch } from "../ManageSwitch";
import {
  ArabicInput,
  Button,
  Card,
  ControlStrip,
  EmptyState,
  Field,
  Icon,
  LoadError,
  Pill,
  Skeleton,
  Stale,
  Text,
  useConfirm,
} from "../../ui/primitives";

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

export default function Categories() {
  const { data, error, loading, stale, reload } = useConsoleQuery("categories", useCallback(() => api.categories(), []));
  const { mutate, busy, problem } = useMutation();
  const confirm = useConfirm();
  const [addingUnder, setAddingUnder] = useState<string | null | false>(false);

  const all = data ?? [];
  const roots = [...all].filter((category) => !category.parent_id).sort((a, b) => a.display_order - b.display_order);
  const childrenOf = (id: string) => all.filter((category) => category.parent_id === id).sort((a, b) => a.display_order - b.display_order);
  const usedBy = (id: string) => all.filter((category) => category.parent_id === id).length;

  async function swap(group: AdminCategory[], index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= group.length) return;
    const a = group[index];
    const b = group[target];
    // One mutation, so a half-applied reorder surfaces instead of vanishing.
    await mutate(
      async () => {
        await api.updateCategory(a.id, { ...whole(a), display_order: b.display_order });
        await api.updateCategory(b.id, { ...whole(b), display_order: a.display_order });
      },
      { invalidates: ["categoryChanged"], onDone: reload },
    );
  }

  function row(category: AdminCategory, group: AdminCategory[], index: number, isRoot: boolean) {
    const children = isRoot ? usedBy(category.id) : 0;
    return (
      <div key={category.id} className="console-row" style={{ gap: 10, flexWrap: "nowrap", padding: "6px 0" }}>
        <label
          style={{
            position: "relative",
            width: 40,
            height: 40,
            flex: "none",
            borderRadius: 6,
            overflow: "hidden",
            background: "var(--bg2)",
            border: "1px solid var(--line)",
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
            color: "var(--ink3)",
          }}
          title={category.icon_url ? "Replace the icon" : "Add an icon — the storefront rail shows a gap without one"}
        >
          {category.icon_url ? <Image src={category.icon_url} alt="" fill sizes="40px" style={{ objectFit: "cover" }} /> : <Icon name="image" size={16} />}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void mutate(() => api.uploadCategoryIcon(category.id, file), { invalidates: ["categoryChanged"], onDone: reload });
            }}
          />
        </label>

        <span style={{ flex: 1, minWidth: 0 }}>
          <Text className="console-strong">{category.name_en}</Text>
          {category.name_ar ? (
            <span className="console-cell-sub" style={{ display: "block" }} dir="rtl">
              {category.name_ar}
            </span>
          ) : (
            <span className="console-cell-sub" style={{ display: "block", color: "var(--warn)" }}>
              no Arabic name
            </span>
          )}
        </span>

        <span className="console-row" style={{ gap: 4, flex: "none" }}>
          <Button size="sm" iconOnly icon="chevron-up" aria-label="Move up" disabled={busy || index === 0} onClick={() => void swap(group, index, -1)} />
          <Button size="sm" iconOnly icon="chevron-down" aria-label="Move down" disabled={busy || index === group.length - 1} onClick={() => void swap(group, index, 1)} />

          {/* A control that looks like a control. */}
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              mutate(() => api.updateCategory(category.id, { ...whole(category), is_active: !category.is_active }), {
                invalidates: ["categoryChanged"],
                onDone: reload,
              })
            }
          >
            {category.is_active ? "Hide" : "Show"}
          </Button>

          {isRoot ? (
            <Button size="sm" icon="plus" disabled={busy} onClick={() => setAddingUnder(category.id)}>
              Sub
            </Button>
          ) : null}

          <Button
            size="sm"
            iconOnly
            icon="trash"
            aria-label="Delete"
            disabled={busy || children > 0}
            title={children > 0 ? `${children} subcategories use this — move them first` : undefined}
            onClick={() =>
              confirm({
                title: `Delete "${category.name_en}"?`,
                body: "Pieces in it are not deleted, but they lose their category and drop out of the storefront's filter until you give them a new one.",
                confirmLabel: "Delete it",
                danger: true,
                onConfirm: () => mutate(() => api.deleteCategory(category.id), { invalidates: ["categoryChanged"], onDone: reload }),
              })
            }
          />
        </span>
      </div>
    );
  }

  return (
    <>
      <ControlStrip
        groups={[]}
        trailing={
          <>
            <Pill tone="neutral">{roots.length} lines</Pill>
            <ManageSwitch current="categories" />
            <Button variant="primary" icon="plus" onClick={() => setAddingUnder(addingUnder === false ? null : false)}>
              {addingUnder !== false ? "Cancel" : "New category"}
            </Button>
          </>
        }
      />

      {error && !data ? <LoadError message={error} onRetry={reload} /> : null}
      {problem ? <p className="console-error">{problem}</p> : null}
      {loading ? <Skeleton height={220} /> : null}

      {addingUnder !== false ? (
        <NewCategory parentId={addingUnder} onCancel={() => setAddingUnder(false)} onCreated={() => { setAddingUnder(false); reload(); }} />
      ) : null}

      {data ? (
        <Stale stale={stale}>
          {roots.length === 0 ? (
            <EmptyState title="No categories yet." hint="A category is an icon on the shop's rail and a choice in its filter." />
          ) : (
            <div className="console-stack-sm">
              {roots.map((root, index) => (
                <Card key={root.id} pad="sm">
                  {row(root, roots, index, true)}
                  {childrenOf(root.id).length > 0 ? (
                    <div style={{ marginInlineStart: 22, paddingInlineStart: 14, borderInlineStart: "1px solid var(--line)" }}>
                      {childrenOf(root.id).map((child, childIndex, siblings) => row(child, siblings, childIndex, false))}
                    </div>
                  ) : null}
                </Card>
              ))}
            </div>
          )}
        </Stale>
      ) : null}
    </>
  );
}

function NewCategory({ parentId, onCancel, onCreated }: { parentId: string | null; onCancel: () => void; onCreated: () => void }) {
  const { mutate, busy, problem } = useMutation();
  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");

  return (
    <Card>
      <form
        className="console-stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (!nameEn.trim()) return;
          void mutate(() => api.createCategory({ name_en: nameEn.trim(), name_ar: nameAr.trim(), parent_id: parentId }), {
            invalidates: ["categoryChanged"],
            onDone: onCreated,
          });
        }}
      >
        <p className="console-caps">{parentId ? "New subcategory" : "New category"}</p>
        <div className="console-form-grid console-form-2">
          <Field label="Name" htmlFor="cat-en">
            <input id="cat-en" value={nameEn} onChange={(event) => setNameEn(event.target.value)} maxLength={160} autoFocus />
          </Field>
          <Field label="Name · Arabic" htmlFor="cat-ar">
            <ArabicInput id="cat-ar" value={nameAr} onChange={(event) => setNameAr(event.target.value)} maxLength={160} />
          </Field>
        </div>
        {problem ? <p className="console-error">{problem}</p> : null}
        <div className="console-row">
          <Button type="submit" variant="primary" disabled={busy || !nameEn.trim()}>
            Add it
          </Button>
          <Button type="button" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
