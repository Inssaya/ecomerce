import { passThrough, privatePage } from "../private-layout";

/** Someone's own cart. */
export const metadata = privatePage("Your cart");

export default passThrough;
