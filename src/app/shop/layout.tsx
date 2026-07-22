import ShopHeader from "@/components/shop/ShopHeader";

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-[64px] lg:pt-[72px]">
      <ShopHeader />
      {children}
    </div>
  );
}
