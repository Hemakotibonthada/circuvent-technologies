import { PageHeaderSkeleton, BlogCardSkeleton } from "@/components/ui/skeleton";

export default function BlogLoading() {
  return (
    <div className="relative z-10">
      <PageHeaderSkeleton />
      <section className="py-12">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <BlogCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
