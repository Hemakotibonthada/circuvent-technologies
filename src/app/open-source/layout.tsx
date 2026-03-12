import { generatePageMetadata } from "@/lib/seo";

export const metadata = generatePageMetadata("openSource");

export default function OpenSourceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
