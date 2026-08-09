"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useCart } from "@/components/CartProvider";
import { api, type PieceDetail } from "@/lib/api";
import { useDelivery } from "@/lib/delivery";
import { type Lang, money, translator } from "@/lib/i18n";
import { track, trackDwell } from "@/lib/signals";

/**
 * One piece, at full size.
 *
 * Two columns on a desktop — the photograph on the left at its own size, every
 * decision on the right — collapsing to one on a phone. The old page was a
 * single 560px column at every width, which on a laptop left the photograph
 * the size of a postcard with a screen of empty cream beside it.
 *
 * The gallery is real: a piece with four photographs shows four, and the
 * thumbnails switch the main image rather than opening a viewer nobody asked
 * for. The batch tally, the variants and the delivery line are all read from
 * the shop — nothing on this page is a number typed into the source.
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
  const ar = lang === "ar";
  const cart = useCart();
  const terms = useDelivery(lang);

  const [piece, setPiece] = useState<PieceDetail | null>(initial);
  const [shown, setShown] = useState(0);
  const [variantId, setVariantId] = useState<string | null>(
    initial?.variants[0]?.id ?? null,
  );
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  // Refreshed in the browser so stock is current even on a cached page.
  useEffect(() => {
    let live = true;
    api
      .piece(lang, slug)
      .then((fresh) => {
        if (!live) return;
        setPiece(fresh);
        setVariantId((current) => current ?? fresh.variants[0]?.id ?? null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [lang, slug]);

  useEffect(() => {
    if (!piece) return;
    track({ type: "click", product_id: piece.id });
    const startedAt = Date.now();
    return () => trackDwell(piece.id, startedAt);
    // Keyed on the id alone: this must fire once per piece, and depending on
    // the whole object would restart the dwell timer on every stock refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piece?.id]);

  if (!piece) {
    return <p className="page-wide pt-20 text-center text-ink-soft">{t("notFound")}</p>;
  }

  const variant = piece.variants.find((option) => option.id === variantId) ?? null;
  const price = variant?.price ?? piece.price;
  const available = piece.kind === "shelf" ? (variant?.available ?? piece.available) : null;
  const soldOut = piece.kind === "shelf" && (available ?? 0) === 0;
  const photos = piece.images.length > 0 ? piece.images : [];
  const cap = available ?? 20;

  function addToCart() {
    if (soldOut || !piece) return;
    cart.add(
      {
        productId: piece.id,
        slug: piece.slug,
        variantId: variant?.id ?? null,
        title: piece.title,
        option: variant?.option ?? "",
        price,
        image: photos[0]?.url ?? piece.image ?? null,
        available,
      },
      quantity,
    );
    track({ type: "add_to_cart", product_id: piece.id, value: quantity });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2200);
  }

  return (
    <div className="page-wide pt-5 pb-16">
      <p className="text-[13.5px] text-ink-mute">
        <Link href={`/${lang}`} className="hover:text-ink">
          {t("navShop")}
        </Link>
        {piece.category_slug ? (
          <>
            <span aria-hidden> · </span>
            <Link href={`/${lang}?category=${piece.category_slug}`} className="hover:text-ink">
              {piece.category_slug}
            </Link>
          </>
        ) : null}
      </p>

      <div className="mt-4 grid gap-8 lg:grid-cols-2 lg:gap-14">
        <div>
          <div className="relative aspect-square overflow-hidden rounded-[18px] bg-surface">
            {photos[shown] ? (
              <Image
                src={photos[shown].url}
                alt={photos[shown].alt || piece.title}
                fill
                priority
                sizes="(max-width:1024px) 100vw, 620px"
                className="object-cover"
              />
            ) : null}
          </div>

          {photos.length > 1 ? (
            <div className="mt-3 flex gap-2.5 overflow-x-auto pb-1">
              {photos.map((photo, index) => (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => setShown(index)}
                  aria-label={`${index + 1}`}
                  aria-current={index === shown}
                  className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2
                              transition-colors duration-200 ${
                                index === shown ? "border-ink" : "border-transparent"
                              }`}
                >
                  <Image
                    src={photo.url}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div>
          <h1 className="text-[clamp(28px,3.2vw,44px)] leading-[1.04] font-semibold tracking-[-0.035em]">
            {piece.title}
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-3.5">
            <p className="stamp text-[clamp(22px,2vw,28px)] font-semibold tabular-nums">
              {money(price, lang)}
            </p>
            <p className="text-[14px] text-ink-mute">
              {piece.kind === "workshop"
                ? t("readyInDays", { n: piece.lead_time_days ?? 0 })
                : soldOut
                  ? t("allGone")
                  : available === 1
                    ? t("lastOne")
                    : t("stillHere")}
            </p>
          </div>

          {piece.description ? (
            <p className="mt-4 max-w-[50ch] text-[15.5px] leading-[1.62] text-ink-soft">
              {piece.description}
            </p>
          ) : null}

          {piece.variants.length > 0 ? (
            <div className="mt-7">
              <p className="text-[13.5px] font-medium text-ink-soft">{t("choose")}</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {piece.variants.map((option) => {
                  const chosen = option.id === variantId;
                  const empty = piece.kind === "shelf" && (option.available ?? 0) === 0;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      disabled={empty}
                      onClick={() => setVariantId(option.id)}
                      className={`h-11 min-w-[52px] rounded-[10px] border-[1.5px] px-3.5 text-[14.5px]
                                  font-medium transition-all duration-200 disabled:opacity-35
                                  disabled:line-through ${
                                    chosen
                                      ? "border-ink bg-ink text-white"
                                      : "border-sand bg-surface text-ink hover:border-ink"
                                  }`}
                    >
                      {option.option}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="mt-7 flex items-center gap-2.5">
            <div className="flex items-center rounded-full border border-sand bg-surface">
              <button
                type="button"
                onClick={() => setQuantity((n) => Math.max(1, n - 1))}
                aria-label="−"
                className="h-[52px] w-11 rounded-s-full text-[18px] text-ink-soft hover:text-ink"
              >
                −
              </button>
              <span className="w-9 text-center text-[15.5px] font-medium tabular-nums">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((n) => Math.min(cap, n + 1))}
                aria-label="+"
                className="h-[52px] w-11 rounded-e-full text-[18px] text-ink-soft hover:text-ink"
              >
                +
              </button>
            </div>

            <button
              type="button"
              onClick={addToCart}
              disabled={soldOut}
              className="h-[52px] flex-1 rounded-full bg-ink text-white text-[15.5px] font-semibold
                         transition-colors duration-200 hover:bg-clay disabled:opacity-40
                         disabled:hover:bg-ink"
            >
              {added ? t("added") : soldOut ? t("allGone") : t("addToCart")}
            </button>
          </div>

          <p className="mt-3 text-[13.5px] text-ink-mute">
            {ar ? "الدفع نقداً عند التسليم" : "Cash on delivery"}
            {terms ? (
              <>
                <span aria-hidden> · </span>
                {ar
                  ? `توصيل مجاني فوق ${money(terms.freeOver, lang)}`
                  : `free over ${money(terms.freeOver, lang)}`}
              </>
            ) : null}
            <span aria-hidden> · </span>
            {ar ? "نتصل قبل التوصيل" : "we call before we deliver"}
          </p>

          {/* The batch, drawn as what it is. The one claim a reseller cannot
              make: they do not know how many of anything exists. */}
          {piece.show_piece_numbers && piece.pieces.length > 0 ? (
            <div className="mt-8">
              <p className="text-[13.5px] font-medium text-ink-soft">{t("weMadeThese")}</p>
              <div className="tally mt-2.5">
                {piece.pieces.map((one) => (
                  <span
                    key={one.id}
                    title={one.label}
                    className={one.state === "available" ? "tally-here" : "tally-gone"}
                  >
                    {one.number}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[12.5px] text-ink-mute">{t("tallyMeaning")}</p>
            </div>
          ) : null}

          {piece.story ? (
            <div className="mt-8 border-t border-sand pt-6">
              <h2 className="text-[15.5px] font-semibold">{t("howItWasMade")}</h2>
              <p className="mt-2 text-[15px] leading-[1.62] text-ink-soft">{piece.story}</p>
            </div>
          ) : null}

          <dl className="mt-7 border-t border-sand">
            <Spec
              k={ar ? "النوع" : "Kind"}
              v={piece.kind === "workshop" ? t("madeToOrder") : t("theShelf")}
            />
            {piece.made_on ? (
              <Spec k={t("madeIn")} v={new Date(piece.made_on).toLocaleDateString(lang)} />
            ) : null}
            {piece.lead_time_days ? (
              <Spec
                k={ar ? "الجاهزية" : "Ready in"}
                v={t("readyInDays", { n: piece.lead_time_days })}
              />
            ) : null}
          </dl>
        </div>
      </div>
    </div>
  );
}

function Spec({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-5 border-b border-sand py-3.5">
      <dt className="text-[14px] text-ink-mute">{k}</dt>
      <dd className="text-[14px] font-medium text-end">{v}</dd>
    </div>
  );
}
