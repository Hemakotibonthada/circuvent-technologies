"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import type { SaaSProduct } from "@/lib/saas-products";
import { formatPlanPrice } from "@/lib/saas-products";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/components/shop/AccountProvider";

export default function ProductSubscribe({ product }: { product: SaaSProduct }) {
  const { account } = useAccount();
  const [planId, setPlanId] = useState(product.plans[0]?.id ?? "starter");
  const [seats, setSeats] = useState(product.plans[0]?.seats ?? 5);
  const [orgName, setOrgName] = useState(account?.name || "");
  const [email, setEmail] = useState(account?.email || "");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{
    subscriptionId: string;
    status: string;
    amount: number;
  } | null>(null);

  const plan = product.plans.find((p) => p.id === planId) ?? product.plans[0];
  const amount = plan?.price ?? 0;

  async function subscribe() {
    setPlacing(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/saas/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productSlug: product.slug,
          planId: plan?.id,
          orgName: orgName || "My organisation",
          customerEmail: email || "unknown@example.com",
          seats,
          paymentMode: amount > 0 ? "manual" : "manual",
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        message?: string;
        subscription?: { id: string; status: string };
        amount?: number;
      };
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Checkout failed");
      }
      setDone({
        subscriptionId: data.subscription!.id,
        status: data.subscription!.status,
        amount: data.amount ?? amount,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setPlacing(false);
    }
  }

  return (
    <aside className="sticky top-24 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        Subscribe
      </p>
      <p className="mt-1 text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
        {formatPlanPrice(amount)}
      </p>
      <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
        {plan?.name} · {seats} seats
      </p>

      <label className="mt-4 block text-sm">
        <span className="text-muted-foreground">Organisation</span>
        <input
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          placeholder="Acme Corp"
        />
      </label>
      <label className="mt-3 block text-sm">
        <span className="text-muted-foreground">Billing email</span>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          placeholder="billing@company.com"
        />
      </label>
      <label className="mt-3 block text-sm">
        <span className="text-muted-foreground">Seats</span>
        <input
          type="number"
          min={1}
          max={10_000}
          value={seats}
          onChange={(e) => setSeats(Number(e.target.value))}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        />
      </label>

      <label className="mt-3 block text-sm">
        <span className="text-muted-foreground">Plan</span>
        <select
          value={planId}
          onChange={(e) => {
            setPlanId(e.target.value);
            const next = product.plans.find((p) => p.id === e.target.value);
            if (next) setSeats(next.seats);
          }}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        >
          {product.plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {formatPlanPrice(p.price)}
            </option>
          ))}
        </select>
      </label>

      {plan?.features?.length ? (
        <ul className="mt-4 space-y-1.5">
          {plan.features.map((f) => (
            <li key={f} className="flex gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: product.accent }} />
              {f}
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {done ? (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm" style={{ color: "var(--text-primary)" }}>
          <p className="font-medium">Subscription activated</p>
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            ID {done.subscriptionId} · {done.status} · ₹{done.amount}
          </p>
          <Link href="/portal" className="mt-2 inline-block text-xs font-medium underline">
            Go to customer portal
          </Link>
        </div>
      ) : (
        <Button
          type="button"
          className="mt-4 w-full rounded-full"
          disabled={placing}
          onClick={subscribe}
        >
          {placing ? "Processing…" : "Subscribe now"}
        </Button>
      )}

      <p className="mt-3 text-center text-[11px]" style={{ color: "var(--text-muted)" }}>
        Or{" "}
        <Link href="/pricing" className="underline">
          browse all plans
        </Link>
      </p>
    </aside>
  );
}
