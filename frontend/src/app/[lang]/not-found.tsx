import Link from "next/link";

/**
 * The end of a dead link, inside a language.
 *
 * There was only a root `not-found.tsx`, which sits *outside* the `[lang]`
 * layout — the one that renders `<html>` and sets `dir`. Next cannot render a
 * page from outside that layout into the document the layout produced, so a
 * `notFound()` raised on a piece page was recovered on the client instead, and
 * the response that carried it had already gone out as 200. A soft 404 on the
 * page type there are the most of.
 *
 * It also means a person who followed a dead link out of an Arabic page landed
 * on a right-to-left document reading an English sentence with the Arabic
 * bolted on after a slash.
 *
 * Both are fixed by the file existing.
 */
export default async function NotFound() {
  return (
    <div className="page flex min-h-[60dvh] flex-col items-center justify-center gap-5 text-center">
      <p className="text-[17px] text-ink-soft">
        We couldn&apos;t find that. It may have been sold, or made once and never again.
      </p>
      <p className="text-[17px] text-ink-soft" dir="rtl" lang="ar">
        لم نجد ذلك. ربما بيعت القطعة، أو صُنعت مرّة واحدة ولم تتكرّر.
      </p>
      <div className="flex gap-2">
        <Link href="/en/store" className="btn-primary">
          See the shelf
        </Link>
        <Link href="/ar/store" className="btn-quiet">
          شاهد الرف
        </Link>
      </div>
    </div>
  );
}
