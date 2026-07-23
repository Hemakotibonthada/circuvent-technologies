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
  LifeBuoy,
  Send,
  RotateCcw,
} from "lucide-react";
import { useAccount } from "@/components/shop/AccountProvider";
import { useCart } from "@/components/shop/CartProvider";
import { useRouter } from "next/navigation";
import AuthForm from "@/components/shop/AuthForm";
import AccountExtras from "@/components/shop/AccountExtras";
import { formatINR, products as CATALOG } from "@/lib/shop-data";

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
  const { account, token, wallet, ready, logout, refreshWallet, authHeaders } = useAccount();

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
          <AuthForm
            heading="Sign in to your account"
            sub="Create an account or sign in to use your Circuvent Wallet, see order history and track deliveries."
          />
        )}
      </div>
    </section>
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
  const { add } = useCart();
  const router = useRouter();
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

  const requestReturn = async (orderNo: string) => {
    const reason = window.prompt("What's the reason for returning this order?");
    if (!reason || reason.trim().length < 3) return;
    try {
      const res = await fetch("/api/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ orderNo, reason }),
      });
      const d = await res.json();
      alert(d.success ? "Return requested — we'll review it and refund to your wallet." : d.message || "Could not request the return.");
    } catch {
      alert("Network error. Please try again.");
    }
  };

  const reorder = async (orderNo: string) => {
    try {
      const res = await fetch("/api/orders/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ orderNo }),
      });
      const d = await res.json();
      if (!d.success) {
        alert(d.message || "Could not reorder.");
        return;
      }
      let added = 0;
      for (const it of d.items || []) {
        if (!it.available) continue;
        const p = CATALOG.find((c) => c.id === it.id || c.slug === it.slug);
        if (p) {
          add(p, it.qty, { silent: true });
          added++;
        }
      }
      if (added) router.push("/cart");
      else alert("Those items are currently unavailable.");
    } catch {
      alert("Network error. Please try again.");
    }
  };

  const cancelOrder = async (orderNo: string) => {
    if (!confirm("Cancel this order? Any payment will be refunded to your wallet.")) return;
    try {
      const res = await fetch("/api/orders/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ orderNo }),
      });
      const d = await res.json();
      if (d.success) {
        alert(d.refunded ? `Order cancelled — ${formatINR(d.refunded)} refunded to your wallet.` : "Order cancelled.");
        refreshWallet();
        loadOrders();
      } else alert(d.message || "Could not cancel the order.");
    } catch {
      alert("Network error. Please try again.");
    }
  };

  const card = { background: "var(--bg-surface)", borderColor: "var(--border-primary)" };

  return (
    <>
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
                  <div className="flex items-center gap-3">
                    {["placed", "confirmed"].includes(o.status) && (
                      <button onClick={() => cancelOrder(o.orderNo)} className="text-xs font-medium" style={{ color: "#ef4444" }}>
                        Cancel
                      </button>
                    )}
                    <button
                      onClick={() => requestReturn(o.orderNo)}
                      className="flex items-center gap-1 text-xs font-medium"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      <RotateCcw className="h-3 w-3" /> Return
                    </button>
                    <button
                      onClick={() => reorder(o.orderNo)}
                      className="flex items-center gap-1 text-xs font-medium"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      <RotateCcw className="h-3 w-3" /> Reorder
                    </button>
                    <Link
                      href={`/track?order=${encodeURIComponent(o.orderNo)}&email=${encodeURIComponent(email)}`}
                      className="text-xs font-semibold"
                      style={{ color: "var(--accent-cyan)" }}
                    >
                      Track →
                    </Link>
                    <Link
                      href={`/shop/invoice/${encodeURIComponent(o.orderNo)}?email=${encodeURIComponent(email)}`}
                      className="text-xs font-medium"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      Invoice
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
    <SupportSection authHeaders={authHeaders} />
    <AccountExtras authHeaders={authHeaders} onWalletChange={refreshWallet} />
    </>
  );
}

interface TicketLite {
  id: string;
  subject: string;
  status: string;
  messages: { from: string; message: string; at: string }[];
  updatedAt: string;
}
interface ReturnLite {
  id: string;
  orderNo: string;
  status: string;
  refundAmount?: number;
}

function SupportSection({ authHeaders }: { authHeaders: () => Record<string, string> }) {
  const [tickets, setTickets] = useState<TicketLite[]>([]);
  const [returns, setReturns] = useState<ReturnLite[]>([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const [t, r] = await Promise.all([
        fetch("/api/support", { headers: authHeaders() }),
        fetch("/api/returns", { headers: authHeaders() }),
      ]);
      if (t.ok) setTickets((await t.json()).tickets || []);
      if (r.ok) setReturns((await r.json()).returns || []);
    } catch {
      /* ignore */
    }
  }, [authHeaders]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim().length < 5) {
      setMsg("Please describe your issue.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ subject, message }),
      });
      const d = await res.json();
      if (d.success) {
        setSubject("");
        setMessage("");
        setMsg("Sent! We'll reply by email.");
        load();
      } else setMsg(d.message || "Could not send.");
    } catch {
      setMsg("Network error.");
    }
    setBusy(false);
  };

  const card = { background: "var(--bg-surface)", borderColor: "var(--border-primary)" };
  const field = "w-full rounded-xl border px-4 py-2.5 text-sm outline-none";
  const inputStyle = { background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" };

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <div className="rounded-2xl border p-6" style={card}>
        <h2 className="flex items-center gap-2 font-semibold" style={{ color: "var(--text-primary)" }}>
          <LifeBuoy className="h-4 w-4" style={{ color: "var(--accent-cyan)" }} /> Support
        </h2>
        <form onSubmit={submit} className="mt-3 space-y-2">
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className={field} style={inputStyle} />
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="How can we help?" className={field + " min-h-[80px]"} style={inputStyle} />
          <div className="flex items-center gap-3">
            <button type="submit" disabled={busy} className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
            </button>
            {msg && <span className="text-xs" style={{ color: "var(--accent-cyan)" }}>{msg}</span>}
          </div>
        </form>
        {tickets.length > 0 && (
          <ul className="mt-4 space-y-2">
            {tickets.map((t) => (
              <li key={t.id} className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border-primary)" }}>
                <div className="flex items-center justify-between">
                  <span style={{ color: "var(--text-primary)" }}>{t.subject}</span>
                  <span className="text-xs" style={{ color: t.status === "open" ? "#f59e0b" : "#10b981" }}>{t.status}</span>
                </div>
                {t.messages.length > 0 && (
                  <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                    {t.messages[t.messages.length - 1].from}: {t.messages[t.messages.length - 1].message}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border p-6" style={card}>
        <h2 className="flex items-center gap-2 font-semibold" style={{ color: "var(--text-primary)" }}>
          <RotateCcw className="h-4 w-4" style={{ color: "var(--accent-cyan)" }} /> Returns
        </h2>
        {returns.length === 0 ? (
          <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>
            No returns yet. Use the &ldquo;Return&rdquo; link on an order to request one.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {returns.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border-primary)" }}>
                <span className="font-mono" style={{ color: "var(--text-primary)" }}>{r.orderNo}</span>
                <span className="text-xs" style={{ color: r.status === "refunded" ? "#10b981" : r.status === "rejected" ? "#ef4444" : "#f59e0b" }}>
                  {r.status}{r.refundAmount ? ` · ${formatINR(r.refundAmount)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
