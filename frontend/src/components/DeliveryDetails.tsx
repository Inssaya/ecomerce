"use client";

import { useEffect, useState } from "react";

import { CityAutocomplete } from "@/components/CityAutocomplete";
import { useDelivery } from "@/lib/delivery";
import { saveProfile, useSession } from "@/lib/session";
import { type Lang, translator } from "@/lib/i18n";

/**
 * Where the shop will send your parcels, and the one screen that can change it.
 *
 * The same three answers checkout needs, so correcting a wrong street here
 * corrects it for every future order instead of for one. It sits on the profile
 * rather than only inside checkout because a person who notices a mistake
 * notices it when they are *not* buying, and the only place they think to look
 * is their own account page.
 *
 * Read-only until asked. A profile that opens as a form invites an edit nobody
 * came to make, and a half-typed address saved by accident is a parcel that
 * goes to the wrong door.
 */
export function DeliveryDetails({ lang }: { lang: Lang }) {
  const t = translator(lang);
  const ar = lang === "ar";
  const { session } = useSession();
  const terms = useDelivery(lang);

  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  // Filled from the session each time the editor opens, not held across it:
  // reopening must show what is stored now, not what was typed and abandoned.
  useEffect(() => {
    if (!editing || !session) return;
    setPhone(session.phone ?? "");
    setCity(session.city ?? "");
    setAddress(session.address ?? "");
  }, [editing, session]);

  if (!session) return null;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    await saveProfile({
      phone: phone.trim(),
      city: city.trim(),
      address_line1: address.trim(),
    });
    setBusy(false);
    setEditing(false);
    setSaved(true);
  }

  return (
    <section className="rounded-2xl border border-sand bg-surface p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">{t("whereWeDeliver")}</h2>
        {editing ? null : (
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              setSaved(false);
            }}
            className="text-[13px] text-clay underline underline-offset-4"
          >
            {t("editDetails")}
          </button>
        )}
      </div>

      {editing ? (
        <form onSubmit={save} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="p-phone" className="label">
              {t("yourPhone")}
            </label>
            <input
              id="p-phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              autoComplete="tel"
              className="field"
            />
          </div>
          <div>
            <label htmlFor="p-city" className="label">
              {t("yourCity")}
            </label>
            <CityAutocomplete
              id="p-city"
              lang={lang}
              cities={terms?.cities ?? []}
              value={city}
              onChange={setCity}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="p-address" className="label">
              {t("yourAddress")}
            </label>
            <input
              id="p-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              autoComplete="street-address"
              className="field"
            />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? t("loading") : t("saveDetails")}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="btn-quiet">
              {ar ? "إلغاء" : "Cancel"}
            </button>
          </div>
        </form>
      ) : (
        <dl className="mt-4 grid gap-2.5 text-[14.5px] sm:grid-cols-3">
          <Line label={t("yourPhone")} value={session.phone} />
          <Line label={t("yourCity")} value={session.city} />
          <Line label={t("yourAddress")} value={session.address} />
        </dl>
      )}

      {!editing && !session.address ? (
        <p className="mt-3 text-[13px] text-ink-mute">{t("addressMissing")}</p>
      ) : null}
      {saved ? (
        <p role="status" className="mt-3 text-[13px] text-clay">
          {t("detailsSaved")}
        </p>
      ) : null}
    </section>
  );
}

function Line({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12.5px] text-ink-soft">{label}</dt>
      <dd className={`mt-0.5 truncate ${value ? "" : "text-ink-mute"}`}>{value || "—"}</dd>
    </div>
  );
}
