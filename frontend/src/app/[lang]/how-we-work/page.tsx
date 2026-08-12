import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import type { CategoryNode, Piece } from "@/lib/api";
import { IntroOverlay } from "@/components/IntroOverlay";
import { type Lang, isLang } from "@/lib/i18n";
import { alternates, fromApi, jsonLd, siteUrl } from "@/lib/server";

/**
 * The workshop's own story, on one page.
 *
 * There was already a shape on the site pointing here — a piece's "How it was
 * made" section, the tagline, the /make service pages — but no page a person
 * could land on that said, plainly, *this is a workshop*, and *this is what we
 * do in it*. That page is here.
 *
 * Deliberately one page, not a blog. A blog is a maintenance commitment paid
 * in real writing every week, and an unmaintained one is worse than none — a
 * "latest post" stamped six months ago is a shop that closed. One page that is
 * true and stays true is worth ten that decay.
 *
 * An earlier version of this page made a promise it could not stand behind —
 * that a remade piece is always photographed again — and named the city the
 * workshop works from, which is not something this business wants printed
 * anywhere. Both are gone. What is written here now is only what the rest of
 * the site already does: makes four kinds of thing in small runs, takes a
 * custom order through `/ask` with a real reference photo attached, and is
 * paid in cash at the door, anywhere in the country — never one city named as
 * home. The four photographs are the live catalogue, one per line of work,
 * fetched by whatever the admin currently calls that line rather than a name
 * hardcoded here.
 *
 * `IntroOverlay` speaks the same handful of lines once, word by word, before
 * handing over to this. It never renders without JavaScript and it never
 * hides anything — everything it says is also sitting in the page underneath
 * it, in full, the entire time.
 *
 * Both languages authored, not translated. The Arabic below is written as
 * Arabic — a Moroccan reading it should feel a Moroccan wrote it, because one
 * did.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang: raw } = await params;
  const lang = (isLang(raw) ? raw : "en") as Lang;

  const title = lang === "ar" ? "من نحن — MoStyle" : "About us — MoStyle";
  const description =
    lang === "ar"
      ? "ورشة صغيرة تصنع قطعاً مطبوعة بالأبعاد الثلاثة، نقشاً بالليزر، تيشيرتات وأكواباً مطبوعة — ولا تجدها هنا؟ نصنعها لك."
      : "A small workshop making 3D printed objects, laser engraving, printed t-shirts and printed mugs — and if you don't see it here, we'll make it.";

  return {
    title,
    description,
    alternates: alternates(lang, "/how-we-work"),
    openGraph: {
      type: "website",
      siteName: "MoStyle",
      locale: lang === "ar" ? "ar_MA" : "en_US",
      url: `${siteUrl}/${lang}/how-we-work`,
      title,
      description,
    },
  };
}

// Without this, `next build` prerenders the page once, and it does so with no
// network path to `api` — the build step is isolated from the compose
// network the same way the home page's own comment already documents. Every
// `fromApi` call below would fail at that moment and the empty result would
// be the page every visitor sees for the next hour, not a live one. Static
// generation is the wrong trade for a page whose whole content is live
// catalogue photos.
export const dynamic = "force-dynamic";

const INTRO: Record<Lang, string[]> = {
  en: [
    "Hey — welcome to our shop.",
    "We make 3D printed objects, laser engraving, printed t-shirts, and printed mugs.",
    "Everything here is made in a small workshop, not shipped in from a factory.",
    "Don't see what you want? Describe it on Ask for a piece, attach a photo if you have one, and we'll make it.",
    "Nothing is paid upfront. You pay when it arrives, in cash, at your door.",
  ],
  ar: [
    "أهلاً بك في متجرنا.",
    "نصنع قطعاً مطبوعة بتقنية الأبعاد الثلاثة، نقشاً بالليزر، تيشيرتات مطبوعة، وأكواباً مطبوعة.",
    "كل ما هنا يُصنع في ورشة صغيرة، لا يصل من مصنع.",
    "لم تجد ما تريد؟ صِفه في صفحة «اطلب قطعة»، أرفق صورة إن توفرت، ونتكفّل بصنعه.",
    "لا شيء يُدفع مقدماً. تدفع عند الوصول، نقداً، عند الباب.",
  ],
};

export default async function HowWeWork({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: raw } = await params;
  const lang = (isLang(raw) ? raw : "en") as Lang;
  const ar = lang === "ar";

  const roots = (await fromApi<CategoryNode[]>("/categories", lang, { revalidate: 3600 })) ?? [];

  // One real photograph per line of work — whatever the admin currently
  // named and ordered them, not a list written into this page by hand.
  const lines = await Promise.all(
    roots.map(async (root) => {
      const page = await fromApi<{ items: Piece[] }>(
        `/products?category=${root.slug}&size=1`,
        lang,
        { revalidate: 600 },
      );
      return { root, piece: page?.items[0] };
    }),
  );

  return (
    <>
      <IntroOverlay
        lines={INTRO[lang]}
        back={ar ? "السابق" : "Back"}
        skip={ar ? "تخطٍّ" : "Skip"}
      />

      <div className="page-wide pt-10 pb-20 sm:pt-14">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(schema(lang)) }}
        />

        {/* No banner. The greeting, the "a workshop, not a shop" headline and
            the two buttons under it were a screenful of the page repeating what
            the intro had just said out loud, above a set of links that appear
            again at the foot of the page. The page starts on the photographs.

            The `h1` survives as a hidden one. A page still needs exactly one —
            it is not decoration, it is what a screen reader announces and what
            an outline tool reads as the name of the page — but here it has
            nothing to say that the sections below do not say better. */}
        <h1 className="sr-only">{ar ? "من نحن" : "About us"}</h1>

        {lines.length > 0 ? (
          <section>
            <h2 className="text-[13px] font-medium uppercase tracking-widest text-ink-soft">
              {ar ? "ماذا نصنع" : "What we make"}
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {lines.map(({ root, piece }) => (
                <Link
                  key={root.slug}
                  href={piece ? `/${lang}/piece/${piece.slug}` : `/${lang}?category=${root.slug}`}
                  className="group block"
                >
                  <div
                    className="relative overflow-hidden rounded-2xl bg-clay-soft"
                    style={{ aspectRatio: "4 / 5" }}
                  >
                    {piece?.image ? (
                      <Image
                        src={piece.image}
                        alt={piece.title}
                        fill
                        sizes="(max-width: 640px) 50vw, 25vw"
                        className="object-cover transition-transform duration-[900ms] ease-gentle
                                   group-hover:scale-[1.04]"
                      />
                    ) : null}
                  </div>
                  <p className="mt-2.5 text-[14.5px] font-medium">{root.name}</p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {/* The real "made for you" claim: not a checkbox on a product page —
            that does not exist yet — but the custom-order page that already
            does. */}
        <section className="mt-16 grid gap-4 sm:mt-20 lg:grid-cols-2 lg:gap-14">
          <div>
            <h2 className="text-[clamp(22px,2.5vw,30px)] font-semibold leading-[1.15] tracking-[-0.03em]">
              {ar ? "مصنوع من أجلك، لا من أجل الجميع" : "Made for you, not for everyone"}
            </h2>
            <p className="mt-4 max-w-[52ch] text-[16.5px] leading-[1.65] text-ink-soft">
              {ar
                ? "هذه ليست بضاعة مصنّعة بالآلاف. كل شيء هنا يُصنع بدفعات صغيرة، في ورشة واحدة."
                : "Nothing here is stock made by the thousand. Everything is made in small batches, in one workshop."}
            </p>
          </div>
          <div>
            <h2 className="text-[clamp(22px,2.5vw,30px)] font-semibold leading-[1.15] tracking-[-0.03em]">
              {ar ? "لم تجده هنا؟ اطلبه" : "Don't see it here? Ask for it"}
            </h2>
            <p className="mt-4 max-w-[52ch] text-[16.5px] leading-[1.65] text-ink-soft">
              {ar
                ? "صِف بكلماتك ما تحتاج، وأرفق صورة أو رسماً إن توفر لديك. نعود إليك بسعر وتاريخ حقيقي، ولا يُنشأ الطلب إلاّ إذا وافقت."
                : "Describe what you need in your own words, and attach a photo or a sketch if you have one. We come back with a real price and date, and only if you say yes does an order exist."}
            </p>
            {/* The one exception to "nothing upfront," stated here and in the
                delivery/returns page's FAQ, and nowhere a shopper buying an
                ordinary shelf piece would run into it. */}
            <p className="mt-3 max-w-[52ch] text-[15px] leading-[1.65] text-ink-mute">
              {ar
                ? "لقطعة مخصصة تتجاوز 500 درهم، نطلب 30% من الثمن قبل أن نبدأ — والباقي نقداً عند الوصول."
                : "For a custom piece over 500 DH, we ask for 30% of the price before we start — the rest, in cash, when it arrives."}
            </p>
            <div className="mt-5">
              <Link href={`/${lang}/ask`} className="btn-quiet">
                {ar ? "اطلب قطعة" : "Ask for a piece"}
              </Link>
            </div>
          </div>
        </section>

        {/* Cash at the door — the one operational fact the checkout itself
            enforces, so it is safe to say plainly. "Nothing upfront" is
            qualified rather than dropped, because the paragraph above this
            one is the one exception to it — stating both without connecting
            them would read as two pages disagreeing with each other. */}
        <section className="mt-16 border-t border-sand pt-10 sm:mt-20">
          <h2 className="max-w-[20ch] text-[clamp(24px,3vw,36px)] font-semibold leading-tight tracking-[-0.03em]">
            {ar ? "نقداً عند الباب" : "Cash at the door"}
          </h2>
          <p className="mt-4 max-w-[54ch] text-[16.5px] leading-[1.65] text-ink-soft">
            {ar
              ? "تُدفع بالدرهم، عند وصول الطرد، في أي مدينة بالمغرب. لا شيء يُدفع مقدماً لما هو جاهز على الرف — الثمن والتاريخ مذكوران على الصفحة قبل أن تطلب. والتوصيل مجاني، على كل شيء، مهما كان المبلغ."
              : "Paid in dirhams, when it arrives, anywhere in Morocco. Nothing upfront for what's already on the shelf — the price and the date are both on the page before you order. Delivery is free, on everything, whatever the order comes to."}
          </p>
          <div className="mt-7 flex flex-wrap gap-2">
            <Link href={`/${lang}`} className="btn-primary">
              {ar ? "شاهد الرف" : "See the shelf"}
            </Link>
            <Link href={`/${lang}/ask`} className="btn-quiet">
              {ar ? "اطلب قطعة" : "Ask for a piece"}
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}

function schema(lang: Lang) {
  return {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    inLanguage: lang === "ar" ? "ar-MA" : "en",
    name: lang === "ar" ? "من نحن — MoStyle" : "About us — MoStyle",
    url: `${siteUrl}/${lang}/how-we-work`,
    about: {
      "@type": "Organization",
      name: "MoStyle",
      url: siteUrl,
      description:
        lang === "ar"
          ? "ورشة مغربية تصنع قِطعاً بالطباعة ثلاثية الأبعاد، نقش الليزر، التيشيرتات، والأكواب المطبوعة."
          : "A Moroccan workshop making 3D printed objects, laser engraving, printed t-shirts, and printed mugs.",
    },
  };
}
