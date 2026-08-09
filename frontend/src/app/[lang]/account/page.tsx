"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { signIn, signOut, signUp, useSession } from "@/lib/session";
import { type Lang, isLang, translator } from "@/lib/i18n";

/**
 * Signing in.
 *
 * Deliberately not on the way to buying anything: checkout takes a name, a
 * phone and an address and never asks for this. An account exists so the
 * concierge knows who it is talking to, which is what keeps an AI bill off
 * every idle visitor.
 */
export default function AccountPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: raw } = use(params);
  const lang = (isLang(raw) ? raw : "en") as Lang;
  const t = translator(lang);
  const ar = lang === "ar";
  const router = useRouter();
  const { session, ready } = useSession();

  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // Somebody who is already signed in has no business on a sign-in form.
  useEffect(() => {
    if (ready && session) router.replace(`/${lang}/contact`);
  }, [ready, session, router, lang]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      if (mode === "in") await signIn(email.trim(), password);
      else await signUp(name.trim(), email.trim(), password);
      router.replace(`/${lang}/contact`);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (ready && session) {
    return (
      <div className="page pt-16 text-center">
        <p className="text-[16px]">{session.email}</p>
        <button type="button" onClick={signOut} className="btn-quiet mt-5">
          {t("signOut")}
        </button>
      </div>
    );
  }

  return (
    <div className="page pt-14 pb-16">
      <h1 className="text-[26px] font-semibold tracking-tight">
        {mode === "in" ? t("signIn") : t("signUp")}
      </h1>

      <form onSubmit={submit} className="mt-7 space-y-4">
        {mode === "up" ? (
          <div>
            <label htmlFor="name" className="label">
              {t("nameLabel")}
            </label>
            <input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              autoComplete="name"
              className="field"
            />
          </div>
        ) : null}

        <div>
          <label htmlFor="email" className="label">
            {t("emailLabel")}
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            className="field"
          />
        </div>

        <div>
          <label htmlFor="password" className="label">
            {t("passwordLabel")}
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            className="field"
          />
        </div>

        {failed ? (
          <p role="alert" className="text-[14px] text-warn">
            {t("signInFailed")}
          </p>
        ) : null}

        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? t("loading") : mode === "in" ? t("signIn") : t("signUp")}
        </button>
      </form>

      <p className="mt-6 text-center text-[14px] text-ink-soft">
        {mode === "in" ? t("needAccount") : t("haveAccount")}{" "}
        <button
          type="button"
          onClick={() => {
            setMode(mode === "in" ? "up" : "in");
            setFailed(false);
          }}
          className="font-medium text-clay underline underline-offset-4"
        >
          {mode === "in" ? t("signUp") : t("signIn")}
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
