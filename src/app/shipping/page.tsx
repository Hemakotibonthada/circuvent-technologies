import type { Metadata } from "next";
import ContentPage from "@/components/ContentPage";

export const metadata: Metadata = {
  title: "Shipping Policy — Circuvent",
  description: "Circuvent shipping coverage, timelines, charges and order tracking across India.",
};

export default function ShippingPage() {
  return (
    <ContentPage
      eyebrow="Policies"
      title="Shipping"
      titleHighlight="Policy"
      titleGradient="from-emerald-500 via-teal-500 to-cyan-500"
      updated="July 2026"
      description="How, where and when we deliver your Circuvent devices — plus how to track every order end to end."
      sections={[
        {
          icon: "MapPin",
          title: "Coverage",
          content: [
            "We ship pan-India to all serviceable pincodes through trusted courier partners.",
            "If your pincode is not serviceable at checkout, please contact us — we can often arrange an alternative.",
          ],
        },
        {
          icon: "IndianRupee",
          title: "Charges",
          content: [
            "Free shipping applies automatically on orders above the free-shipping threshold shown in your cart.",
            "A small flat shipping fee applies to orders below that threshold. The exact amount is always displayed before you pay — no surprises.",
          ],
        },
        {
          icon: "Clock",
          title: "Timelines",
          content: [
            "Orders are processed within 1 business day. Metro cities typically receive delivery in 2–4 business days; other regions in 4–7 business days.",
            "Delivery timelines are estimates and may vary during peak periods, weather events or courier delays.",
          ],
        },
        {
          icon: "PackageCheck",
          title: "Tracking",
          content: [
            "As soon as your order ships, we email you a tracking number and a live tracking link.",
            "You can also track any order any time from your account's Orders section or the Track page.",
          ],
        },
        {
          icon: "Bell",
          title: "Out-of-stock items",
          content: [
            "If an item is temporarily sold out, tap 'Notify me' on the product page. We'll email you the instant it's restocked so you never miss out.",
          ],
        },
        {
          icon: "Truck",
          title: "Delivery issues",
          content: [
            "If a package arrives damaged, please refuse delivery or photograph it and raise a support ticket within 48 hours so we can resolve it quickly.",
          ],
        },
      ]}
    />
  );
}
