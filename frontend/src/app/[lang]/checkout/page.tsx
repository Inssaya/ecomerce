"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { CityAutocomplete } from "@/components/CityAutocomplete";
import { useCart } from "@/components/CartProvider";
import { api, ApiError } from "@/lib/api";
import { feeFor, matchCity, useDelivery } from "@/lib/delivery";
import { saveProfile, useSession } from "@/lib/session";
import { type Lang, isLang, money, translator } from "@/lib/i18n";
import { track } from "@/lib/signals";

/**
 * Checkout.
 *
 * No account, no password, no payment step — it is cash at the door, and every
 * field removed from this screen is a sale that does not get abandoned on it.
 *
 * Which is exactly why a signed-in customer no longer meets the form at all.
 * The shop already has their name, their number and their street; asking for
 * all four again is five chances to abandon an order the shop had already won,
 * and it reads as though signing in bought them nothing. They get one line —
 * where this is going — and a button. The form is one tap away underneath, for
 * the parcel that has to go somewhere else this time, and a correction made
 * there is saved back to the account so the next order starts right.
 *
 * Two columns from `lg` up. The single phone-width column was the whole page at
 * every size, which on a laptop meant a 560px ribbon of form with the order
 * summary pushed below the fold and the confirm button floating in a bar pinned
 * across the entire viewport. Above `lg` the summary and the button move into a
 * sticky panel beside the form, where they belong; below it, the pinned bar
 * stays, because on a phone it is right.
 */
export default function Checkout({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: raw } = use(params);
  const lang = (isLang(raw) ? raw : "en") as Lang;
  const t = translator(lang);
  const ar = lang === "ar";
  const router = useRouter();
  const { lines, total, count, clear, ready } = useCart();
  const { session, ready: sessionReady } = useSession();
  const terms = useDelivery(lang);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [editing, setEditing] = useState(false);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Filled the moment the session is known, not on a later fetch: an input that
  // populates itself half a second after the customer started typing into it is
  // worse than one that was never going to.
  useEffect(() => {
    if (!session) return;
    setName((current) => current || session.name || "");
    setEmail((current) => current || session.email || "");
    setPhone((current) => current || session.phone || "");
    setCity((current) => current || session.city || "");
    setAddress((current) => current || session.address || "");
  }, [session]);

  // Everything the courier needs, already on file. Anything missing — an
  // account made before the address was asked for, or one made only to message
  // the workshop — and the form opens as it always did.
  const known = Boolean(session && name.trim() && phone.trim() && city.trim() && address.trim());
  const showForm = !known || editing;

  // The city decides the delivery window, so it is recomputed as it is typed.
  // `place` is null until what they have written matches somewhere we have
  // actually made a promise about — everywhere else is told no date, because we
  // have not earned the right to name one.
  const place = terms ? matchCity(terms.cities, city) : null;
  const fee = terms ? feeFor(total, terms, city) : null;

  // The cart is read from storage on mount, so before that there is nothing to
  // total. Drawing an order summary with no lines in it and then filling it in
  // reads as a page that lost the basket.
  if (!ready) return <div className="page pt-10" aria-hidden />;

  if (lines.length === 0) {
    return (
      <div className="page pt-20 text-center">
        <p className="text-[17px] text-ink-soft">{t("cartEmpty")}</p>
        <Link href={`/${lang}`} className="btn-quiet mt-6">
          {t("browse")}
        </Link>
      </div>
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setProblem(null);

    try {
      const order = await api.checkout(lang, {
        full_name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || null,
        lang,
        address: {
          line1: address.trim(),
          city: city.trim(),
          notes: notes.trim() || null,
        },
        // Only ids and counts. The server prices the order itself.
        items: lines.map((line) => ({
          product_id: line.productId,
          variant_id: line.variantId,
          quantity: line.quantity,
        })),
      });

      // Whatever they actually typed becomes the account's details, so the next
      // order starts from the corrected version. After the order, never before:
      // a profile that failed to save is not a reason to lose a confirmed sale,
      // and the order carries its own copy of the address regardless.
      if (session) {
        void saveProfile({
          phone: phone.trim(),
          city: city.trim(),
          address_line1: address.trim(),
        });
      }

      lines.forEach((line) => track({ type: "purchase", product_id: line.productId }));
      clear();
      router.replace(`/${lang}/track/${order.tracking_token}`);
    } catch (error) {
      setProblem(error instanceof ApiError ? error.message : t("somethingWentWrong"));
      setSending(false);
    }
  }

  const summary = (
    <>
      {/* Broken out rather than summed into one figure: at the door the customer
          hands over cash against this line, and "why is it more than the pieces
          cost" is the question that gets a package refused. */}
      <div className="flex justify-between text-[15px] text-ink-soft">
        <span>{t("subtotal")}</span>
        <span className="stamp">{money(total, lang)}</span>
      </div>
      <div className="mt-1 flex justify-between text-[15px] text-ink-soft">
        <span>{t("delivery")}</span>
        <span className="stamp">
          {fee === null ? "—" : fee === 0 ? t("freeDelivery") : money(fee, lang)}
        </span>
      </div>
      <div className="mt-2 flex justify-between border-t border-sand pt-2 text-[17px] font-semibold">
        <span>{t("total")}</span>
        <span className="stamp">{fee === null ? "—" : money(total + fee, lang)}</span>
      </div>
      <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">{t("payAtDoor")}</p>
      {/* Where the doubt actually is. A buyer deciding whether to commit to cash
          at the door wants to know what happens if they say no — and answering
          it here prevents the refusal, which costs far more than the sale it
          might lose. */}
      <p className="mt-2 text-[13px]">
        <Link href={`/${lang}/delivery`} className="text-ink-soft underline underline-offset-4">
          {ar ? "ماذا لو لم تعجبني؟" : "What if I don't want it?"}
        </Link>
      </p>
    </>
  );

  const confirm = (
    <button type="submit" disabled={sending} className="btn-primary w-full">
      {sending ? t("placing") : t("placeOrder")}
    </button>
  );

  return (
    <form
      onSubmit={submit}
      className="page-wide pt-6 pb-32 lg:max-w-[1020px] lg:pb-16"
    >
      <h1 className="text-[21px] font-semibold tracking-[-0.01em]">{t("yourOrder")}</h1>
      <p className="mt-1 text-[14px] text-ink-soft">{t("itemCount", { n: count })}</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-10">
        <div>
          {/* What they are actually committing to. The cart shows every line
              with a stepper to change it; here it is read-only — this is the
              moment to confirm, not to shop — with one way out, back to the
              cart itself, if something needs fixing. */}
          <div className="card p-4 shadow-soft">
            <ul className="space-y-3">
              {lines.map((line) => (
                <li key={`${line.productId}:${line.variantId}`} className="flex items-center gap-3">
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-clay-soft">
                    {line.image ? (
                      <Image
                        src={line.image}
                        alt={line.title}
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-[14.5px] font-medium leading-snug">
                      {line.title}
                    </p>
                    <p className="text-[13px] text-ink-soft">
                      {line.option ? `${line.option} · ` : ""}
                      {t("qty", { n: line.quantity })}
                    </p>
                  </div>
                  <p className="stamp shrink-0 text-[14.5px] font-semibold">
                    {money(line.price * line.quantity, lang)}
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-3 border-t border-sand pt-3 text-end">
              <Link
                href={`/${lang}/cart`}
                className="inline-flex text-[13px] text-ink-soft underline underline-offset-4"
              >
                {t("editCart")}
              </Link>
            </div>
          </div>

          {/* Held back until the session is known. Rendering the empty form and
              then collapsing it into "Delivering to Salma" a frame later is a
              worse first impression than a beat of nothing. */}
          {!sessionReady ? (
            <div className="mt-6 h-24" aria-hidden />
          ) : showForm ? (
            <div className="mt-6 space-y-4">
              {known ? (
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="text-[13px] text-clay underline underline-offset-4"
                >
                  {t("useMyDetails")}
                </button>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="full_name">
                    {t("yourName")}
                  </label>
                  <input
                    id="full_name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                    autoComplete="name"
                    className="field"
                  />
                </div>

                <div>
                  <label className="label" htmlFor="phone">
                    {t("yourPhone")}
                  </label>
                  <input
                    id="phone"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    required
                    // A numeric keypad on a phone, and the browser's own saved
                    // number.
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="0612345678"
                    className="field"
                  />
                  <p className="mt-1.5 text-[13px] text-ink-soft">{t("phoneHint")}</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="city">
                    {t("yourCity")}
                  </label>
                  {/* Suggestions, not a menu. The list offered live as they type
                      is the places this shop will put a delivery window in
                      writing for — but a dropdown that does not contain
                      someone's town loses the order, so the field stays free
                      text underneath and the list only ever offers help. */}
                  <CityAutocomplete
                    id="city"
                    lang={lang}
                    cities={terms?.cities ?? []}
                    value={city}
                    onChange={setCity}
                    required
                  />
                  {place ? (
                    <p className="mt-1.5 text-[13px] text-ink-soft">
                      {ar
                        ? `${place.name}: التوصيل خلال ${place.delivery_days[0]}–${place.delivery_days[1]} أيام.`
                        : `${place.name}: delivered in ${place.delivery_days[0]}–${place.delivery_days[1]} days.`}
                    </p>
                  ) : null}
                </div>

                <div>
                  <label className="label" htmlFor="email">
                    {t("yourEmail")}
                  </label>
                  <input
                    id="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    type="email"
                    autoComplete="email"
                    className="field"
                  />
                </div>
              </div>

              <div>
                <label className="label" htmlFor="line1">
                  {t("yourAddress")}
                </label>
                <input
                  id="line1"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  required
                  autoComplete="street-address"
                  className="field"
                />
              </div>

              <div>
                <label className="label" htmlFor="notes">
                  {t("anythingElse")}
                </label>
                <textarea
                  id="notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={2}
                  className="field resize-none"
                />
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-sand bg-surface p-5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[13px] font-medium text-ink-soft">{t("deliverTo")}</p>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="text-[13px] text-clay underline underline-offset-4"
                >
                  {t("notYou")}
                </button>
              </div>
              <p className="mt-2 text-[16px] font-medium">{name}</p>
              <p className="mt-0.5 text-[14.5px] leading-relaxed text-ink-soft">
                {address}
                <br />
                {city}
                <br />
                <span className="stamp">{phone}</span>
              </p>
              {place ? (
                <p className="mt-2 text-[13px] text-ink-soft">
                  {ar
                    ? `التوصيل خلال ${place.delivery_days[0]}–${place.delivery_days[1]} أيام.`
                    : `Delivered in ${place.delivery_days[0]}–${place.delivery_days[1]} days.`}
                </p>
              ) : null}

              {/* Still offered, because "leave it with the neighbour" is a real
                  instruction and it is per-order, not per-account. */}
              <div className="mt-4">
                <label className="label" htmlFor="notes-known">
                  {t("anythingElse")}
                </label>
                <textarea
                  id="notes-known"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={2}
                  className="field resize-none"
                />
              </div>
            </div>
          )}

          {problem ? (
            <p role="alert" className="mt-4 text-[15px] text-warn">
              {problem}
            </p>
          ) : null}
        </div>

        {/* Sticky on a wide screen so the total and the one action this page
            exists for stay in view while the form is filled in. */}
        <aside className="card p-5 shadow-soft lg:sticky lg:top-20">
          {summary}
          <div className="mt-5 hidden lg:block">{confirm}</div>
        </aside>
      </div>

      {/* The phone's version of the same button. Pinned to the actual bottom of
          the viewport — it used to sit at `bottom-16`, clearing a tab bar that
          no longer exists, which left a strip of page showing underneath it. */}
      <div
        className="fixed inset-x-0 bottom-0 z-10 border-t border-sand bg-cream/90 backdrop-blur-md lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="page-wide flex items-center gap-4 py-3 lg:max-w-[1020px]">
          <div className="min-w-0">
            <p className="text-[12px] text-ink-soft">{t("total")}</p>
            <p className="stamp text-[16px] font-semibold leading-tight">
              {fee === null ? "—" : money(total + fee, lang)}
            </p>
          </div>
          <div className="ms-auto w-[58%] max-w-[240px]">{confirm}</div>
        </div>
      </div>
    </form>
  );
}
