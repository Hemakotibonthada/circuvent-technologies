import { generatePageMetadata } from "@/lib/seo";

export const metadata = generatePageMetadata("blog");

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
