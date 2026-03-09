import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function RoadmapLoading() {
  return (
    <div className="relative z-10">
      <PageHeaderSkeleton />
      <section className="py-12">
        <div className="max-w-5xl mx-auto px-6 lg:px-8 space-y-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl p-6 space-y-3"
              style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}
            >
              <div className="flex items-center gap-3">
                <Skeleton variant="circular" width={36} height={36} />
                <div className="space-y-1 flex-1">
                  <Skeleton variant="text" height={18} className="w-1/3" />
                  <Skeleton variant="text" height={12} className="w-1/4" />
                </div>
                <Skeleton variant="rounded" width={80} height={24} />
              </div>
              <Skeleton variant="text" height={12} count={2} />
              <Skeleton variant="rounded" height={8} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
