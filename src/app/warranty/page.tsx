import type { Metadata } from "next";
import ContentPage from "@/components/ContentPage";

export const metadata: Metadata = {
  title: "Warranty — Circuvent",
  description: "Circuvent 6-month limited hardware warranty: what's covered, what's not, and how to claim.",
};

export default function WarrantyPage() {
  return (
    <ContentPage
      eyebrow="Support"
      title="Limited"
      titleHighlight="Warranty"
      titleGradient="from-cyan-500 via-blue-500 to-indigo-500"
      updated="July 2026"
      description="Every Circuvent device is built to last and backed by a 6-month limited hardware warranty."
      sections={[
        {
          icon: "Clock",
          title: "Coverage period",
          content: [
            "All Circuvent smart devices include a 6-month limited warranty from the date of delivery, covering defects in materials and workmanship under normal use.",
          ],
        },
        {
          icon: "ShieldCheck",
          title: "What's covered",
          content: [
            "Manufacturing defects, component failures under normal use, and firmware faults that prevent the device from functioning as described.",
            "If we can't repair a covered unit, we'll replace it with the same or an equivalent model.",
          ],
        },
        {
          icon: "AlertTriangle",
          title: "What's not covered",
          content: [
            "Physical, liquid or electrical damage from misuse, accidents, unauthorized repairs or modifications, power surges, or use outside rated specifications.",
            "Normal wear and cosmetic damage that doesn't affect function, and consumable parts.",
          ],
        },
        {
          icon: "Wrench",
          title: "How to claim",
          content: [
            "Raise a ticket from your account's Support section (or email contact@circuvent.com) with your order number and a short description of the issue — photos or a short video help us diagnose faster.",
            "We'll troubleshoot remotely first; if a hardware fix is needed, we'll guide you through repair or replacement.",
          ],
        },
        {
          icon: "LifeBuoy",
          title: "Out-of-warranty support",
          content: [
            "Past 6 months? We still offer paid repair and spare-part options for most devices, plus ongoing firmware updates for supported models.",
          ],
        },
      ]}
    />
  );
}
