import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import type { Place } from "@/lib/api";
import { LANGS, type Lang, isLang, money, translator } from "@/lib/i18n";
import { alternates, fromApi, jsonLd, siteUrl, workshopPhone } from "@/lib/server";

/**
 * "Do you deliver to Fez, and how long does it take?"
 *
 * The question every cash-on-delivery buyer in Morocco actually has, and the
 * one nothing on this site answered. It is also the search: people type the
 * city, not the shop.
 *
 * What keeps this from being a doorway page is that each one has facts of its
 * own — its delivery window, its fee, and once there is enough of it, how many
 * pieces have really gone there and how long they really took. Where there is
 * nothing true to say yet, the page says less instead of inventing more.
 */
async function load(lang: Lang, slug: string): Promise<Place | null> {
  // Short cache: the delivered count is live, and a city page that is a day
  // stale is claiming a smaller shop than we are.
  return fromApi<Place>(`/places/${slug}`, lang, { revalidate: 600 });
}

/**
 * Every city we serve, in both languages, decided at build time.
 *
 * `dynamicParams = false` is what makes an unserved place a real 404 instead
 * of a 200 carrying the not-found body — a soft 404. That distinction matters
 * more here than anywhere else on the site: a set of generated city pages
 * where any place name returns a page is the exact shape of a doorway network,
 * and answering 200 for /delivery/paris is how you look like one.
 */
export const dynamicParams = false;

export async function generateStaticParams() {
  const places = await fromApi<{ items: { slug: string }[] }>("/places", "en");
  return (places?.items ?? []).flatMap((place) =>
    LANGS.map((lang) => ({ lang, city: place.slug })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; city: string }>;
}): Promise<Metadata> {
  const { lang: raw, city } = await params;
  const lang = (isLang(raw) ? raw : "en") as Lang;
  const place = await load(lang, city);
  if (!place) return { title: translator(lang)("notFound") };

  const [low, high] = place.delivery_days;
  const title =
    lang === "ar"
      ? `التوصيل إلى ${place.name} — MoStyle`
      : `Delivery to ${place.name} — MoStyle`;
  const description =
    lang === "ar"
      ? `نصنع ونوصّل إلى ${place.name} خلال ${low}–${high} أيام. تخلّص نقداً عند الباب، بلا دفع مسبق.`
      : `We make and deliver to ${place.name} in ${low}–${high} days. Pay cash at the door — nothing before.`;

  return {
    title,
    description,
    alternates: alternates(lang, `/delivery/${place.slug}`),
    openGraph: {
      type: "website",
      siteName: "MoStyle",
      locale: lang === "ar" ? "ar_MA" : "en_US",
      url: `${siteUrl}/${lang}/delivery/${place.slug}`,
      title,
      description,
    },
  };
}

export default async function CityLanding({
  params,
}: {
  params: Promise<{ lang: string; city: string }>;
}) {
  const { lang: raw, city } = await params;
  const lang = (isLang(raw) ? raw : "en") as Lang;
  const t = translator(lang);
  const place = await load(lang, city);
  if (!place) notFound();

  const ar = lang === "ar";
  const [low, high] = place.delivery_days;
  const history = place.history;

  return (
    <div className="page pt-8 pb-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(citySchema(place, lang)) }}
      />

      <nav aria-label="Breadcrumb" className="text-[13px] text-ink-soft">
        <Link href={`/${lang}`} className="underline underline-offset-4">
          MoStyle
        </Link>
        <span aria-hidden> · </span>
        <span>{ar ? "التوصيل" : "Delivery"}</span>
      </nav>

      <h1 className="mt-3 text-[30px] leading-[1.15] font-semibold tracking-tight">
        {ar ? `التوصيل إلى ${place.name}` : `Delivery to ${place.name}`}
      </h1>
      <p className="mt-3 text-[17px] text-ink-soft leading-relaxed">
        {ar
          ? `نصنع في ورشتنا ونوصّل إلى ${place.name} ${place.region}. تخلّص نقداً عند وصول القطعة، لا قبل.`
          : `We make in our own workshop and deliver to ${place.name}, ${place.region}. You pay in cash when the piece reaches you — not before.`}
      </p>

      <section className="mt-7 grid grid-cols-2 gap-2.5">
        <div className="card p-4 shadow-soft">
          <p className="text-[13px] text-ink-soft">{ar ? "المدة" : "How long"}</p>
          <p className="stamp mt-1 text-[22px] font-semibold tabular-nums">
            {low}–{high}
          </p>
          <p className="mt-0.5 text-[12px] text-ink-soft">{ar ? "أيام" : "days"}</p>
        </div>
        <div className="card p-4 shadow-soft">
          <p className="text-[13px] text-ink-soft">{ar ? "التوصيل" : "Delivery"}</p>
          <p className="stamp mt-1 text-[22px] font-semibold tabular-nums">
            {money(place.delivery_fee, lang)}
          </p>
          <p className="mt-0.5 text-[12px] text-ink-soft">
            {ar
              ? `مجاناً فوق ${place.free_delivery_over}`
              : `free over ${place.free_delivery_over}`}
          </p>
        </div>
      </section>

      {/*
        The one thing a page about this city can say that no competitor's can:
        what has actually gone there. Shown only once there is enough of it to
        be a fact rather than an anecdote — the backend decides that, not this
        component.
      */}
      {history?.worth_saying ? (
        <p className="mt-5 text-[15px] leading-relaxed">
          {ar
            ? `أرسلنا ${history.delivered} قطعة إلى ${place.name} حتى الآن`
            : `We have sent ${history.delivered} pieces to ${place.name} so far`}
          {history.average_days
            ? ar
              ? `، ووصلت في ${history.average_days} أيام في المتوسط.`
              : `, arriving in ${history.average_days} days on average.`
            : "."}
        </p>
      ) : null}

      <section className="mt-9 card p-5 shadow-soft">
        <h2 className="text-[17px] font-semibold">
          {ar ? "كيف يجري الأمر" : "How it works"}
        </h2>
        <ol className="mt-3 flex flex-col gap-2.5 text-[15px] leading-relaxed">
          {(ar
            ? [
                "تختار قطعة من الرف، أو تصف لنا ما تريد صنعه.",
                "نتصل بك على رقمك لنؤكد العنوان قبل أن نرسل شيئاً.",
                `يصل الطرد إلى ${place.name} خلال ${low}–${high} أيام.`,
                "تفتحه، ثم تخلّص للموصّل نقداً. إن لم يعجبك، لا تأخذه.",
              ]
            : [
                "Pick a piece from the shelf, or describe what you want made.",
                "We call your number to confirm the address before anything is sent.",
                `It reaches ${place.name} in ${low}–${high} days.`,
                "You open it, then pay the courier in cash. If it is wrong, do not take it.",
              ]
          ).map((step, index) => (
            <li key={index} className="flex gap-3">
              <span className="stamp text-[13px] text-ink-soft pt-0.5">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      {place.services && place.services.length > 0 ? (
        <section className="mt-9">
          <h2 className="text-[19px] font-semibold">
            {ar ? `ما نصنعه لأهل ${place.name}` : `What we make for ${place.name}`}
          </h2>
          <div className="mt-4 flex flex-col gap-3">
            {place.services.map((item) => (
              <Link
                key={item.slug}
                href={`/${lang}/make/${item.slug}`}
                className="card block p-4 shadow-soft active:scale-[0.99] transition-transform duration-gentle"
              >
                <h3 className="text-[16px] font-semibold">{item.name}</h3>
                <p className="mt-1 text-[14px] text-ink-soft leading-relaxed">{item.summary}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <div className="mt-9 flex flex-wrap gap-3">
        <Link href={`/${lang}/store`} className="btn-primary">
          {t("browse")}
        </Link>
        <Link href={`/${lang}/ask`} className="btn-quiet">
          {t("askUs")}
        </Link>
      </div>
    </div>
  );
}

function citySchema(place: Place, lang: Lang) {
  const [low, high] = place.delivery_days;
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${siteUrl}/${lang}/delivery/${place.slug}#business`,
    name: `MoStyle — ${place.name_en}`,
    url: `${siteUrl}/${lang}/delivery/${place.slug}`,
    parentOrganization: { "@id": `${siteUrl}#workshop` },
    address: { "@type": "PostalAddress", addressCountry: "MA" },
    areaServed: {
      "@type": "City",
      name: place.name_en,
      address: { "@type": "PostalAddress", addressCountry: "MA" },
    },
    currenciesAccepted: "MAD",
    paymentAccepted: "Cash on delivery",
    // The same number as the Organization on the landing page. Local search
    // rewards one business saying one number everywhere and punishes drift.
    ...(workshopPhone ? { telephone: workshopPhone } : {}),
    // The delivery promise, in the vocabulary that can be shown under a
    // result rather than only read by a person.
    makesOffer: {
      "@type": "Offer",
      priceCurrency: "MAD",
      deliveryLeadTime: {
        "@type": "QuantitativeValue",
        minValue: low,
        maxValue: high,
        unitCode: "DAY",
      },
    },
  };
}
