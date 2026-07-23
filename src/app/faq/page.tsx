import type { Metadata } from "next";
import ContentPage from "@/components/ContentPage";

export const metadata: Metadata = {
  title: "FAQ — Circuvent",
  description: "Answers to common questions about Circuvent smart devices, orders, payments, shipping, returns and warranty.",
};

export default function FAQPage() {
  return (
    <ContentPage
      eyebrow="Help Center"
      title="Frequently Asked"
      titleHighlight="Questions"
      description="Everything you need to know about ordering, payments, delivery, warranty and our smart devices. Can't find an answer? Reach out any time."
      sections={[
        {
          icon: "HelpCircle",
          title: "Orders & Accounts",
          content: [
            "Do I need an account to order? You can browse freely, but placing an order requires a quick sign-up so we can email your invoice and let you track delivery. Sign-up is verified with a one-time code sent to your email.",
            "Can I edit or cancel my order? Yes — from your account's Orders section you can cancel an order before it ships. Paid orders are refunded to your Circuvent wallet instantly on cancellation.",
            "How do I reorder? Open any past order in your account and tap Reorder to add the same items straight back to your cart.",
          ],
        },
        {
          icon: "CreditCard",
          title: "Payments",
          content: [
            "What payment methods do you accept? UPI, credit/debit cards and net banking via Razorpay (India), Cash on Delivery on eligible orders, and your Circuvent wallet balance.",
            "Is online payment secure? Payments are processed by Razorpay over an encrypted connection. We never see or store your full card details.",
            "What is the Circuvent wallet? A store balance you can top up, earn (loyalty points, referrals, refunds, gift cards) and spend at checkout.",
          ],
        },
        {
          icon: "Truck",
          title: "Shipping & Delivery",
          content: [
            "Where do you ship? Across India. Free shipping applies over the threshold shown at checkout; a flat fee applies below it.",
            "How long does delivery take? Metros typically 2–4 business days; other regions 4–7 business days. You'll get a tracking link by email as soon as your order ships.",
            "Out of stock? Tap 'Notify me' on the product and we'll email you the moment it's back.",
          ],
        },
        {
          icon: "RotateCcw",
          title: "Returns & Refunds",
          content: [
            "What's your return window? 7 days from delivery for unused items in original packaging. Start a return from your account's Orders section.",
            "How are refunds issued? To your Circuvent wallet by default (instant once approved), or to your original payment method on request.",
          ],
        },
        {
          icon: "ShieldCheck",
          title: "Warranty & Support",
          content: [
            "Is there a warranty? Yes — every device includes a 6-month limited hardware warranty covering manufacturing defects.",
            "How do I get support? Raise a ticket from your account's Support section, or email contact@circuvent.com. We reply within 1–2 business days.",
          ],
        },
        {
          icon: "Wifi",
          title: "Devices & Setup",
          content: [
            "Do the devices work on 5GHz WiFi? Our devices connect over 2.4GHz WiFi, which offers better range for IoT. Dual-band routers are fully supported.",
            "Is the platform proprietary? Yes — firmware, APIs and the control app are all built and owned by Circuvent, so your devices, data and updates stay within our ecosystem.",
            "Can I control devices remotely? Yes, from the Circuvent app and your account's Devices section, with secure claim-and-command flows.",
          ],
        },
        {
          icon: "Gift",
          title: "Rewards & Referrals",
          content: [
            "How do loyalty points work? Earn points on every paid order and redeem them for wallet credit.",
            "How does the referral program work? Share your referral link — when a friend places their first paid order, you both get wallet credit.",
            "Gift cards? Redeem any Circuvent gift card code from your account to top up your wallet instantly.",
          ],
        },
        {
          icon: "Wrench",
          title: "Something else?",
          content: [
            "Bulk or business orders, custom firmware, integrations or press enquiries — email contact@circuvent.com and we'll get you to the right person.",
          ],
        },
      ]}
    />
  );
}
