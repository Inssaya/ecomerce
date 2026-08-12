"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { CityAutocomplete } from "@/components/CityAutocomplete";
import { useDelivery } from "@/lib/delivery";
import { ApiError, signIn, signUp, useSession } from "@/lib/session";
import { type Lang, isLang, translator } from "@/lib/i18n";

/**
 * The account.
 *
 * Buying still never requires one — checkout takes a guest order and always
 * will. What an account is *for* changed: it used to exist so the concierge
 * knew who it was talking to, and it now also exists so that a returning
 * customer never types their address again. Signing in bought a shopper nothing
 * at the till before this; checkout asked the same five questions of someone
 * the shop already had every answer for, and each of those five is a chance to
 * abandon the order.
 *
 * So sign-up asks for the delivery details once, here, where nobody is halfway
 * through a purchase and a long form costs nothing. Phone and city are asked
 * for; the street is optional, because someone creating an account only to
 * message the workshop should not be made to type one.
 *
 * Somebody already signed in goes to their own page — `/account/profile`, where
 * the same details are shown and editable — rather than to `/contact`, which is
 * where this used to send them for no reason anybody could name.
 */
export default function AccountPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: raw } = use(params);
  const lang = (isLang(raw) ? raw : "en") as Lang;
  const t = translator(lang);
  const ar = lang === "ar";
  const router = useRouter();
  const { session, ready } = useSession();
  const terms = useDelivery(lang);

  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Somebody who is already signed in has no business on a sign-in form.
  useEffect(() => {
    if (ready && session) router.replace(`/${lang}/account/profile`);
  }, [ready, session, router, lang]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (mode === "up" && password !== again) {
      setProblem(ar ? "الكلمتان غير متطابقتين" : "Those two passwords do not match");
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      if (mode === "in") await signIn(email.trim(), password);
      else
        await signUp({
          fullName: name.trim(),
          email: email.trim(),
          password,
          phone: phone.trim(),
          city: city.trim(),
          address: address.trim(),
        });
      router.replace(`/${lang}/account/profile`);
    } catch (error) {
      // The server already says what went wrong — wrong password, an email
      // already registered, a password too short — so show that instead of
      // one generic line that means something different every time.
      setProblem(error instanceof ApiError ? error.message : t("signInFailed"));
    } finally {
      setBusy(false);
    }
  }

  // Nothing at all until the browser has been asked whether there is a session:
  // rendering the sign-in form first and redirecting a frame later is a flash
  // of the wrong page on every visit by somebody already signed in.
  if (!ready || session) return <div className="page pt-16" aria-hidden />;

  const creating = mode === "up";

  return (
    <div className="page pt-14 pb-16">
      <h1 className="text-[26px] font-semibold tracking-tight">
        {creating ? t("signUp") : t("signIn")}
      </h1>
      {creating ? (
        <p className="mt-2 text-[14.5px] leading-relaxed text-ink-soft">{t("signUpLead")}</p>
      ) : null}

      <form onSubmit={submit} className="mt-7 space-y-4">
        {creating ? (
          <Field id="name" label={t("nameLabel")}>
            <input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              autoComplete="name"
              className="field"
            />
          </Field>
        ) : null}

        <Field id="email" label={t("emailLabel")}>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            className="field"
          />
        </Field>

        {creating ? (
          <>
            <Field id="phone" label={t("yourPhone")} hint={t("phoneHint")}>
              <input
                id="phone"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                required
                autoComplete="tel"
                placeholder="0612345678"
                className="field"
              />
            </Field>

            {/* The delivery half of the form, marked off from the credentials
                so it reads as "where your parcels go" rather than as three more
                things standing between a person and an account. */}
            <fieldset className="rounded-2xl border border-sand bg-surface p-4">
              <legend className="px-1 text-[13px] font-medium text-ink-soft">
                {t("whereWeDeliver")}
              </legend>
              <div className="space-y-4">
                <Field id="city" label={t("yourCity")}>
                  <CityAutocomplete
                    id="city"
                    lang={lang}
                    cities={terms?.cities ?? []}
                    value={city}
                    onChange={setCity}
                    required
                  />
                </Field>
                <Field id="address" label={t("yourAddress")}>
                  <input
                    id="address"
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    autoComplete="street-address"
                    className="field"
                  />
                </Field>
              </div>
            </fieldset>
          </>
        ) : null}

        <Field id="password" label={t("passwordLabel")} hint={creating ? t("passwordRule") : undefined}>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
            autoComplete={creating ? "new-password" : "current-password"}
            className="field"
          />
        </Field>

        {creating ? (
          <Field id="again" label={t("newPasswordAgain")}>
            <input
              id="again"
              type="password"
              value={again}
              onChange={(event) => setAgain(event.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="field"
            />
          </Field>
        ) : (
          <p className="text-end text-[13px]">
            <Link
              href={`/${lang}/account/reset`}
              className="text-ink-soft underline underline-offset-4"
            >
              {t("forgotPassword")}
            </Link>
          </p>
        )}

        {problem ? (
          <p role="alert" className="text-[14px] text-warn">
            {problem}
          </p>
        ) : null}

        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? t("loading") : creating ? t("signUp") : t("signIn")}
        </button>
      </form>

      <p className="mt-6 text-center text-[14px] text-ink-soft">
        {creating ? t("haveAccount") : t("needAccount")}{" "}
        <button
          type="button"
          onClick={() => {
            setMode(creating ? "in" : "up");
            setProblem(null);
            setAgain("");
          }}
          className="font-medium text-clay underline underline-offset-4"
        >
          {creating ? t("signIn") : t("signUp")}
        </button>
      </p>

      <p className="mt-8 text-center text-[13px] text-ink-mute">
        {ar
          ? "لست بحاجة إلى حساب للشراء — الدفع نقداً عند التسليم."
          : "You do not need an account to buy — payment is cash on delivery."}{" "}
        <Link href={`/${lang}`} className="underline underline-offset-4">
          {t("browse")}
        </Link>
      </p>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1.5 text-[13px] text-ink-soft">{hint}</p> : null}
    </div>
  );
}
