import { type Lang } from "@/lib/i18n";

/**
 * What a blocked device sees, full page, in place of the shop.
 *
 * Reached from `Chrome.tsx`, which listens for `BLOCKED_EVENT` and swaps its
 * children for this — the block itself is enforced server-side by the
 * blocklist middleware, this is only the explanation. The two ways to reach
 * a person are the owner's own words, not paraphrased.
 */
export function BlockedScreen({ lang }: { lang: Lang }) {
  const ar = lang === "ar";
  return (
    <div className="page pt-24 pb-16 text-center" dir={ar ? "rtl" : "ltr"}>
      <h1 className="text-[22px] font-semibold">
        {ar ? "تم حظرك لأسباب أمنية" : "You are blocked for security reasons"}
      </h1>
      <p className="mt-3 text-[15px] text-ink-soft leading-relaxed">
        {ar
          ? "تواصل مع الدعم على هذا الرقم"
          : "Contact support on this number"}
      </p>
      <p className="mt-1 stamp text-[17px] font-semibold" dir="ltr">
        <a href="tel:+212623842535">0623842535</a>
      </p>
      <p className="mt-3 text-[15px] text-ink-soft leading-relaxed">
        {ar ? "أو راسلنا على البريد التالي" : "Or leave an email"}
      </p>
      <p className="mt-1 text-[15px]" dir="ltr">
        <a href="mailto:mostyle.service@gmail.com" className="underline underline-offset-4">
          mostyle.service@gmail.com
        </a>
      </p>
    </div>
  );
}
