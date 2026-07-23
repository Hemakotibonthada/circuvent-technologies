import type { Metadata } from "next";
import ContentPage from "@/components/ContentPage";

export const metadata: Metadata = {
  title: "Returns & Refunds — Circuvent",
  description: "Circuvent returns window, eligibility, refund methods and how to start a return.",
};

export default function ReturnsPolicyPage() {
  return (
    <ContentPage
      eyebrow="Policies"
      title="Returns &"
      titleHighlight="Refunds"
      titleGradient="from-amber-500 via-orange-500 to-rose-500"
      updated="July 2026"
      description="Not the right fit? Here's exactly how returns and refunds work at Circuvent — simple, fair and fast."
      sections={[
        {
          icon: "Clock",
          title: "Return window",
          content: [
            "You can request a return within 7 days of delivery.",
            "To start one, open the order in your account's Orders section and tap Return — pick the items and a reason, and we'll take it from there.",
          ],
        },
        {
          icon: "CheckCircle2",
          title: "Eligibility",
          content: [
            "Items must be unused, in original condition, with all accessories and original packaging.",
            "Include the invoice (available to print from your account).",
          ],
        },
        {
          icon: "XCircle",
          title: "Non-returnable",
          content: [
            "For hygiene and safety, certain items may be non-returnable once opened, and clearance items are final sale. Any such exclusion is noted on the product page.",
            "Physically damaged or tampered devices (outside of transit damage reported within 48 hours) are not eligible.",
          ],
        },
        {
          icon: "PackageOpen",
          title: "How it works",
          content: [
            "1. Request the return from your account. 2. We approve and arrange pickup or share return instructions. 3. Once we receive and inspect the item, we issue your refund.",
          ],
        },
        {
          icon: "Wallet",
          title: "Refunds",
          content: [
            "Approved refunds are credited to your Circuvent wallet by default — instantly usable on your next order.",
            "Prefer your original payment method? Just ask in the return notes and we'll route it back to source (bank timelines apply, usually 5–7 business days).",
          ],
        },
        {
          icon: "RotateCcw",
          title: "Cancellations",
          content: [
            "You can cancel any order before it ships, directly from your account. Paid orders are refunded to your wallet immediately on cancellation.",
          ],
        },
      ]}
    />
  );
}
