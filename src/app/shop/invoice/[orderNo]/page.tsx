"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Loader2, Printer, ShieldCheck } from "lucide-react";
import { formatINR } from "@/lib/shop-data";
import { formatAddress, warrantyFooter, type BusinessDocument, type DocumentKind, type DocumentAddress } from "@/lib/documents";
import { warrantyDate } from "@/lib/warranty";
import { useAccount } from "@/components/shop/AccountProvider";
import { BRAND, documentContactLine } from "@/lib/brand";

interface CoverUnit {
  id: string;
  productName: string;
  deviceOrSerial: string;
  purchaseDate: string;
  warrantyMonths: number;
  auto: boolean;
}

const LABELS: Record<DocumentKind, string> = {
  invoice: "Invoice",
  "packing-slip": "Packing slip",
  "delivery-note": "Delivery note",
  "warranty-certificate": "Warranty certificate",
};

function AddressBlock({ heading, a }: { heading: string; a: DocumentAddress }) {
  const postal = formatAddress(a);
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{heading}</p>
      {a.name ? <p className="mt-1 font-semibold">{a.name}</p> : null}
      {postal ? <p className="text-slate-600">{postal}</p> : null}
      {a.phone ? <p className="text-slate-600">{a.phone}</p> : null}
      {a.email ? <p className="text-slate-600">{a.email}</p> : null}
      {!a.name && !postal ? <p className="text-slate-400">Not recorded</p> : null}
    </div>
  );
}

export default function InvoicePage() {
  const params = useParams<{ orderNo: string }>();
  const sp = useSearchParams();
  const { account, ready, authHeaders } = useAccount();
  // `type=packing` is the link format the account page has always used; keep it
  // working rather than breaking every invoice link a customer has been emailed.
  const initialKind = (sp.get("kind") || (sp.get("type") === "packing" ? "packing-slip" : "invoice")) as DocumentKind;

  const [kind, setKind] = useState<DocumentKind>(initialKind);
  const [doc, setDoc] = useState<BusinessDocument | null>(null);
  const [units, setUnits] = useState<CoverUnit[]>([]);
  const [available, setAvailable] = useState<DocumentKind[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const orderNo = params?.orderNo;
    if (!orderNo) {
      setErr("Missing order number.");
      setLoading(false);
      return;
    }
    /*
     * Wait for the account to load before asking, and before concluding
     * anything from a 401.
     *
     * The token lives in localStorage and is restored by AccountProvider after
     * mount, so a fetch fired on the first render carries no credentials. This
     * page asked immediately and rendered "Please sign in" at a customer who
     * was signed in — their name was in the header at the time.
     */
    if (!ready) return;

    // A guest who followed the link from their order confirmation has no
    // session, but the link carries the email the order was placed with, which
    // is what the API accepts instead. Checkout does not require an account,
    // so refusing here would mean a guest could never get their own invoice.
    const emailParam = sp.get("email") || "";
    if (!account && !emailParam) {
      setErr("Sign in, or open this from the link in your order confirmation email.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setErr("");
    const query = new URLSearchParams({ kind });
    if (!account && emailParam) query.set("email", emailParam);

    fetch(`/api/account/documents/${encodeURIComponent(orderNo)}?${query.toString()}`, {
      // The shop authenticates with a bearer token, not a cookie, so
      // credentials:"include" sends nothing at all.
      headers: { ...authHeaders() },
    })
      .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))
      .then(({ status, body }) => {
        if (cancelled) return;
        if (status === 401) {
          setErr(body?.message || "Sign in, or open this from the link in your order confirmation email.");
        } else if (body?.success) {
          setDoc(body.document);
          setUnits(Array.isArray(body.units) ? body.units : []);
          setAvailable(Array.isArray(body.available) ? body.available : []);
        } else {
          setErr(body?.message || "Could not load this document.");
          if (Array.isArray(body?.available)) setAvailable(body.available);
        }
      })
      .catch(() => {
        if (!cancelled) setErr("Could not load this document.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params, kind, ready, account, authHeaders, sp]);

  if (loading) {
    return (
      <div className="flex justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--accent-cyan)" }} />
      </div>
    );
  }

  if (err || !doc) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <p style={{ color: "var(--text-tertiary)" }}>{err || "Document unavailable."}</p>
        {available.length > 0 && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {available.map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className="min-h-[44px] rounded-xl border px-4 py-2 text-sm"
                style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}
              >
                {LABELS[k]}
              </button>
            ))}
          </div>
        )}
        <a href="/shop/account" className="mt-6 inline-block text-sm" style={{ color: "var(--accent-cyan-text)" }}>
          ← Back to account
        </a>
      </div>
    );
  }

  const issued = new Date(doc.issuedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  const placed = new Date(doc.placedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  const isCertificate = doc.kind === "warranty-certificate";

  return (
    <section className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <a href="/shop/account" className="text-sm" style={{ color: "var(--accent-cyan-text)" }}>
          ← Back to account
        </a>
        <div className="flex flex-wrap items-center gap-2">
          {available.map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              aria-pressed={k === doc.kind}
              className="min-h-[44px] rounded-xl border px-3 py-2 text-sm"
              style={{
                borderColor: k === doc.kind ? "var(--accent-cyan)" : "var(--border-subtle)",
                color: k === doc.kind ? "var(--accent-cyan-text)" : "var(--text-secondary)",
              }}
            >
              {LABELS[k]}
            </button>
          ))}
          <button
            onClick={() => window.print()}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white"
          >
            <Printer className="h-4 w-4" /> Print / Save PDF
          </button>
        </div>
      </div>

      <div id="doc" className="rounded-2xl border p-8" style={{ background: "#ffffff", borderColor: "#e2e8f0", color: "#0c1222" }}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-mark-160.png" alt="Circuvent" width={36} height={36} />
              <span className="text-xl font-bold">Circuvent Technologies</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">{documentContactLine()}</p>
          </div>
          <div className="text-right">
            <h1 className="text-lg font-extrabold">{doc.title}</h1>
            <p className="text-sm text-slate-600">{doc.number}</p>
            <p className="text-xs text-slate-500">Issued {issued}</p>
            <p className="text-xs text-slate-500">
              Order {doc.orderNo} · {placed}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-6 text-sm sm:grid-cols-3">
          <AddressBlock heading="Billed to" a={doc.billTo} />
          {doc.shipToSameAsBillTo ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Shipped to</p>
              <p className="mt-1 text-slate-600">Same as billing address</p>
            </div>
          ) : (
            <AddressBlock heading="Shipped to" a={doc.shipTo} />
          )}
          <div className="sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Status</p>
            <p className="mt-1 capitalize">{doc.status}</p>
            {doc.shows.payment && (
              <p className="capitalize text-slate-600">
                {doc.paymentMethod} · {doc.paymentStatus}
              </p>
            )}
            {doc.shows.tracking && doc.trackingNumber && (
              <p className="text-slate-600">
                {doc.carrier} · {doc.trackingNumber}
              </p>
            )}
          </div>
        </div>

        {!isCertificate && (
          <table className="mt-6 w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2">Item</th>
                <th className="py-2 text-center">Qty</th>
                {doc.shows.warrantyDetail && <th className="py-2 text-left">Warranty</th>}
                {doc.shows.prices && <th className="py-2 text-right">Price</th>}
                {doc.shows.prices && <th className="py-2 text-right">Amount</th>}
              </tr>
            </thead>
            <tbody>
              {doc.lines.map((l, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-2">{l.name}</td>
                  <td className="py-2 text-center">{l.qty}</td>
                  {doc.shows.warrantyDetail && (
                    <td className="py-2 text-slate-600">
                      {l.warranty.state === "not-started" ? "From delivery" : `to ${warrantyDate(l.warranty.expiry)}`}
                    </td>
                  )}
                  {doc.shows.prices && <td className="py-2 text-right">{formatINR(l.unitPrice)}</td>}
                  {doc.shows.prices && <td className="py-2 text-right">{formatINR(l.lineTotal)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {doc.shows.totals && (
          <div className="mt-4 ml-auto w-full max-w-[260px] text-sm">
            <div className="flex justify-between py-1">
              <span className="text-slate-500">Subtotal</span>
              <span>{formatINR(doc.totals.subtotal)}</span>
            </div>
            {doc.totals.discount > 0 && (
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Discount</span>
                <span style={{ color: "var(--status-success-text)" }}>- {formatINR(doc.totals.discount)}</span>
              </div>
            )}
            <div className="flex justify-between py-1">
              <span className="text-slate-500">Shipping</span>
              <span>{doc.totals.shipping === 0 ? "Free" : formatINR(doc.totals.shipping)}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-slate-200 py-2 text-base font-extrabold">
              <span>Total</span>
              <span>{formatINR(doc.totals.total)}</span>
            </div>
          </div>
        )}

        {doc.shows.payment && doc.transaction && (
          <div className="mt-6 rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Payment</p>
            <div className="mt-2 grid gap-2 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs text-slate-400">Method</p>
                <p className="capitalize">{doc.transaction.method || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Status</p>
                <p className="capitalize">{doc.transaction.status || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Paid on</p>
                <p>{doc.transaction.paidAt ? warrantyDate(doc.transaction.paidAt) : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Amount</p>
                <p className="font-semibold">{formatINR(doc.transaction.amount)}</p>
              </div>
            </div>
            {/* The gateway reference is the point of this block: without it a
                customer disputing a charge, or an accountant matching a bank
                line, has nothing to match against. */}
            {doc.transaction.reference && (
              <div className="mt-2">
                <p className="text-xs text-slate-400">Transaction reference</p>
                <p className="font-mono text-xs">{doc.transaction.reference}</p>
              </div>
            )}
          </div>
        )}

        {doc.shows.warrantyDetail && (
          <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-slate-500" />
              <p className="text-sm font-semibold">Warranty</p>
            </div>
            <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400">Cover begins</p>
                <p>{doc.warranty.start ? warrantyDate(doc.warranty.start) : "On delivery"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400">Cover ends</p>
                <p>{doc.warranty.expiry ? warrantyDate(doc.warranty.expiry) : "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400">Term</p>
                <p>{doc.warranty.months} months</p>
              </div>
            </div>

            {units.length > 0 && (
              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-1">Unit</th>
                    <th className="py-1">Device / serial</th>
                  </tr>
                </thead>
                <tbody>
                  {units.map((u) => (
                    <tr key={u.id} className="border-b border-slate-100">
                      <td className="py-1">{u.productName}</td>
                      <td className="py-1 font-mono text-xs text-slate-600">{u.deviceOrSerial}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        <p className="mt-8 text-center text-xs text-slate-400">
          {warrantyFooter(doc)} · Made in India · circuvent.com/warranty
        </p>
      </div>
    </section>
  );
}
