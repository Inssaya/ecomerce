"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";

interface Summary {
  total_orders: number;
  total_gross_mad: number;
  total_commission_mad: number;
  total_net_mad: number;
  payout_balance_mad: number;
  commission_rate: number;
}

interface LedgerEntry {
  id: string;
  order_id: string;
  gross_amount: number;
  commission_rate: number;
  commission_amount: number;
  net_amount: number;
  settled: boolean;
  created_at: string;
}

interface PayoutRecord {
  id: string;
  amount: number;
  note: string | null;
  created_at: string;
}

const PAGE_SIZE = 20;

export default function SellerEarningsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [payoutNote, setPayoutNote] = useState("");
  const [payoutAmount, setPayoutAmount] = useState("");
  const [paying, setPaying] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  function headers() {
    const token = localStorage.getItem("access_token");
    return { Authorization: `Bearer ${token}` };
  }

  async function load() {
    const token = localStorage.getItem("access_token");
    if (!token) { window.location.href = "/auth/login"; return; }
    setLoading(true);
    try {
      const [s, l, p] = await Promise.all([
        fetch("/api/v1/seller/analytics/summary", { headers: headers() }).then((r) => r.json()),
        fetch(`/api/v1/seller/analytics/ledger?page=${page}&size=${PAGE_SIZE}`, { headers: headers() }).then((r) => r.json()),
        fetch("/api/v1/seller/analytics/payouts?size=5", { headers: headers() }).then((r) => r.json()),
      ]);
      setSummary(s);
      const items = Array.isArray(l) ? l : [];
      setLedger(items);
      setHasMore(items.length === PAGE_SIZE);
      setPayouts(Array.isArray(p) ? p : []);
    } catch {
      setError("Failed to load earnings data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handlePayout(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setPaying(true);
    try {
      const body: Record<string, unknown> = {};
      if (payoutAmount) body.amount = parseFloat(payoutAmount);
      if (payoutNote) body.note = payoutNote;
      const res = await fetch("/api/v1/seller/analytics/payout", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers() },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail ?? "Payout failed");
      }
      setPayoutAmount("");
      setPayoutNote("");
      setMsg("Payout recorded successfully");
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPaying(false);
      setTimeout(() => { setMsg(""); setError(""); }, 4000);
    }
  }

  if (loading && !summary) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-orange-500/20 border-t-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 py-8 px-4">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Earnings</h1>
            <p className="text-sm text-white/40 mt-0.5">Commission ledger & payouts</p>
          </div>
          <Link
            href="/seller/dashboard"
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60 hover:bg-white/5 transition-colors"
          >
            ← Dashboard
          </Link>
        </div>

        {msg && (
          <div className="mb-4 rounded-xl bg-green-500/10 border border-green-500/30 px-4 py-3 text-sm text-green-400">
            {msg}
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
            {[
              { label: "Available balance", value: formatPrice(summary.payout_balance_mad), accent: true },
              { label: "Total earned (net)", value: formatPrice(summary.total_net_mad) },
              { label: "Total revenue", value: formatPrice(summary.total_gross_mad) },
              { label: "Commission paid", value: formatPrice(summary.total_commission_mad) },
              { label: "Total orders", value: String(summary.total_orders) },
              { label: "Commission rate", value: `${(summary.commission_rate * 100).toFixed(0)}%` },
            ].map((stat) => (
              <div key={stat.label} className={`rounded-xl border p-5 ${stat.accent ? "bg-orange-500/10 border-orange-500/30" : "bg-white/5 border-white/10"}`}>
                <p className="text-xs text-white/40 uppercase tracking-wide mb-1">{stat.label}</p>
                <p className={`text-2xl font-bold ${stat.accent ? "text-orange-400" : "text-white"}`}>{stat.value}</p>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Record payout */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-5">
            <h2 className="font-semibold text-white mb-4">Record payout</h2>
            <form onSubmit={handlePayout} className="space-y-3">
              <div>
                <label className="block text-xs text-white/50 mb-1">
                  Amount (MAD) — leave blank for full balance
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder={summary ? `${summary.payout_balance_mad.toFixed(2)}` : ""}
                  value={payoutAmount}
                  onChange={(e) => setPayoutAmount(e.target.value)}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder:text-white/20"
                />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Note (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Bank transfer ref #123"
                  value={payoutNote}
                  onChange={(e) => setPayoutNote(e.target.value)}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder:text-white/20"
                />
              </div>
              <button
                type="submit"
                disabled={paying || !summary || summary.payout_balance_mad <= 0}
                className="w-full rounded-lg bg-orange-500 hover:bg-orange-400 py-2.5 text-sm font-semibold text-white disabled:opacity-40 transition-colors"
              >
                {paying ? "Recording..." : "Record payout"}
              </button>
            </form>
          </div>

          {/* Recent payouts */}
          <div className="lg:col-span-2 bg-white/5 border border-white/10 rounded-xl p-5">
            <h2 className="font-semibold text-white mb-4">Recent payouts</h2>
            {payouts.length === 0 ? (
              <p className="text-white/30 text-sm">No payouts recorded yet</p>
            ) : (
              <ul className="space-y-2">
                {payouts.map((p) => (
                  <li key={p.id} className="flex items-center justify-between text-sm">
                    <div>
                      <span className="text-white font-medium">{formatPrice(p.amount)}</span>
                      {p.note && <span className="text-white/40 ml-2">— {p.note}</span>}
                    </div>
                    <span className="text-white/30 text-xs">
                      {new Date(p.created_at).toLocaleDateString("en-MA", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Commission ledger */}
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10">
            <h2 className="font-semibold text-white">Commission ledger</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b border-white/10">
                <tr className="text-left text-xs text-white/40 uppercase">
                  <th className="px-5 py-3">Order</th>
                  <th className="px-5 py-3">Revenue</th>
                  <th className="px-5 py-3">Commission</th>
                  <th className="px-5 py-3">Net earned</th>
                  <th className="px-5 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {ledger.map((entry) => (
                  <tr key={entry.id} className="hover:bg-white/3">
                    <td className="px-5 py-3 font-mono text-xs text-white/60">
                      #{entry.order_id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="px-5 py-3 text-white/70">{formatPrice(entry.gross_amount)}</td>
                    <td className="px-5 py-3 text-red-400/70">−{formatPrice(entry.commission_amount)}</td>
                    <td className="px-5 py-3 font-semibold text-green-400">{formatPrice(entry.net_amount)}</td>
                    <td className="px-5 py-3 text-white/40 text-xs">
                      {new Date(entry.created_at).toLocaleDateString("en-MA", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ledger.length === 0 && (
            <p className="text-white/30 text-center py-10 text-sm">No earnings yet</p>
          )}
          {(page > 1 || hasMore) && (
            <div className="flex items-center justify-between px-5 py-4 border-t border-white/10">
              <button
                onClick={() => setPage((p) => p - 1)}
                disabled={page === 1}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:bg-white/5 disabled:opacity-30 transition-colors"
              >
                ← Previous
              </button>
              <span className="text-xs text-white/40">Page {page}</span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasMore}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:bg-white/5 disabled:opacity-30 transition-colors"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
