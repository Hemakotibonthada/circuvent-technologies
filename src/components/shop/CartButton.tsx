"use client";

import { ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCart } from "./CartProvider";

export default function CartButton({ className }: { className?: string }) {
  const { count, open } = useCart();
  return (
    <button
      onClick={open}
      aria-label={`Open cart${count ? ` (${count} items)` : ""}`}
      className={cn(
        "relative inline-flex h-10 w-10 items-center justify-center rounded-lg border transition-all duration-300 hover:scale-105",
        className
      )}
      style={{
        borderColor: "var(--border-primary)",
        color: "var(--text-secondary)",
        background: "var(--bg-glass)",
      }}
    >
      <ShoppingBag className="h-5 w-5" />
      {count > 0 && (
        <span className="absolute -right-1.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-gradient-to-r from-cyan-500 to-violet-500 px-1 text-[10px] font-bold text-white">
          {count}
        </span>
      )}
    </button>
  );
}
