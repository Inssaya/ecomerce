import { type Lang } from "@/lib/i18n";

/**
 * What a blocked device sees, full page, in place of the shop.
 *
 * Reached from `Chrome.tsx`, which listens for `BLOCKED_EVENT` and swaps its
 * children for this — the block itself is enforced server-side by the
 * blocklist middleware, this is only the explanation. The two ways to reach
 * a person are the owner's own words, not paraphrased. `contact` is threaded
 * down from `[lang]/layout.tsx`, which already fetched it for `Chrome`, so a
 * blocked visitor is not the one request that has to hit the API a second
 * time to learn how to reach the shop.
 */
export function BlockedScreen({
  lang,
  contact,
}: {
  lang: Lang;
  contact: { email: string; phone: string };
}) {
  const ar = lang === "ar";
  // The stored phone is Morocco's normalised local form (0XXXXXXXXX); tel:
  // needs the international form.
  const phoneTel = `+212${contact.phone.replace(/^0/, "")}`;
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
        <a href={`tel:${phoneTel}`}>{contact.phone}</a>
      </p>
      <p className="mt-3 text-[15px] text-ink-soft leading-relaxed">
        {ar ? "أو راسلنا على البريد التالي" : "Or leave an email"}
      </p>
      <p className="mt-1 text-[15px]" dir="ltr">
        <a href={`mailto:${contact.email}`} className="underline underline-offset-4">
          {contact.email}
        </a>
      </p>
    </div>
  );
}
