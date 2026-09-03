import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Incident Management | Circuvent",
  description:
    "Circuvent Incident Management — severity-ordered queue with acknowledge and mitigate clocks.",
  robots: "noindex, nofollow",
};

export default function IcmLayout({ children }: { children: React.ReactNode }) {
  return children;
}
