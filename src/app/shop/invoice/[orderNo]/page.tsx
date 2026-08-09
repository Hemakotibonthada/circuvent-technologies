"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Loader2, Printer } from "lucide-react";
import { formatINR } from "@/lib/shop-data";

interface InvoiceOrder {
  orderNo: string;
  placedAt: string;
  items: { name: string; price?: number; qty: number; lineTotal: number }[];
  subtotal: number;
  shipping: number;
  discount?: number;
  total: number;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  trackingNumber?: string | null;
  carrier?: string | null;
  customer: { name?: string; email?: string; phone?: string; address?: string; city?: string; state?: string; pincode?: string };
}

export default function InvoicePage() {
  const params = useParams<{ orderNo: string }>();
  const sp = useSearchParams();
  const email = sp.get("email") || "";
  const packing = sp.get("type") === "packing";
  const [order, setOrder] = useState<InvoiceOrder | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const orderNo = params?.orderNo;
    if (!orderNo || !email) {
      setErr("Missing order number or email.");
      return;
    }
    fetch(`/api/orders/track?order=${encodeURIComponent(orderNo)}&email=${encodeURIComponent(email)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.success) setOrder(d.order);
        else setErr("Order not found.");
      })
      .catch(() => setErr("Could not load the order."));
  }, [params, email]);

  if (err) {
    return <div className="mx-auto max-w-2xl px-6 py-24 text-center" style={{ color: "var(--text-tertiary)" }}>{err}</div>;
  }
  if (!order) {
    return (
      <div className="flex justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--accent-cyan)" }} />
      </div>
    );
  }

  const addr = [order.customer.address, order.customer.city, order.customer.state, order.customer.pincode]
    .filter(Boolean)
    .join(", ");
  const date = new Date(order.placedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

  return (
    <section className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <a href="/shop/account" className="text-sm" style={{ color: "var(--accent-cyan)" }}>← Back to account</a>
        <button
          onClick={() => window.print()}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white"
        >
          <Printer className="h-4 w-4" /> Print / Save PDF
        </button>
      </div>

      <div
        id="doc"
        className="rounded-2xl border p-8"
        style={{ background: "#ffffff", borderColor: "#e2e8f0", color: "#0c1222" }}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-mark-160.png" alt="Circuvent" width={36} height={36} />
              <span className="text-xl font-bold">Circuvent Technologies</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">circuvent.com · support: hema@circuvent.com</p>
          </div>
          <div className="text-right">
            <h1 className="text-lg font-extrabold">{packing ? "PACKING SLIP" : "INVOICE"}</h1>
            <p className="text-sm text-slate-600">{order.orderNo}</p>
            <p className="text-xs text-slate-500">{date}</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-6 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {packing ? "Ship to" : "Billed to"}
            </p>
            <p className="mt-1 font-semibold">{order.customer.name}</p>
            <p className="text-slate-600">{addr}</p>
            <p className="text-slate-600">{order.customer.phone}</p>
            <p className="text-slate-600">{order.customer.email}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Status</p>
            <p className="mt-1 capitalize">{order.status}</p>
            {!packing && <p className="text-slate-600 capitalize">{order.paymentMethod} · {order.paymentStatus}</p>}
            {order.trackingNumber && <p className="text-slate-600">{order.carrier} · {order.trackingNumber}</p>}
          </div>
        </div>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2">Item</th>
              <th className="py-2 text-center">Qty</th>
              {!packing && <th className="py-2 text-right">Price</th>}
              {!packing && <th className="py-2 text-right">Amount</th>}
            </tr>
          </thead>
          <tbody>
            {order.items.map((it, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="py-2">{it.name}</td>
                <td className="py-2 text-center">{it.qty}</td>
                {!packing && <td className="py-2 text-right">{formatINR(it.price ?? it.lineTotal / it.qty)}</td>}
                {!packing && <td className="py-2 text-right">{formatINR(it.lineTotal)}</td>}
              </tr>
            ))}
          </tbody>
        </table>

        {!packing && (
          <div className="mt-4 ml-auto w-full max-w-[240px] text-sm">
            <div className="flex justify-between py-1"><span className="text-slate-500">Subtotal</span><span>{formatINR(order.subtotal)}</span></div>
            {order.discount ? (
              <div className="flex justify-between py-1"><span className="text-slate-500">Discount</span><span style={{ color: "var(--status-success-text)" }}>- {formatINR(order.discount)}</span></div>
            ) : null}
            <div className="flex justify-between py-1"><span className="text-slate-500">Shipping</span><span>{order.shipping === 0 ? "Free" : formatINR(order.shipping)}</span></div>
            <div className="mt-1 flex justify-between border-t border-slate-200 py-2 text-base font-extrabold"><span>Total</span><span>{formatINR(order.total)}</span></div>
          </div>
        )}

        <p className="mt-8 text-center text-xs text-slate-400">
          Thank you for shopping with Circuvent · Made in India · 6-month warranty on every device
        </p>
      </div>
    </section>
  );
}
