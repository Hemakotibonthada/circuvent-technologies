import Link from "next/link";
import { ShieldCheck, RotateCcw, Truck } from "lucide-react";
import { WARRANTY_MONTHS, RETURN_DAYS, POLICY_LINKS } from "@/lib/shop-policy";
import { SHIPPING, formatINR } from "@/lib/shop-data";

/**
 * The three commercial terms a shopper weighs before committing: what happens
 * if it breaks, what happens if they change their mind, and what delivery
 * costs. All three were already company policy but lived only on separate
 * policy pages, which is too far away to influence the decision.
 *
 * Each links to the page that is the actual contract, so the summary can be
 * checked rather than taken on trust.
 */
export default function ProductAssurance() {
  const items = [
    {
      icon: ShieldCheck,
      title: `${WARRANTY_MONTHS}-month warranty`,
      detail: "Limited hardware cover from delivery",
      href: POLICY_LINKS.warranty,
    },
    {
      icon: RotateCcw,
      title: `${RETURN_DAYS}-day returns`,
      detail: "Unused, in original packaging",
      href: POLICY_LINKS.returns,
    },
    {
      icon: Truck,
      title: `Free delivery over ${formatINR(SHIPPING.freeOver)}`,
      detail: `${formatINR(SHIPPING.flat)} flat rate below that`,
      href: POLICY_LINKS.shipping,
    },
  ];

  return (
    <ul className="mt-6 grid gap-2 sm:grid-cols-3">
      {items.map(({ icon: Icon, title, detail, href }) => (
        <li key={title}>
          <Link
            href={href}
            className="flex h-full min-h-[44px] items-start gap-2.5 rounded-xl border p-3 transition-colors hover:border-[var(--border-hover)]"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)" }}
          >
            <Icon
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
              style={{ color: "var(--accent-cyan)" }}
            />
            <span className="min-w-0">
              <span className="block text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                {title}
              </span>
              <span className="block text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>
                {detail}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
