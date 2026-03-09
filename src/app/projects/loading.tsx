import { PageHeaderSkeleton, CardGridSkeleton } from "@/components/ui/skeleton";

export default function ProjectsLoading() {
  return (
    <div className="relative z-10">
      <PageHeaderSkeleton />
      <section className="py-12">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <CardGridSkeleton count={9} columns={3} />
        </div>
      </section>
    </div>
  );
}
