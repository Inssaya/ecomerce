import type { Metadata } from "next";
import Link from "next/link";

import { type Lang, isLang } from "@/lib/i18n";
import { alternates, jsonLd, siteUrl } from "@/lib/server";

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

  const title =
    lang === "ar" ? "كيف نصنع — MoStyle" : "How we make things — MoStyle";
  const description =
    lang === "ar"
      ? "ورشة، لا متجراً. طباعة ثلاثية الأبعاد، تصنيع آلي، صقل يدوي. صورة حقيقية لكل قطعة."
      : "A workshop, not a shop. 3D printing, machining, hand-finishing. A real photograph of every piece.";

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

export default async function HowWeWork({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: raw } = await params;
  const lang = (isLang(raw) ? raw : "en") as Lang;

  const ar = lang === "ar";

  // Three facts about the place, side by side above the prose. On a laptop the
  // old page opened on a wall of paragraphs in a phone-width column; this gives
  // the eye somewhere to land first and uses the width the screen has.
  const facts = ar
    ? [
        ["نصنع، لا نعيد البيع", "الآلات لنا. القطعة تُصنع هنا، لا تصل في حاوية."],
        ["الصورة هي القطعة", "لا صور مخزنية أبداً. ما تراه هو ما يصلك."],
        ["تخلّص عند الباب", "نقداً عند التسليم، في كل المغرب. لا شيء مقدماً."],
      ]
    : [
        ["Made, not resold", "The machines are ours. A piece is made here, not unloaded from a container."],
        ["The photo is the piece", "Never a stock image. What you see is what is boxed."],
        ["Pay at the door", "Cash on delivery, anywhere in Morocco. Nothing up front."],
      ];

  return (
    <div className="page-wide pt-8 pb-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(schema(lang)) }}
      />

      <h1 className="max-w-[20ch] text-[clamp(32px,4.4vw,58px)] leading-[1.02] font-semibold tracking-[-0.04em]">
        {ar ? "ورشة، لا متجر." : "A workshop, not a shop."}
      </h1>

      <div className="mt-9 grid gap-3 sm:grid-cols-3">
        {facts.map(([title, detail]) => (
          <div key={title} className="rounded-2xl border border-sand bg-surface p-5">
            <p className="text-[15.5px] font-semibold">{title}</p>
            <p className="mt-1.5 text-[14px] leading-[1.6] text-ink-soft">{detail}</p>
          </div>
        ))}
      </div>

      {/* The writing keeps a reading measure of its own — prose at 1180px wide
          is unreadable no matter how much room the screen has. */}
      <article className="mt-14 max-w-[68ch]">
        {ar ? <ArabicContent /> : <EnglishContent />}

        <div className="mt-10 flex flex-wrap gap-2">
          <Link href={`/${lang}`} className="btn-primary">
            {ar ? "شاهد الرف" : "See the shelf"}
          </Link>
          <Link href={`/${lang}/ask`} className="btn-quiet">
            {ar ? "اطلب قطعة" : "Ask for a piece"}
          </Link>
        </div>
      </article>
    </div>
  );
}

function schema(lang: Lang) {
  return {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    inLanguage: lang === "ar" ? "ar-MA" : "en",
    name:
      lang === "ar" ? "كيف نصنع — MoStyle" : "How we make things — MoStyle",
    url: `${siteUrl}/${lang}/how-we-work`,
    about: {
      "@type": "Organization",
      name: "MoStyle",
      url: siteUrl,
      description:
        lang === "ar"
          ? "ورشة مغربية تصنع قِطعاً بالطباعة ثلاثية الأبعاد، التصنيع الآلي، والصقل اليدوي."
          : "A Moroccan workshop making pieces by 3D printing, machining, and hand-finishing.",
    },
  };
}

function EnglishContent() {
  return (
    <>
      <p className="text-[13px] uppercase tracking-widest text-ink-soft">The workshop</p>
      <h1 className="mt-1 text-[30px] font-semibold leading-tight tracking-tight">
        We made this, we did not buy it.
      </h1>
      <p className="mt-5 text-[17px] leading-relaxed text-ink-soft">
        Everything else online came from a container. Ours came from a workshop, one at a time,
        with real hands on it. This page is what &ldquo;made&rdquo; means when we say it.
      </p>

      <Section title="Three tools, no shortcuts">
        <p>
          A printer that runs overnight and makes the shape. A small machine that trims and
          finishes where the plastic will not do. And hands, at the end of every piece, that file
          the edges, oil the wood, buff the metal, and check the number that goes on it. None of
          that scales. That is the point.
        </p>
      </Section>

      <Section title="One photograph, one piece">
        <p>
          The photo on a piece&rsquo;s page is that piece. Not a similar one, not a stock image, not
          something rendered. It cannot go on the shelf until we have taken it, and if a piece is
          made twice it is photographed twice. That is how we make a promise about a physical
          object rather than about a category.
        </p>
      </Section>

      <Section title="A count that can be read">
        <p>
          When a batch is four, the page reads 04. When the second one leaves, it reads 04, with
          one struck through. When we make three more, the older ones become 04 of 07 — the number
          moves with the truth, in both directions. There is no bar saying &ldquo;only 1 left&rdquo;
          that has been saying it for six weeks.
        </p>
      </Section>

      <Section title="If it is not here, we make it">
        <p>
          The Workshop is the other half of the shop. You describe what you need in your own
          words, we come back with a price and a real date, and only if you say yes does an order
          exist. A quote is not an order. Nothing is owed until you agree.
        </p>
      </Section>

      <Section title="Cash at the door">
        <p>
          Paid in dirhams, in Morocco, when it arrives. This means we take the risk out of the
          purchase and put it on ourselves &mdash; which is why the fee, the date, and the shape of what is
          coming are all on the page before you order. A package refused at the door is the
          largest silent cost in this market, and it is our cost, so we take real care not to
          surprise you at it.
        </p>
      </Section>

      <Section title="Two people, one shop">
        <p>
          There is no seller marketplace behind this, no dropshipper, no supplier catalogue. One
          workshop, one owner, one machine each of the three kinds. When you write to us on
          WhatsApp, a person reads it and a person answers it.
        </p>
      </Section>
    </>
  );
}

function ArabicContent() {
  return (
    <>
      <p className="text-[13px] uppercase tracking-widest text-ink-soft">الورشة</p>
      <h1 className="mt-1 text-[30px] font-semibold leading-tight tracking-tight">
        نحن صنعناها، لم نشترها.
      </h1>
      <p className="mt-5 text-[17px] leading-relaxed text-ink-soft">
        كل شيء آخر على الإنترنت جاء من حاوية. أما قِطعتنا فجاءت من ورشة، واحدة تلو الأخرى، ومسّتها
        يدٌ حقيقية. هذه الصفحة تشرح ماذا تعني كلمة &laquo;صنعناها&raquo; حين نقولها.
      </p>

      <Section title="ثلاث أدوات، لا اختصارات">
        <p>
          طابعة تعمل طوال الليل وتصنع الشكل. آلة صغيرة تُتمّ الحواف حيث لا يكفي البلاستيك. ثم يدان
          في نهاية كل قطعة، تُبرد الحواف، وتُزيّت الخشب، وتُلمّع المعدن، وتتحقّق من الرقم الذي
          سيُوضع عليها. لا شيء من هذا يقبل التوسّع. وهذا بالضبط ما نريد.
        </p>
      </Section>

      <Section title="صورة واحدة، قطعة واحدة">
        <p>
          الصورة على صفحة القطعة هي هذه القطعة. ليست قطعة شبيهة، ولا صورة جاهزة، ولا شيء
          مُصمَّم. لا تُنشر على الرف قبل أن نلتقطها. وإن صُنعت مرّتين، صُوّرت مرّتين. هكذا نعِد
          بشيء بعينه، لا بفئة.
        </p>
      </Section>

      <Section title="عدّ يُقرأ">
        <p>
          حين تكون الدفعة أربعاً، تقرأ الصفحة 04. وحين تُباع الثانية، تبقى 04 مع خطّ فوق واحدة.
          وحين نصنع ثلاثاً أخرى، تصبح الأقدم 04 من 07 — الرقم يتحرّك مع الحقيقة، في الاتجاهين.
          لا شريط يقول &laquo;بقيت واحدة فقط&raquo; منذ ستة أسابيع.
        </p>
      </Section>

      <Section title="إن لم يكن هنا، صنعناه">
        <p>
          الورشة هي النصف الآخر من المتجر. تصف بكلماتك ما تحتاج، ونعود إليك بسعر وتاريخ حقيقي.
          ولا يُنشأ الطلب إلاّ إذا وافقت. السعر ليس طلباً. لا شيء عليك حتى تقول &laquo;نعم&raquo;.
        </p>
      </Section>

      <Section title="نقداً عند الباب">
        <p>
          تُدفع بالدرهم، في المغرب، عند وصول الطرد. هذا يعني أنّنا نحمل المخاطرة عنك — ولذلك يُذكر
          الثمن والتاريخ وشكل ما سيصلك على الصفحة قبل أن تطلبه. رفض الطرد عند الباب هو أغلى تكلفة
          صامتة في هذا السوق، وهي تكلفتنا نحن، لذا نحرص أن لا نُفاجئك عنده.
        </p>
      </Section>

      <Section title="شخصان، ورشة واحدة">
        <p>
          لا سوق بائعين خلف هذا، ولا وسيط، ولا كتالوج مورّد. ورشة واحدة، مالك واحد، آلة واحدة من
          كل نوع. حين تكتب إلينا على واتساب، يقرأها شخص، ويردّ عليها شخص.
        </p>
      </Section>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-[19px] font-semibold tracking-tight">{title}</h2>
      <div className="mt-2.5 text-[16px] leading-relaxed">{children}</div>
    </section>
  );
}
