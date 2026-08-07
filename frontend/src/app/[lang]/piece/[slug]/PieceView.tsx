"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useCart } from "@/components/CartProvider";
import { WaitForMore } from "@/components/WaitForMore";
import { api, type PieceDetail } from "@/lib/api";
import { type Lang, money, translator } from "@/lib/i18n";
import { track, trackDwell } from "@/lib/signals";

/**
 * One piece.
 *
 * Everything a refusal at the door would have been caused by belongs on this
 * screen: the real photo, how many exist, how it was made, and — for
 * made-to-order work — how many days it takes. One primary action, at the
 * bottom, where a thumb is.
 *
 * The server renders this with `initial` already filled in, so the photo and
 * the price are in the first paint and in the page a crawler reads. It still
 * re-fetches on mount: availability is the one number here that must not be a
 * minute old, because it is what someone is about to act on.
 */
export function PieceView({
  lang,
  slug,
  initial,
}: {
  lang: Lang;
  slug: string;
  initial: PieceDetail | null;
}) {
  const t = translator(lang);
  const router = useRouter();
  const cart = useCart();

  const [piece, setPiece] = useState<PieceDetail | null>(initial);
  const [missing, setMissing] = useState(false);
  const [chosen, setChosen] = useState<string | null>(initial?.variants[0]?.id ?? null);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .piece(lang, slug)
      .then((result) => {
        if (cancelled) return;
        setPiece(result);
        setChosen((current) => current ?? result.variants[0]?.id ?? null);
      })
      // A refresh that fails over a page already on screen is not worth
      // replacing the piece with an error — what is shown is still true.
      .catch(() => !cancelled && !initial && setMissing(true));
    return () => {
      cancelled = true;
    };
  }, [lang, slug, initial]);

  // How long they actually looked, reported on the way out. This is the
  // strongest passive signal there is — far better than a click.
  useEffect(() => {
    if (!piece) return;
    const startedAt = Date.now();
    return () => trackDwell(piece.id, startedAt);
  }, [piece]);

  if (missing) {
    return <p className="page pt-20 text-center text-ink-soft">{t("notFound")}</p>;
  }
  if (!piece) {
    return (
      <div className="page pt-6" aria-hidden>
        <div className="aspect-square rounded-3xl bg-clay-soft/60 animate-pulse" />
      </div>
    );
  }

  const variant = piece.variants.find((option) => option.id === chosen) ?? null;
  const price = variant?.price ?? piece.price;
  const left = variant ? variant.available : piece.available;
  const soldOut = piece.kind === "shelf" && (left ?? 0) === 0;

  function addToCart() {
    if (!piece) return;
    cart.add({
      productId: piece.id,
      slug: piece.slug,
      variantId: variant?.id ?? null,
      title: piece.title,
      option: variant?.option ?? "",
      price,
      image: piece.images[0]?.url ?? null,
      available: piece.kind === "shelf" ? left : null,
    });
    track({ type: "add_to_cart", product_id: piece.id });
    setAdded(true);
    setTimeout(() => router.push(`/${lang}/cart`), 600);
  }

  return (
    <div className="pb-32">
      <div className="relative aspect-square bg-clay-soft">
        {piece.images[0] ? (
          <Image
            src={piece.images[0].url}
            alt={piece.images[0].alt || piece.title}
            fill
            sizes="100vw"
            className="object-cover"
            priority
          />
        ) : null}
      </div>

      {piece.images.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto px-5 pt-3 pb-1 -mx-0">
          {piece.images.slice(1).map((image) => (
            <div
              key={image.id}
              className="relative h-20 w-20 shrink-0 rounded-2xl overflow-hidden bg-clay-soft"
            >
              <Image src={image.url} alt={image.alt || piece.title} fill sizes="80px" className="object-cover" />
            </div>
          ))}
        </div>
      ) : null}

      <div className="page pt-6">
        {/* One line above the title, when we know which line of work it is.
            It sends the visitor to a page showing every other piece we have
            in that category — the natural next move after tapping in from a
            search or a share, and the one thing there was no way to make. */}
        {piece.category_slug ? (
          <p className="text-[13px]">
            <Link
              href={`/${lang}/store/${piece.category_slug}`}
              className="text-ink-soft underline underline-offset-4"
            >
              {lang === "ar" ? "شاهد المزيد من هذا النوع" : "See more of this kind"}
            </Link>
          </p>
        ) : null}
        <h1 className="mt-1 text-[26px] font-semibold leading-tight tracking-tight">
          {piece.title}
        </h1>
        <p className="stamp mt-2 text-[20px] font-semibold">{money(price, lang)}</p>

        <p className="mt-1.5 text-[14px] text-ink-soft">
          {piece.kind === "workshop"
            ? `${t("madeToOrder")} ${t("readyInDays", { n: piece.lead_time_days ?? 0 })}`
            : soldOut
              ? t("allGone")
              : left === 1
                ? t("lastOne")
                : t("onlyMade", { n: piece.pieces.length || (left ?? 0), left: left ?? 0 })}
        </p>

        {piece.description ? (
          <p className="mt-6 text-[16px] leading-relaxed whitespace-pre-line">{piece.description}</p>
        ) : null}

        {piece.variants.length > 0 ? (
          <div className="mt-7">
            <p className="label">{t("choose")}</p>
            <div className="flex flex-wrap gap-2">
              {piece.variants.map((option) => {
                const gone = piece.kind === "shelf" && option.available === 0;
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={gone}
                    onClick={() => setChosen(option.id)}
                    className={`tap rounded-2xl px-5 text-[15px] font-medium transition-colors duration-gentle ${
                      chosen === option.id
                        ? "bg-clay text-white"
                        : gone
                          ? "bg-sand/50 text-ink-soft/50 line-through"
                          : "bg-clay-soft text-ink"
                    }`}
                  >
                    {option.option}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/*
          A sold-out page was a dead end, and a dead end is a visitor we paid
          to attract and then sent away. This is the second-best outcome after
          a sale: their number, against a specific piece at a price they have
          already seen.
        */}
        {soldOut ? <WaitForMore lang={lang} slug={piece.slug} /> : null}

        {piece.story ? (
          <section className="mt-8 card p-5 shadow-soft">
            <h2 className="text-[17px] font-semibold">{t("howItWasMade")}</h2>
            <p className="mt-2 text-[15px] text-ink-soft leading-relaxed whitespace-pre-line">
              {piece.story}
            </p>
          </section>
        ) : null}

        {/*
          The batch, drawn as what it is.

          One mark per object we made. Solid means it is still here; struck
          through means it has gone. Seeing three of four crossed out is
          scarcity you can check, which is the opposite of a countdown timer —
          and it is the one claim on this site no reseller can make, because
          they do not know how many of anything exists.
        */}
        {piece.show_piece_numbers && piece.pieces.length > 0 ? (
          <section className="mt-8">
            <h2 className="text-[17px] font-semibold">{t("weMadeThese")}</h2>
            <div className="tally mt-3">
              {piece.pieces.map((one) => {
                const here = one.state === "available";
                return (
                  <span
                    key={one.id}
                    title={one.note || undefined}
                    className={here ? "tally-here" : "tally-gone"}
                    aria-label={`${t("piece")} ${one.label} — ${here ? t("stillHere") : t("gone")}`}
                  >
                    {String(one.number).padStart(2, "0")}
                  </span>
                );
              })}
            </div>
            <p className="mt-2.5 text-[13px] text-ink-soft">
              {piece.made_on ? `${t("madeIn")} ${piece.made_on}. ` : ""}
              {t("tallyMeaning")}
            </p>
          </section>
        ) : null}
      </div>

      <div
        className="fixed bottom-16 inset-x-0 z-10 bg-cream/90 backdrop-blur-md border-t border-sand"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="page py-3">
          <button
            type="button"
            onClick={addToCart}
            disabled={soldOut || added}
            className="btn-primary w-full"
          >
            {added ? t("added") : soldOut ? t("allGone") : t("addToCart")}
          </button>
        </div>
      </div>
    </div>
  );
}
