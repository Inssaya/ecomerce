"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useCart } from "./CartProvider";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { type Lang, translator } from "@/lib/i18n";

/**
 * The concierge, on its own page and behind a sign-in.
 *
 * It used to be a floating button on every screen, which is two problems. Every
 * message costs money at an AI provider, and a bubble that follows you around a
 * public shop is an invitation to play with it — so it now sits on `/contact`
 * and asks who you are first.
 *
 * The model asks for a tool; the ones that are UI actions are carried out here,
 * in the browser, because that is where the cart and the router live. The
 * server validates every one of them first — the assistant is never trusted
 * with whether something is in stock, or with a price.
 */
interface Turn {
  role: "user" | "assistant";
  content: string;
}

export function ChatPanel({ lang }: { lang: Lang }) {
  const t = translator(lang);
  const router = useRouter();
  const cart = useCart();
  const { session, ready } = useSession();

  const [available, setAvailable] = useState<boolean | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .assistantStatus(lang)
      .then((status) => setAvailable(status.available))
      .catch(() => setAvailable(false));
  }, [lang]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns, thinking]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const question = draft.trim();
    if (!question || thinking) return;

    setDraft("");
    const history: Turn[] = [...turns, { role: "user", content: question }];
    setTurns(history);
    setThinking(true);

    try {
      const answer = await api.assistant(lang, history);
      setTurns([...history, { role: "assistant", content: answer.reply }]);

      for (const action of answer.actions) {
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
                // No stock ceiling — the shop does not count units.
                available: null,
              },
              action.quantity ?? 1,
            );
            break;
          }
          case "open_product":
            router.push(`/${lang}/piece/${action.slug}`);
            break;
          case "open_category":
            router.push(`/${lang}?category=${action.slug}`);
            break;
          case "go_to_checkout":
            router.push(`/${lang}/cart`);
            break;
        }
      }
    } catch {
      setTurns([...history, { role: "assistant", content: t("somethingWentWrong") }]);
    } finally {
      setThinking(false);
    }
  }

  if (available === false) return null;

  // The gate. Shown rather than hidden, so somebody who wants to ask something
  // knows the door exists and where the handle is.
  if (ready && !session) {
    return (
      <div className="rounded-3xl border border-sand bg-surface p-7 text-center">
        <h2 className="text-[19px] font-semibold">{t("chatGateTitle")}</h2>
        <p className="mx-auto mt-2 max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">
          {t("chatGateBody")}
        </p>
        <Link href={`/${lang}/account`} className="btn-primary mt-6">
          {t("signIn")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col rounded-3xl border border-sand bg-surface overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-sand px-5 py-3.5">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-good opacity-70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-good" />
        </span>
        <span className="text-[15px] font-semibold">{t("assistant")}</span>
      </div>

      <div className="h-[min(58vh,520px)] overflow-y-auto px-5 py-5 space-y-3">
        {turns.length === 0 ? (
          <p className="text-[15px] leading-relaxed text-ink-mute">{t("chatEmpty")}</p>
        ) : null}

        {turns.map((turn, index) => (
          <div
            key={index}
            className={`flex ${turn.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-line ${
                turn.role === "user"
                  ? "rounded-[20px] rounded-ee-[6px] bg-ink text-white"
                  : "rounded-[20px] rounded-es-[6px] bg-cream text-ink"
              }`}
            >
              {turn.content}
            </div>
          </div>
        ))}

        {thinking ? (
          <div className="flex justify-start">
            <div className="rounded-[20px] rounded-es-[6px] bg-cream px-4 py-3">
              <span className="flex gap-1.5">
                {[0, 1, 2].map((dot) => (
                  <span
                    key={dot}
                    className="h-1.5 w-1.5 rounded-full bg-ink-mute animate-bounce"
                    style={{ animationDelay: `${dot * 140}ms` }}
                  />
                ))}
              </span>
            </div>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="flex items-center gap-2 border-t border-sand p-3">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          autoComplete="off"
          placeholder={t("assistantPlaceholder")}
          aria-label={t("assistantPlaceholder")}
          className="flex-1 h-11 rounded-full bg-cream px-4 text-[16px] text-ink
                     placeholder:text-ink-mute focus:outline-none"
        />
        <button
          type="submit"
          disabled={thinking || !draft.trim()}
          aria-label={t("assistant")}
          className="h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-full
                     bg-clay text-white transition-all duration-200
                     disabled:opacity-35 enabled:hover:scale-105 enabled:active:scale-95"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="rtl:-scale-x-100"
          >
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </button>
      </form>
    </div>
  );
}
