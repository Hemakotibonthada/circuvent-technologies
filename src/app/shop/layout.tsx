import ShopHeader from "@/components/shop/ShopHeader";
import { ToastProvider } from "@/components/shop/ToastProvider";
import { CompareProvider } from "@/components/shop/CompareProvider";
import { generatePageMetadata } from "@/lib/seo";

export const metadata = generatePageMetadata("shop");

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <CompareProvider>
        <ShopHeader />
        {children}
      </CompareProvider>
    </ToastProvider>
  );
}
