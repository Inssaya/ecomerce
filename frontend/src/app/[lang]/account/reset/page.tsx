"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";

import { api, ApiError } from "@/lib/api";
import { type Lang, isLang, translator } from "@/lib/i18n";

/**
 * Setting a new password.
 *
 * This page existed as a URL before it existed as a page: the API has been
 * sending `/{lang}/account/reset?token=…` in its reset email since the auth
 * module was ported, and clicking it returned a 404. For a shop with exactly
 * one account that matters more than it looks — the owner's password is the
 * only way into the panel, and this was the only way back if they lost it.
 *
 * Two behaviours worth keeping:
 *
 * * **Without a token it is the request form instead.** Someone who lands here
 *   from a bookmark, or whose token has expired, should be able to ask for a
 *   new link rather than meeting a dead end.
 * * **Asking never says whether the address exists.** The server always
 *   answers the same way, and so does this page. Anything else turns the form
 *   into a way to test which addresses are registered.
 */
export default function ResetPassword({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang: raw } = use(params);
  const lang = (isLang(raw) ? raw : "en") as Lang;
  const t = translator(lang);
  const ar = lang === "ar";

  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Read directly rather than through `useSearchParams`, which would force
    // this route out of static rendering for one optional parameter.
    setToken(new URLSearchParams(window.location.search).get("token"));
    setReady(true);
  }, []);

  if (!ready) return <div className="page pt-10" aria-hidden />;

  return (
    <div className="page pt-10 pb-10">
      <h1 className="text-[26px] font-semibold tracking-tight">
        {token ? t("setNewPassword") : t("forgotPassword")}
      </h1>
      {token ? <ChooseNew lang={lang} token={token} /> : <AskForLink lang={lang} />}

      <p className="mt-8 text-[13px] text-ink-soft">
        <Link href={`/${lang}`} className="underline underline-offset-4">
          {ar ? "العودة إلى المتجر" : "Back to the shop"}
        </Link>
      </p>
    </div>
  );
}

function AskForLink({ lang }: { lang: Lang }) {
  const t = translator(lang);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "sending") return;
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    setState("sending");
    // Deliberately not branching on the result. The endpoint answers the same
    // way for a known and an unknown address, and so must this.
    try {
      await api.forgotPassword(lang, email);
    } catch {
      /* rate limited or offline — the message below is still the honest one */
    }
    setState("sent");
  }

  if (state === "sent") {
    return (
      <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">{t("resetSent")}</p>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
      <p className="text-[15px] text-ink-soft leading-relaxed">{t("forgotPasswordLead")}</p>
      <div>
        <label className="label" htmlFor="email">
          {t("yourEmail")}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="field"
        />
      </div>
      <button type="submit" disabled={state === "sending"} className="btn-primary">
        {t("sendResetLink")}
      </button>
    </form>
  );
}

function ChooseNew({ lang, token }: { lang: Lang; token: string }) {
  const t = translator(lang);
  const ar = lang === "ar";
  const [state, setState] = useState<"idle" | "saving" | "done">("idle");
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "saving") return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const again = String(form.get("again") ?? "");

    if (password !== again) {
      setProblem(ar ? "الكلمتان غير متطابقتين" : "Those two do not match");
      return;
    }

    setState("saving");
    setProblem(null);
    try {
      await api.resetPassword(lang, token, password);
      setState("done");
    } catch (error) {
      setProblem(
        error instanceof ApiError ? error.message : t("somethingWentWrong"),
      );
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <div className="mt-5 flex flex-col gap-4 items-start">
        <p className="text-[15px] leading-relaxed">{t("passwordChanged")}</p>
        <Link href="/admin" className="btn-primary">
          {ar ? "ادخل إلى الورشة" : "Go to the workshop"}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
      <div>
        <label className="label" htmlFor="password">
          {t("newPassword")}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="field"
        />
        <p className="mt-1.5 text-[13px] text-ink-soft">{t("passwordRule")}</p>
      </div>
      <div>
        <label className="label" htmlFor="again">
          {t("newPasswordAgain")}
        </label>
        <input
          id="again"
          name="again"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="field"
        />
      </div>

      {problem ? <p className="text-[13px] text-warn">{problem}</p> : null}

      <button type="submit" disabled={state === "saving"} className="btn-primary">
        {t("savePassword")}
      </button>
      {/* Every other session is ended by the server when this succeeds. Saying
          so is reassurance if the reason for the reset was a lost phone. */}
      <p className="text-[12.5px] text-ink-soft">{t("otherSessionsEnded")}</p>
    </form>
  );
}
