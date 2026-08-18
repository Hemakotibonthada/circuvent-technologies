import type { Metadata } from "next";
import ContentPage from "@/components/ContentPage";
import JsonLd from "@/components/JsonLd";
import { getFAQJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: "FAQ — Circuvent Technologies",
  description:
    "Answers about Circuvent Technologies — who we are, why the name is often confused with the word 'circumvent', and how orders, payments, shipping, returns and warranty work for Circuvent Smart devices.",
};

const FAQ_JSONLD = [
  // Deliberately first. "Circuvent" is one character from "circumvent", so
  // search engines treat the brand as a misspelling and silently rewrite the
  // query to a different, unrelated company. This entry is the plainest
  // on-page statement that the token is a real name, and as FAQPage structured
  // data it is directly eligible to be surfaced against that exact confusion.
  { question: "Is Circuvent the same as Circumvent?", answer: "No — they are unrelated. Circuvent Technologies is an engineering company based in Hyderabad, India, building AI, IoT and full-stack systems, online at circuvent.com. The name is spelled C-I-R-C-U-V-E-N-T, with no 'm'. Search engines often autocorrect it to the English word 'circumvent', which returns a different company entirely." },
  { question: "What is Circuvent Technologies?", answer: "Circuvent Technologies is an Indian engineering company founded in 2023 that builds intelligent systems across AI, IoT and full-stack software. Alongside client work it ships its own products: Circuvent Mail, the CV-365 workspace, an HRMS and ATS, and made-in-India Circuvent Smart devices." },
  { question: "Do I need an account to order?", answer: "You can browse freely, but placing an order requires a quick sign-up so we can email your invoice and let you track delivery. Sign-up is verified with a one-time code sent to your email." },
  { question: "Can I edit or cancel my order?", answer: "Yes — from your account's Orders section you can cancel an order before it ships. Paid orders are refunded to your Circuvent wallet instantly on cancellation." },
  { question: "What payment methods do you accept?", answer: "UPI, credit/debit cards and net banking via Razorpay (India), Cash on Delivery on eligible orders, and your Circuvent wallet balance." },
  { question: "Is online payment secure?", answer: "Payments are processed by Razorpay over an encrypted connection. We never see or store your full card details." },
  { question: "Where do you ship and how long does delivery take?", answer: "We ship across India. Metros typically take 2–4 business days and other regions 4–7 business days. You'll get a tracking link by email as soon as your order ships." },
  { question: "What is your return window?", answer: "7 days from delivery for unused items in original packaging. Start a return from your account's Orders section." },
  { question: "How are refunds issued?", answer: "To your Circuvent wallet by default (instant once approved), or to your original payment method on request." },
  { question: "Is there a warranty?", answer: "Yes — every device includes a 6-month limited hardware warranty covering manufacturing defects." },
  { question: "Do the devices work on 5GHz WiFi?", answer: "Our devices connect over 2.4GHz WiFi, which offers better range for IoT. Dual-band routers are fully supported." },
  { question: "How do loyalty points and referrals work?", answer: "Earn loyalty points on every paid order and redeem them for wallet credit. Share your referral link and you both get wallet credit when a friend places their first paid order." },
];

export default function FAQPage() {
  return (
    <>
      <JsonLd data={getFAQJsonLd(FAQ_JSONLD)} />
      <ContentPage
      eyebrow="Help Center"
      title="Frequently Asked"
      titleHighlight="Questions"
      description="Everything you need to know about ordering, payments, delivery, warranty and our smart devices. Can't find an answer? Reach out any time."
      sections={[
        {
          icon: "Building2",
          title: "About the name",
          content: [
            "Is Circuvent the same as Circumvent? No — they are unrelated. Circuvent Technologies is an engineering company based in Hyderabad, India, building AI, IoT and full-stack systems. The name is spelled C-I-R-C-U-V-E-N-T, with no 'm'. Search engines often autocorrect it to the English word 'circumvent', which returns a different company entirely.",
            "What is Circuvent Technologies? An Indian engineering company founded in 2023, building intelligent systems across AI, IoT and full-stack software — and shipping its own products: Circuvent Mail, the CV-365 workspace, an HRMS and ATS, and made-in-India Circuvent Smart devices.",
          ],
        },
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
    </>
  );
}
