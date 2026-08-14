/**
 * Categories no longer has a page.
 *
 * The tree is built where it is used — inside Manage · Products, under Add,
 * where you can see what you are filing into while you file it. Setting up a
 * new line of work used to be a route change and two screens.
 *
 * This stays as a redirect rather than being deleted: the route was in the
 * console's own nav for months, and a bookmark that 404s is a worse answer
 * than one that lands where the thing moved to.
 */
import { redirect } from "next/navigation";

export default function Categories() {
  redirect("/admin/manage");
}
