/**
 * The fallback shown only if `/api/settings/contact` cannot be reached.
 *
 * The owner edits the real values from the console; this exists so a blocked
 * visitor or a page rendered while the API is briefly down still sees *a* way
 * to reach the shop, rather than a blank field. Do not read this directly for
 * anything a visitor sees in the normal path — fetch the live value with
 * `lib/server.ts`'s `contact()` (server components) or `api.contact()`
 * (client components) instead.
 */
export const FALLBACK_CONTACT = {
  email: "workshop@mostyle.ma",
  phone: "0623842535",
};
