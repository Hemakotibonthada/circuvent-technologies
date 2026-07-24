import ShopHeader from "@/components/shop/ShopHeader";
import { generatePageMetadata } from "@/lib/seo";

export const metadata = generatePageMetadata("shop");

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ShopHeader />
      {children}
    </>
  );
}
