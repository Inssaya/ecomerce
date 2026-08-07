import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import type { Place, ServicePage } from "@/lib/api";
import { LANGS, type Lang, isLang, money, translator } from "@/lib/i18n";
import { alternates, fromApi, jsonLd, resource, siteUrl } from "@/lib/server";

/**
 * "Can you make me one of these?"
 *
 * A different question from *what is on the shelf*, and a different search.
 * Somebody typing "printing on demand" or "t-shirt printing" is not browsing;
 * they have a job and they are looking for someone to do it. Until now this
 * shop had no page that said those words, so it could not be found by them —
 * the shelf and the request form were both real answers that never appeared
 * in a search result.
 *
 * The page is server-rendered and mostly text on purpose. What ranks and what
 * converts are the same thing here: a specific, honest description of the work
 * by someone who obviously does it.
 */
async function load(lang: Lang, slug: string): Promise<ServicePage | null> {
  return resource<ServicePage>(`/services/${slug}`, lang, { revalidate: 3600 });
}

/**
 * Every service, in both languages, rendered at build time.
 *
 * `dynamicParams = false` is doing real work here. Without it an unknown slug
 * reaches the page, calls `notFound()`, and Next answers 200 with the
 * not-found body — a soft 404, which Google treats as a page that exists and
 * is worthless, and which is precisely the failure mode a site with generated
 * landing pages must not have. With it, anything not in this list is a genuine
 * 404 before the page runs.
 *
 * The cost is that adding a service needs a deploy rather than a database
 * write. That is the right way round: these are five pages of written copy,
 * not a catalogue.
 */
export const dynamicParams = false;

export async function generateStaticParams() {
  const services = await fromApi<{ items: { slug: string }[] }>("/services", "en");
  return (services?.items ?? []).flatMap((item) =>
    LANGS.map((lang) => ({ lang, service: item.slug })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; service: string }>;
}): Promise<Metadata> {
  const { lang: raw, service } = await params;
  const lang = (isLang(raw) ? raw : "en") as Lang;
  const found = await load(lang, service);
  if (!found) return { title: translator(lang)("notFound") };

  // "in Morocco" is in the title because that is how the search is typed, and
  // because it is the one thing that separates this from a global supplier
  // who cannot deliver here for a price anyone will pay.
  const title =
    lang === "ar"
      ? `${found.name} في المغرب — MoStyle`
      : `${found.name} in Morocco — MoStyle`;

  return {
    title,
    description: found.summary,
    alternates: alternates(lang, `/make/${found.slug}`),
    openGraph: {
      type: "website",
      siteName: "MoStyle",
      locale: lang === "ar" ? "ar_MA" : "en_US",
      url: `${siteUrl}/${lang}/make/${found.slug}`,
      title,
      description: found.summary,
    },
  };
}

export default async function ServiceLanding({
  params,
}: {
  params: Promise<{ lang: string; service: string }>;
}) {
  const { lang: raw, service } = await params;
  const lang = (isLang(raw) ? raw : "en") as Lang;
  const t = translator(lang);
  const found = await load(lang, service);
  if (!found) notFound();

  const ar = lang === "ar";
  const fastest = [...found.places].sort(
    (a, b) => a.delivery_days[1] - b.delivery_days[1],
  );

  return (
    <div className="page pt-8 pb-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(serviceSchema(found, lang)) }}
      />

      <nav aria-label="Breadcrumb" className="text-[13px] text-ink-soft">
        <Link href={`/${lang}`} className="underline underline-offset-4">
          MoStyle
        </Link>
        <span aria-hidden> · </span>
        <span>{ar ? "ما نصنعه" : "What we make"}</span>
      </nav>

      <h1 className="mt-3 text-[30px] leading-[1.15] font-semibold tracking-tight">
        {found.name}
      </h1>
      <p className="mt-3 text-[17px] text-ink-soft leading-relaxed">{found.summary}</p>

      <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[14px]">
        {found.lead_time_days ? (
          <span>
            <span className="stamp font-semibold">{found.lead_time_days}</span>{" "}
            <span className="text-ink-soft">{ar ? "أيام عادةً" : "days, usually"}</span>
          </span>
        ) : null}
        {found.from_price ? (
          <span>
            <span className="text-ink-soft">{ar ? "من" : "from"}</span>{" "}
            <span className="stamp font-semibold">{money(found.from_price, lang)}</span>
          </span>
        ) : null}
        <span className="text-ink-soft">{ar ? "تخلّص عند الباب" : "Cash at the door"}</span>
      </div>

      <div className="mt-8 flex flex-col gap-4 text-[16px] leading-relaxed">
        {found.body.split("\n\n").map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>

      <Link href={`/${lang}/ask`} className="btn-primary mt-8 inline-flex">
        {t("askUs")}
      </Link>
      <p className="mt-2 text-[13px] text-ink-soft">{t("nothingOwed")}</p>

      {/*
        Where it reaches, on the page itself.

        This is the honest version of local SEO: one service page that names
        the cities and their real delivery windows, rather than thirty
        near-identical pages that differ by one noun. The cities link out to
        their own pages, which have something of their own to say.
      */}
      <section className="mt-12">
        <h2 className="text-[19px] font-semibold">
          {ar ? `${found.name} — أين نوصّل` : `Where we deliver`}
        </h2>
        <p className="mt-1.5 text-[14px] text-ink-soft leading-relaxed">
          {ar
            ? "من الورشة إلى بابك، في كل المغرب. المدة الحقيقية لكل مدينة:"
            : "From the workshop to your door, anywhere in Morocco. The real window for each city:"}
        </p>

        <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 text-[14px]">
          {fastest.map((place) => (
            <li key={place.slug} className="flex items-baseline justify-between gap-2">
              <Link
                href={`/${lang}/delivery/${place.slug}`}
                className="underline underline-offset-4 decoration-sand hover:decoration-clay"
              >
                {place.name}
              </Link>
              <span className="stamp text-[12.5px] tabular-nums text-ink-soft shrink-0">
                {place.delivery_days[0]}–{place.delivery_days[1]}
                {ar ? " ي" : "d"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function serviceSchema(found: ServicePage, lang: Lang) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: found.name,
    description: found.summary,
    serviceType: found.name,
    provider: { "@type": "Organization", "@id": `${siteUrl}#workshop`, name: "MoStyle" },
    // The cities, declared as the area actually served. This is what lets a
    // service page answer a search that names a city without needing a page
    // per city per service.
    areaServed: found.places.map((place: Place) => ({
      "@type": "City",
      name: place.name_en,
      address: { "@type": "PostalAddress", addressCountry: "MA" },
    })),
    ...(found.from_price
      ? {
          offers: {
            "@type": "Offer",
            price: found.from_price,
            priceCurrency: "MAD",
            availability: "https://schema.org/InStock",
          },
        }
      : {}),
    url: `${siteUrl}/${lang}/make/${found.slug}`,
  };
}
