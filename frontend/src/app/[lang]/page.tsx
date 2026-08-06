import Link from "next/link";

import { type Lang, isLang, translator } from "@/lib/i18n";

/**
 * The workshop's own count, read on the server so it is in the first paint.
 *
 * Never throws: a landing page that fails because a counter is unavailable is
 * worse than a landing page without a counter.
 */
async function workshopNumbers(lang: Lang) {
  const base = process.env.INTERNAL_API_URL ?? "http://api:8000";
  try {
    const response = await fetch(`${base}/api/workshop?lang=${lang}`, {
      // A count that is a minute stale is fine; a slow first paint is not.
      next: { revalidate: 60 },
    });
    if (!response.ok) return null;
    return (await response.json()) as { pieces_made: number; pieces_here: number };
  } catch {
    return null;
  }
}

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
  const numbers = await workshopNumbers(lang);

  return (
    <div className="page pt-14 pb-8">
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
