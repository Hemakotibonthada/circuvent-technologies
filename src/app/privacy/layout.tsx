import { generatePageMetadata } from "@/lib/seo";

export const metadata = generatePageMetadata("privacy");

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
