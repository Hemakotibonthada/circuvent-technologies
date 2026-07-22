"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Wallet,
  Plus,
  LogOut,
  Package,
  Loader2,
  ArrowRight,
  ArrowDownCircle,
  ArrowUpCircle,
  UserPlus,
  LogIn,
} from "lucide-react";
import { useAccount } from "@/components/shop/AccountProvider";
import { formatINR } from "@/lib/shop-data";

interface WalletTxn {
  at: string;
  type: "credit" | "debit";
  amount: number;
  reason: string;
  balanceAfter: number;
}
interface OrderRow {
  orderNo: string;
  placedAt: string;
  items: { name: string; qty: number }[];
  total: number;
  status: string;
  paymentMethod: string;
}

const STATUS_LABEL: Record<string, string> = {
  placed: "Placed",
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}
type RazorpayCtor = new (o: Record<string, unknown>) => { open: () => void };

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if ((window as unknown as { Razorpay?: unknown }).Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function AccountPage() {
  const { account, token, wallet, ready, login, register, logout, refreshWallet, authHeaders } = useAccount();

  return (
    <section className="relative z-10 mx-auto max-w-5xl px-6 pb-24 pt-8 lg:px-8">
      <h1 className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>
        Your account
      </h1>
      <p className="mt-1 text-sm" style={{ color: "var(--text-tertiary)" }}>
        Sign in to use your Circuvent Wallet, see order history and track deliveries.
      </p>

      <div className="mt-8">
        {!ready ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--accent-cyan)" }} />
          </div>
        ) : account && token ? (
          <SignedIn
            name={account.name}
            email={account.email}
            wallet={wallet}
            authHeaders={authHeaders}
            refreshWallet={refreshWallet}
            onLogout={logout}
          />
        ) : (
          <AuthCard login={login} register={register} />
        )}
      </div>
    </section>
  );
}

function AuthCard({
  login,
  register,
}: {
  login: (e: string, p: string) => Promise<{ ok: boolean; message?: string }>;
  register: (n: string, e: string, p: string) => Promise<{ ok: boolean; message?: string; errors?: Record<string, string> }>;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const res = mode === "login" ? await login(email, password) : await register(name, email, password);
    if (!res.ok) setErr(res.message || "Something went wrong.");
    setBusy(false);
  };

  const field = "w-full rounded-xl border px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[var(--accent-cyan)]/30";
  const inputStyle = { background: "var(--bg-surface)", borderColor: "var(--border-primary)", color: "var(--text-primary)" };

  return (
    <div
      className="mx-auto max-w-md rounded-2xl border p-8"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)", boxShadow: "var(--shadow-lg)" }}
    >
      <div className="mb-6 flex rounded-xl p-1" style={{ background: "var(--bg-glass)" }}>
        {(["login", "register"] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setErr("");
            }}
            className="flex-1 rounded-lg py-2 text-sm font-semibold capitalize transition-colors"
            style={
              mode === m
                ? { background: "linear-gradient(135deg,#06b6d4,#8b5cf6)", color: "#fff" }
                : { color: "var(--text-tertiary)" }
            }
          >
            {m === "login" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-3">
        {mode === "register" && (
          <input className={field} style={inputStyle} placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} required />
        )}
        <input type="email" className={field} style={inputStyle} placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input
          type="password"
          className={field}
          style={inputStyle}
          placeholder="Password (min 6 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {err && <p className="text-sm text-rose-500">{err}</p>}
        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "login" ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
          {mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>
      <p className="mt-4 text-center text-xs" style={{ color: "var(--text-muted)" }}>
        Your account lets you pay with wallet, reorder faster and track every delivery.
      </p>
    </div>
  );
}

function SignedIn({
  name,
  email,
  wallet,
  authHeaders,
  refreshWallet,
  onLogout,
}: {
  name: string;
  email: string;
  wallet: number;
  authHeaders: () => Record<string, string>;
  refreshWallet: () => Promise<void>;
  onLogout: () => void;
}) {
  const [history, setHistory] = useState<WalletTxn[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [amount, setAmount] = useState("500");
  const [topupBusy, setTopupBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const loadWallet = useCallback(async () => {
    try {
      const res = await fetch("/api/wallet", { headers: authHeaders() });
      if (res.ok) {
        const d = await res.json();
        setHistory(d.history || []);
      }
    } catch {
      /* ignore */
    }
  }, [authHeaders]);

  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const res = await fetch("/api/account/orders", { headers: authHeaders() });
      if (res.ok) {
        const d = await res.json();
        setOrders(d.orders || []);
      }
    } catch {
      /* ignore */
    }
    setLoadingOrders(false);
  }, [authHeaders]);

  useEffect(() => {
    loadWallet();
    loadOrders();
  }, [loadWallet, loadOrders]);

  const topUp = async () => {
    setMsg("");
    const amt = Math.round(Number(amount) || 0);
    if (amt < 100) {
      setMsg("Minimum top-up is ₹100.");
      return;
    }
    setTopupBusy(true);
    try {
      const loaded = await loadRazorpay();
      if (!loaded) {
        setMsg("Could not load the payment gateway.");
        setTopupBusy(false);
        return;
      }
      const res = await fetch("/api/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ mode: "create", amount: amt }),
      });
      const data = await res.json();
      if (!data.success) {
        setMsg(data.message || "Could not start the top-up.");
        setTopupBusy(false);
        return;
      }
      const Razorpay = (window as unknown as { Razorpay: RazorpayCtor }).Razorpay;
      const rzp = new Razorpay({
        key: data.keyId,
        amount: data.amount,
        currency: data.currency,
        order_id: data.orderId,
        name: "Circuvent Wallet",
        description: `Add ${formatINR(amt)} to wallet`,
        image: "/logo-mark.png",
        prefill: { name, email },
        theme: { color: "#06b6d4" },
        handler: async (resp: RazorpayResponse) => {
          try {
            const vr = await fetch("/api/wallet/topup", {
              method: "POST",
              headers: { "Content-Type": "application/json", ...authHeaders() },
              body: JSON.stringify({ mode: "verify", amount: amt, ...resp }),
            });
            const vd = await vr.json();
            if (vd.success) {
              setMsg(`₹${amt} added to your wallet.`);
              await refreshWallet();
              await loadWallet();
            } else {
              setMsg(vd.message || "Verification failed.");
            }
          } catch {
            setMsg("Top-up verification error.");
          } finally {
            setTopupBusy(false);
          }
        },
        modal: { ondismiss: () => setTopupBusy(false) },
      });
      rzp.open();
    } catch {
      setMsg("Something went wrong.");
      setTopupBusy(false);
    }
  };

  const card = { background: "var(--bg-surface)", borderColor: "var(--border-primary)" };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
      {/* Left column: profile + wallet */}
      <div className="space-y-6">
        <div className="flex items-center justify-between rounded-2xl border p-5" style={card}>
          <div>
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              Signed in as
            </p>
            <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
              {name}
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {email}
            </p>
          </div>
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium"
            style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl border" style={card}>
          <div className="p-6" style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}>
            <div className="flex items-center gap-2 text-white/80">
              <Wallet className="h-4 w-4" /> <span className="text-xs font-semibold uppercase tracking-wider">Circuvent Wallet</span>
            </div>
            <p className="mt-2 text-3xl font-extrabold text-white">{formatINR(wallet)}</p>
            <p className="mt-1 text-xs text-white/70">Store credit — spend it at checkout.</p>
          </div>
          <div className="p-5">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--text-muted)" }}>
                  ₹
                </span>
                <input
                  type="number"
                  min={100}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-xl border py-2.5 pl-7 pr-3 text-sm outline-none"
                  style={{ background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" }}
                />
              </div>
              <button
                onClick={topUp}
                disabled={topupBusy}
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {topupBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add money
              </button>
            </div>
            <div className="mt-2 flex gap-1.5">
              {[500, 1000, 2000].map((q) => (
                <button
                  key={q}
                  onClick={() => setAmount(String(q))}
                  className="rounded-lg border px-2.5 py-1 text-xs"
                  style={{ borderColor: "var(--border-primary)", color: "var(--text-tertiary)" }}
                >
                  ₹{q}
                </button>
              ))}
            </div>
            {msg && <p className="mt-3 text-xs" style={{ color: "var(--accent-cyan)" }}>{msg}</p>}
          </div>

          {history.length > 0 && (
            <div className="border-t p-5" style={{ borderColor: "var(--border-primary)" }}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                Recent activity
              </p>
              <ul className="space-y-2">
                {history.slice(0, 6).map((t, i) => (
                  <li key={i} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2" style={{ color: "var(--text-secondary)" }}>
                      {t.type === "credit" ? (
                        <ArrowDownCircle className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <ArrowUpCircle className="h-4 w-4 text-rose-500" />
                      )}
                      {t.reason}
                    </span>
                    <span className="font-medium" style={{ color: t.type === "credit" ? "#10b981" : "var(--text-primary)" }}>
                      {t.type === "credit" ? "+" : "−"}
                      {formatINR(t.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Right column: orders */}
      <div className="rounded-2xl border p-6" style={card}>
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold" style={{ color: "var(--text-primary)" }}>
            <Package className="h-4 w-4" style={{ color: "var(--accent-cyan)" }} /> Order history
          </h2>
          <Link href="/shop" className="text-xs font-medium" style={{ color: "var(--accent-cyan)" }}>
            Continue shopping
          </Link>
        </div>

        {loadingOrders ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--accent-cyan)" }} />
          </div>
        ) : orders.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              No orders yet.
            </p>
            <Link
              href="/shop"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white"
            >
              Start shopping <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {orders.map((o) => (
              <li key={o.orderNo} className="rounded-xl border p-4" style={{ borderColor: "var(--border-primary)" }}>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {o.orderNo}
                  </span>
                  <span
                    className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                    style={{ background: "var(--accent-cyan-muted)", color: "var(--accent-cyan)" }}
                  >
                    {STATUS_LABEL[o.status] || o.status}
                  </span>
                </div>
                <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  {fmt(o.placedAt)} · {o.items.reduce((s, it) => s + it.qty, 0)} item(s) · {formatINR(o.total)}
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs capitalize" style={{ color: "var(--text-tertiary)" }}>
                    {o.paymentMethod === "razorpay" ? "Paid online" : o.paymentMethod}
                  </span>
                  <Link
                    href={`/track?order=${encodeURIComponent(o.orderNo)}&email=${encodeURIComponent(email)}`}
                    className="text-xs font-semibold"
                    style={{ color: "var(--accent-cyan)" }}
                  >
                    Track →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
