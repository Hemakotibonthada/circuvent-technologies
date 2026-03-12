import { generatePageMetadata } from "@/lib/seo";

export const metadata = generatePageMetadata("careers");

export default function CareersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
