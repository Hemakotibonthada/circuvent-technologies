import type { Metadata } from "next";
import ContentPage from "@/components/ContentPage";

export const metadata: Metadata = {
  title: "Terms of Service — Circuvent",
  description: "The terms governing your use of the Circuvent website, store and connected devices.",
};

export default function TermsPage() {
  return (
    <ContentPage
      eyebrow="Legal"
      title="Terms of"
      titleHighlight="Service"
      titleGradient="from-slate-400 via-cyan-500 to-violet-500"
      updated="July 2026"
      description="Please read these terms carefully. By using the Circuvent website, store or devices, you agree to them."
      sections={[
        {
          icon: "FileText",
          title: "Acceptance of terms",
          content: [
            "By accessing or using our website, creating an account, or purchasing our products, you agree to be bound by these Terms of Service and our Privacy Policy.",
            "If you do not agree, please do not use the site or services.",
          ],
        },
        {
          icon: "ShoppingBag",
          title: "Orders & pricing",
          content: [
            "All orders are subject to acceptance and product availability. We may cancel or limit orders (for example, suspected fraud or pricing errors) and will refund any amount charged.",
            "Prices are in Indian Rupees (₹) and include applicable taxes unless stated otherwise. We may change prices at any time, but changes won't affect orders already placed.",
          ],
        },
        {
          icon: "CreditCard",
          title: "Payments",
          content: [
            "Online payments are processed by our payment partner (Razorpay). By paying, you authorize the charge and confirm you are permitted to use the payment method.",
            "Cash on Delivery may be offered on eligible orders at our discretion.",
          ],
        },
        {
          icon: "Wallet",
          title: "Wallet, rewards & gift cards",
          content: [
            "Wallet balance, loyalty points, referral rewards and gift cards are store credit for use on Circuvent only. They carry no cash value, are non-transferable except as designed, and may not be exchanged for cash.",
            "We may adjust or reverse credits issued in error or through abuse of promotions.",
          ],
        },
        {
          icon: "Copyright",
          title: "Intellectual property",
          content: [
            "The Circuvent name, logo, website, firmware, apps, APIs and content are owned by Circuvent Technologies and protected by law. You may not copy, resell or reverse-engineer them except as permitted by applicable law or an open-source license we explicitly grant.",
          ],
        },
        {
          icon: "AlertTriangle",
          title: "Acceptable use & devices",
          content: [
            "Use our devices and services only for lawful purposes and in line with provided instructions and safety ratings. Do not tamper with, overload, or use devices outside their rated specifications.",
            "You are responsible for keeping your account credentials secure and for activity under your account.",
          ],
        },
        {
          icon: "Scale",
          title: "Liability & governing law",
          content: [
            "To the maximum extent permitted by law, Circuvent is not liable for indirect or consequential damages. Our total liability for any claim is limited to the amount you paid for the relevant product.",
            "These terms are governed by the laws of India. Disputes are subject to the courts of our registered jurisdiction.",
            "We may update these terms from time to time; continued use after changes constitutes acceptance.",
          ],
        },
      ]}
    />
  );
}
