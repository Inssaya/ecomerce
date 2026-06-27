"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { register } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "", full_name: "", role: "buyer" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function set(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const tokens = await register(form);
      localStorage.setItem("access_token", tokens.access_token);
      localStorage.setItem("refresh_token", tokens.refresh_token);
      router.push("/");
    } catch (err: unknown) {
      setError((err as Error).message ?? "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-md bg-white/5 border border-white/10 rounded-2xl p-8">
        <Link href="/" className="block text-center mb-8">
          <span
            className="text-3xl font-black"
            style={{
              background: "linear-gradient(90deg, #ff6b35, #7c3aed)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            MoStyle
          </span>
        </Link>

        <h1 className="text-2xl font-bold text-white mb-2">Create account</h1>
        <p className="text-sm text-white/50 mb-6">
          Already have an account?{" "}
          <Link href="/auth/login" className="text-orange-400 hover:underline font-medium">
            Sign in
          </Link>
        </p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Full name</label>
            <input
              type="text"
              required
              value={form.full_name}
              onChange={set("full_name")}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder:text-white/30"
              placeholder="Your full name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={set("email")}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder:text-white/30"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={set("password")}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder:text-white/30"
              placeholder="At least 8 characters"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-orange-500 hover:bg-orange-400 py-2.5 text-sm font-semibold text-white disabled:opacity-50 transition-colors"
          >
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>
      </div>
    </main>
  );
}
