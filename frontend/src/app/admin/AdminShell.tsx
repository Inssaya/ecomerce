"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

import { ownerToken, signIn, signOut } from "@/lib/admin/session";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/management", label: "Management" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/assistant", label: "AI Assistant" },
] as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => setSignedIn(Boolean(ownerToken())), []);

  if (signedIn === null) return <div className="page-wide pt-10" aria-hidden />;
  if (!signedIn) return <SignIn onDone={() => setSignedIn(true)} />;

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar onSignOut={() => setSignedIn(false)} />
      <main className="flex-1 min-w-0 px-5 py-6 lg:px-10 lg:py-8">{children}</main>
    </div>
  );
}

function Sidebar({ onSignOut }: { onSignOut: () => void }) {
  const pathname = usePathname();

  return (
    <aside className="shrink-0 border-b border-sand px-5 py-4 lg:w-56 lg:border-b-0 lg:border-e lg:px-4 lg:py-6">
      <div className="flex items-center justify-between lg:block">
        <p className="stamp text-[18px] font-semibold">The workshop</p>
        <button
          type="button"
          onClick={() => {
            // Sign out of this device immediately, and revoke the session on
            // the server on the way — clearing storage alone leaves a refresh
            // token that stays good for a month.
            onSignOut();
            void signOut();
          }}
          className="tap text-[13px] text-ink-soft lg:mt-4"
        >
          Sign out
        </button>
      </div>
      <nav className="mt-4 flex gap-1 overflow-x-auto lg:mt-6 lg:flex-col lg:overflow-visible">
        {NAV.map((item) => {
          const active = item.href === "/admin" ? pathname === "/admin" : pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`tap shrink-0 rounded-xl px-3 py-2 text-[14px] font-medium transition-colors duration-gentle ${
                active ? "bg-clay text-white" : "text-ink hover:bg-clay-soft"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

function SignIn({ onDone }: { onDone: () => void }) {
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    const form = new FormData(event.currentTarget);
    try {
      await signIn(String(form.get("email")), String(form.get("password")));
      onDone();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Sign in failed");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="page pt-16">
      <h1 className="text-[24px] font-semibold">The workshop</h1>
      <div className="mt-6 space-y-4">
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@mostyle.ma"
          className="field"
        />
        <input name="password" type="password" required autoComplete="current-password" className="field" />
      </div>
      {problem ? (
        <p role="alert" className="mt-4 text-[15px] text-warn">
          {problem}
        </p>
      ) : null}
      <button type="submit" disabled={busy} className="btn-primary w-full mt-6">
        Sign in
      </button>
      <p className="mt-5 text-center text-[13px]">
        <Link href="/en/account/reset" className="text-ink-soft underline underline-offset-4">
          Forgotten your password?
        </Link>
      </p>
    </form>
  );
}
