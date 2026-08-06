import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="text-[17px] text-ink-soft">We couldn&apos;t find that. / لم نجد ذلك.</p>
      <Link href="/en" className="btn-quiet">
        MoStyle
      </Link>
    </div>
  );
}
