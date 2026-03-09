import { generatePageMetadata } from "@/lib/seo";

export const metadata = generatePageMetadata("domains");

export default function DomainsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
