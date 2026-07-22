import type { Metadata } from "next";
import ShopGrid from "@/components/shop/ShopGrid";

export const metadata: Metadata = {
  title: "Shop — Circuvent Technologies",
  description:
    "Buy Circuvent smart devices — Wi-Fi smart plug, automatic water-tank controller, personal safety SOS beacon and more. Made in India, cash on delivery, 6-month warranty.",
};

export default function ShopPage() {
  return (
    <section className="relative z-10 mx-auto max-w-7xl px-6 pb-24 pt-8 lg:px-8">
      <div className="mb-8">
        <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-cyan)" }}>
          Circuvent Store
        </span>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl" style={{ color: "var(--text-primary)" }}>
          Bring home{" "}
          <span className="bg-gradient-to-r from-cyan-500 via-violet-500 to-pink-500 bg-clip-text text-transparent">
            Circuvent
          </span>
        </h1>
        <p className="mt-3 max-w-2xl text-sm sm:text-base" style={{ color: "var(--text-tertiary)" }}>
          Smart, made-in-India devices — designed, flashed and shipped by our own R&D lab. Free
          shipping over ₹999, cash on delivery or wallet, and a 6-month warranty on every product.
        </p>
      </div>
      <ShopGrid />
    </section>
  );
}
