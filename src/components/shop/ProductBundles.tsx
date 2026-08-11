"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Package, Plus, Check } from "lucide-react";
import { formatINR, products as staticProducts, type Product } from "@/lib/shop-data";
import { useCart } from "./CartProvider";

interface BundleItem {
  id: string;
  name: string;
  slug: string;
  price: number;
  image: string;
}

interface ShopBundle {
  id: string;
  name: string;
  productIds: string[];
  bundlePrice: number;
  catalogTotal: number;
  savings: number;
  savingsPct: number;
  items: BundleItem[];
}

/**
 * "Buy together and save" — bundles that include the product being viewed.
 *
 * Bundles were configurable in the admin panel and shown to nobody, so a
 * merchandising decision the owner had already made had no effect on the store.
 *
 * The saving is not applied here. Adding the items puts ordinary products in
 * the cart and the server recognises the complete set and discounts it (see
 * bundle-pricing.ts). That is deliberate: a price posted from the browser would
 * be discarded by priceItems, so quoting one here would show a total the
 * checkout then refused to honour.
 */
export default function ProductBundles({ product }: { product: Product }) {
  const [bundles, setBundles] = useState<ShopBundle[]>([]);
  const [added, setAdded] = useState<string | null>(null);
  const { add, open } = useCart();

  useEffect(() => {
    let alive = true;
    fetch("/api/shop/bundles")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d?.success) return;
        setBundles((d.bundles as ShopBundle[]).filter((b) => b.productIds.includes(product.id)));
      })
      .catch(() => {
        /* a merchandising extra: silence beats an error box on a product page */
      });
    return () => {
      alive = false;
    };
  }, [product.id]);

  if (!bundles.length) return null;

  const addBundle = (b: ShopBundle) => {
    for (const item of b.items) {
      const full = staticProducts.find((p) => p.id === item.id);
      if (full) add(full, 1, { silent: true });
    }
    setAdded(b.id);
    open();
  };

  return (
    <section className="mt-16">
      <h2 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
        Buy together and save
      </h2>
      <p className="mt-1 text-sm" style={{ color: "var(--text-tertiary)" }}>
        The saving is applied automatically at checkout when the full set is in your cart.
      </p>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {bundles.map((b) => (
          <div
            key={b.id}
            className="rounded-2xl border p-5"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)" }}
          >
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 shrink-0" aria-hidden="true" style={{ color: "var(--accent-cyan)" }} />
              <h3 className="min-w-0 truncate font-semibold" style={{ color: "var(--text-primary)" }}>
                {b.name}
              </h3>
              <span
                className="ml-auto shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold"
                style={{ background: "var(--accent-cyan-muted)", color: "var(--accent-cyan-text)" }}
              >
                Save {b.savingsPct}%
              </span>
            </div>

            <ul className="mt-4 flex flex-wrap items-center gap-2">
              {b.items.map((item, i) => (
                <li key={item.id} className="flex items-center gap-2">
                  {i > 0 && (
                    <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" style={{ color: "var(--text-muted)" }} />
                  )}
                  <Link
                    href={`/shop/${item.slug}`}
                    className="flex min-w-0 items-center gap-2 rounded-xl border p-2 transition-colors hover:border-[var(--border-hover)]"
                    style={{ borderColor: "var(--border-primary)" }}
                  >
                    {item.image ? (
                      <Image
                        src={item.image}
                        alt=""
                        width={36}
                        height={36}
                        className="h-9 w-9 shrink-0 rounded-lg object-cover"
                      />
                    ) : null}
                    <span className="min-w-0">
                      <span
                        className="block max-w-[9rem] truncate text-xs font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {item.name}
                      </span>
                      <span className="block text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {formatINR(item.price)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
                {formatINR(b.bundlePrice)}
              </span>
              <span className="text-sm line-through" style={{ color: "var(--text-muted)" }}>
                {formatINR(b.catalogTotal)}
              </span>
              <span className="text-sm font-semibold text-emerald-500">Save {formatINR(b.savings)}</span>
            </div>

            <button
              type="button"
              onClick={() => addBundle(b)}
              className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-5 py-2.5 text-sm font-semibold text-white transition-transform hover:scale-[1.01]"
            >
              {added === b.id ? (
                <>
                  <Check className="h-4 w-4" aria-hidden="true" /> Added to cart
                </>
              ) : (
                <>
                  <Package className="h-4 w-4" aria-hidden="true" /> Add all {b.items.length} to cart
                </>
              )}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
