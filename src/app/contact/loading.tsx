import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function ContactLoading() {
  return (
    <div className="relative z-10">
      <PageHeaderSkeleton />
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-3 gap-12">
            <div className="lg:col-span-2">
              <div
                className="rounded-3xl p-8 space-y-6"
                style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}
              >
                <div className="grid sm:grid-cols-2 gap-4">
                  <Skeleton variant="rounded" height={44} />
                  <Skeleton variant="rounded" height={44} />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Skeleton variant="rounded" height={44} />
                  <Skeleton variant="rounded" height={44} />
                </div>
                <Skeleton variant="rounded" height={44} />
                <Skeleton variant="rounded" height={160} />
                <Skeleton variant="rounded" width={140} height={44} className="ml-auto" />
              </div>
            </div>
            <div className="space-y-6">
              <div
                className="rounded-2xl p-6 space-y-4"
                style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}
              >
                <Skeleton variant="text" height={20} className="w-1/2" />
                <Skeleton variant="text" height={14} count={4} />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
