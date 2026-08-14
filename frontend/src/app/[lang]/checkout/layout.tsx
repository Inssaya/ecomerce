import { passThrough, privatePage } from "../private-layout";

/** A form carrying a name, a phone number and an address. */
export const metadata = privatePage("Checkout");

export default passThrough;
