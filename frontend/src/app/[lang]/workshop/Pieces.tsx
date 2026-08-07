"use client";

/**
 * Putting something on the shelf.
 *
 * The screen without which the shop is empty. Everything else in this panel
 * measures or predicts; this is the one that creates.
 *
 * It follows the real sequence a workshop works in, and refuses to let the
 * owner skip a step, because each guard exists for a reason the shop already
 * decided:
 *
 * 1. **Write it** — a title and a price. It starts as a draft; nobody sees it.
 * 2. **Photograph it** — real photos only, and the server will not publish a
 *    piece without one. That is not a technical requirement, it is the brand:
 *    the photo is the actual object you will receive.
 * 3. **Say how many you made** — not a stock number. Each one becomes a row,
 *    numbered 01/04, 02/04. That is what makes the count on the page true.
 * 4. **Publish it** — only then does it appear in the shop.
 *
 * Adding pieces is also what tells everyone waiting on a sold-out piece, so
 * step 3 is the trigger for the whole alert system.
 */
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

import {
  admin,
  NotSignedIn,
  type AdminCategory,
  type AdminPiece,
  type AdminProduct,
} from "@/lib/admin";
import { type Lang, money } from "@/lib/i18n";

export function Pieces({ lang, onExpire }: { lang: Lang; onExpire: () => void }) {
  const ar = lang === "ar";
  const [products, setProducts] = useState<AdminProduct[] | null>(null);
  // Loaded once here and handed to both forms, rather than fetched again by
  // each one that needs it.
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [shelf, lines] = await Promise.all([admin.products(lang), admin.categories(lang)]);
      setProducts(shelf);
      setCategories(lines);
    } catch (error) {
      if (error instanceof NotSignedIn) onExpire();
      else setProblem(ar ? "تعذّر التحميل" : "Could not load");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  useEffect(() => {
    void load();
  }, [load]);

  /** A line named inside one form is immediately offered by the other. */
  const remember = useCallback(
    (category: AdminCategory) => setCategories((all) => [...all, category]),
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => setMaking(!making)}
        className={making ? "btn-quiet self-start" : "btn-primary self-start"}
      >
        {making ? (ar ? "إلغاء" : "Cancel") : ar ? "قطعة جديدة" : "New piece"}
      </button>

      {making ? (
        <NewPiece
          lang={lang}
          categories={categories}
          onCategoryCreated={remember}
          onExpire={onExpire}
          onDone={async (id) => {
            setMaking(false);
            await load();
            // Open it straight away: it is a draft with no photo, and the next
            // two steps are the ones that actually get it into the shop.
            setOpen(id);
          }}
        />
      ) : null}

      {problem ? <p className="text-[13px] text-warn">{problem}</p> : null}

      {products === null ? (
        <div className="h-32" aria-hidden />
      ) : products.length === 0 ? (
        <p className="text-[14px] text-ink-soft">
          {ar ? "الرف فارغ. ابدأ بقطعة." : "The shelf is empty. Start with one piece."}
        </p>
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
                    <Image
                      src={product.images[0].url}
                      alt=""
                      fill
                      sizes="48px"
                      className="object-cover"
                    />
                  ) : null}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-medium truncate">
                    {product.title_en}
                  </span>
                  <span className="block text-[12.5px] text-ink-soft">
                    {money(product.price, lang)}
                    {" · "}
                    {product.kind === "workshop"
                      ? ar
                        ? "عند الطلب"
                        : "made to order"
                      : ar
                        ? `${product.available} على الرف`
                        : `${product.available} on the shelf`}
                  </span>
                </span>
                <Badge lang={lang} status={product.status} />
              </button>

              {open === product.id ? (
                <PieceDetail
                  lang={lang}
                  product={product}
                  categories={categories}
                  onCategoryCreated={remember}
                  onExpire={onExpire}
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

function Badge({ lang, status }: { lang: Lang; status: string }) {
  const ar = lang === "ar";
  const label =
    status === "active"
      ? ar
        ? "منشورة"
        : "live"
      : status === "draft"
        ? ar
          ? "مسودّة"
          : "draft"
        : ar
          ? "مؤرشفة"
          : "archived";
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
        status === "active" ? "bg-clay text-white" : "bg-sand text-ink-soft"
      }`}
    >
      {label}
    </span>
  );
}

/**
 * Which line a piece belongs to, and a way to name a new one without leaving.
 *
 * There is no separate screen for managing categories and there should not be:
 * this shop has one owner and perhaps six lines of work, and the only moment
 * anybody thinks about them is while looking at a piece. So the select carries
 * its own "a new line" option, and naming one takes two fields and a button.
 *
 * Both names are asked for, because both languages are authored here and a
 * category with an empty Arabic name is a hole on half the site.
 */
function CategoryField({
  lang,
  categories,
  value,
  onChange,
  onCreated,
  disabled,
  published = false,
}: {
  lang: Lang;
  categories: AdminCategory[];
  value: string | null;
  onChange: (id: string | null) => void;
  onCreated: (category: AdminCategory) => void;
  disabled?: boolean;
  /** Only used to decide whether a missing kind is worth warning about. */
  published?: boolean;
}) {
  const ar = lang === "ar";
  const NEW = "__new__";
  const [naming, setNaming] = useState(false);
  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function create() {
    if (!nameEn.trim()) return;
    setBusy(true);
    setProblem(null);
    try {
      const created = await admin.createCategory(lang, nameEn.trim(), nameAr.trim());
      onCreated(created);
      onChange(created.id);
      setNaming(false);
      setNameEn("");
      setNameAr("");
    } catch (error) {
      setProblem(error instanceof Error ? error.message : ar ? "تعذّر الإنشاء" : "Could not add it");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label className="label" htmlFor="category">
        {ar ? "أي نوع من الأشياء؟" : "What kind of thing is it?"}
      </label>
      <select
        id="category"
        name="category"
        className="field"
        disabled={disabled || busy}
        value={naming ? NEW : (value ?? "")}
        onChange={(event) => {
          const picked = event.target.value;
          setNaming(picked === NEW);
          if (picked !== NEW) onChange(picked || null);
        }}
      >
        <option value="">{ar ? "اختر…" : "Choose…"}</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {ar ? category.name_ar || category.name_en : category.name_en}
          </option>
        ))}
        <option value={NEW}>{ar ? "＋ نوع جديد" : "＋ A new kind"}</option>
      </select>

      {naming ? (
        <div className="mt-2 flex flex-col gap-2">
          <input
            aria-label={ar ? "اسم النوع بالإنجليزية" : "Name of the kind, in English"}
            placeholder={ar ? "Hooks" : "Hooks"}
            value={nameEn}
            onChange={(event) => setNameEn(event.target.value)}
            maxLength={160}
            className="field"
          />
          <input
            aria-label={ar ? "اسم النوع بالعربية" : "Name of the kind, in Arabic"}
            placeholder="خطّافات"
            dir="rtl"
            value={nameAr}
            onChange={(event) => setNameAr(event.target.value)}
            maxLength={160}
            className="field"
          />
          <button
            type="button"
            disabled={busy || !nameEn.trim()}
            onClick={() => void create()}
            className="btn-quiet self-start"
          >
            {ar ? "أضف النوع" : "Add the kind"}
          </button>
        </div>
      ) : null}

      {problem ? <p className="mt-1 text-[13px] text-warn">{problem}</p> : null}

      <p className="mt-1.5 text-[12.5px] text-ink-soft">
        {ar
          ? "هذا ما يتعلّمه الرف: من نظر إلى خطّاف يُعرض عليه المزيد من الخطّافات."
          : "This is what the shelf learns from — someone who looks at a hook is shown more hooks."}
      </p>

      {/* Worth saying out loud only once it is in the shop: a draft with no
          kind yet is fine, a published piece with none is invisible to the
          strongest thing the feed knows how to do. */}
      {published && !value ? (
        <p className="mt-1 text-[12.5px] text-warn">
          {ar
            ? "هذه القطعة منشورة بلا نوع — الرف لا يعرف لمن يعرضها."
            : "This one is live with no kind, so the shelf cannot learn who to show it to."}
        </p>
      ) : null}
    </div>
  );
}

/** Photograph it, make some, publish it — and see who is waiting. */
function PieceDetail({
  lang,
  product,
  categories,
  onCategoryCreated,
  onExpire,
  onChanged,
}: {
  lang: Lang;
  product: AdminProduct;
  categories: AdminCategory[];
  onCategoryCreated: (category: AdminCategory) => void;
  onExpire: () => void;
  onChanged: () => Promise<void>;
}) {
  const ar = lang === "ar";
  const [pieces, setPieces] = useState<AdminPiece[]>([]);
  const [waiting, setWaiting] = useState(0);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [batch, queue] = await Promise.all([
        product.kind === "shelf" ? admin.pieces(lang, product.id) : Promise.resolve([]),
        admin.waiting(lang, product.id).catch(() => ({ waiting: 0 })),
      ]);
      setPieces(batch);
      setWaiting(queue.waiting);
    } catch (error) {
      if (error instanceof NotSignedIn) onExpire();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, product.id, product.kind]);

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
      if (error instanceof NotSignedIn) onExpire();
      else setProblem(error instanceof Error ? error.message : failure);
    } finally {
      setBusy(false);
    }
  }

  const published = product.status === "active";

  return (
    <div className="mt-4 flex flex-col gap-4 border-t border-sand pt-4">
      {/* Photographs. The shop will not publish without one, so this is first. */}
      <div>
        <p className="label">{ar ? "الصور" : "Photos"}</p>
        <div className="flex flex-wrap gap-2">
          {product.images.map((photo) => (
            <span
              key={photo.id}
              className="relative h-16 w-16 rounded-xl overflow-hidden bg-clay-soft"
            >
              <Image src={photo.url} alt="" fill sizes="64px" className="object-cover" />
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
                if (file) {
                  void guarded(
                    () => admin.addPhoto(lang, product.id, file),
                    ar ? "تعذّر رفع الصورة" : "That photo would not upload",
                  );
                }
              }}
            />
          </label>
        </div>
        {product.images.length === 0 ? (
          <p className="mt-1.5 text-[12.5px] text-ink-soft">
            {ar
              ? "صورة حقيقية واحدة على الأقل قبل النشر. الصورة هي القطعة نفسها."
              : "At least one real photo before it can go live. The photo is the piece itself."}
          </p>
        ) : null}
      </div>

      {/* Which line it belongs to. Changeable afterwards, because the first
          answer is often wrong and the ranking reads this every time. */}
      <CategoryField
        lang={lang}
        categories={categories}
        value={product.category_id}
        disabled={busy}
        published={published}
        onCreated={onCategoryCreated}
        onChange={(id) =>
          void guarded(
            () => admin.updateProduct(lang, product.id, { category_id: id }),
            ar ? "تعذّر التغيير" : "Could not change that",
          )
        }
      />

      {/* How many were made. Not a stock number — one row per object. */}
      {product.kind === "shelf" ? (
        <div>
          <p className="label">{ar ? "كم صنعت" : "How many you made"}</p>
          {pieces.length > 0 ? (
            <div className="tally mb-2.5">
              {pieces.map((piece) => (
                <span
                  key={piece.id}
                  className={piece.state === "available" ? "tally-here" : "tally-gone"}
                  title={piece.state}
                >
                  {String(piece.number).padStart(2, "0")}
                </span>
              ))}
            </div>
          ) : null}
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const quantity = Number(form.get("quantity"));
              if (quantity >= 1) {
                void guarded(
                  () => admin.addPieces(lang, product.id, quantity),
                  ar ? "تعذّرت الإضافة" : "Could not add those",
                );
              }
            }}
          >
            <input
              name="quantity"
              type="number"
              min={1}
              max={200}
              defaultValue={1}
              inputMode="numeric"
              className="field w-24"
              aria-label={ar ? "العدد" : "How many"}
            />
            <button type="submit" disabled={busy} className="btn-quiet">
              {ar ? "أضف إلى الرف" : "Add to the shelf"}
            </button>
          </form>
          {waiting > 0 ? (
            <p className="mt-2 text-[13px] text-clay font-medium">
              {ar
                ? `${waiting} ينتظرون هذه القطعة — سيُخطرون فور الإضافة.`
                : `${waiting} people are waiting on this — they are told the moment you add more.`}
            </p>
          ) : null}
        </div>
      ) : null}

      {problem ? <p className="text-[13px] text-warn">{problem}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void guarded(
              () =>
                admin.updateProduct(lang, product.id, {
                  status: published ? "draft" : "active",
                }),
              published
                ? ar
                  ? "تعذّر السحب"
                  : "Could not take it down"
                : ar
                  ? "تعذّر النشر"
                  : "Could not publish it",
            )
          }
          className={published ? "btn-quiet" : "btn-primary"}
        >
          {published
            ? ar
              ? "اسحبها من المتجر"
              : "Take it down"
            : ar
              ? "انشرها"
              : "Publish it"}
        </button>
        {published ? (
          <a href={`/${lang}/piece/${product.slug}`} target="_blank" rel="noreferrer" className="btn-quiet">
            {ar ? "اعرض الصفحة" : "See the page"}
          </a>
        ) : null}
      </div>
    </div>
  );
}

/** Title and price. Everything else is added once it exists. */
function NewPiece({
  lang,
  categories,
  onCategoryCreated,
  onDone,
  onExpire,
}: {
  lang: Lang;
  categories: AdminCategory[];
  onCategoryCreated: (category: AdminCategory) => void;
  onDone: (id: string) => Promise<void>;
  onExpire: () => void;
}) {
  const ar = lang === "ar";
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
      const created = await admin.createProduct(lang, {
        kind,
        title_en: String(form.get("title_en") ?? "").trim(),
        title_ar: String(form.get("title_ar") ?? "").trim(),
        description_en: String(form.get("description_en") ?? ""),
        description_ar: String(form.get("description_ar") ?? ""),
        price: Number(form.get("price")),
        category_id: categoryId,
        // Required for made-to-order: a piece with no lead time has nothing
        // honest to put on its page.
        lead_time_days: kind === "workshop" ? Number(form.get("lead_time_days")) : null,
      });
      await onDone(created.id);
    } catch (error) {
      if (error instanceof NotSignedIn) onExpire();
      else setProblem(ar ? "تحقّق من الحقول" : "Check the fields");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={create} className="card p-5 shadow-soft flex flex-col gap-4">
      <div className="flex gap-2">
        {(
          [
            ["shelf", ar ? "على الرف" : "The Shelf", ar ? "صنعتها بالفعل" : "already made"],
            ["workshop", ar ? "الورشة" : "The Workshop", ar ? "تُصنع عند الطلب" : "made to order"],
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
            <span className={`text-[11px] ${kind === value ? "text-white/75" : "text-ink-soft"}`}>
              {hint}
            </span>
          </button>
        ))}
      </div>

      <div>
        <label className="label" htmlFor="title_en">
          {ar ? "الاسم بالإنجليزية" : "Name in English"}
        </label>
        <input id="title_en" name="title_en" required maxLength={300} className="field" />
      </div>

      <div>
        <label className="label" htmlFor="title_ar">
          {ar ? "الاسم بالعربية" : "Name in Arabic"}
        </label>
        <input id="title_ar" name="title_ar" maxLength={300} className="field" dir="rtl" />
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="label" htmlFor="price">
            {ar ? "الثمن" : "Price"}
          </label>
          <input
            id="price"
            name="price"
            type="number"
            min={1}
            // Whole dirhams, and every one of them valid.
            //
            // This was `step={10}`, which sounds harmless and is not: the step
            // is counted from `min`, so the only acceptable prices became 1,
            // 11, 21, 31… A price of 140 made the field invalid, the browser
            // silently refused to submit the form, and the owner pressed send
            // and watched nothing happen.
            step={1}
            required
            inputMode="numeric"
            className="field"
          />
        </div>
        {kind === "workshop" ? (
          <div className="flex-1">
            <label className="label" htmlFor="lead_time_days">
              {ar ? "خلال كم يوماً" : "In how many days"}
            </label>
            <input
              id="lead_time_days"
              name="lead_time_days"
              type="number"
              min={1}
              max={365}
              required
              inputMode="numeric"
              className="field"
            />
          </div>
        ) : null}
      </div>

      <div>
        <label className="label" htmlFor="description_en">
          {ar ? "الوصف بالإنجليزية" : "Description in English"}
        </label>
        <textarea id="description_en" name="description_en" rows={2} className="field resize-none" />
      </div>

      <div>
        <label className="label" htmlFor="description_ar">
          {ar ? "الوصف بالعربية" : "Description in Arabic"}
        </label>
        <textarea
          id="description_ar"
          name="description_ar"
          rows={2}
          dir="rtl"
          className="field resize-none"
        />
      </div>

      <CategoryField
        lang={lang}
        categories={categories}
        value={categoryId}
        onChange={setCategoryId}
        onCreated={onCategoryCreated}
        disabled={busy}
      />

      {problem ? <p className="text-[13px] text-warn">{problem}</p> : null}

      <button type="submit" disabled={busy} className="btn-primary">
        {ar ? "أنشئها كمسودّة" : "Create it as a draft"}
      </button>
      <p className="text-[12px] text-ink-soft">
        {ar
          ? "لن يراها أحد حتى تضيف صورة حقيقية وتنشرها."
          : "Nobody sees it until you add a real photo and publish it."}
      </p>
    </form>
  );
}
