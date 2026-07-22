import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import ShopGrid from "@/components/shop/ShopGrid";

export const metadata: Metadata = {
  title: "Shop — Circuvent Technologies",
  description:
    "Buy Circuvent smart devices — Wi-Fi smart plug, automatic water-tank controller, personal safety SOS beacon and more. Made in India, cash on delivery, 6-month warranty.",
};

export default function ShopPage() {
  return (
    <>
      <PageHeader
        eyebrow="Circuvent Store"
        title="Bring home"
        titleHighlight="Circuvent"
        description="Smart, made-in-India devices — designed, flashed and shipped by our own R&D lab. Free shipping over ₹999, cash on delivery, and a 6-month warranty on every product."
      />
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-24 lg:px-8">
        <ShopGrid />
      </section>
    </>
  );
}
