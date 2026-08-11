import { generatePageMetadata } from "@/lib/seo";

export const metadata = generatePageMetadata("devices");

export default function DevicesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
