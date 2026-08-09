"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { ApiError, api } from "@/lib/api";
import { type Lang, isLang, translator } from "@/lib/i18n";

/**
 * Custom orders.
 *
 * Two columns on a desktop: the form on the left, and on the right the one
 * thing a person hesitating over this page actually wants to know — what
 * happens after they press send, and that nothing is owed until they agree.
 * It was a single phone-width column at every screen size.
 *
 * The type chips are the shop's real categories, read from the API. A fixed
 * list here would go stale the first time a line of work is added in the panel.
 */
export default function AskPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: raw } = use(params);
  const lang = (isLang(raw) ? raw : "en") as Lang;
  const t = translator(lang);
  const ar = lang === "ar";
  const router = useRouter();

  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [kind, setKind] = useState<string | null>(null);

  useEffect(() => {
    api
      .categories(lang)
      .then((tree) => setCategories(tree.map(({ id, name }) => ({ id, name }))))
      .catch(() => setCategories([]));
  }, [lang]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setProblem(null);

    const form = new FormData(event.currentTarget);
    try {
      const created = await api.ask(lang, {
        full_name: form.get("full_name"),
        phone: form.get("phone"),
        email: form.get("email") || null,
        city: form.get("city") || null,
        description: form.get("description"),
        category_id: kind,
        budget: form.get("budget") ? Number(form.get("budget")) : null,
        lang,
      });
      router.replace(`/${lang}/request/${created.tracking_token}`);
    } catch (error) {
      setProblem(error instanceof ApiError ? error.message : t("somethingWentWrong"));
      setSending(false);
    }
  }

  const steps = ar
    ? [
        ["نقرأ الطلب", "نقرأه بأنفسنا، لا آلة. عادةً في نفس اليوم."],
        ["نعود بثمن وتاريخ", "ثمن واضح وتاريخ حقيقي — لا «قريباً»."],
        ["نصنعه", "بعد موافقتك فقط. تخلّص نقداً عند الاستلام."],
      ]
    : [
        ["We read it", "By hand, not by machine. Usually the same day."],
        ["We come back with a price and a date", "A real date, never “soon”."],
        ["We make it", "Only after you agree. You pay cash when it arrives."],
      ];

  return (
    <div className="page-wide pt-8 pb-16">
      <div className="max-w-[46ch]">
        <p className="text-[13.5px] font-medium text-clay">{t("navCustom")}</p>
        <h1 className="mt-3 text-[clamp(30px,4vw,52px)] leading-[1.02] font-semibold tracking-[-0.04em]">
          {ar ? "أخبرنا بما تريد صنعه." : "Tell us what you want made."}
        </h1>
        <p className="mt-3.5 text-[16px] leading-[1.6] text-ink-soft">
          {ar
            ? "دفعة قمصان لفريق، 200 ميدالية منقوشة، قطعة غيار، هدية عليها اسم. أرسل الفكرة — نعود إليك بثمن وتاريخ. لا شيء عليك حتى توافق."
            : "A run of tees for a team, 200 engraved keychains, a replacement part, a gift with a name on it. Send the idea — we come back with a price and a date. Nothing to pay until you agree."}
        </p>
      </div>

      <div className="mt-9 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-12 lg:items-start">
        <form onSubmit={submit} className="grid gap-4">
          <div>
            <label htmlFor="description" className="label">
              {ar ? "ما الذي تحتاجه؟" : "What do you need?"}
            </label>
            <textarea
              id="description"
              name="description"
              rows={5}
              required
              minLength={10}
              placeholder={
                ar
                  ? "30 قميصاً أسود بشعارنا على الصدر، مقاسات M إلى XL…"
                  : "30 black tees with our logo on the chest, sizes M to XL…"
              }
              className="field resize-none"
            />
          </div>

          {categories.length > 0 ? (
            <div>
              <span className="label">{ar ? "نوع المنتج" : "Product type"}</span>
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => {
                  const chosen = kind === category.id;
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => setKind(chosen ? null : category.id)}
                      className={`h-10 rounded-full border-[1.5px] px-4 text-[14px] font-medium
                                  transition-all duration-200 ${
                                    chosen
                                      ? "border-ink bg-ink text-white"
                                      : "border-sand bg-surface text-ink-soft hover:text-ink hover:border-ink"
                                  }`}
                    >
                      {category.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="full_name" className="label">
                {t("yourName")}
              </label>
              <input id="full_name" name="full_name" required autoComplete="name" className="field" />
            </div>
            <div>
              <label htmlFor="phone" className="label">
                {t("yourPhone")}
              </label>
              <input
                id="phone"
                name="phone"
                required
                inputMode="tel"
                autoComplete="tel"
                placeholder="0612345678"
                className="field"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="email" className="label">
                {t("yourEmail")}
              </label>
              <input id="email" name="email" type="email" autoComplete="email" className="field" />
            </div>
            <div>
              <label htmlFor="city" className="label">
                {t("yourCity")}
              </label>
              <input id="city" name="city" autoComplete="address-level2" className="field" />
            </div>
          </div>

          <div>
            <label htmlFor="budget" className="label">
              {ar ? "ميزانيتك بالدرهم (اختياري)" : "Your budget in MAD (optional)"}
            </label>
            <input id="budget" name="budget" type="number" min="0" inputMode="numeric" className="field" />
          </div>

          {problem ? (
            <p role="alert" className="text-[14px] text-warn">
              {problem}
            </p>
          ) : null}

          <button type="submit" disabled={sending} className="btn-primary h-[52px]">
            {sending ? t("placing") : ar ? "أرسل الطلب" : "Send the request"}
          </button>
        </form>

        <aside className="rounded-[18px] border border-sand bg-surface p-6">
          <p className="text-[16px] font-semibold">
            {ar ? "ما الذي يحدث بعد ذلك" : "What happens next"}
          </p>
          {steps.map(([title, detail], index) => (
            <div key={title} className="mt-5 flex gap-3.5">
              <span className="stamp h-7 w-7 shrink-0 rounded-full bg-clay-soft text-center text-[13px] font-semibold leading-7 text-clay">
                {index + 1}
              </span>
              <div>
                <p className="text-[15px] font-medium">{title}</p>
                <p className="mt-1 text-[13.5px] leading-[1.6] text-ink-mute">{detail}</p>
              </div>
            </div>
          ))}
          <p className="mt-6 border-t border-sand pt-5 text-[13.5px] leading-[1.6] text-ink-mute">
            {ar
              ? "نصنع في ورشتنا في الدار البيضاء. الصورة التي تراها على الموقع هي القطعة نفسها."
              : "Everything is made in our own studio in Casablanca. The photo on the site is the actual piece."}
          </p>
        </aside>
      </div>
    </div>
  );
}
