"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Building2, Layers } from "lucide-react";
import type { SaaSProduct } from "@/lib/saas-products";
import { SAAS_PRODUCTS } from "@/lib/saas-products";
import { useAccount } from "@/components/shop/AccountProvider";
import { cn } from "@/lib/utils";

type DomainIcon = React.ComponentType<{ className?: string }>;

interface PortalProps {
  domainIcons: Record<string, DomainIcon>;
}

interface SubscriptionRow {
  id: string;
  orgName: string;
  customerEmail: string;
  productSlug: string;
  planId: string;
  planName: string;
  seats: number;
  status: string;
  renewsAt: string;
  priceLabel: string;
  createdAt: string;
  product?: SaaSProduct | null;
  invoices?: InvoiceRow[];
}

interface InvoiceRow {
  id: string;
  amount: number | string;
  status: string;
  description: string;
  issuedAt: string;
  dueAt: string;
}

export default function PortalClient({ domainIcons }: PortalProps) {
  const { account } = useAccount();
  const [email, setEmail] = useState(account?.email || "");
  const [queryEmail, setQueryEmail] = useState(account?.email || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [active, setActive] = useState<string | null>(null);

  async function load(targetEmail: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/saas/portal?email=${encodeURIComponent(targetEmail)}`);
      const data = (await res.json()) as {
        success?: boolean;
        message?: string;
        subscriptions?: SubscriptionRow[];
        invoices?: InvoiceRow[];
      };
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Could not load portal");
      }
      setSubscriptions(data.subscriptions || []);
      setInvoices(data.invoices || []);
      setActive(data.subscriptions?.[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load portal");
      setSubscriptions([]);
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (account?.email) {
      setEmail(account.email);
      setQueryEmail(account.email);
      void load(account.email);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.email]);

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    void load(queryEmail.trim().toLowerCase());
  }

  const selected = subscriptions.find((s) => s.id === active) ?? null;
  // Invoices are scoped to the same email as the portal lookup.
  const selectedInvoiceList = invoices;

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-1 space-y-4">
        <form onSubmit={onSearch} className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Look up your portal
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Use the billing email from checkout.
          </p>
          <label className="block text-sm">
            <span className="text-muted-foreground">Email</span>
            <input
              value={queryEmail}
              onChange={(e) => setQueryEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="billing@company.com"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-primary py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {loading ? "Loading…" : "Search"}
          </button>
        </form>

        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Active products
          </p>
          {loading ? (
            <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
              Loading…
            </p>
          ) : subscriptions.length === 0 ? (
            <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
              No subscriptions for this email.{" "}
              <Link href="/products" className="underline" style={{ color: "var(--accent-cyan)" }}>
                Buy a plan
              </Link>
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {subscriptions.map((s) => {
                const Icon = domainIcons[s.productSlug as keyof typeof domainIcons] ?? Layers;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setActive(s.id)}
                      className={cn(
                        "w-full rounded-xl border px-3 py-2 text-left transition-colors",
                        active === s.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/30"
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: s.product?.accent }} />
                        <div>
                          <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                            {s.product?.name || s.planName}
                          </p>
                          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                            {s.status} · {s.seats} seats
                          </p>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="lg:col-span-2 space-y-4">
        {selected ? (
          <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Subscription
                </p>
                <h2 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
                  {selected.product?.name || selected.planName}
                </h2>
                <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                  {selected.orgName} · {selected.planName}
                </p>
              </div>
              <span
                className="rounded-full px-3 py-1 text-xs font-medium capitalize"
                style={{
                  background:
                    selected.status === "active"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                      : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
                }}
              >
                {selected.status}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border p-3">
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Plan</p>
                <p className="mt-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  {selected.planName}
                </p>
              </div>
              <div className="rounded-xl border border-border p-3">
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Seats</p>
                <p className="mt-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  {selected.seats}
                </p>
              </div>
              <div className="rounded-xl border border-border p-3">
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Renews</p>
                <p className="mt-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  {new Date(selected.renewsAt).toLocaleDateString()}
                </p>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Launch products
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {SAAS_PRODUCTS.map((p) => {
                  const Icon = domainIcons[p.domain] ?? Layers;
                  return (
                    <a
                      key={p.slug}
                      href={p.href}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm hover:border-primary/40"
                    >
                      <Icon className="h-4 w-4" style={{ color: p.accent }} />
                      <span style={{ color: "var(--text-primary)" }}>{p.name}</span>
                      <ExternalLink className="ml-auto h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
                    </a>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Invoices
              </p>
              {selectedInvoiceList.length === 0 ? (
                <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
                  No invoices yet.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {selectedInvoiceList.map((inv) => (
                    <li key={inv.id} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">
                      <div>
                        <p style={{ color: "var(--text-primary)" }}>{inv.description}</p>
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {new Date(inv.issuedAt).toLocaleDateString()} · {inv.id}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                          ₹{Number(inv.amount).toLocaleString("en-IN")}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] capitalize",
                            inv.status === "paid"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-900"
                          )}
                        >
                          {inv.status}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
            <Building2 className="mx-auto h-8 w-8" style={{ color: "var(--text-muted)" }} />
            <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>
              Select a subscription or look up your portal by email to see apps and invoices.
            </p>
          </section>
        )}

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
