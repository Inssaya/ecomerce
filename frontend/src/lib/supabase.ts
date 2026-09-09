"use client";

/**
 * The connection to Supabase, which is where accounts now live.
 *
 * One client for the whole tab. Creating a second would give the shop two
 * independent copies of the same session — each with its own refresh timer,
 * each writing the same storage key — and they would race on renewal.
 *
 * The anon key is meant to be public: it names the project and grants nothing
 * on its own. What a caller may actually do is decided by the token they hold
 * and, for anything belonging to this shop, by the `role` on their row in the
 * shop's own database.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * True only when the shop has been told which project to talk to.
 *
 * Checked rather than assumed because `createClient` throws on an empty URL,
 * and a build that forgot the variable should degrade to "sign-in is
 * unavailable" rather than taking down every page that imports this.
 */
export const supabaseReady = Boolean(url && anonKey);

export const supabase = createClient(url || "http://localhost", anonKey || "public-anon-key", {
  auth: {
    // The session outlives the tab and renews itself, which is what lets an
    // owner close the laptop mid-afternoon and come back to the console.
    persistSession: true,
    autoRefreshToken: true,
    // A password-reset link arrives as a session in the URL fragment, so this
    // has to stay on: with it off the link lands on the reset page with no
    // session and nothing to update. It is a no-op on every page that has no
    // such fragment, which is all of them.
    detectSessionInUrl: true,
  },
});
