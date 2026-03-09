import { generatePageMetadata } from "@/lib/seo";

export const metadata = generatePageMetadata("services");

export default function ServicesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
