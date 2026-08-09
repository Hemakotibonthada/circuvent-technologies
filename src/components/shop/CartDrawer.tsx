"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { X, Minus, Plus, Trash2, ArrowRight, Truck, ShoppingBag } from "lucide-react";
import { useCart } from "./CartProvider";
import ProductMedia from "./ProductMedia";
import { formatINR } from "@/lib/shop-data";

export default function CartDrawer() {
  const { items, isOpen, close, setQty, remove, subtotal, shipping, total, freeShipOver, count } =
    useCart();
  const remaining = Math.max(0, freeShipOver - subtotal);
  const pct = freeShipOver > 0 ? Math.min(100, Math.round((subtotal / freeShipOver) * 100)) : 100;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-[100]"
            style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
          />
          <motion.aside
            className="fixed right-0 top-0 z-[101] flex h-full w-full max-w-md flex-col"
            style={{ background: "var(--bg-elevated)", borderLeft: "1px solid var(--border-primary)" }}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.3, ease: "easeInOut" }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: "1px solid var(--border-primary)" }}
            >
              <h3 className="flex items-center gap-2 font-semibold" style={{ color: "var(--text-primary)" }}>
                <ShoppingBag className="h-5 w-5" style={{ color: "var(--accent-cyan)" }} /> Your cart
                {count > 0 && (
                  <span className="text-sm font-normal" style={{ color: "var(--text-muted)" }}>
                    ({count})
                  </span>
                )}
              </h3>
              <button
                onClick={close}
                aria-label="Close cart"
                style={{ color: "var(--text-tertiary)" }}
                className="transition-colors hover:opacity-70"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {items.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
                <ShoppingBag className="h-[44px] w-[44px]" style={{ color: "var(--text-muted)" }} />
                <p style={{ color: "var(--text-tertiary)" }}>Your cart is empty.</p>
                <Link
                  href="/shop"
                  onClick={close}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-5 py-2.5 text-sm font-semibold text-white"
                >
                  Browse the shop <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ) : (
              <>
                {/* Free shipping progress */}
                <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--border-primary)" }}>
                  {remaining > 0 ? (
                    <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      Add{" "}
                      <span className="font-semibold" style={{ color: "var(--accent-cyan)" }}>
                        {formatINR(remaining)}
                      </span>{" "}
                      more for free shipping
                    </p>
                  ) : (
                    <p className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--accent-cyan)" }}>
                      <Truck className="h-3.5 w-3.5" /> You&apos;ve unlocked free shipping!
                    </p>
                  )}
                  <div
                    className="mt-2 h-1.5 overflow-hidden rounded-full"
                    style={{ background: "var(--bg-surface-hover)" }}
                  >
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-violet-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.4 }}
                    />
                  </div>
                </div>

                {/* Items */}
                <div className="flex-1 overflow-y-auto px-5">
                  {items.map((it) => (
                    <div
                      key={it.id}
                      className="flex items-center gap-3 py-4"
                      style={{ borderBottom: "1px solid var(--border-primary)" }}
                    >
                      <ProductMedia
                        image={it.image}
                        accent={it.accent}
                        icon={it.icon}
                        name={it.name}
                        className="h-14 w-14 shrink-0 rounded-xl"
                        iconClass="text-2xl"
                      />
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/shop/${it.slug}`}
                          onClick={close}
                          className="line-clamp-1 text-sm font-semibold hover:opacity-80"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {it.name}
                        </Link>
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {formatINR(it.price)}
                        </p>
                        <div
                          className="mt-1.5 inline-flex items-center rounded-lg border"
                          style={{ borderColor: "var(--border-primary)" }}
                        >
                          <button
                            onClick={() => setQty(it.id, it.qty - 1)}
                            className="grid h-7 w-7 place-items-center hover:opacity-70"
                            style={{ color: "var(--text-secondary)" }}
                            aria-label="Decrease"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-7 text-center text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                            {it.qty}
                          </span>
                          <button
                            onClick={() => setQty(it.id, it.qty + 1)}
                            className="grid h-7 w-7 place-items-center hover:opacity-70"
                            style={{ color: "var(--text-secondary)" }}
                            aria-label="Increase"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                          {formatINR(it.price * it.qty)}
                        </span>
                        <button
                          onClick={() => remove(it.id)}
                          aria-label="Remove"
                          className="hover:opacity-70"
                          style={{ color: "var(--text-muted)" }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Footer */}
                <div className="px-5 py-4" style={{ borderTop: "1px solid var(--border-primary)" }}>
                  <div className="flex justify-between text-sm">
                    <span style={{ color: "var(--text-tertiary)" }}>Subtotal</span>
                    <span style={{ color: "var(--text-secondary)" }}>{formatINR(subtotal)}</span>
                  </div>
                  <div className="mt-1 flex justify-between text-sm">
                    <span style={{ color: "var(--text-tertiary)" }}>Shipping</span>
                    <span style={{ color: "var(--text-secondary)" }}>
                      {shipping === 0 ? "Free" : formatINR(shipping)}
                    </span>
                  </div>
                  <div
                    className="mt-2 flex justify-between pt-2 text-base"
                    style={{ borderTop: "1px solid var(--border-primary)" }}
                  >
                    <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                      Total
                    </span>
                    <span className="font-extrabold" style={{ color: "var(--text-primary)" }}>
                      {formatINR(total)}
                    </span>
                  </div>
                  <Link
                    href="/checkout"
                    onClick={close}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-500/25 transition-transform hover:scale-[1.02]"
                  >
                    Checkout <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/cart"
                    onClick={close}
                    className="mt-2 block w-full rounded-xl border px-5 py-2.5 text-center text-sm font-medium transition-colors"
                    style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}
                  >
                    View full cart
                  </Link>
                </div>
              </>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
