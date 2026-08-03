import { generatePageMetadata } from "@/lib/seo";

export const metadata = generatePageMetadata("developers");

export default function DevelopersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
