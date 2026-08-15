"use client";

/**
 * Renders inside `[lang]/layout.tsx`'s tree — Chrome, fonts, `dir`, the
 * warm-palette design system all apply, unlike the root `app/not-found.tsx`
 * fallback, which is a bare unstyled page reached only when the request
 * never matched a language segment at all.
 *
 * Next does not pass this file route params, so language comes from the
 * path itself — the same way `Chrome.tsx` and `CategoryRail.tsx` read it.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

import { isLang, translator, type Lang } from "@/lib/i18n";

export default function NotFound() {
  const path = usePathname();
  const lang = (isLang(path.split("/")[1]) ? path.split("/")[1] : "en") as Lang;
  const t = translator(lang);

  return (
    <div className="page flex min-h-[60vh] flex-col items-center justify-center gap-6 pt-24 pb-16 text-center">
      <p className="text-[17px] text-ink-soft">{t("notFound")}</p>
      <Link href={`/${lang}`} className="btn-quiet">
        MoStyle
      </Link>
    </div>
  );
}
