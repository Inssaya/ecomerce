/**
 * Sending a photograph to storage, without sending it through the shop.
 *
 * The browser used to POST the file to the API, which held all twelve
 * megabytes of it in memory, checked it, and wrote it on to storage. That
 * works on a server we run and is impossible on a serverless host, where the
 * request body is capped well below what a product photograph weighs.
 *
 * So it goes in three steps: ask the API for permission, write the bytes
 * straight to the bucket, hand the API the name. The signature the API returns
 * is bound to that one name, one method and a few minutes, so it cannot be
 * pointed at anything else.
 *
 * The shop still decides whether the file is acceptable — it reads the first
 * bytes back out of storage when the name is handed over, and deletes what is
 * not an image. Nothing here is trusted, which is why none of these checks
 * pretend to be security: they exist to fail early, on the phone, before a
 * slow upload that was never going to be accepted.
 */

/** What the browser is allowed to offer. The server decides what it really is. */
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"] as const;
export type UploadType = (typeof ACCEPTED)[number];

export const ACCEPT_ATTRIBUTE = ACCEPTED.join(",");

export type Purpose = "product" | "reference" | "avatar" | "category";

interface Signed {
  put_url: string;
  key: string;
  max_bytes: number;
}

export class UploadFailed extends Error {}

function readableType(file: File): UploadType {
  const type = file.type.toLowerCase();
  if ((ACCEPTED as readonly string[]).includes(type)) return type as UploadType;
  // A phone occasionally offers `image/jpg`, which is not a real media type.
  if (type === "image/jpg") return "image/jpeg";
  throw new UploadFailed("Photos must be JPEG, PNG or WebP");
}

/**
 * @param sign  How to ask for a signature — the two sides of the shop
 *              authenticate differently, so each passes its own caller rather
 *              than this module reaching for a token it should not know about.
 */
export async function uploadToStorage(
  file: File,
  purpose: Purpose,
  sign: (body: { purpose: Purpose; content_type: UploadType }) => Promise<Signed>,
): Promise<string> {
  const contentType = readableType(file);
  const signed = await sign({ purpose, content_type: contentType });

  // Checked here only to fail in a tenth of a second instead of after a long
  // upload on mobile data. The server enforces the same ceiling afterwards,
  // because a signature carries no size of its own.
  if (file.size > signed.max_bytes) {
    throw new UploadFailed(`That photo is larger than ${Math.round(signed.max_bytes / 1024 / 1024)} MB`);
  }

  const response = await fetch(signed.put_url, {
    method: "PUT",
    body: file,
    headers: { "content-type": contentType },
  });
  if (!response.ok) {
    throw new UploadFailed("That photo could not be uploaded. Check your connection.");
  }
  return signed.key;
}
