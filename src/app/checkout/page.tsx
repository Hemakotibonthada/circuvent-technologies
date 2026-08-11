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
  const [quote, setQuote] = useState<{
    subtotal: number;
    shipping: number;
    discount: number;
    total: number;
    lines: { name: string; price: number; qty: number; lineTotal: number }[];
  } | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<
    Array<{ id: string; label: string; name: string; phone: string; line1: string; line2?: string; city: string; state: string; pincode: string; isDefaultShipping?: boolean }>
  >([]);
  const [selectedAddrId, setSelectedAddrId] = useState<string | null>(null);
  const [saveAddr, setSaveAddr] = useState(true);
  const [applyWallet, setApplyWallet] = useState(false);

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

  // Load the customer's saved addresses and prefill the default shipping one.
  useEffect(() => {
    if (!account) {
      setSavedAddresses([]);
      return;
    }
    fetch("/api/account/addresses", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = d?.addresses || [];
        setSavedAddresses(list);
        const def = list.find((a: { isDefaultShipping?: boolean }) => a.isDefaultShipping) || list[0];
        if (def) {
          setSelectedAddrId(def.id);
          setForm((f) => ({
            ...f,
            name: f.name || def.name || "",
            phone: f.phone || def.phone || "",
            address: f.address || [def.line1, def.line2].filter(Boolean).join(", "),
            city: f.city || def.city || "",
            state: f.state || def.state || "",
            pincode: f.pincode || def.pincode || "",
          }));
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  // Live, server-authoritative price quote (reflects admin price edits + coupon).
  useEffect(() => {
    if (items.length === 0) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    fetch("/api/shop/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: items.map((i) => ({ id: i.id, slug: i.slug, qty: i.qty })), coupon: coupon?.code }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.success) {
          setQuote({ subtotal: d.subtotal, shipping: d.shipping, discount: d.discount, total: d.total, lines: d.lines });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [items, coupon]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const cartPayload = () => items.map((i) => ({ id: i.id, slug: i.slug, qty: i.qty }));

  // Fill the delivery form from a chosen saved address.
  const applyAddress = (a: (typeof savedAddresses)[number]) => {
    setSelectedAddrId(a.id);
    setForm((f) => ({
      ...f,
      name: a.name || f.name,
      phone: a.phone || f.phone,
      address: [a.line1, a.line2].filter(Boolean).join(", "),
      city: a.city || f.city,
      state: a.state || f.state,
      pincode: a.pincode || f.pincode,
    }));
  };

  const dispSubtotal = quote?.subtotal ?? subtotal;
  const dispShipping = quote?.shipping ?? shipping;
  const discount = quote?.discount ?? (coupon?.discount || 0);
  const payTotal = quote?.total ?? Math.max(0, subtotal + shipping - discount);
  // Partial wallet redemption: how much wallet is applied, and what remains due.
  const walletUse = account && applyWallet && wallet > 0 ? Math.min(wallet, payTotal) : 0;
  const dueNow = Math.max(0, payTotal - walletUse);
  const fullWallet = walletUse > 0 && dueNow === 0;

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
    // Save this delivery address to the address book for next time (signed-in only).
    if (account && saveAddr && form.address.trim() && form.pincode.trim()) {
      const norm = (s: string) => s.trim().toLowerCase();
      const dup = savedAddresses.some(
        (a) => a.pincode === form.pincode.trim() && norm([a.line1, a.line2].filter(Boolean).join(", ")) === norm(form.address)
      );
      if (!dup) {
        fetch("/api/account/addresses", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            label: "Home",
            name: form.name,
            phone: form.phone,
            line1: form.address,
            city: form.city,
            state: form.state,
            pincode: form.pincode,
            isDefaultShipping: savedAddresses.length === 0,
          }),
        }).catch(() => {});
      }
    }
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
      const method = fullWallet ? "wallet" : form.paymentMethod; // "cod" otherwise
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          items: cartPayload(),
          customer: { ...form, paymentMethod: method },
          coupon: coupon?.code,
          walletApply: fullWallet ? 0 : walletUse,
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (walletUse > 0 || form.paymentMethod === "wallet") refreshWallet();
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
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ items: cartPayload(), coupon: coupon?.code, walletApply: walletUse }),
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
              headers: { "Content-Type": "application/json", ...authHeaders() },
              body: JSON.stringify({ ...resp, items: cartPayload(), customer: form, coupon: coupon?.code, walletApply: walletUse }),
            });
            const vd = await vr.json();
            if (vd.success) { if (walletUse > 0) refreshWallet(); finalize(vd.order); }
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
    if (fullWallet) placeOffline();
    else if (form.paymentMethod === "razorpay") payOnline();
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
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-5 py-2.5 text-sm font-semibold text-white"
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
          className="min-h-[44px] mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-5 py-2.5 text-sm font-semibold text-white"
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
          /* This form replaces the whole page when signed out, so its title is
             the page title. Without h1 the document starts at h2 and a screen
             reader jumping by heading finds no top-level landmark. */
          as="h1"
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

          {account && savedAddresses.length > 0 && (
            <div className="rounded-xl border p-3" style={{ borderColor: "var(--border-primary)", background: "var(--bg-glass)" }}>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                Deliver to a saved address
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {savedAddresses.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => applyAddress(a)}
                    className="rounded-lg border px-3 py-2 text-left text-xs transition-colors"
                    style={
                      selectedAddrId === a.id
                        ? { borderColor: "var(--accent-cyan)", background: "var(--accent-cyan-muted)", color: "var(--accent-cyan)" }
                        : { borderColor: "var(--border-primary)", color: "var(--text-secondary)" }
                    }
                  >
                    <span className="font-semibold">
                      {a.label}
                      {a.isDefaultShipping ? " • default" : ""}
                    </span>
                    <br />
                    <span style={{ color: "var(--text-muted)" }}>
                      {[a.line1, a.city, a.pincode].filter(Boolean).join(", ")}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
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

          {account && (
            <label className="flex cursor-pointer items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
              <input type="checkbox" className="accent-cyan-500" checked={saveAddr} onChange={(e) => setSaveAddr(e.target.checked)} />
              Save this address to my address book for future orders
            </label>
          )}

          <div>
            <label className={labelCls} style={{ color: "var(--text-tertiary)" }}>
              Payment method
            </label>

            {account && wallet > 0 && (
              <label
                className="mb-2 flex cursor-pointer items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm"
                style={{
                  borderColor: applyWallet ? "var(--accent-cyan)" : "var(--border-primary)",
                  background: applyWallet ? "var(--accent-cyan-muted)" : "transparent",
                  color: "var(--text-secondary)",
                }}
              >
                <span className="flex items-center gap-2">
                  <input type="checkbox" className="accent-cyan-500" checked={applyWallet} onChange={(e) => setApplyWallet(e.target.checked)} />
                  Use Circuvent Wallet — {formatINR(wallet)} available
                </span>
                {applyWallet && walletUse > 0 && (
                  <span className="font-semibold" style={{ color: "var(--accent-cyan)" }}>− {formatINR(walletUse)}</span>
                )}
              </label>
            )}

            {fullWallet ? (
              <p className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--accent-cyan)", background: "var(--accent-cyan-muted)", color: "var(--accent-cyan)" }}>
                Your wallet covers this order in full — no other payment needed.
              </p>
            ) : (
              <>
                {walletUse > 0 && (
                  <p className="mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
                    Pay the remaining <b>{formatINR(dueNow)}</b> with:
                  </p>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    { id: "razorpay", label: "Pay online — cards, UPI, netbanking" },
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
              </>
            )}
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
            {items.map((it, idx) => (
              <div key={it.id} className="flex justify-between text-sm">
                <span style={{ color: "var(--text-secondary)" }}>
                  {it.name} <span style={{ color: "var(--text-muted)" }}>× {it.qty}</span>
                </span>
                <span style={{ color: "var(--text-secondary)" }}>{formatINR(quote?.lines?.[idx]?.lineTotal ?? it.price * it.qty)}</span>
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
              <dd style={{ color: "var(--text-secondary)" }}>{formatINR(dispSubtotal)}</dd>
            </div>
            {discount > 0 && (
              <div className="flex justify-between">
                <dt style={{ color: "var(--text-tertiary)" }}>Discount</dt>
                <dd className="font-medium text-emerald-500">- {formatINR(discount)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt style={{ color: "var(--text-tertiary)" }}>Shipping</dt>
              <dd style={{ color: "var(--text-secondary)" }}>{dispShipping === 0 ? "Free" : formatINR(dispShipping)}</dd>
            </div>
            <div className="flex justify-between pt-3 text-base" style={{ borderTop: "1px solid var(--border-primary)" }}>
              <dt className="font-semibold" style={{ color: "var(--text-primary)" }}>
                Total
              </dt>
              <dd className="font-extrabold" style={{ color: "var(--text-primary)" }}>
                {formatINR(payTotal)}
              </dd>
            </div>
            {walletUse > 0 && (
              <>
                <div className="flex justify-between">
                  <dt style={{ color: "var(--text-tertiary)" }}>Wallet applied</dt>
                  <dd className="font-medium text-emerald-500">- {formatINR(walletUse)}</dd>
                </div>
                <div className="flex justify-between pt-2 text-base" style={{ borderTop: "1px dashed var(--border-primary)" }}>
                  <dt className="font-semibold" style={{ color: "var(--text-primary)" }}>
                    {fullWallet ? "Paid by wallet" : "Due now"}
                  </dt>
                  <dd className="font-extrabold" style={{ color: "var(--accent-cyan)" }}>
                    {formatINR(dueNow)}
                  </dd>
                </div>
              </>
            )}
          </dl>
          <button
            type="submit"
            disabled={placing}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-500/25 transition-transform hover:scale-[1.02] disabled:opacity-60"
          >
            {placing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {placing
              ? form.paymentMethod === "cod" || fullWallet
                ? "Placing order…"
                : "Processing…"
              : fullWallet
                ? `Pay ${formatINR(payTotal)} with wallet`
                : form.paymentMethod === "razorpay"
                  ? `Pay ${formatINR(dueNow)}`
                  : walletUse > 0
                    ? `Place order · ${formatINR(dueNow)} on delivery`
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
