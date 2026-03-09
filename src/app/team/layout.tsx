import { generatePageMetadata } from "@/lib/seo";

export const metadata = generatePageMetadata("team");

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  return children;
}
