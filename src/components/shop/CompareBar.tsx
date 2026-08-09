"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, GitCompareArrows, ShoppingCart, Trash2, X, Minus } from "lucide-react";
import { formatINR, type Product } from "@/lib/shop-data";
import { discountPct, isSoldOut, savingOf } from "@/lib/shop-filters";
import { useCompare, MAX_COMPARE } from "./CompareProvider";
import { useCart } from "./CartProvider";
import { useToast } from "./ToastProvider";
import ShopDialog from "./ShopDialog";
import ProductMedia from "./ProductMedia";
import Stars from "./Stars";

/**
 * Sticky compare tray plus the side-by-side comparison dialog. Renders nothing
 * until the shopper has picked at least one product.
 */
export default function CompareBar({ products }: { products: Product[] }) {
  const { ids, remove, clear, count, isOpen, open, close } = useCompare();
  const { add } = useCart();
  const { toast } = useToast();
  const reduceMotion = useReducedMotion();

  const selected = ids
    .map((id) => products.find((p) => p.id === id))
    .filter((p): p is Product => !!p);

  const rows: { label: string; render: (p: Product) => React.ReactNode }[] = [
    {
      label: "Price",
      render: (p) => (
        <div>
          <span className="text-lg font-extrabold" style={{ color: "var(--text-primary)" }}>
            {formatINR(p.price)}
          </span>
          {savingOf(p) > 0 && (
            <span className="ml-1.5 text-xs line-through" style={{ color: "var(--text-muted)" }}>
              {formatINR(p.compareAt!)}
            </span>
          )}
        </div>
      ),
    },
    {
      label: "Discount",
      render: (p) =>
        discountPct(p) > 0 ? (
          <span className="font-semibold" style={{ color: "#10b981" }}>
            {discountPct(p)}% off · save {formatINR(savingOf(p))}
          </span>
        ) : (
          <Minus className="h-4 w-4" style={{ color: "var(--text-muted)" }} aria-label="No discount" />
        ),
    },
    { label: "Rating", render: (p) => <Stars rating={p.rating} reviewCount={p.reviewCount} /> },
    { label: "Category", render: (p) => p.category },
    {
      label: "Availability",
      render: (p) =>
        isSoldOut(p) ? (
          <span style={{ color: "#ef4444" }}>Out of stock</span>
        ) : (
          <span style={{ color: "#10b981" }}>In stock{typeof p.stock === "number" ? ` (${p.stock})` : ""}</span>
        ),
    },
    {
      label: "Highlights",
      render: (p) => (
        <ul className="space-y-1">
          {p.specs.slice(0, 5).map((s) => (
            <li key={s} className="flex items-start gap-1.5 text-xs">
              <Check className="mt-0.5 h-3 w-3 shrink-0" style={{ color: "var(--accent-cyan)" }} /> {s}
            </li>
          ))}
        </ul>
      ),
    },
  ];

  return (
    <>
      <AnimatePresence>
        {count > 0 && !isOpen && (
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-x-0 bottom-0 z-[90] px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
          >
            <div
              className="mx-auto flex max-w-3xl items-center gap-3 rounded-2xl border p-3 shadow-lg backdrop-blur-xl"
              style={{
                background: "var(--bg-glass-strong)",
                borderColor: "var(--border-accent)",
                boxShadow: "var(--shadow-lg)",
              }}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto no-scrollbar">
                {selected.map((p) => (
                  <div key={p.id} className="relative shrink-0">
                    <ProductMedia
                      image={p.image}
                      accent={p.accent}
                      icon={p.icon}
                      name={p.name}
                      className="h-[44px] w-[44px] rounded-xl"
                      iconClass="text-lg"
                    />
                    <button
                      onClick={() => remove(p.id)}
                      aria-label={`Remove ${p.name} from comparison`}
                      className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border text-white"
                      style={{ background: "#ef4444", borderColor: "var(--bg-elevated)" }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {Array.from({ length: Math.max(0, 2 - count) }).map((_, i) => (
                  <div
                    key={`slot-${i}`}
                    aria-hidden="true"
                    className="grid h-[44px] w-[44px] shrink-0 place-items-center rounded-xl border border-dashed text-[10px]"
                    style={{ borderColor: "var(--border-hover)", color: "var(--text-muted)" }}
                  >
                    +
                  </div>
                ))}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={clear}
                  className="hidden rounded-xl border px-3 py-2 text-xs font-medium transition-colors sm:block"
                  style={{ borderColor: "var(--border-primary)", color: "var(--text-tertiary)" }}
                >
                  Clear
                </button>
                <button
                  onClick={open}
                  disabled={count < 2}
                  className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-cyan-500/25 transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
                >
                  <GitCompareArrows className="h-4 w-4" />
                  {count < 2 ? "Add 1 more" : `Compare (${count})`}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ShopDialog
        open={isOpen}
        onClose={close}
        title="Compare products"
        description={`${count} of ${MAX_COMPARE} products selected`}
        maxWidthClass="max-w-5xl"
      >
        <div className="overflow-x-auto p-5 sm:p-6">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <caption className="sr-only">Side-by-side comparison of selected Circuvent products</caption>
            <thead>
              <tr>
                <th scope="col" className="w-28 p-2 text-left align-bottom">
                  <span className="sr-only">Attribute</span>
                </th>
                {selected.map((p) => (
                  <th key={p.id} scope="col" className="p-2 align-bottom text-left">
                    <div className="flex flex-col gap-2">
                      <ProductMedia
                        image={p.image}
                        accent={p.accent}
                        icon={p.icon}
                        name={p.name}
                        className="h-24 w-full rounded-xl"
                        iconClass="text-3xl"
                      />
                      <Link
                        href={`/shop/${p.slug}`}
                        onClick={close}
                        className="text-sm font-bold leading-snug hover:opacity-80"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {p.name}
                      </Link>
                      <button
                        onClick={() => remove(p.id)}
                        className="inline-flex items-center gap-1 self-start text-[11px] font-medium transition-opacity hover:opacity-70"
                        style={{ color: "var(--text-muted)" }}
                      >
                        <Trash2 className="h-3 w-3" /> Remove
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} style={{ borderTop: "1px solid var(--border-primary)" }}>
                  <th
                    scope="row"
                    className="p-2 text-left align-top text-xs font-semibold uppercase tracking-wide"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {row.label}
                  </th>
                  {selected.map((p) => (
                    <td key={p.id} className="p-2 align-top" style={{ color: "var(--text-secondary)" }}>
                      {row.render(p)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr style={{ borderTop: "1px solid var(--border-primary)" }}>
                <th scope="row" className="p-2 text-left align-top">
                  <span className="sr-only">Actions</span>
                </th>
                {selected.map((p) => (
                  <td key={p.id} className="p-2 align-top">
                    <button
                      onClick={() => {
                        if (isSoldOut(p)) return;
                        add(p, 1, { silent: true });
                        toast({ title: `${p.name} added to cart`, action: { label: "View cart", href: "/cart" } });
                      }}
                      disabled={isSoldOut(p)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-3 py-2 text-xs font-semibold text-white transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
                    >
                      <ShoppingCart className="h-3.5 w-3.5" />
                      {isSoldOut(p) ? "Out of stock" : "Add to cart"}
                    </button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </ShopDialog>
    </>
  );
}
