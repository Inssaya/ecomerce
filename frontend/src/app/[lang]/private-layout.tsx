import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * A page that belongs to one person, not to the shop.
 *
 * Four routes needed exactly this and each carried its own copy: a cart, a
 * checkout, a tracking page and a custom request. None of them is secret —
 * they are reached by an unguessable token or by having filled the form — but
 * every one would be indexed with a name, a phone number and an address in it.
 *
 * Written once so that adding the fifth is one line, and so a change of mind
 * about `nocache` or `nosnippet` happens in one place rather than four.
 */
export function privatePage(title: string): Metadata {
  return {
    title,
    robots: { index: false, follow: false, nocache: true },
  };
}

/** Layouts here exist only to carry the metadata above. */
export function passThrough({ children }: { children: ReactNode }) {
  return children;
}
