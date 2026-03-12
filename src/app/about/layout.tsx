import { generatePageMetadata } from "@/lib/seo";

export const metadata = generatePageMetadata("about");

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
