import { generatePageMetadata } from "@/lib/seo";

export const metadata = generatePageMetadata("account");

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return children;
}
