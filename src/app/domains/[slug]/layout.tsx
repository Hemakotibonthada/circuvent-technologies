import type { Metadata } from "next";
import { getDomainBySlug } from "@/lib/domains-data";
import { generateDomainMetadata, getBreadcrumbJsonLd } from "@/lib/seo";
import JsonLd from "@/components/JsonLd";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const domain = getDomainBySlug(slug);
  if (!domain) return { title: "Domain", robots: { index: false, follow: true } };
  return generateDomainMetadata({
    name: domain.name,
    tagline: domain.tagline,
    description: domain.description,
    slug: domain.slug,
    technologies: domain.technologies,
  });
}

export default async function DomainLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const domain = getDomainBySlug(slug);
  return (
    <>
      {domain && (
        <JsonLd
          data={getBreadcrumbJsonLd([
            { name: "Home", url: "/" },
            { name: "Domains", url: "/domains" },
            { name: domain.name, url: `/domains/${domain.slug}` },
          ])}
        />
      )}
      {children}
    </>
  );
}
