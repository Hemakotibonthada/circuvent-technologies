"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, CheckCircle2, ArrowRight, Truck, MapPin, ShieldCheck, Wallet } from "lucide-react";
import { useCart } from "@/components/shop/CartProvider";
import { useAccount } from "@/components/shop/AccountProvider";
import AuthForm from "@/components/shop/AuthForm";
import { formatINR } from "@/lib/shop-data";

interface PlacedOrder {
  orderNo: string;
  placedAt: string;
  items: { name: string; price: number; qty: number; lineTotal: number }[];
  subtotal: number;
  shipping: number;
  total: number;
  customer: Record<string, string>;
  paymentMethod: string;
  status: string;
}

function saveOrder(order: PlacedOrder) {
  try {
    const raw = localStorage.getItem("circuvent-orders");
    const arr = raw ? JSON.parse(raw) : [];
    arr.unshift(order);
    localStorage.setItem("circuvent-orders", JSON.stringify(arr.slice(0, 50)));
  } catch {
    /* ignore */
  }
}

const field =
  "w-full rounded-xl border px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[var(--accent-cyan)]/30";

interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}
interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description?: string;
  image?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  handler: (r: RazorpayResponse) => void;
  modal?: { ondismiss?: () => void };
}
type RazorpayCtor = new (o: RazorpayOptions) => { open: () => void };

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

export default function CheckoutPage() {
  const { items, subtotal, shipping, clear } = useCart();
  const { account, wallet, ready, authHeaders, refreshWallet } = useAccount();
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    paymentMethod: "razorpay",
    notes: "",
  });
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<PlacedOrder | null>(null);
  const [coupon, setCoupon] = useState<{ code: string; discount: number; label: string } | null>(null);
  const [couponInput, setCouponInput] = useState("");
  const [couponMsg, setCouponMsg] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);

  useEffect(() => {
    if (!account) return;
    setForm((f) => ({ ...f, name: f.name || account.name, email: f.email || account.email }));
    // Auto-fill the delivery address from the customer's most recent order.
    fetch("/api/account/orders", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const last = d?.orders?.[0]?.customer;
        if (last) {
          setForm((f) => ({
            ...f,
            phone: f.phone || last.phone || "",
            address: f.address || last.address || "",
            city: f.city || last.city || "",
            state: f.state || last.state || "",
            pincode: f.pincode || last.pincode || "",
          }));
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const cartPayload = () => items.map((i) => ({ id: i.id, slug: i.slug, qty: i.qty }));

  const discount = coupon?.discount || 0;
  const payTotal = Math.max(0, subtotal + shipping - discount);

  const applyCoupon = async () => {
    if (!couponInput.trim()) return;
    setCouponBusy(true);
    setCouponMsg("");
    try {
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cartPayload(), code: couponInput.trim() }),
      });
      const d = await res.json();
      if (d.success) {
        setCoupon({ code: d.code, discount: d.discount, label: d.label });
        setCouponMsg("");
      } else {
        setCoupon(null);
        setCouponMsg(d.message || "That coupon isn't valid.");
      }
    } catch {
      setCouponMsg("Network error. Please try again.");
    }
    setCouponBusy(false);
  };

  const removeCoupon = () => {
    setCoupon(null);
    setCouponInput("");
    setCouponMsg("");
  };

  const finalize = (order: PlacedOrder) => {
    saveOrder(order);
    clear();
    setDone(order);
    window.scrollTo(0, 0);
  };

  const placeOffline = async () => {
    setPlacing(true);
    setError("");
    setErrors({});
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ items: cartPayload(), customer: form, coupon: coupon?.code }),
      });
      const data = await res.json();
      if (data.success) {
        if (form.paymentMethod === "wallet") refreshWallet();
        finalize(data.order);
      } else {
        setError(data.message || "");
        setErrors(data.errors || {});
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPlacing(false);
    }
  };

  const payOnline = async () => {
    setPlacing(true);
    setError("");
    setErrors({});
    try {
      const loaded = await loadRazorpay();
      if (!loaded) {
        setError("Could not load the payment gateway. Please try again.");
        setPlacing(false);
        return;
      }
      const res = await fetch("/api/payments/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cartPayload(), coupon: coupon?.code }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || "Could not start the payment.");
        setPlacing(false);
        return;
      }
      const Razorpay = (window as unknown as { Razorpay: RazorpayCtor }).Razorpay;
      const rzp = new Razorpay({
        key: data.keyId,
        amount: data.amount,
        currency: data.currency,
        order_id: data.orderId,
        name: "Circuvent Store",
        description: "Order payment",
        image: "/logo-mark.png",
        prefill: { name: form.name, email: form.email, contact: form.phone },
        theme: { color: "#06b6d4" },
        handler: async (resp: RazorpayResponse) => {
          try {
            const vr = await fetch("/api/payments/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...resp, items: cartPayload(), customer: form, coupon: coupon?.code }),
            });
            const vd = await vr.json();
            if (vd.success) finalize(vd.order);
            else setError(vd.message || "Payment verification failed.");
          } catch {
            setError("Payment verification error. If money was debited, contact support with your payment id.");
          } finally {
            setPlacing(false);
          }
        },
        modal: { ondismiss: () => setPlacing(false) },
      });
      rzp.open();
    } catch {
      setError("Something went wrong starting the payment.");
      setPlacing(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.paymentMethod === "razorpay") payOnline();
    else placeOffline();
  };

  const inputStyle = { background: "var(--bg-surface)", borderColor: "var(--border-primary)", color: "var(--text-primary)" };
  const labelCls = "mb-1.5 block text-xs font-medium uppercase tracking-wider";

  if (done) {
    return (
      <section className="relative z-10 mx-auto max-w-xl px-6 pb-24 pt-32 lg:px-8">
        <div
          className="grid place-items-center gap-4 rounded-2xl border p-10 text-center"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)" }}
        >
          <CheckCircle2 className="h-14 w-14 text-emerald-500" />
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            Order placed!
          </h1>
          <p style={{ color: "var(--text-tertiary)" }}>
            Thank you, {done.customer.name?.split(" ")[0]}. Your order{" "}
            <span className="font-semibold" style={{ color: "var(--accent-cyan)" }}>
              {done.orderNo}
            </span>{" "}
            has been received{done.status === "placed" ? "" : ""}. A confirmation has been emailed to you.
          </p>
          <div
            className="w-full rounded-xl border p-4 text-left text-sm"
            style={{ borderColor: "var(--border-primary)", background: "var(--bg-secondary)" }}
          >
            <div className="flex justify-between">
              <span style={{ color: "var(--text-tertiary)" }}>Total</span>
              <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                {formatINR(done.total)}
              </span>
            </div>
            <div className="mt-1 flex justify-between">
              <span style={{ color: "var(--text-tertiary)" }}>Payment</span>
              <span style={{ color: "var(--text-secondary)" }}>
                {done.paymentMethod === "cod"
                  ? "Cash on delivery"
                  : done.paymentMethod === "razorpay"
                    ? "Paid online (Razorpay)"
                    : done.paymentMethod.toUpperCase()}
              </span>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            <Link
              href={`/track?order=${encodeURIComponent(done.orderNo)}&email=${encodeURIComponent(done.customer.email)}`}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-5 py-2.5 text-sm font-semibold text-white"
            >
              <Truck className="h-4 w-4" /> Track order
            </Link>
            <Link
              href="/shop"
              className="inline-flex items-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-medium"
              style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}
            >
              Continue shopping
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="relative z-10 mx-auto max-w-xl px-6 pb-24 pt-32 text-center lg:px-8">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
          Your cart is empty
        </h1>
        <Link
          href="/shop"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-5 py-2.5 text-sm font-semibold text-white"
        >
          Browse the shop <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    );
  }

  if (!ready) {
    return (
      <section className="relative z-10 mx-auto flex max-w-xl justify-center px-6 pb-24 pt-40 lg:px-8">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--accent-cyan)" }} />
      </section>
    );
  }

  if (!account) {
    return (
      <section className="relative z-10 mx-auto max-w-xl px-6 pb-24 pt-32 lg:px-8">
        <AuthForm
          heading="Sign in to check out"
          sub="Please sign in or create an account to place your order, pay with wallet and track it. Your cart is saved."
        />
      </section>
    );
  }

  return (
    <section className="relative z-10 mx-auto max-w-5xl px-6 pb-24 pt-32 lg:px-8">
      <h1 className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>
        Checkout
      </h1>

      <form onSubmit={submit} className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div
          className="space-y-4 rounded-2xl border p-6"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)" }}
        >
          <h3 className="flex items-center gap-2 font-semibold" style={{ color: "var(--text-primary)" }}>
            <MapPin className="h-4 w-4" style={{ color: "var(--accent-cyan)" }} /> Delivery details
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} style={{ color: "var(--text-tertiary)" }}>
                Full name *
              </label>
              <input className={field} style={inputStyle} value={form.name} onChange={set("name")} required />
              {errors.name && <p className="mt-1 text-xs text-rose-500">{errors.name}</p>}
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--text-tertiary)" }}>
                Phone *
              </label>
              <input className={field} style={inputStyle} value={form.phone} onChange={set("phone")} required />
              {errors.phone && <p className="mt-1 text-xs text-rose-500">{errors.phone}</p>}
            </div>
          </div>
          <div>
            <label className={labelCls} style={{ color: "var(--text-tertiary)" }}>
              Email *
            </label>
            <input type="email" className={field} style={inputStyle} value={form.email} onChange={set("email")} required />
            {errors.email && <p className="mt-1 text-xs text-rose-500">{errors.email}</p>}
          </div>
          <div>
            <label className={labelCls} style={{ color: "var(--text-tertiary)" }}>
              Address *
            </label>
            <textarea
              className={field + " min-h-[72px]"}
              style={inputStyle}
              value={form.address}
              onChange={set("address")}
              placeholder="House / street / landmark"
              required
            />
            {errors.address && <p className="mt-1 text-xs text-rose-500">{errors.address}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={labelCls} style={{ color: "var(--text-tertiary)" }}>
                City
              </label>
              <input className={field} style={inputStyle} value={form.city} onChange={set("city")} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--text-tertiary)" }}>
                State
              </label>
              <input className={field} style={inputStyle} value={form.state} onChange={set("state")} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--text-tertiary)" }}>
                PIN code *
              </label>
              <input className={field} style={inputStyle} value={form.pincode} onChange={set("pincode")} required />
              {errors.pincode && <p className="mt-1 text-xs text-rose-500">{errors.pincode}</p>}
            </div>
          </div>

          <div>
            <label className={labelCls} style={{ color: "var(--text-tertiary)" }}>
              Payment method
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                { id: "razorpay", label: "Pay online — cards, UPI, netbanking" },
                ...(account && wallet >= payTotal
                  ? [{ id: "wallet", label: `Circuvent Wallet — ${formatINR(wallet)} available` }]
                  : []),
                { id: "cod", label: "Cash on delivery" },
              ].map((opt) => (
                <label
                  key={opt.id}
                  className="flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 text-sm"
                  style={{
                    borderColor: form.paymentMethod === opt.id ? "var(--accent-cyan)" : "var(--border-primary)",
                    color: "var(--text-secondary)",
                    background: form.paymentMethod === opt.id ? "var(--accent-cyan-muted)" : "transparent",
                  }}
                >
                  <input
                    type="radio"
                    name="pay"
                    className="accent-cyan-500"
                    checked={form.paymentMethod === opt.id}
                    onChange={() => setForm((f) => ({ ...f, paymentMethod: opt.id }))}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">{error}</p>
          )}
        </div>

        <div
          className="h-fit rounded-2xl border p-6 lg:sticky lg:top-28"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)" }}
        >
          <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>
            Your order
          </h3>
          <div className="mt-4 space-y-3">
            {items.map((it) => (
              <div key={it.id} className="flex justify-between text-sm">
                <span style={{ color: "var(--text-secondary)" }}>
                  {it.name} <span style={{ color: "var(--text-muted)" }}>× {it.qty}</span>
                </span>
                <span style={{ color: "var(--text-secondary)" }}>{formatINR(it.price * it.qty)}</span>
              </div>
            ))}
          </div>
          {/* Coupon */}
          <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--border-primary)" }}>
            {coupon ? (
              <div className="flex items-center justify-between rounded-lg px-3 py-2 text-sm" style={{ background: "var(--accent-cyan-muted)" }}>
                <span style={{ color: "var(--accent-cyan)" }}>
                  <b>{coupon.code}</b> — {coupon.label}
                </span>
                <button type="button" onClick={removeCoupon} className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>
                  Remove
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  placeholder="Coupon code"
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={applyCoupon}
                  disabled={couponBusy || !couponInput.trim()}
                  className="shrink-0 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50"
                  style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}
                >
                  {couponBusy ? "…" : "Apply"}
                </button>
              </div>
            )}
            {couponMsg && <p className="mt-1.5 text-xs text-rose-500">{couponMsg}</p>}
            {!coupon && (
              <p className="mt-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                Try <b>WELCOME10</b> or <b>FREESHIP</b>.
              </p>
            )}
          </div>

          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt style={{ color: "var(--text-tertiary)" }}>Subtotal</dt>
              <dd style={{ color: "var(--text-secondary)" }}>{formatINR(subtotal)}</dd>
            </div>
            {discount > 0 && (
              <div className="flex justify-between">
                <dt style={{ color: "var(--text-tertiary)" }}>Discount</dt>
                <dd className="font-medium text-emerald-500">- {formatINR(discount)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt style={{ color: "var(--text-tertiary)" }}>Shipping</dt>
              <dd style={{ color: "var(--text-secondary)" }}>{shipping === 0 ? "Free" : formatINR(shipping)}</dd>
            </div>
            <div className="flex justify-between pt-3 text-base" style={{ borderTop: "1px solid var(--border-primary)" }}>
              <dt className="font-semibold" style={{ color: "var(--text-primary)" }}>
                Total
              </dt>
              <dd className="font-extrabold" style={{ color: "var(--text-primary)" }}>
                {formatINR(payTotal)}
              </dd>
            </div>
          </dl>
          <button
            type="submit"
            disabled={placing}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-500/25 transition-transform hover:scale-[1.02] disabled:opacity-60"
          >
            {placing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {placing
              ? form.paymentMethod === "cod"
                ? "Placing order…"
                : "Processing…"
              : form.paymentMethod === "razorpay"
                ? `Pay ${formatINR(payTotal)}`
                : form.paymentMethod === "wallet"
                  ? `Pay ${formatINR(payTotal)} with wallet`
                  : "Place order"}
          </button>
          <div className="mt-4 flex items-center justify-center gap-4 text-[11px]" style={{ color: "var(--text-muted)" }}>
            <span className="flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" /> Secure
            </span>
            <span className="flex items-center gap-1">
              <Wallet className="h-3 w-3" /> COD
            </span>
            <span className="flex items-center gap-1">
              <Truck className="h-3 w-3" /> {shipping === 0 ? "Free shipping" : formatINR(shipping) + " shipping"}
            </span>
          </div>
        </div>
      </form>
    </section>
  );
}
