"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";

import { CityAutocomplete } from "@/components/CityAutocomplete";
import { ApiError, api, type CategoryNode } from "@/lib/api";
import { useDelivery } from "@/lib/delivery";
import { useSession } from "@/lib/session";
import { type Lang, isLang } from "@/lib/i18n";

/**
 * Custom orders.
 *
 * The form and nothing else. It used to open with a headline and a strapline
 * saying what the page was, and close with a three-step "what happens next"
 * panel — a screen and a half of reassurance wrapped around the one control
 * that does anything. Both are gone: somebody who clicked "Custom" already
 * knows what this page is for, and the promise that nothing is owed until they
 * agree a price is worth one line under the button, not a column beside it.
 *
 * What was actually broken, beyond the copy:
 *
 * * **The attachments were fiction.** Files were read into browser memory and
 *   their *filenames* pasted into the description. The workshop got the text
 *   "Files: IMG_4471.jpg" and no picture, and the customer believed they had
 *   sent one. They now upload to `/requests/references` as they are chosen, and
 *   the URLs go on the request where `CustomRequest.references` has always
 *   expected them.
 * * **The page was English only.** Every string was hardcoded, on a site whose
 *   other half is Arabic, so an Arabic visitor met an English form.
 * * **The category chips were hardcoded**, under a comment claiming they were
 *   read from the API. They are now the shop's real lines of work, and the one
 *   the customer picks is sent as `category_id` — which is the whole point of
 *   that column: twenty wordings for "a lamp" become one countable number.
 * * **Every label was `sr-only`, with the placeholder standing in for it.** A
 *   placeholder disappears the moment you type, so a half-filled form is a
 *   column of anonymous boxes.
 * * The "preferred contact" pair was two pills, one of them a sentence long,
 *   which wrapped into a mess at every width under a laptop.
 *
 * Email is required alongside the phone. It was marked optional and the copy
 * said so, but a quote is a document — a price, a date, a mockup to approve —
 * and sending that to a phone number alone is how a custom order stalls.
 */
export default function AskPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: raw } = use(params);
  const lang = (isLang(raw) ? raw : "en") as Lang;
  const ar = lang === "ar";
  const router = useRouter();
  const { session } = useSession();
  const terms = useDelivery(lang);
  const filePicker = useRef<HTMLInputElement>(null);

  const [lines, setLines] = useState<CategoryNode[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(0);
  const [contactBy, setContactBy] = useState<"whatsapp" | "phone">("whatsapp");
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // The shop's real lines of work. A list written into this file goes stale the
  // first time the owner adds one in the panel.
  useEffect(() => {
    api
      .categories(lang)
      .then(setLines)
      .catch(() => undefined);
  }, [lang]);

  // Whatever the account already knows. Somebody signed in should not retype
  // their own name to ask a question.
  useEffect(() => {
    if (!session) return;
    setName((current) => current || session.name || "");
    setEmail((current) => current || session.email || "");
    setPhone((current) => current || session.phone || "");
    setCity((current) => current || session.city || "");
  }, [session]);

  const MAX_PHOTOS = 6;

  async function addPhotos(list: FileList | null) {
    if (!list?.length) return;
    const room = MAX_PHOTOS - photos.length;
    const chosen = Array.from(list).slice(0, Math.max(room, 0));
    if (chosen.length === 0) return;

    setProblem(null);
    setUploading((n) => n + chosen.length);
    for (const file of chosen) {
      try {
        const { url } = await api.uploadReference(lang, file);
        setPhotos((current) => [...current, url]);
      } catch (error) {
        // Named, not silent: a photo that vanished without a word is a brief
        // the customer thinks they sent.
        setProblem(
          error instanceof ApiError
            ? `${file.name}: ${error.message}`
            : ar
              ? `تعذّر رفع ${file.name}`
              : `Could not upload ${file.name}`,
        );
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending || uploading > 0) return;
    setSending(true);
    setProblem(null);

    try {
      const created = await api.ask(lang, {
        full_name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        city: city.trim() || null,
        // How they would rather be reached is a real instruction, and there is
        // no column for it — so it goes where the workshop will read it, at the
        // end of the brief, in the customer's own language.
        description: `${description.trim()}\n\n${
          contactBy === "whatsapp"
            ? ar
              ? "يفضّل التواصل عبر واتساب."
              : "Prefers WhatsApp."
            : ar
              ? "يفضّل مكالمة هاتفية."
              : "Prefers a phone call."
        }`,
        category_id: category,
        references: photos,
        lang,
      });
      router.replace(`/${lang}/request/${created.tracking_token}`);
    } catch (error) {
      setProblem(
        error instanceof ApiError
          ? error.message
          : ar
            ? "حدث خطأ ما."
            : "Something went wrong.",
      );
      setSending(false);
    }
  }

  const busy = sending || uploading > 0;

  return (
    <form onSubmit={submit} className="page-wide max-w-[720px] pt-8 pb-16">
      {/* What it is. One field, big, at the top — the page opens on the thing
          the visitor came to do. */}
      <label htmlFor="description" className="label">
        {ar ? "ما الذي تريد صنعه؟" : "What do you want made?"}
      </label>
      <textarea
        id="description"
        rows={5}
        required
        minLength={10}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder={
          ar
            ? "مثلاً: ٢٠ كوباً مطبوعاً بشعار شركة، أو ٣٠ تيشيرت أسود، أو قطعة ثلاثية الأبعاد بمقاس معيّن…"
            : "e.g. 20 mugs printed with a company logo, 30 black tees, or a 3D printed part to a measurement…"
        }
        className="field resize-none text-[16px] leading-relaxed"
      />
      <p className="mt-1.5 text-[13px] text-ink-soft">
        {ar
          ? "المقاس، اللون، المادة، الكمية، ولأي غرض — كل ما تعرفه."
          : "Size, colour, material, how many, what it is for — whatever you know."}
      </p>

      {/* The line of work, from the shop's own tree. One tap here is what turns
          twenty wordings for the same thing into a number the workshop can act
          on. Optional — a required field is a request that never gets sent. */}
      {lines.length > 0 ? (
        <fieldset className="mt-6">
          <legend className="label">{ar ? "من أي نوع؟" : "What kind of thing?"}</legend>
          <div className="flex flex-wrap gap-2">
            {lines.map((line) => {
              const picked = category === line.id;
              return (
                <button
                  key={line.id}
                  type="button"
                  onClick={() => setCategory(picked ? null : line.id)}
                  aria-pressed={picked}
                  className={`h-10 rounded-full border px-4 text-[14px] font-medium transition-colors duration-150 ${
                    picked
                      ? "border-ink bg-ink text-white"
                      : "border-sand bg-surface text-ink-soft hover:border-ink hover:text-ink"
                  }`}
                >
                  {line.name}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {/* Photos. Real ones, stored on the way in. */}
      <div className="mt-6">
        <span className="label">
          {ar ? "صورة أو رسم (اختياري)" : "A photo or a sketch (optional)"}
        </span>
        <div className="flex flex-wrap gap-2.5">
          {photos.map((url) => (
            <div
              key={url}
              className="relative h-24 w-24 overflow-hidden rounded-2xl border border-sand bg-clay-soft"
            >
              <Image src={url} alt="" fill sizes="96px" className="object-cover" unoptimized />
              <button
                type="button"
                onClick={() => setPhotos((current) => current.filter((one) => one !== url))}
                aria-label={ar ? "احذف الصورة" : "Remove photo"}
                className="absolute end-1 top-1 flex h-7 w-7 items-center justify-center rounded-full
                           bg-ink/75 text-[15px] leading-none text-white backdrop-blur-sm"
              >
                ×
              </button>
            </div>
          ))}

          {uploading > 0
            ? Array.from({ length: uploading }).map((_, index) => (
                <div
                  key={`pending-${index}`}
                  className="h-24 w-24 animate-pulse rounded-2xl border border-sand bg-clay-soft"
                  aria-hidden
                />
              ))
            : null}

          {photos.length + uploading < MAX_PHOTOS ? (
            <button
              type="button"
              onClick={() => filePicker.current?.click()}
              className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-2xl
                         border border-dashed border-sand bg-surface text-[12.5px] text-ink-soft
                         transition-colors duration-150 hover:border-ink hover:text-ink"
            >
              <span aria-hidden className="text-[20px] leading-none">
                +
              </span>
              {ar ? "أضف" : "Add"}
            </button>
          ) : null}
        </div>
        <input
          ref={filePicker}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(event) => {
            void addPhotos(event.target.files);
            // Cleared so choosing the same file twice in a row still fires.
            event.target.value = "";
          }}
          className="hidden"
        />
      </div>

      {/* Who you are. Both ways of reaching you are required: the phone is how
          the workshop asks a question, the email is where a quote and a mockup
          go — and a mockup sent to a phone number is a custom order that
          stalls. */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="full_name" className="label">
            {ar ? "اسمك" : "Your name"}
          </label>
          <input
            id="full_name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            autoComplete="name"
            className="field"
          />
        </div>
        <div>
          <label htmlFor="phone" className="label">
            {ar ? "رقم الهاتف" : "Phone number"}
          </label>
          <input
            id="phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            required
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0612345678"
            className="field"
          />
        </div>
        <div>
          <label htmlFor="email" className="label">
            {ar ? "البريد الإلكتروني" : "Email"}
          </label>
          <input
            id="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            autoComplete="email"
            className="field"
          />
          <p className="mt-1.5 text-[13px] text-ink-soft">
            {ar ? "نرسل الثمن والنموذج إلى هنا." : "The price and the mockup go here."}
          </p>
        </div>
        <div>
          <label htmlFor="city" className="label">
            {ar ? "المدينة (اختياري)" : "City (optional)"}
          </label>
          <CityAutocomplete
            id="city"
            lang={lang}
            cities={terms?.cities ?? []}
            value={city}
            onChange={setCity}
          />
        </div>
      </div>

      {/* Two words each, so it stays one row on the narrowest phone. */}
      <fieldset className="mt-6">
        <legend className="label">{ar ? "كيف نتواصل معك؟" : "How should we reach you?"}</legend>
        <div className="inline-flex rounded-full border border-sand bg-surface p-1">
          {(["whatsapp", "phone"] as const).map((how) => (
            <button
              key={how}
              type="button"
              onClick={() => setContactBy(how)}
              aria-pressed={contactBy === how}
              className={`h-9 rounded-full px-4 text-[14px] font-medium transition-colors duration-150 ${
                contactBy === how ? "bg-ink text-white" : "text-ink-soft hover:text-ink"
              }`}
            >
              {how === "whatsapp" ? "WhatsApp" : ar ? "مكالمة" : "A call"}
            </button>
          ))}
        </div>
      </fieldset>

      {problem ? (
        <p role="alert" aria-live="assertive" className="mt-6 text-[14px] text-warn">
          {problem}
        </p>
      ) : null}

      <button type="submit" disabled={busy} className="btn-primary mt-7 h-[52px] w-full sm:w-auto">
        {sending
          ? ar
            ? "جارٍ الإرسال…"
            : "Sending…"
          : uploading > 0
            ? ar
              ? "جارٍ رفع الصور…"
              : "Uploading photos…"
            : ar
              ? "أرسل الطلب"
              : "Send it"}
      </button>
      <p className="mt-3 text-[13px] text-ink-soft">
        {ar
          ? "مجاني، ولا شيء عليك حتى تتّفق على الثمن."
          : "Free, and nothing is owed until you agree a price."}
      </p>
    </form>
  );
}
