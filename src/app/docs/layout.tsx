import { generatePageMetadata } from "@/lib/seo";

export const metadata = generatePageMetadata("docs");

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
