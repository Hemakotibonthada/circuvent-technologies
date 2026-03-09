import { PageHeaderSkeleton, CardGridSkeleton, StatsSkeleton } from "@/components/ui/skeleton";

export default function StackLoading() {
  return (
    <div className="relative z-10">
      <PageHeaderSkeleton />
      <section className="py-12">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <StatsSkeleton count={4} />
        </div>
      </section>
      <section className="py-12">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <CardGridSkeleton count={6} columns={3} />
        </div>
      </section>
    </div>
  );
}
