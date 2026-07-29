import { ProductGridSkeleton } from "@/components/shop/ProductCardSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** Route-level placeholder that mirrors the shop layout, so nothing jumps. */
export default function ShopLoading() {
  return (
    <section className="relative z-10 mx-auto max-w-7xl px-6 pb-24 pt-8 lg:px-8">
      <div className="mb-8 space-y-3">
        <Skeleton variant="text" height={12} className="w-28" />
        <Skeleton variant="text" height={38} className="w-72 max-w-full" />
        <Skeleton variant="text" height={16} className="w-full max-w-2xl" />
        <div className="grid grid-cols-2 gap-4 pt-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton variant="text" height={22} className="w-20" />
              <Skeleton variant="text" height={11} className="w-24" />
            </div>
          ))}
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="rounded" height={72} />
        ))}
      </div>

      <div className="lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-8">
        <div className="hidden lg:block">
          <Skeleton variant="rounded" height={520} />
        </div>
        <div className="min-w-0 space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Skeleton variant="rounded" height={46} className="flex-1" />
            <Skeleton variant="rounded" height={46} className="w-full sm:w-52" />
          </div>
          <ProductGridSkeleton count={6} />
        </div>
      </div>
    </section>
  );
}
