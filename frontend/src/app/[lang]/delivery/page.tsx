import type { Metadata } from "next";
import Link from "next/link";

import type { Place } from "@/lib/api";
import { type Lang, isLang, money, translator } from "@/lib/i18n";
import { alternates, fromApi, jsonLd, siteUrl } from "@/lib/server";

/**
 * "What happens if I don't want it when it arrives?"
 *
 * The unspoken question in every cash-on-delivery order, and the one the shop
 * had no page for. It is worth answering plainly for a reason that is
 * commercial rather than decent: a refused package is the single largest
 * silent cost in this market — the courier is paid both ways, the piece comes
 * back handled, and nothing was earned. Most refusals are not fraud. They are
 * someone who was surprised at the door.
 *
 * So this page exists to remove surprises before the knock: the fee, the
 * window, that we call first, and what happens if they say no. Saying "you can
 * refuse it" out loud costs a few refusals from people who were never going to
 * keep it, and prevents the more expensive kind — the customer who feels
 * tricked and never comes back.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang: raw } = await params;
  const lang = (isLang(raw) ? raw : "en") as Lang;
  const title =
    lang === "ar" ? "التوصيل والإرجاع — MoStyle" : "Delivery and returns — MoStyle";
  const description =
    lang === "ar"
      ? "تخلّص نقداً عند الباب. نتصل بك قبل الإرسال، ويمكنك رفض الطرد إن لم يعجبك."
      : "You pay cash at the door. We call before we send, and you can refuse the parcel if it is not right.";

  return {
    title,
    description,
    alternates: alternates(lang, "/delivery"),
    openGraph: {
      type: "website",
      siteName: "MoStyle",
      locale: lang === "ar" ? "ar_MA" : "en_US",
      url: `${siteUrl}/${lang}/delivery`,
      title,
      description,
    },
  };
}

export default async function DeliveryAndReturns({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang: raw } = await params;
  const lang = (isLang(raw) ? raw : "en") as Lang;
  const t = translator(lang);
  const ar = lang === "ar";

  const list = await fromApi<{ items: Place[] }>("/places", lang, { revalidate: 3600 });
  const places = list?.items ?? [];
  const fee = places[0]?.delivery_fee ?? 30;
  const freeOver = places[0]?.free_delivery_over ?? 500;

  const questions = ar
    ? [
        [
          "متى أخلّص؟",
          "عند الباب، نقداً، بعد أن يصل الطرد. لا شيء قبل ذلك — لا بطاقة، ولا تحويل، ولا عربون.",
        ],
        [
          "وإن لم يعجبني حين أفتحه؟",
          "لا تأخذه. افتح الطرد أمام الموصّل، وإن لم يكن كما في الصفحة فأعده معه ولا تدفع شيئاً. لن نتصل بك لنجادلك.",
        ],
        [
          "وإن أخذته ثم غيّرت رأيي؟",
          "راسلنا خلال ٤٨ ساعة وسنتّفق. القطعة المصنوعة خصيصاً باسمك أو بمقاسك استثناء — لا يمكن بيعها لأحد غيرك، ونقول لك ذلك قبل أن نبدأ.",
        ],
        [
          "وإن وصلت مكسورة؟",
          "نصنع بديلاً أو نعيد لك المال، كما تفضّل. أرسل صورة فقط — لا نطلب أكثر من ذلك.",
        ],
        [
          "هل تتصلون قبل الإرسال؟",
          "دائماً. نؤكّد العنوان والوقت المناسب على الرقم الذي تركته. إن لم نصل إليك، لا نرسل.",
        ],
        [
          "كم يستغرق؟",
          "يوم أو يومان في المدن الكبرى، وحتى سبعة في أقصى الجنوب. المدة الحقيقية لكل مدينة في صفحتها.",
        ],
      ]
    : [
        [
          "When do I pay?",
          "At the door, in cash, after the parcel reaches you. Nothing before — no card, no transfer, no deposit.",
        ],
        [
          "What if I open it and don't want it?",
          "Don't take it. Open the parcel in front of the courier, and if it is not what the page said, hand it straight back and pay nothing. Nobody will call you to argue about it.",
        ],
        [
          "What if I take it and change my mind?",
          "Message us within 48 hours and we will sort it out. A piece made specifically for you — your name on it, your measurement — is the exception, because it cannot be sold to anyone else. We say so before we start it.",
        ],
        [
          "What if it arrives broken?",
          "We make another or give your money back, whichever you prefer. Send a photo, that is all we ask for.",
        ],
        [
          "Do you call before sending?",
          "Always. We confirm the address and a time that suits you on the number you left. If we cannot reach you, we do not send it.",
        ],
        [
          "How long does it take?",
          "A day or two in the big cities, up to seven in the far south. The real window for each city is on its own page.",
        ],
      ];

  return (
    <div className="page pt-8 pb-10">
      {/*
        The same answers for a machine. FAQ data is one of the few kinds Google
        still shows under a result, and "do you deliver to X, and can I refuse
        it" is exactly what gets typed before a first order.
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: questions.map(([question, answer]) => ({
              "@type": "Question",
              name: question,
              acceptedAnswer: { "@type": "Answer", text: answer },
            })),
          }),
        }}
      />

      <nav aria-label="Breadcrumb" className="text-[13px] text-ink-soft">
        <Link href={`/${lang}`} className="underline underline-offset-4">
          MoStyle
        </Link>
      </nav>

      <h1 className="mt-3 text-[30px] leading-[1.15] font-semibold tracking-tight">
        {ar ? "التوصيل والإرجاع" : "Delivery and returns"}
      </h1>
      <p className="mt-3 text-[17px] text-ink-soft leading-relaxed">
        {ar
          ? "لا شيء عليك حتى تمسك القطعة بيدك."
          : "You owe nothing until the piece is in your hand."}
      </p>

      <section className="mt-7 grid grid-cols-2 gap-2.5">
        <div className="card p-4 shadow-soft">
          <p className="text-[13px] text-ink-soft">{ar ? "التوصيل" : "Delivery"}</p>
          <p className="stamp mt-1 text-[22px] font-semibold tabular-nums">
            {money(fee, lang)}
          </p>
          <p className="mt-0.5 text-[12px] text-ink-soft">
            {ar ? `مجاناً فوق ${freeOver}` : `free over ${freeOver}`}
          </p>
        </div>
        <div className="card p-4 shadow-soft">
          <p className="text-[13px] text-ink-soft">{ar ? "الدفع" : "Payment"}</p>
          <p className="mt-1 text-[18px] font-semibold">{ar ? "نقداً" : "Cash"}</p>
          <p className="mt-0.5 text-[12px] text-ink-soft">
            {ar ? "عند الباب فقط" : "at the door only"}
          </p>
        </div>
      </section>

      <section className="mt-9 flex flex-col gap-6">
        {questions.map(([question, answer]) => (
          <div key={question}>
            <h2 className="text-[17px] font-semibold">{question}</h2>
            <p className="mt-1.5 text-[15px] text-ink-soft leading-relaxed">{answer}</p>
          </div>
        ))}
      </section>

      {places.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-[17px] font-semibold">
            {ar ? "المدة حسب المدينة" : "How long, by city"}
          </h2>
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[14px]">
            {places.slice(0, 12).map((place) => (
              <li key={place.slug} className="flex items-baseline justify-between gap-2">
                <Link
                  href={`/${lang}/delivery/${place.slug}`}
                  className="underline underline-offset-4 decoration-sand"
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
      ) : null}

      <div className="mt-10 flex flex-wrap gap-3">
        <Link href={`/${lang}/store`} className="btn-primary">
          {t("browse")}
        </Link>
        <Link href={`/${lang}/orders`} className="btn-quiet">
          {t("findYourOrder")}
        </Link>
      </div>
    </div>
  );
}
