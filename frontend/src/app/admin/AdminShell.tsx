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
import { type ReactNode, useEffect, useState } from "react";

import { call, ownerToken, signOut, SIGNED_OUT_EVENT } from "@/lib/console/auth";
import { patchSession, watchAuth } from "@/lib/session";
import { clearAllDrafts } from "@/lib/console/draft";

import { ConfirmProvider } from "./ui/primitives";
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

  /**
   * There is no sign-in form here any more.
   *
   * The console used to carry its own — a second email-and-password page,
   * under its own branding, writing its own token. One shop with two sign-ins
   * is a thing the owner has to remember rather than a thing that helps them:
   * signing in on the storefront did not sign you into the console, and the
   * console could not tell it was already looking at an authenticated owner.
   *
   * Now the storefront's sign-in is the only one, and it sends an owner here
   * on the strength of the role the server returns. Arriving without that
   * role — signed out, or signed in as a shopper — bounces to the same
   * sign-in page every other visitor uses, with `next` so the owner lands
   * where they were headed rather than on the shop wall.
   */
  useEffect(() => {
    let cancelled = false;

    // Supabase renews the access token in the background and the renewed one
    // is what every later request must carry. The storefront mounts this in
    // `Chrome`, which the console deliberately does not render — so without
    // it here the console held the original token until it expired and only
    // recovered on the round trip after a request had already failed.
    const stopWatching = watchAuth();

    const bounce = () => {
      const here = window.location.pathname + window.location.search;
      window.location.replace(`/en/account?next=${encodeURIComponent(here)}`);
    };

    void (async () => {
      if (!ownerToken()) {
        bounce();
        return;
      }
      try {
        // Asked of the server rather than read from the stored copy.
        //
        // The stored `role` is a cache, and it is filled in by one call at
        // sign-in that can fail: if it did, the owner was left with a session
        // saying "not the owner", bounced here to the sign-in page, which saw
        // a live session and sent them to their profile — a loop with no way
        // out but signing out and in again. Asking here heals that, and it
        // also means an owner whose role is taken away loses the console on
        // their next visit rather than keeping a stale yes in local storage.
        const me = await call<{ role?: string | null }>("/auth/me");
        if (cancelled) return;
        if (me.role === "owner") {
          patchSession({ role: me.role });
          setSignedIn(true);
        } else {
          bounce();
        }
      } catch {
        if (!cancelled) bounce();
      }
    })();

    return () => {
      cancelled = true;
      stopWatching();
    };
  }, []);

  // The session died mid-task. The owner is sent back to the one sign-in
  // page; `next` brings them straight back to the screen they were on.
  useEffect(() => {
    const onSignedOut = () => setExpired(true);
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut);
  }, []);

  useEffect(() => {
    if (!expired) return;
    const here = window.location.pathname + window.location.search;
    window.location.replace(`/en/account?next=${encodeURIComponent(here)}`);
  }, [expired]);

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
                    void signOut().finally(() => window.location.replace("/en"));
                  }}
                />
                <main className="console-main">
                  <div className="console-page">{children}</div>
                </main>
              </div>
            </>
          ) : null}
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