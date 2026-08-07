import { passThrough, privatePage } from "../private-layout";

/** Someone's own request and the price we sent them. */
export const metadata = privatePage("Your request");

export default passThrough;
