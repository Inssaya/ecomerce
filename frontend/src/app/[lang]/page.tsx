import Link from "next/link";

import type { Place, ServiceSummary, WorkshopNumbers } from "@/lib/api";
import { type Lang, isLang, translator } from "@/lib/i18n";
import { fromApi, siteUrl, workshopPhone } from "@/lib/server";

/**
 * The landing page. One idea, one action.
 *
 * The old homepage dumped four storefronts and every product at once, which is
 * the confusion the whole rebuild exists to fix. This page says who we are and
 * offers exactly two doors.
 */
export default async function Landing({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: raw } = await params;
  const lang = (isLang(raw) ? raw : "en") as Lang;
  const t = translator(lang);
  // A count a minute stale is fine; a slow first paint is not. Never throws —
  // a landing page that fails because a counter was unavailable is worse than
  // a landing page without a counter.
  // Three reads, in parallel — sequential awaits here would be three round
  // trips on the page every visitor sees first.
  const [numbers, serviceList, placeList] = await Promise.all([
    fromApi<WorkshopNumbers>("/workshop", lang),
    fromApi<{ items: ServiceSummary[] }>("/services", lang, { revalidate: 3600 }),
    fromApi<{ items: Place[] }>("/places", lang, { revalidate: 3600 }),
  ]);
  const services = serviceList?.items ?? [];
  const places = placeList?.items ?? [];

  return (
    <div className="page pt-14 pb-8">
      {/*
        Who we are, for a machine.

        The `makesOffer` line is the whole positioning stated in the one
        vocabulary Google reads: this is a workshop that manufactures what it
        sells. It is also what makes the site eligible to be shown as a
        business rather than as a page — and the sitelinks search box is what
        puts the shelf's own search under the result instead of sending people
        to a homepage they then have to navigate.
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(workshopSchema(lang, t)) }}
      />

      <section className="animate-rise">
        <h1 className="text-[34px] leading-[1.15] font-semibold tracking-tight">{t("tagline")}</h1>
        <p className="mt-4 text-[17px] text-ink-soft leading-relaxed">{t("taglineSupport")}</p>
      </section>

      {/*
        Open with the most characteristic thing in the subject's world.

        For a workshop that is the count of what it has made — a real number,
        read from the pieces table, not a marketing figure. It is also the one
        sentence a reseller cannot write: they have no idea how many of
        anything exists, because they did not make any of it.
      */}
      {numbers && numbers.pieces_made > 0 ? (
        <section className="mt-10 flex items-baseline gap-6 border-y border-sand py-5">
          <div>
            <p className="stamp text-[38px] font-semibold leading-none">{numbers.pieces_made}</p>
            <p className="mt-1.5 text-[13px] text-ink-soft">{t("piecesMade")}</p>
          </div>
          <div>
            <p className="stamp text-[38px] font-semibold leading-none text-clay">
              {numbers.pieces_here}
            </p>
            <p className="mt-1.5 text-[13px] text-ink-soft">{t("stillOnTheShelf")}</p>
          </div>
        </section>
      ) : null}

      <section className="mt-12 space-y-4">
        <Door
          href={`/${lang}/store`}
          title={t("theShelf")}
          meaning={t("shelfMeaning")}
          action={t("browse")}
          primary
        />
        <Door
          href={`/${lang}/ask`}
          title={t("theWorkshop")}
          meaning={t("workshopMeaning")}
          action={t("askUs")}
        />
      </section>

      {/*
        What the workshop does, as opposed to what is on the shelf today.

        Here for two reasons and both matter. A visitor who wants something
        made has no idea from the two doors above that we cut, print and
        engrave — the Workshop door says "tell us what you need", which assumes
        they already know we can. And these are the pages that answer a search
        for the work itself, so they have to be linked from the homepage or
        nothing crawls them.
      */}
      {services.length > 0 ? (
        <section className="mt-14">
          <h2 className="text-[19px] font-semibold">
            {lang === "ar" ? "ما نصنعه" : "What we make"}
          </h2>
          <div className="mt-4 flex flex-col gap-2.5">
            {services.map((item) => (
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

      {/*
        And where it goes. Only the handful of biggest cities are named here —
        the rest are reachable from any service page, so every city is two taps
        from this page without turning the homepage into a list of thirty
        towns.
      */}
      {places.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-[17px] font-semibold">
            {lang === "ar" ? "نوصّل في كل المغرب" : "We deliver across Morocco"}
          </h2>
          <p className="mt-2 text-[14px] text-ink-soft leading-relaxed">
            {places.slice(0, 8).map((place, index) => (
              <span key={place.slug}>
                {index > 0 ? <span aria-hidden> · </span> : null}
                <Link
                  href={`/${lang}/delivery/${place.slug}`}
                  className="underline underline-offset-4 decoration-sand"
                >
                  {place.name}
                </Link>
              </span>
            ))}
          </p>
        </section>
      ) : null}

      <section className="mt-14 card p-6 shadow-soft">
        <h2 className="text-[19px] font-semibold">{t("ourStory")}</h2>
        <div className="mt-3 space-y-3 text-[15px] text-ink-soft leading-relaxed">
          <p>
            {lang === "ar"
              ? "كل ما يُباع تقريباً على الإنترنت في المغرب وصل داخل حاوية. صوّره أحدهم، وعرضه، وأرسله. لا أحد في تلك السلسلة لمس ما يبيعه."
              : "Almost everything sold online in Morocco arrived in a container. Someone photographed it, listed it, and shipped it on. Nobody in that chain has ever touched the thing they're selling."}
          </p>
          <p>
            {lang === "ar"
              ? "لدينا ورشة. نصنع قطعنا واحدة واحدة — طباعة، وخراطة، وصقل باليد. الصورة في الصفحة هي القطعة نفسها التي ستصلك، لأنها واحدة فقط، ولأننا نحن من صنعها."
              : "We have a workshop. We make our pieces one at a time — printed, machined, finished by hand. The photo on the page is the actual piece you will receive, because there is only one of it and we're the ones who made it."}
          </p>
          <p className="text-ink font-medium">{t("ifWeDontHaveIt")}</p>
        </div>
      </section>

      {/*
        Quiet, and last, because it is for the small number of people who are
        already waiting on a package rather than the ones deciding whether to
        buy. They are the ones most likely to be back on this page, though —
        the link they were sent is the thing they have lost.
      */}
      <p className="mt-10 text-center text-[14px] text-ink-soft">
        {t("alreadyOrdered")}{" "}
        <Link href={`/${lang}/orders`} className="font-medium text-clay underline-offset-4 underline">
          {t("findYourOrder")}
        </Link>
      </p>
      <p className="mt-2 text-center text-[13px] text-ink-soft">
        <Link href={`/${lang}/delivery`} className="underline underline-offset-4">
          {lang === "ar" ? "التوصيل والإرجاع" : "Delivery and returns"}
        </Link>
      </p>
    </div>
  );
}

function Door({
  href,
  title,
  meaning,
  action,
  primary,
}: {
  href: string;
  title: string;
  meaning: string;
  action: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`card block p-6 shadow-soft active:scale-[0.99] transition-transform duration-gentle ${
        primary ? "bg-clay text-white" : ""
      }`}
    >
      <h2 className="text-[22px] font-semibold">{title}</h2>
      <p className={`mt-1.5 text-[15px] ${primary ? "text-white/80" : "text-ink-soft"}`}>
        {meaning}
      </p>
      <p className={`mt-5 text-[15px] font-semibold ${primary ? "" : "text-clay"}`}>{action} →</p>
    </Link>
  );
}

function workshopSchema(lang: Lang, t: ReturnType<typeof translator>) {
  const home = `${siteUrl}/${lang}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": ["Organization", "HomeAndConstructionBusiness"],
        "@id": `${siteUrl}#workshop`,
        name: "MoStyle",
        url: home,
        slogan: t("tagline"),
        description: t("taglineSupport"),
        address: { "@type": "PostalAddress", addressCountry: "MA" },
        currenciesAccepted: "MAD",
        paymentAccepted: "Cash on delivery",
        // Omitted entirely when unset. A wrong number here is worse than none,
        // because it is the one a search result puts a "call" button on.
        ...(workshopPhone ? { telephone: workshopPhone } : {}),
        areaServed: { "@type": "Country", name: "Morocco" },
        // The position, in the one vocabulary a crawler reads: we make the
        // things we sell.
        makesOffer: {
          "@type": "Offer",
          itemOffered: { "@type": "Product", name: t("theShelf") },
        },
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}#site`,
        url: home,
        name: "MoStyle",
        inLanguage: lang,
        publisher: { "@id": `${siteUrl}#workshop` },
        // Puts the shelf's own search under the search result, so people
        // arrive at a piece rather than at a homepage to navigate.
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${siteUrl}/${lang}/store?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
}
