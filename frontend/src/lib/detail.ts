/**
 * What the server said went wrong, in words a person can act on.
 *
 * FastAPI answers a refusal two different ways: a plain `detail` string for a
 * deliberate one — "Add at least one photo of the piece before publishing it" —
 * and a *list* of objects when a schema rejects the body. Both need reading,
 * and the first message of the list is the useful one.
 *
 * This lives on its own because it was written twice, once in each client, and
 * the two copies had already begun to diverge in what they said when the body
 * was not JSON at all. There is exactly one behaviour here and it should have
 * exactly one definition: the sentence the server wrote, or failing that, the
 * status, which at least says whether it was us or them.
 */
export async function problemFrom(response: Response): Promise<string> {
  try {
    const body = await response.json();
    const detail = Array.isArray(body?.detail) ? body.detail[0]?.msg : body?.detail;
    if (typeof detail === "string" && detail) return detail;
  } catch {
    /* not JSON — the status is all there is */
  }
  return `Request failed (${response.status})`;
}
