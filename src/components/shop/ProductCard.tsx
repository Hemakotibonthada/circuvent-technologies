"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, Eye, GitCompareArrows, Heart, ShoppingCart } from "lucide-react";
import { formatINR, type Product } from "@/lib/shop-data";
import { discountPct, isLowStock, isSoldOut, savingOf, type ViewMode } from "@/lib/shop-filters";
import { productAvailability } from "@/lib/product-availability";
import { useCart } from "./CartProvider";
import { useWishlist } from "./WishlistProvider";
import { useCompare, MAX_COMPARE } from "./CompareProvider";
import { useToast } from "./ToastProvider";
import ProductMedia from "./ProductMedia";
import Stars from "./Stars";

interface ProductCardProps {
  product: Product;
  index?: number;
  view?: ViewMode;
  onQuickView?: (product: Product) => void;
  /** Marks the first cards so their images get fetch priority for LCP. */
  priority?: boolean;
}

export default function ProductCard({
  product,
  index = 0,
  view = "grid",
  onQuickView,
  priority = false,
}: ProductCardProps) {
  const { add } = useCart();
  const { has: isSaved, toggle: toggleSaved } = useWishlist();
  const compare = useCompare();
  const { toast } = useToast();
  const reduceMotion = useReducedMotion();

  const saved = isSaved(product.id);
  const comparing = compare.has(product.id);
  const saving = savingOf(product);
  const discount = discountPct(product);
  const soldOut = isSoldOut(product);
  const availability = productAvailability(product);
  const lowStock = isLowStock(product);
  const href = `/shop/${product.slug}`;
  const isList = view === "list";

  const handleAdd = () => {
    if (soldOut) return;
    add(product, 1, { silent: true });
    toast({
      title: `${product.name} added to cart`,
      description: formatINR(product.price),
      action: { label: "View cart", href: "/cart" },
    });
  };

  const handleSave = () => {
    const nowSaved = !saved;
    toggleSaved(product.id);
    toast({
      title: nowSaved ? "Saved to wishlist" : "Removed from wishlist",
      description: product.name,
      tone: "info",
      duration: 2500,
    });
  };

  const handleCompare = () => {
    const accepted = compare.toggle(product.id);
    if (!accepted) {
      toast({
        title: "Compare list is full",
        description: `Remove a product to add another — up to ${MAX_COMPARE} at a time.`,
        tone: "warning",
      });
      return;
    }
    toast({
      title: comparing ? "Removed from comparison" : "Added to comparison",
      description: product.name,
      tone: "info",
      duration: 2500,
    });
  };

  const iconButton = (label: string, active: boolean, onClick: () => void, node: React.ReactNode) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className="grid h-[44px] w-[44px] place-items-center rounded-full border backdrop-blur transition-transform hover:scale-110 active:scale-95"
      style={{
        background: "var(--bg-glass-strong)",
        borderColor: active ? "var(--border-accent)" : "var(--border-primary)",
      }}
    >
      {node}
    </button>
  );

  const badges = (
    <>
      {discount > 0 && !soldOut && (
        <span className="rounded-full bg-gradient-to-r from-rose-500 to-orange-500 px-2.5 py-1 text-[11px] font-bold text-white shadow">
          {discount}% OFF
        </span>
      )}
      {product.badge && !soldOut && (
        <span
          className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-white shadow"
          style={{ background: "var(--accent-violet)" }}
        >
          {product.badge}
        </span>
      )}
      {/* One badge, whatever the reason. Saying "out of stock" about something
          that has not launched is untrue, and it throws away the more useful
          message — that it is coming. */}
      {availability.badge && (
        <span
          className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-white shadow"
          style={{
            background:
              availability.state === "coming-soon"
                ? "var(--accent-cyan)"
                : availability.state === "discontinued"
                  ? "rgba(100,116,139,.9)"
                  : "rgba(0,0,0,.75)",
          }}
        >
          {availability.badge}
        </span>
      )}
    </>
  );

  const priceBlock = (
    <div>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-2xl font-extrabold" style={{ color: "var(--text-primary)" }}>
          {formatINR(product.price)}
        </span>
        {saving > 0 && product.compareAt && (
          <>
            <span className="text-sm line-through" style={{ color: "var(--text-muted)" }}>
              {formatINR(product.compareAt)}
            </span>
            <span className="text-sm font-semibold" style={{ color: "var(--status-success-text)" }}>
              Save {formatINR(saving)}
            </span>
          </>
        )}
      </div>
      {lowStock ? (
        <p className="mt-1 text-xs font-semibold" style={{ color: "var(--status-warning-text)" }}>
          Only {product.stock} left — order soon
        </p>
      ) : availability.state === "coming-soon" ? (
        <p className="mt-1 text-xs font-semibold" style={{ color: "var(--accent-cyan-text)" }}>
          {availability.daysUntilRelease === 1 ? "Launches tomorrow" : `Launches in ${availability.daysUntilRelease} days`}
        </p>
      ) : (
        !soldOut && (
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            In stock · ships in 24–48h
          </p>
        )
      )}
    </div>
  );

  const actions = (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={handleAdd}
        disabled={soldOut}
        className="min-h-[44px] flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/25 transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
      >
        <ShoppingCart className="h-4 w-4" aria-hidden="true" />
        {availability.cta}
        <span className="sr-only"> — {product.name}</span>
      </button>
      <Link
        href={href}
        aria-label={`View full details for ${product.name}`}
        className="inline-flex h-[44px] w-[44px] items-center justify-center grid place-items-center rounded-xl border px-3 transition-colors"
        style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}
      >
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  );

  return (
    <motion.article
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.3, delay: Math.min(index, 5) * 0.04 }}
      className={`group relative flex overflow-hidden rounded-2xl border transition-shadow duration-300 hover:shadow-lg ${
        isList ? "flex-col sm:flex-row" : "h-full flex-col"
      }`}
      style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)", boxShadow: "var(--shadow-sm)" }}
    >
      {/* Media */}
      <div className={`relative shrink-0 ${isList ? "sm:w-56" : ""}`}>
        <Link href={href} className="block" tabIndex={-1} aria-hidden="true">
          <ProductMedia
            image={product.image}
            accent={product.accent}
            icon={product.icon}
            name={product.name}
            priority={priority}
            sizes={
              isList
                ? "(max-width: 640px) 100vw, 224px"
                : "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            }
            className={isList ? "h-44 w-full sm:h-full sm:min-h-[200px]" : "h-48 w-full"}
          />
        </Link>

        <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-1.5">{badges}</div>

        {/* Save / compare — always visible on touch, revealed on hover for pointers. */}
        <div className="absolute right-3 top-3 flex flex-col gap-2 opacity-100 transition-opacity duration-200 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          {iconButton(
            saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`,
            saved,
            handleSave,
            <Heart
              className="h-4 w-4"
              aria-hidden="true"
              style={{ color: saved ? "var(--status-danger-text)" : "var(--text-tertiary)", fill: saved ? "var(--status-danger-text)" : "none" }}
            />
          )}
          {iconButton(
            comparing ? `Remove ${product.name} from comparison` : `Add ${product.name} to comparison`,
            comparing,
            handleCompare,
            <GitCompareArrows
              className="h-4 w-4"
              aria-hidden="true"
              style={{ color: comparing ? "var(--accent-cyan)" : "var(--text-tertiary)" }}
            />
          )}
        </div>

        {onQuickView && !isList && (
          <button
            type="button"
            onClick={() => onQuickView(product)}
            className="min-h-[44px] absolute inset-x-3 bottom-3 flex items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-semibold backdrop-blur transition-all duration-200 sm:translate-y-2 sm:opacity-0 sm:group-hover:translate-y-0 sm:group-hover:opacity-100 sm:group-focus-within:translate-y-0 sm:group-focus-within:opacity-100"
            style={{
              background: "var(--bg-glass-strong)",
              borderColor: "var(--border-primary)",
              color: "var(--text-primary)",
            }}
          >
            <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Quick view
            <span className="sr-only"> of {product.name}</span>
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
            {product.category}
          </span>
          <Stars rating={product.rating} reviewCount={product.reviewCount} />
        </div>

        <h3 className="mt-1 text-lg font-bold leading-snug" style={{ color: "var(--text-primary)" }}>
          <Link href={href} className="transition-opacity hover:opacity-80">
            {product.name}
          </Link>
        </h3>
        <p className="mt-1 line-clamp-2 text-sm" style={{ color: "var(--text-tertiary)" }}>
          {product.tagline}
        </p>

        <ul className="mt-3 space-y-1">
          {product.specs.slice(0, isList ? 4 : 3).map((s) => (
            <li key={s} className="flex items-start gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
              <Check className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" style={{ color: "var(--accent-cyan)" }} />{" "}
              {s}
            </li>
          ))}
        </ul>

        <div className={`mt-auto pt-4 ${isList ? "flex flex-wrap items-end justify-between gap-4" : ""}`}>
          {priceBlock}
          <div className={isList ? "min-w-[220px] flex-1" : "mt-3"}>
            {actions}
            {onQuickView && isList && (
              <button
                type="button"
                onClick={() => onQuickView(product)}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-semibold transition-colors"
                style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}
              >
                <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Quick view
                <span className="sr-only"> of {product.name}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.article>
  );
}
