"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";

import { type Lang, isLang, translator } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";

/**
 * Setting a new password.
 *
 * Supabase sends the email and owns the credential, so what arrives here is a
 * recovery *session* in the URL fragment rather than a token in the query
 * string — the client picks it up on load, and the new password is set on the
 * account that session belongs to.
 *
 * Two behaviours worth keeping:
 *
 * * **Without a recovery session it is the request form instead.** Someone who
 *   lands here from a bookmark, or whose link has expired, should be able to
 *   ask for a new one rather than meeting a dead end.
 * * **Asking never says whether the address exists.** Anything else turns the
 *   form into a way to test which addresses are registered.
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

  const [recovering, setRecovering] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // The link lands with the recovery session in the fragment. The client is
    // configured to consume it, so the question here is only whether one
    // turned up — asked after a tick, because that consumption is async.
    let cancelled = false;

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (!cancelled && event === "PASSWORD_RECOVERY") {
        setRecovering(true);
        setReady(true);
      }
    });

    void supabase.auth.getSession().then(({ data: session }) => {
      if (cancelled) return;
      // A fragment means the link was just followed; a bare visit to this page
      // while merely signed in should still show the request form.
      const fromLink = window.location.hash.includes("type=recovery");
      if (fromLink && session.session) setRecovering(true);
      setReady(true);
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  if (!ready) return <div className="page pt-10" aria-hidden />;

  return (
    <div className="page pt-10 pb-10">
      <h1 className="text-[26px] font-semibold tracking-tight">
        {recovering ? t("setNewPassword") : t("forgotPassword")}
      </h1>
      {recovering ? <ChooseNew lang={lang} /> : <AskForLink lang={lang} />}

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
    // Deliberately not branching on the result. Supabase answers the same way
    // for a known and an unknown address, and so must this.
    try {
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/${lang}/account/reset`,
      });
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
          {t("email")}
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

function ChooseNew({ lang }: { lang: Lang }) {
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
      // The recovery link signed this browser in, so the account to change is
      // simply the one holding the session.
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error(error.message);
      await supabase.auth.signOut();
      setState("done");
    } catch (error) {
      setProblem(error instanceof Error ? error.message : t("somethingWentWrong"));
      setState("idle");
    }
  }

  if (state === "done") {
    // This form is shared by the storefront's sign-in page and the admin
    // login screen — the emailed link carries no hint of which one asked for
    // it, so the way back has to work for a customer too. It used to point
    // straight at `/admin`, which is a dead end for anyone but the owner.
    return (
      <div className="mt-5 flex flex-col gap-4 items-start">
        <p className="text-[15px] leading-relaxed">{t("passwordChanged")}</p>
        <Link href={`/${lang}/account`} className="btn-primary">
          {t("signIn")}
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
