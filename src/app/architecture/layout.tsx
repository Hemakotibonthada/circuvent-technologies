import { generatePageMetadata } from "@/lib/seo";

export const metadata = generatePageMetadata("architecture");

export default function ArchitectureLayout({ children }: { children: React.ReactNode }) {
  return children;
}
