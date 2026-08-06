"use client";

export default function ErrorBoundary({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="page pt-24 text-center">
      <p className="text-[17px] text-ink-soft">Something went wrong. / حدث خطأ ما.</p>
      <button type="button" onClick={reset} className="btn-quiet mt-6">
        Try again / أعد المحاولة
      </button>
    </div>
  );
}
