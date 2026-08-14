"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useCart, type CartSelection } from "@/components/CartProvider";
import {
  api,
  type InteractionState,
  type PieceAttribute,
  type PieceDetail,
} from "@/lib/api";
import { alwaysFree, useDelivery } from "@/lib/delivery";
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
 * What lives on the right, in this order: the title, the price (struck out if
 * an offer is running), the description, the picks (measures, colours,
 * materials — as circles or chips, exactly as the admin entered them), a name
 * field if personalization is on, quantity + add-to-cart + a heart + a save,
 * then the story and the spec list. Nothing on this page is a number typed
 * into the source; everything reads from the shop.
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
  // Which measure / colour / material is selected in each group. Keyed on
  // the attribute id, not on the value string — two different measures with
  // the same value ("M" for shirt size and "M" for something else) do not
  // collide, and a live attribute switch stays consistent when the shop
  // renames one.
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [personalization, setPersonalization] = useState<string>("");
  const [interactions, setInteractions] = useState<InteractionState | null>(null);
  const [reacting, setReacting] = useState(false);

  // Refresh in the browser so a cached page shows the current price and
  // whether this visitor already hearted or saved the piece.
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
    api
      .interactions(lang, slug)
      .then((state) => {
        if (live) setInteractions(state);
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
    // the whole object would restart the dwell timer on every refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piece?.id]);

  const toggle = useCallback(
    async (kind: "like" | "save") => {
      if (!piece || reacting) return;
      setReacting(true);
      // Optimistic: flip the visible state right away so the button feels
      // responsive on a Moroccan phone connection, and reconcile against the
      // server's response — which carries the true counts.
      setInteractions((current) => {
        if (!current) return current;
        if (kind === "like") {
          const liked = !current.liked;
          return { ...current, liked, likes: current.likes + (liked ? 1 : -1) };
        }
        const saved = !current.saved;
        return { ...current, saved, saves: current.saves + (saved ? 1 : -1) };
      });
      try {
        const next = kind === "like"
          ? await api.likePiece(lang, piece.slug)
          : await api.savePiece(lang, piece.slug);
        setInteractions(next);
      } catch {
        // Roll the optimistic flip back on failure.
        try {
          const truth = await api.interactions(lang, piece.slug);
          setInteractions(truth);
        } catch {
          /* leave the last known state on screen */
        }
      } finally {
        setReacting(false);
      }
    },
    [lang, piece, reacting],
  );

  if (!piece) {
    return <p className="page-wide pt-20 text-center text-ink-soft">{t("notFound")}</p>;
  }

  const variant = piece.variants.find((option) => option.id === variantId) ?? null;
  // The unit price the storefront shows and the cart carries. The server
  // recomputes both the base and the markup at checkout, so this is a
  // display value — never the number the customer is actually billed.
  const baseUnit = variant?.price ?? piece.effective_price ?? piece.price;
  const originalUnit = variant?.price ?? piece.price;
  const wantsName = personalization.trim().length > 0;
  const markup = piece.personalization_markup_pct || 0;
  const withName = wantsName ? Math.round(baseUnit * (1 + markup / 100)) : baseUnit;

  const photos = piece.images.length > 0 ? piece.images : [];
  //: Nothing here runs out, so the only ceiling is one that keeps a slipped
  //: keypress from becoming an order for four hundred.
  const cap = 20;

  const grouped: Record<PieceAttribute["group"], PieceAttribute[]> = {
    measure: piece.attributes.filter((a) => a.group === "measure"),
    color: piece.attributes.filter((a) => a.group === "color"),
    material: piece.attributes.filter((a) => a.group === "material"),
  };

  function addToCart() {
    if (!piece) return;
    // The buyer's picks travel with the line so two of the same piece in
    // different colours stay two lines and the workshop reads what to make.
    const selection: CartSelection[] = piece.attributes
      .filter((attribute) => picks[attribute.id] === attribute.value)
      .map((attribute) => ({
        group: attribute.group,
        name: attribute.name,
        value: attribute.value,
        hex: attribute.hex,
      }));

    cart.add(
      {
        productId: piece.id,
        slug: piece.slug,
        variantId: variant?.id ?? null,
        title: piece.title,
        option: variant?.option ?? "",
        price: withName,
        image: photos[0]?.url ?? piece.image ?? null,
        available: null,
        selection,
        personalization: wantsName ? personalization.trim().slice(0, 20) : null,
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
              {piece.category_name || piece.category_slug}
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

          {/* The price. Struck-through original + reduced when an offer is
              live; a workshop piece still says how long the making takes. */}
          <div className="mt-3 flex flex-wrap items-center gap-3.5">
            {piece.discount_active && piece.effective_price < originalUnit ? (
              <>
                <p className="stamp text-[clamp(22px,2vw,28px)] font-semibold tabular-nums">
                  {money(withName, lang)}
                </p>
                <p className="stamp text-[15px] text-ink-mute line-through tabular-nums">
                  {money(originalUnit, lang)}
                </p>
                <span className="rounded-full bg-clay px-2 py-0.5 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-white">
                  {ar ? "تخفيض" : "offer"}
                </span>
              </>
            ) : (
              <p className="stamp text-[clamp(22px,2vw,28px)] font-semibold tabular-nums">
                {money(withName, lang)}
              </p>
            )}
            {piece.kind === "workshop" && piece.lead_time_days ? (
              <p className="text-[14px] text-ink-mute">
                {t("readyInDays", { n: piece.lead_time_days })}
              </p>
            ) : null}
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
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setVariantId(option.id)}
                      className={`h-11 min-w-[52px] rounded-[10px] border-[1.5px] px-3.5 text-[14.5px]
                                  font-medium transition-all duration-200 ${
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

          {/* The picks the owner set up: circles for colours, chips with a
              little label on top for measures and materials. Rendered
              exactly as they were entered — no unit parsing, nothing inferred. */}
          {grouped.color.length > 0 ? (
            <AttributeRow
              label={ar ? "اللون" : "Colour"}
              options={grouped.color}
              selected={picks}
              onPick={(id, value) => setPicks({ ...picks, [id]: value })}
              variant="swatch"
            />
          ) : null}
          {grouped.measure.length > 0 ? (
            <AttributeRow
              label={ar ? "المقاس" : "Measure"}
              options={grouped.measure}
              selected={picks}
              onPick={(id, value) => setPicks({ ...picks, [id]: value })}
              variant="chip"
            />
          ) : null}
          {grouped.material.length > 0 ? (
            <AttributeRow
              label={ar ? "المادة" : "Material"}
              options={grouped.material}
              selected={picks}
              onPick={(id, value) => setPicks({ ...picks, [id]: value })}
              variant="chip"
            />
          ) : null}

          {/* Personalization. Optional, 20 characters, and the price change is
              shown honestly *before* the piece lands in the cart. */}
          {piece.personalizable ? (
            <div className="mt-7">
              <label
                htmlFor="personalize"
                className="text-[13.5px] font-medium text-ink-soft"
              >
                {ar ? "اكتب اسمك عليها (اختياري)" : "Your name on it (optional)"}
              </label>
              <input
                id="personalize"
                type="text"
                maxLength={20}
                value={personalization}
                onChange={(event) => setPersonalization(event.target.value)}
                placeholder={ar ? "20 حرفا كحد أقصى" : "up to 20 characters"}
                className="mt-2 h-11 w-full rounded-[10px] border-[1.5px] border-sand bg-surface px-3.5 text-[15px] focus:border-ink focus:outline-none"
                dir="auto"
              />
              {wantsName && markup > 0 ? (
                <p className="mt-1.5 text-[13px] text-ink-mute">
                  {ar
                    ? `يُضاف ${Math.round(withName - baseUnit)} درهم للاسم.`
                    : `${Math.round(withName - baseUnit)} MAD added for the name.`}
                </p>
              ) : null}
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
              className="h-[52px] flex-1 rounded-full bg-ink text-white text-[15.5px] font-semibold
                         transition-colors duration-200 hover:bg-clay"
            >
              {added ? t("added") : t("addToCart")}
            </button>

            {/* Heart and save. Optimistic — the flip happens the moment the
                button is pressed, so on a Moroccan phone connection the tap
                feels done rather than pending. The response reconciles the
                count against what the server actually holds. */}
            <ReactButton
              icon="heart"
              active={interactions?.liked ?? false}
              count={interactions?.likes ?? 0}
              disabled={reacting}
              aria-label={ar ? "أعجبني" : "Like"}
              onClick={() => void toggle("like")}
            />
            <ReactButton
              icon="bookmark"
              active={interactions?.saved ?? false}
              count={interactions?.saves ?? 0}
              disabled={reacting}
              aria-label={ar ? "احفظ للاحقا" : "Save for later"}
              onClick={() => void toggle("save")}
            />
          </div>

          <p className="mt-3 text-[13.5px] text-ink-mute">
            {ar ? "الدفع نقداً عند التسليم" : "Cash on delivery"}
            {terms ? (
              <>
                <span aria-hidden> · </span>
                {alwaysFree(terms)
                  ? ar
                    ? "توصيل مجاني"
                    : "free delivery"
                  : ar
                    ? `توصيل مجاني فوق ${money(terms.freeOver, lang)}`
                    : `free over ${money(terms.freeOver, lang)}`}
              </>
            ) : null}
            <span aria-hidden> · </span>
            {ar ? "نتصل قبل التوصيل" : "we call before we deliver"}
          </p>

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

/**
 * One group of picks — colours as circles, everything else as chips.
 *
 * A colour with no hex still gets a circle: the background is the label
 * itself, in text, so a "Red" that forgot its swatch reads as "Red" instead
 * of as an empty grey button.
 */
function AttributeRow({
  label,
  options,
  selected,
  onPick,
  variant,
}: {
  label: string;
  options: PieceAttribute[];
  selected: Record<string, string>;
  onPick: (id: string, value: string) => void;
  variant: "chip" | "swatch";
}) {
  return (
    <div className="mt-7">
      <p className="text-[13.5px] font-medium text-ink-soft">{label}</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {options.map((option) => {
          const chosen = selected[option.id] === option.value;
          if (variant === "swatch") {
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onPick(option.id, option.value)}
                title={option.value}
                aria-label={option.value}
                aria-pressed={chosen}
                className={`relative h-11 w-11 rounded-full border-[1.5px] transition-all duration-200 ${
                  chosen ? "border-ink" : "border-sand hover:border-ink"
                }`}
                style={option.hex ? { backgroundColor: option.hex } : undefined}
              >
                {!option.hex ? (
                  <span className="text-[11px] font-medium text-ink">{option.value.slice(0, 3)}</span>
                ) : null}
              </button>
            );
          }
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onPick(option.id, option.value)}
              aria-pressed={chosen}
              className={`h-11 min-w-[52px] rounded-[10px] border-[1.5px] px-3.5 text-[14.5px]
                          font-medium transition-all duration-200 ${
                            chosen
                              ? "border-ink bg-ink text-white"
                              : "border-sand bg-surface text-ink hover:border-ink"
                          }`}
            >
              {option.name ? (
                <>
                  <span className="me-1 text-[11px] uppercase tracking-[0.12em] opacity-70">
                    {option.name}
                  </span>
                  {option.value}
                </>
              ) : (
                option.value
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ReactButton({
  icon,
  active,
  count,
  disabled,
  onClick,
  ...rest
}: {
  icon: "heart" | "bookmark";
  active: boolean;
  count: number;
  disabled?: boolean;
  onClick: () => void;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick">) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-[52px] items-center gap-1.5 rounded-full border-[1.5px] px-3.5 text-[14px] font-medium transition-colors duration-200 ${
        active
          ? "border-clay bg-clay/10 text-clay"
          : "border-sand bg-surface text-ink hover:border-ink"
      } disabled:opacity-60`}
      {...rest}
    >
      <ReactionIcon icon={icon} filled={active} />
      {count > 0 ? <span className="tabular-nums">{count}</span> : null}
    </button>
  );
}

function ReactionIcon({ icon, filled }: { icon: "heart" | "bookmark"; filled: boolean }) {
  const stroke = "currentColor";
  const fill = filled ? "currentColor" : "none";
  if (icon === "heart") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
        <path
          d="M12 20s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 10c0 5.65-7 10-7 10z"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M6 3.5h12a1 1 0 0 1 1 1V20l-7-4-7 4V4.5a1 1 0 0 1 1-1z"
        fill={fill}
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
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
