"use client";

import { use } from "react";

import { AMBIENTS, useAmbient, type AmbientName } from "@/components/ambient";
import { type Lang, isLang, money } from "@/lib/i18n";

/**
 * The gallery.
 *
 * Every background lives here to be judged, and it is judged the only way that
 * means anything: switched on across the whole real site, with a real card
 * sitting on top of it. A swatch in a grid tells you nothing about whether a
 * background fights a photograph — which is the only question that matters,
 * because the photograph is the entire argument for buying anything here.
 *
 * Nothing is deleted after a choice is made. The engine and the painters are
 * self-contained in `components/ambient`, so the ones not chosen lift straight
 * out into another project.
 */
export default function AmbientGallery({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: raw } = use(params);
  const lang = (isLang(raw) ? raw : "en") as Lang;
  const { ambient, setAmbient } = useAmbient();

  const author = {
    owner: { en: "Your idea", ar: "فكرتك" },
    "claude-code": { en: "Claude Code", ar: "Claude Code" },
    "claude-design": { en: "Claude Design", ar: "Claude Design" },
  } as const;

  return (
    <div className="page pt-6 pb-10">
      <h1 className="text-[26px] font-semibold tracking-tight">
        {lang === "ar" ? "الخلفيات" : "Backgrounds"}
      </h1>
      <p className="mt-2 text-[15px] text-ink-soft leading-relaxed">
        {lang === "ar"
          ? "اختر واحدة وستُطبَّق على الموقع كلّه حتى تغيّرها. جرّبها على صفحة قطعة قبل أن تحكم: السؤال الوحيد المهم هو هل تنازع الصورة."
          : "Pick one and it applies across the whole site until you change it. Judge it on a piece's page, not here — the only question that matters is whether it fights the photograph."}
      </p>

      <div className="mt-7 space-y-3">
        {AMBIENTS.map((option) => {
          const chosen = ambient === option.name;
          return (
            <button
              key={option.name}
              type="button"
              onClick={() => setAmbient(option.name as AmbientName)}
              aria-pressed={chosen}
              className={`card block w-full p-5 text-start shadow-soft transition-all duration-gentle active:scale-[0.99] ${
                chosen ? "ring-2 ring-clay" : ""
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[17px] font-semibold">{option.label[lang]}</span>
                <span className="text-[12px] text-ink-soft">{author[option.author][lang]}</span>
              </div>
              <p className="mt-1.5 text-[14px] text-ink-soft leading-relaxed">
                {option.note[lang]}
              </p>
              {chosen ? (
                <p className="mt-3 text-[13px] font-medium text-clay">
                  {lang === "ar" ? "مُفعَّلة الآن" : "On now"}
                </p>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* A stand-in card, so the effect can be judged against something with a
          photograph and a price in it rather than against empty space. */}
      <section className="mt-10">
        <h2 className="text-[15px] font-semibold text-ink-soft">
          {lang === "ar" ? "كيف تبدو بطاقة قطعة فوقها" : "A piece card, on top of it"}
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {[0, 1].map((index) => (
            <div key={index} className="card shadow-soft">
              <div className="aspect-square bg-clay-soft" />
              <div className="p-3.5">
                <h3 className="text-[15px] font-medium">
                  {lang === "ar" ? "خطّاف أسود مطفي" : "Matte black hook"}
                </h3>
                <p className="stamp mt-1.5 text-[15px] font-semibold">{money(180, lang)}</p>
                <p className="mt-0.5 text-[12px] text-ink-soft">
                  {lang === "ar" ? "بقيت واحدة — آخرها." : "One left — the last of them."}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="tally mt-5">
          {["01", "02", "03", "04"].map((mark, index) => (
            <span key={mark} className={index < 2 ? "tally-gone" : "tally-here"}>
              {mark}
            </span>
          ))}
        </div>
      </section>

      <p className="mt-10 text-[13px] text-ink-soft leading-relaxed">
        {lang === "ar"
          ? "الخلفيات كلها تتوقّف تماماً إذا طلب الزائر تقليل الحركة، وتتوقّف حين تكون الصفحة مخفية أو خارج الشاشة."
          : "Every background stops entirely for anyone who asked for reduced motion, and pauses when the tab is hidden or it scrolls off screen."}
      </p>
    </div>
  );
}
