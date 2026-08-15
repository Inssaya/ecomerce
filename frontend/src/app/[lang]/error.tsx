"use client";

/**
 * Same reasoning as `not-found.tsx`: renders inside the language layout, so
 * language comes from the path rather than a prop Next does not pass here.
 */
import { usePathname } from "next/navigation";

import { isLang, translator, type Lang } from "@/lib/i18n";

export default function ErrorBoundary({ reset }: { error: Error; reset: () => void }) {
  const path = usePathname();
  const lang = (isLang(path.split("/")[1]) ? path.split("/")[1] : "en") as Lang;
  const t = translator(lang);

  return (
    <div className="page pt-24 text-center">
      <p className="text-[17px] text-ink-soft">{t("somethingWentWrong")}</p>
      <button type="button" onClick={reset} className="btn-quiet mt-6">
        {t("tryAgain")}
      </button>
    </div>
  );
}
