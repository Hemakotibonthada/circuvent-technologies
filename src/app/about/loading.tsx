import { PageHeaderSkeleton, CardGridSkeleton } from "@/components/ui/skeleton";

export default function AboutLoading() {
  return (
    <div className="relative z-10">
      <PageHeaderSkeleton />
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <CardGridSkeleton count={4} columns={2} />
        </div>
      </section>
    </div>
  );
}
