import { PageHeaderSkeleton, CardGridSkeleton } from "@/components/ui/skeleton";

export default function CareersLoading() {
  return (
    <div className="relative z-10">
      <PageHeaderSkeleton />
      <section className="py-12">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <CardGridSkeleton count={6} columns={2} />
        </div>
      </section>
    </div>
  );
}
