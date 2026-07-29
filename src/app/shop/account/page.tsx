"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Wallet,
  Plus,
  LogOut,
  Package,
  Truck,
  Loader2,
  ArrowRight,
  ArrowDownCircle,
  ArrowUpCircle,
  LifeBuoy,
  Send,
  RotateCcw,
  Heart,
  ShoppingCart,
  Trash2,
  Pencil,
  AlertCircle,
  LayoutDashboard,
  Search,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { useAccount } from "@/components/shop/AccountProvider";
import { useCart } from "@/components/shop/CartProvider";
import { useWishlist } from "@/components/shop/WishlistProvider";
import { useRouter } from "next/navigation";
import AuthForm from "@/components/shop/AuthForm";
import AccountExtras from "@/components/shop/AccountExtras";
import AccountSectionNav, { type AccountSection } from "@/components/shop/AccountSectionNav";
import { Skeleton } from "@/components/ui/skeleton";
import { formatINR, products as CATALOG } from "@/lib/shop-data";

// Module-level so the nav's IntersectionObserver isn't rebuilt every render.
const ACCOUNT_SECTIONS: AccountSection[] = [
  { id: "account-overview", label: "Overview", icon: LayoutDashboard },
  { id: "account-orders", label: "Orders", icon: Package },
  { id: "account-wallet", label: "Wallet", icon: Wallet },
  { id: "account-personal", label: "Profile", icon: UserCog },
  { id: "account-wishlist", label: "Wishlist", icon: Heart },
  { id: "account-support", label: "Support", icon: LifeBuoy },
];

const ORDER_FILTERS: { id: string; label: string; match: (status: string) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "open", label: "In progress", match: (s) => !["delivered", "cancelled"].includes(s) },
  { id: "delivered", label: "Delivered", match: (s) => s === "delivered" },
  { id: "cancelled", label: "Cancelled", match: (s) => s === "cancelled" },
];

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

const surface = { background: "var(--bg-surface)", borderColor: "var(--border-primary)" };
const inputStyle = { background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" };
const accentBg = { background: "var(--accent-cyan)" };
const primaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60";

function getInitials(name: string, email: string) {
  const src = (name || "").trim();
  if (src) {
    const parts = src.split(/\s+/);
    const first = parts[0]?.[0] ?? "";
    const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
    const out = (first + last).toUpperCase();
    if (out) return out;
  }
  return (email[0] || "?").toUpperCase();
}

function avatarBackground(email: string) {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `linear-gradient(135deg, hsl(${hue} 55% 45%), hsl(${(hue + 42) % 360} 58% 38%))`;
}

export default function AccountPage() {
  const { account, token, wallet, ready, logout, refreshWallet, authHeaders } = useAccount();

  return (
    <section className="relative z-10 mx-auto max-w-5xl px-6 pb-24 pt-8 lg:px-8">
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
        <div>
          <h1 className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>
            Your account
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-tertiary)" }}>
            Sign in to use your Circuvent Wallet, see order history and track deliveries.
          </p>
          <div className="mt-8">
            <AuthForm
              heading="Sign in to your account"
              sub="Create an account or sign in to use your Circuvent Wallet, see order history and track deliveries."
            />
          </div>
        </div>
      )}
    </section>
  );
}

function SectionHeading({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
        {children}
      </h2>
      {action}
    </div>
  );
}

function StatCard({ href, icon: Icon, label, value, hint }: { href: string; icon: LucideIcon; label: string; value: string; hint: string }) {
  return (
    <a href={href} className="rounded-2xl border p-5 transition-colors hover:bg-[var(--bg-surface-hover)]" style={surface}>
      <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-tertiary)" }}>
        <Icon className="h-4 w-4" style={{ color: "var(--accent-cyan)" }} /> {label}
      </div>
      <p className="mt-2 truncate text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
        {value}
      </p>
      <p className="mt-0.5 truncate text-xs" style={{ color: "var(--text-muted)" }}>
        {hint}
      </p>
    </a>
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
  const { ids: wishIds, remove: removeWish, count: wishCount } = useWishlist();
  const router = useRouter();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [ordersError, setOrdersError] = useState(false);
  const [orderFilter, setOrderFilter] = useState("all");
  const [orderQuery, setOrderQuery] = useState("");
  const [amount, setAmount] = useState("500");
  const [topupBusy, setTopupBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [profile, setProfile] = useState<{ name?: string; phone?: string; businessName?: string } | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/account/profile", { headers: authHeaders() });
      if (res.ok) setProfile((await res.json()).account || null);
    } catch {
      /* ignore */
    }
  }, [authHeaders]);

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
    setOrdersError(false);
    try {
      const res = await fetch("/api/account/orders", { headers: authHeaders() });
      if (res.ok) {
        const d = await res.json();
        setOrders(d.orders || []);
      } else {
        setOrdersError(true);
      }
    } catch {
      // Surface the failure instead of leaving an indistinguishable empty list.
      setOrdersError(true);
    }
    setLoadingOrders(false);
  }, [authHeaders]);

  useEffect(() => {
    // Independent endpoints — fetch together rather than in sequence.
    void Promise.all([loadWallet(), loadOrders(), loadProfile()]);
  }, [loadWallet, loadOrders, loadProfile]);

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

  const sortedOrders = useMemo(
    () => [...orders].sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime()),
    [orders]
  );
  const latest = sortedOrders[0];
  const openCount = orders.filter((o) => !["delivered", "cancelled"].includes(o.status)).length;

  const visibleOrders = useMemo(() => {
    const matcher = ORDER_FILTERS.find((f) => f.id === orderFilter) ?? ORDER_FILTERS[0];
    const q = orderQuery.trim().toLowerCase();
    return sortedOrders.filter((o) => {
      if (!matcher.match(o.status)) return false;
      if (!q) return true;
      return (
        o.orderNo.toLowerCase().includes(q) ||
        o.items.some((it) => it.name.toLowerCase().includes(q))
      );
    });
  }, [sortedOrders, orderFilter, orderQuery]);

  const displayName = (profile?.name || name || "").trim();
  const firstName = displayName.split(/\s+/)[0] || "there";
  const phone = profile?.phone?.trim();
  const businessName = profile?.businessName?.trim();

  return (
    <div>
      {/* Welcome + identity hero */}
      <h1 className="text-3xl font-bold sm:text-[34px]" style={{ color: "var(--text-primary)" }}>
        Welcome back, {firstName}
      </h1>
      <p className="mt-1 text-sm" style={{ color: "var(--text-tertiary)" }}>
        Manage your profile, orders, wallet and preferences — all in one place.
      </p>

      <div className="mt-6 flex flex-col gap-5 rounded-2xl border p-6 sm:flex-row sm:items-center" style={surface}>
        <div className="relative h-28 w-28 shrink-0">
          <div
            className="grid h-28 w-28 place-items-center rounded-full text-3xl font-semibold text-white"
            style={{ background: avatarBackground(email) }}
            aria-hidden
          >
            {getInitials(displayName, email)}
          </div>
          <a
            href="#account-personal"
            title="Edit your profile"
            aria-label="Edit your profile"
            className="absolute bottom-0 right-0 grid h-9 w-9 place-items-center rounded-full border"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}
          >
            <Pencil className="h-4 w-4" />
          </a>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
            {displayName || "Your profile"}
          </p>
          <p className="truncate text-sm" style={{ color: "var(--text-tertiary)" }}>
            {email}
          </p>
          <a href="#account-personal" className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: "var(--accent-cyan)" }}>
            <Pencil className="h-3.5 w-3.5" /> Edit profile
          </a>
        </div>

        <div className="grid gap-3 text-sm sm:min-w-[160px] sm:border-l sm:pl-6" style={{ borderColor: "var(--border-primary)" }}>
          <div>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Phone
            </p>
            <p style={{ color: "var(--text-secondary)" }}>{phone || "Not added yet"}</p>
          </div>
          {businessName && (
            <div>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Business
              </p>
              <p className="truncate" style={{ color: "var(--text-secondary)" }}>
                {businessName}
              </p>
            </div>
          )}
          <button onClick={onLogout} className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: "var(--text-tertiary)" }}>
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </div>

      <AccountSectionNav sections={ACCOUNT_SECTIONS} />

      {/* Keep track */}
      <section id="account-overview" className="mt-8 scroll-mt-28">
        <SectionHeading>Keep track</SectionHeading>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            href="#account-orders"
            icon={Package}
            label="Open orders"
            value={orders.length === 0 ? "—" : String(openCount)}
            hint={orders.length === 0 ? "No orders yet" : openCount === 0 ? "All delivered" : "In progress"}
          />
          <StatCard
            href={latest ? `/track?order=${encodeURIComponent(latest.orderNo)}&email=${encodeURIComponent(email)}` : "#account-orders"}
            icon={Truck}
            label="Latest order"
            value={latest ? STATUS_LABEL[latest.status] || latest.status : "—"}
            hint={latest ? latest.orderNo : "No orders yet"}
          />
          <StatCard href="#account-wallet" icon={Wallet} label="Wallet" value={formatINR(wallet)} hint="Store credit" />
          <StatCard
            href="#account-wishlist"
            icon={Heart}
            label="Wishlist"
            value={wishCount === 0 ? "—" : String(wishCount)}
            hint={wishCount === 0 ? "Nothing saved" : "Saved items"}
          />
        </div>
      </section>

      {/* Orders */}
      <section id="account-orders" className="mt-10 scroll-mt-28">
        <SectionHeading
          action={
            <Link href="/shop" className="text-sm font-medium" style={{ color: "var(--accent-cyan)" }}>
              Continue shopping
            </Link>
          }
        >
          Orders
        </SectionHeading>
        <div className="rounded-2xl border p-6" style={surface}>
          {/* Filter + search — only worth showing once there's something to sift. */}
          {!loadingOrders && !ordersError && orders.length > 0 && (
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter orders by status">
                {ORDER_FILTERS.map((f) => {
                  const isActive = orderFilter === f.id;
                  return (
                    <button
                      key={f.id}
                      onClick={() => setOrderFilter(f.id)}
                      aria-pressed={isActive}
                      className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
                      style={{
                        borderColor: isActive ? "var(--border-accent)" : "var(--border-primary)",
                        background: isActive ? "var(--accent-cyan-muted)" : "transparent",
                        color: isActive ? "var(--accent-cyan)" : "var(--text-tertiary)",
                      }}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
              <div className="relative sm:ml-auto sm:w-60">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
                  aria-hidden="true"
                  style={{ color: "var(--text-muted)" }}
                />
                <input
                  type="search"
                  value={orderQuery}
                  onChange={(e) => setOrderQuery(e.target.value)}
                  placeholder="Order number or product"
                  aria-label="Search your orders"
                  className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm outline-none"
                  style={{ borderColor: "var(--border-primary)", color: "var(--text-primary)" }}
                />
              </div>
            </div>
          )}

          {loadingOrders ? (
            <ul className="space-y-3" aria-label="Loading orders">
              {[0, 1, 2].map((i) => (
                <li key={i} className="rounded-xl border p-4" style={{ borderColor: "var(--border-primary)" }}>
                  <div className="flex items-center justify-between gap-3">
                    <Skeleton variant="text" height={14} className="w-32" />
                    <Skeleton variant="rounded" height={20} width={80} />
                  </div>
                  <Skeleton variant="text" height={11} className="mt-2 w-52" />
                  <Skeleton variant="text" height={11} className="mt-3 w-40" />
                </li>
              ))}
            </ul>
          ) : ordersError ? (
            <div className="py-10 text-center">
              <AlertCircle className="mx-auto h-8 w-8" style={{ color: "#f59e0b" }} />
              <p className="mt-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                We couldn&apos;t load your orders
              </p>
              <p className="mt-1 text-sm" style={{ color: "var(--text-tertiary)" }}>
                Check your connection and try again — nothing has been lost.
              </p>
              <button onClick={loadOrders} className={`mt-4 ${primaryBtn}`} style={accentBg}>
                <RotateCcw className="h-4 w-4" /> Retry
              </button>
            </div>
          ) : sortedOrders.length === 0 ? (
            <div className="py-10 text-center">
              <Package className="mx-auto h-8 w-8" style={{ color: "var(--text-muted)" }} />
              <p className="mt-3 text-sm" style={{ color: "var(--text-tertiary)" }}>
                No orders yet.
              </p>
              <Link href="/shop" className={`mt-4 ${primaryBtn}`} style={accentBg}>
                Start shopping <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <>
              <p aria-live="polite" className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
                {visibleOrders.length === sortedOrders.length
                  ? `${sortedOrders.length} order${sortedOrders.length === 1 ? "" : "s"}`
                  : `${visibleOrders.length} of ${sortedOrders.length} orders`}
              </p>
              {visibleOrders.length === 0 ? (
                <div className="py-10 text-center">
                  <Search className="mx-auto h-7 w-7" style={{ color: "var(--text-muted)" }} />
                  <p className="mt-3 text-sm" style={{ color: "var(--text-tertiary)" }}>
                    No orders match this filter.
                  </p>
                  <button
                    onClick={() => {
                      setOrderFilter("all");
                      setOrderQuery("");
                    }}
                    className="mt-3 text-sm font-semibold underline underline-offset-2"
                    style={{ color: "var(--accent-cyan)" }}
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                <ul className="space-y-3">
                  {visibleOrders.map((o) => (
                <li key={o.orderNo} className="rounded-xl border p-4" style={{ borderColor: "var(--border-primary)" }}>
                  <div className="flex items-center justify-between gap-3">
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
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs capitalize" style={{ color: "var(--text-tertiary)" }}>
                      {o.paymentMethod === "razorpay" ? "Paid online" : o.paymentMethod}
                    </span>
                    <div className="flex flex-wrap items-center gap-3">
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
            </>
          )}
        </div>
      </section>

      {/* Wallet */}
      <section id="account-wallet" className="mt-10 scroll-mt-28">
        <SectionHeading>Wallet</SectionHeading>
        <div className="rounded-2xl border p-6" style={surface}>
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <div className="flex items-center gap-2" style={{ color: "var(--text-tertiary)" }}>
                <Wallet className="h-4 w-4" style={{ color: "var(--accent-cyan)" }} />
                <span className="text-sm">Circuvent Wallet</span>
              </div>
              <p className="mt-1 text-3xl font-bold" style={{ color: "var(--text-primary)" }}>
                {formatINR(wallet)}
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                Store credit — spend it at checkout.
              </p>
            </div>
            <div className="w-full sm:w-auto">
              <div className="flex gap-2">
                <div className="relative flex-1 sm:w-40">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--text-muted)" }}>
                    ₹
                  </span>
                  <input
                    type="number"
                    min={100}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full rounded-xl border py-2.5 pl-7 pr-3 text-sm outline-none"
                    style={inputStyle}
                  />
                </div>
                <button onClick={topUp} disabled={topupBusy} className={primaryBtn} style={accentBg}>
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
            </div>
          </div>
          {msg && (
            <p className="mt-3 text-xs" style={{ color: "var(--accent-cyan)" }}>
              {msg}
            </p>
          )}

          {history.length > 0 && (
            <div className="mt-5 border-t pt-5" style={{ borderColor: "var(--border-primary)" }}>
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
      </section>

      {/* Manage your account, rewards & notifications */}
      <AccountExtras authHeaders={authHeaders} onWalletChange={refreshWallet} onProfileChange={loadProfile} />

      {/* Wishlist */}
      <WishlistSection ids={wishIds} onRemove={removeWish} onAdd={(p) => add(p)} />

      {/* Support */}
      <SupportSection authHeaders={authHeaders} />
    </div>
  );
}

function WishlistSection({
  ids,
  onRemove,
  onAdd,
}: {
  ids: string[];
  onRemove: (id: string) => void;
  onAdd: (p: (typeof CATALOG)[number]) => void;
}) {
  const items = ids.map((id) => CATALOG.find((p) => p.id === id || p.slug === id)).filter(Boolean) as typeof CATALOG;
  return (
    <section id="account-wishlist" className="mt-10 scroll-mt-28">
      <SectionHeading>Wishlist{items.length > 0 ? ` · ${items.length}` : ""}</SectionHeading>
      <div className="rounded-2xl border p-6" style={surface}>
        {items.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No saved products yet. Tap the heart on any product to save it here.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {items.map((p) => {
              const soldOut = p.available === false || (typeof p.stock === "number" && p.stock <= 0);
              return (
                <div key={p.id} className="flex items-center gap-3 rounded-xl border p-3" style={{ borderColor: "var(--border-primary)" }}>
                  <div className="min-w-0 flex-1">
                    <Link href={`/shop/${p.slug}`} className="truncate font-semibold hover:underline" style={{ color: "var(--text-primary)" }}>
                      {p.name}
                    </Link>
                    <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                      {formatINR(p.price)} {soldOut && <span className="text-xs" style={{ color: "#ef4444" }}>· Out of stock</span>}
                    </p>
                  </div>
                  <button
                    onClick={() => onAdd(p)}
                    disabled={soldOut}
                    title={soldOut ? "Out of stock" : "Add to cart"}
                    className="grid h-9 w-9 place-items-center rounded-lg text-white disabled:opacity-40"
                    style={accentBg}
                  >
                    <ShoppingCart className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => onRemove(p.id)}
                    title="Remove from wishlist"
                    className="grid h-9 w-9 place-items-center rounded-lg border"
                    style={{ borderColor: "var(--border-primary)", color: "var(--text-muted)" }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
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

  const field = "w-full rounded-xl border px-4 py-2.5 text-sm outline-none";

  return (
    <section id="account-support" className="mt-10 scroll-mt-28">
      <SectionHeading>Support</SectionHeading>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border p-6" style={surface}>
          <h3 className="flex items-center gap-2 font-semibold" style={{ color: "var(--text-primary)" }}>
            <LifeBuoy className="h-4 w-4" style={{ color: "var(--accent-cyan)" }} /> Contact support
          </h3>
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            Questions about an order or product? Send us a note.
          </p>
          <form onSubmit={submit} className="mt-4 space-y-2">
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className={field} style={inputStyle} />
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="How can we help?"
              className={field + " min-h-[80px]"}
              style={inputStyle}
            />
            <div className="flex items-center gap-3">
              <button type="submit" disabled={busy} className={primaryBtn} style={accentBg}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
              </button>
              {msg && (
                <span className="text-xs" style={{ color: "var(--accent-cyan)" }}>
                  {msg}
                </span>
              )}
            </div>
          </form>
          {tickets.length > 0 && (
            <ul className="mt-4 space-y-2">
              {tickets.map((t) => (
                <li key={t.id} className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border-primary)" }}>
                  <div className="flex items-center justify-between">
                    <span style={{ color: "var(--text-primary)" }}>{t.subject}</span>
                    <span className="text-xs" style={{ color: t.status === "open" ? "#f59e0b" : "#10b981" }}>
                      {t.status}
                    </span>
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

        <div className="rounded-2xl border p-6" style={surface}>
          <h3 className="flex items-center gap-2 font-semibold" style={{ color: "var(--text-primary)" }}>
            <RotateCcw className="h-4 w-4" style={{ color: "var(--accent-cyan)" }} /> Returns
          </h3>
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            Track return requests and their refunds.
          </p>
          {returns.length === 0 ? (
            <p className="mt-4 text-sm" style={{ color: "var(--text-muted)" }}>
              No returns yet. Use the &ldquo;Return&rdquo; link on an order to request one.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {returns.map((r) => (
                <li key={r.id} className="flex items-center justify-between rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border-primary)" }}>
                  <span className="font-mono" style={{ color: "var(--text-primary)" }}>
                    {r.orderNo}
                  </span>
                  <span className="text-xs" style={{ color: r.status === "refunded" ? "#10b981" : r.status === "rejected" ? "#ef4444" : "#f59e0b" }}>
                    {r.status}
                    {r.refundAmount ? ` · ${formatINR(r.refundAmount)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
