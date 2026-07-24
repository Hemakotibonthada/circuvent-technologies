import { generatePageMetadata } from "@/lib/seo";

export const metadata = generatePageMetadata("checkout");

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
