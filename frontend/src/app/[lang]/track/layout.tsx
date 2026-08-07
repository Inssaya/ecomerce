import { passThrough, privatePage } from "../private-layout";

/** Reached by an unguessable token, which is what lets it work without a login — and exactly why it must never be listed. */
export const metadata = privatePage("Your order");

export default passThrough;
