"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useCart } from "./CartProvider";
import { api } from "@/lib/api";
import { type Lang, translator } from "@/lib/i18n";

/**
 * The concierge.
 *
 * The shape is borrowed from the portfolio project's `useAssistant`: the model
 * asks for a tool, and the ones that are UI actions are carried out here, in
 * the browser, because that is where the cart and the router live. The server
 * validates every one of them first — the assistant is never trusted with
 * whether something is in stock.
 *
 * It hides itself entirely when no API key is configured, rather than offering
 * something that fails when someone taps it.
 */
interface Turn {
  role: "user" | "assistant";
  content: string;
}

export function Assistant({ lang }: { lang: Lang }) {
  const t = translator(lang);
  const router = useRouter();
  const cart = useCart();

  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [thinking, setThinking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .assistantStatus(lang)
      .then((status) => setAvailable(status.available))
      .catch(() => setAvailable(false));
  }, [lang]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, thinking]);

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = new FormData(form).get("question");
    const question = String(input ?? "").trim();
    if (!question || thinking) return;

    form.reset();
    const history: Turn[] = [...turns, { role: "user", content: question }];
    setTurns(history);
    setThinking(true);

    try {
      const answer = await api.assistant(lang, history);
      setTurns([...history, { role: "assistant", content: answer.reply }]);

      for (const action of answer.actions) {
        // Each action was already validated server-side — availability was
        // checked there — so here it is only carried out.
        switch (action.type) {
          case "add_to_cart": {
            if (!action.slug) break;
            // The action carries ids, not a price. Prices are read from the
            // API, never from anything the model produced.
            const piece = await api.piece(lang, action.slug);
            const variant =
              piece.variants.find((option) => option.id === action.variant_id) ?? null;
            cart.add(
              {
                productId: piece.id,
                slug: piece.slug,
                variantId: variant?.id ?? null,
                title: piece.title,
                option: variant?.option ?? "",
                price: variant?.price ?? piece.price,
                image: piece.images[0]?.url ?? null,
                available: piece.kind === "shelf" ? (variant?.available ?? piece.available) : null,
              },
              action.quantity ?? 1,
            );
            break;
          }
          case "open_product":
            setOpen(false);
            router.push(`/${lang}/piece/${action.slug}`);
            break;
          case "go_to_checkout":
            setOpen(false);
            router.push(`/${lang}/cart`);
            break;
          case "open_whatsapp":
            setOpen(false);
            router.push(`/${lang}/ask`);
            break;
        }
      }
    } catch {
      setTurns([...history, { role: "assistant", content: t("somethingWentWrong") }]);
    } finally {
      setThinking(false);
    }
  }

  if (!available) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 end-4 z-30 tap rounded-full bg-clay px-5 text-[14px] font-semibold text-white shadow-lift active:scale-95 transition-transform duration-gentle"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        {t("assistant")}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-cream animate-fade">
      <header className="flex items-center justify-between h-14 px-5 border-b border-sand">
        <span className="text-[16px] font-semibold">{t("assistant")}</span>
        <button type="button" onClick={() => setOpen(false)} className="tap px-2 text-ink-soft">
          ✕
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-3">
        {turns.length === 0 ? (
          <p className="text-[15px] text-ink-soft leading-relaxed">{t("assistantOpener")}</p>
        ) : null}

        {turns.map((turn, index) => (
          <div
            key={index}
            className={`max-w-[85%] rounded-3xl px-4 py-3 text-[15px] leading-relaxed whitespace-pre-line ${
              turn.role === "user"
                ? "ms-auto bg-clay text-white"
                : "me-auto bg-surface shadow-soft"
            }`}
          >
            {turn.content}
          </div>
        ))}

        {thinking ? (
          <div className="me-auto rounded-3xl bg-surface px-4 py-3 text-[15px] text-ink-soft shadow-soft">
            {t("loading")}
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={send}
        className="flex gap-2 px-5 py-3 border-t border-sand"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <input
          name="question"
          autoComplete="off"
          placeholder={t("assistantPlaceholder")}
          className="field flex-1"
        />
        <button type="submit" disabled={thinking} className="btn-primary px-5">
          →
        </button>
      </form>
    </div>
  );
}
