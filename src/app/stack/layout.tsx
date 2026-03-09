import { generatePageMetadata } from "@/lib/seo";

export const metadata = generatePageMetadata("stack");

export default function StackLayout({ children }: { children: React.ReactNode }) {
  return children;
}
