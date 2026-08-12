"use client";

/**
 * The shell: five doors and the page beneath them.
 *
 * Aptiv's whole admin is four dock items covering eight areas, and it stays
 * simple because a door can carry two faces and one door holds everything
 * administrative. This is the same shape, one door wider: Board · Orders ·
 * Assistant · Manage · Logs. Sections inside them are real routes —
 * deep-linkable — they just are not doors.
 *
 * Nav adapts rather than picking a side: a labelled rail on a laptop, an
 * icon rail on a tablet, a bottom bar on a phone. On a phone the row is now
 * five doors plus "More" — the row still flexes to fit, same as it did at
 * four; see the `.console-nav-item { flex: 1 }` rule in console.css.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { ownerToken, signIn, signOut, SIGNED_OUT_EVENT } from "@/lib/console/auth";
import { clearAllDrafts } from "@/lib/console/draft";

import { Button, ConfirmProvider, Field } from "./ui/primitives";
import { Icon, type IconName } from "./ui/icons";
import { ConsoleThemeProvider, useConsoleTheme } from "./ui/theme";

const DOORS: { href: string; label: string; icon: IconName; owns: string[] }[] = [
  { href: "/admin", label: "Board", icon: "board", owns: ["/admin", "/admin/make"] },
  { href: "/admin/orders", label: "Orders", icon: "orders", owns: ["/admin/orders"] },
  { href: "/admin/assistant", label: "Assistant", icon: "assistant", owns: ["/admin/assistant"] },
  { href: "/admin/manage", label: "Manage", icon: "manage", owns: ["/admin/manage"] },
  { href: "/admin/logs", label: "Logs", icon: "shield", owns: ["/admin/logs"] },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => setSignedIn(Boolean(ownerToken())), []);

  // The session died mid-task. Overlay sign-in; do not unmount the page.
  useEffect(() => {
    const onSignedOut = () => setExpired(true);
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut);
  }, []);

  return (
    <ConsoleThemeProvider>
      <ConsoleRoot>
        <ConfirmProvider>
          {signedIn === null ? null : signedIn ? (
            <>
              <div className="console-shell">
                <Rail
                  onSignOut={() => {
                    clearAllDrafts();
                    setSignedIn(false);
                    void signOut();
                  }}
                />
                <main className="console-main">
                  <div className="console-page">{children}</div>
                </main>
              </div>
              {expired ? <SignIn resuming onDone={() => setExpired(false)} /> : null}
            </>
          ) : (
            <SignIn onDone={() => setSignedIn(true)} />
          )}
        </ConfirmProvider>
      </ConsoleRoot>
    </ConsoleThemeProvider>
  );
}

function ConsoleRoot({ children }: { children: ReactNode }) {
  const { theme } = useConsoleTheme();
  return (
    <div className="console" data-console-theme={theme}>
      {children}
    </div>
  );
}

function Wordmark() {
  return (
    <span className="console-wordmark">
      <span>M-STYLE</span>
      <span className="dot" aria-hidden />
    </span>
  );
}

function Rail({ onSignOut }: { onSignOut: () => void }) {
  const pathname = usePathname() ?? "";
  const { theme, toggle } = useConsoleTheme();
  const [moreOpen, setMoreOpen] = useState(false);

  // Moving between doors should never leave a menu hanging open behind you.
  useEffect(() => setMoreOpen(false), [pathname]);

  const isActive = (door: (typeof DOORS)[number]) =>
    door.owns.some((path) => (path === "/admin" ? pathname === "/admin" || pathname === "/admin/make" : pathname.startsWith(path)));

  return (
    <nav className="console-rail" aria-label="Console">
      <div className="console-rail-brand">
        <Wordmark />
      </div>

      {DOORS.map((door) => {
        const active = isActive(door);
        return (
          <Link key={door.href} href={door.href} className={`console-nav-item${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
            <Icon name={door.icon} size={19} />
            <span className="console-nav-label">{door.label}</span>
          </Link>
        );
      })}

      {/* On a phone these two fold behind "More", so the bar stays at five
          targets and no label has to wrap. On wider screens they are just
          two more rows at the bottom of the rail. */}
      <div className="console-rail-foot">
        <button
          type="button"
          onClick={() => setMoreOpen((was) => !was)}
          className={`console-nav-item console-rail-more${moreOpen ? " active" : ""}`}
          aria-expanded={moreOpen}
          aria-label="More"
        >
          <Icon name="manage" size={19} />
          <span className="console-nav-label">More</span>
        </button>

        <div className={`console-rail-utils${moreOpen ? " open" : ""}`}>
          <button type="button" onClick={toggle} className="console-nav-item" aria-label={theme === "light" ? "Switch to dark" : "Switch to light"}>
            <Icon name={theme === "light" ? "moon" : "sun"} size={19} />
            <span className="console-nav-label">{theme === "light" ? "Dark" : "Light"}</span>
          </button>
          <button type="button" onClick={onSignOut} className="console-nav-item" aria-label="Sign out">
            <Icon name="logout" size={19} />
            <span className="console-nav-label">Sign out</span>
          </button>
        </div>
      </div>
    </nav>
  );
}

/**
 * Sign in. `resuming` is the session-expired case: the page is still live
 * underneath, so this says so and hands the owner back exactly where they
 * were rather than pretending they just arrived.
 */
function SignIn({ onDone, resuming }: { onDone: () => void; resuming?: boolean }) {
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  const submit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (busy) return;
      setBusy(true);
      setProblem(null);
      const form = new FormData(event.currentTarget);
      try {
        await signIn(String(form.get("email")), String(form.get("password")));
        onDone();
      } catch (failure) {
        // A wrong password and an unreachable server are different problems
        // and deserve different sentences.
        const message = failure instanceof Error ? failure.message : "";
        setProblem(message.includes("fetch") || message.includes("network") ? "Can't reach the shop. Check the connection and try again." : message || "Sign in failed");
        setBusy(false);
      }
    },
    [busy, onDone],
  );

  const form = (
    <form onSubmit={submit} className="console-signin-box">
      {resuming ? (
        <p className="console-note brand">
          Your session expired. Sign in and you&apos;ll land back exactly where you were — nothing you typed has been lost.
        </p>
      ) : null}

      <Field label="Email" htmlFor="console-email">
        <input ref={emailRef} id="console-email" name="email" type="email" required autoComplete="email" placeholder="you@mostyle.ma" />
      </Field>

      <Field label="Password" htmlFor="console-password">
        <div className="console-row" style={{ gap: 8, flexWrap: "nowrap" }}>
          <input id="console-password" name="password" type={showPassword ? "text" : "password"} required autoComplete="current-password" />
          <Button
            iconOnly
            icon={showPassword ? "eye-off" : "eye"}
            onClick={() => setShowPassword((was) => !was)}
            aria-label={showPassword ? "Hide password" : "Show password"}
          />
        </div>
      </Field>

      {problem ? (
        <p className="console-error" role="alert">
          {problem}
        </p>
      ) : null}

      <Button type="submit" variant="primary" block disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </Button>

      <p className="console-muted" style={{ textAlign: "center" }}>
        <Link href="/en/account/reset" style={{ textDecoration: "underline", textUnderlineOffset: 4 }}>
          Forgotten your password?
        </Link>
      </p>
    </form>
  );

  // Expired mid-task: a modal over the live page, so nothing unmounts.
  if (resuming) {
    return (
      <div className="console-modal-wrap">
        <div className="console-modal" role="dialog" aria-modal="true" aria-label="Session expired">
          {form}
        </div>
      </div>
    );
  }

  return (
    <div className="console-signin">
      <div className="console-signin-hero">
        <Wordmark />
        <h1 className="console-signin-headline">
          The workshop, <em>read at a glance.</em>
        </h1>
        <p className="console-muted" style={{ maxWidth: "38ch" }}>
          Orders, what to make next, the catalogue and the shop&apos;s own numbers — one console.
        </p>
      </div>
      <div className="console-signin-panel">{form}</div>
    </div>
  );
}
