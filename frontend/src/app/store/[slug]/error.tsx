"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export default function StoreError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <AlertTriangle className="w-12 h-12 text-orange-500 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-white mb-2">Store unavailable</h1>
        <p className="text-white/50 mb-6 text-sm">
          {error.message || "This store could not be loaded right now."}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-5 py-2.5 bg-orange-500 hover:bg-orange-400 text-white rounded-xl font-semibold transition-colors text-sm"
          >
            Try again
          </button>
          <Link
            href="/"
            className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-semibold transition-colors text-sm"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
