import type { Metadata } from "next";
import { getCareerById } from "@/lib/services-data";
import { generateCareerMetadata, getJobPostingJsonLd, getBreadcrumbJsonLd } from "@/lib/seo";
import JsonLd from "@/components/JsonLd";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const role = getCareerById(id);
  if (!role) return { title: "Careers", robots: { index: false, follow: true } };
  return generateCareerMetadata({
    title: role.title,
    department: role.department,
    location: role.location,
    description: role.description,
    id: role.id,
  });
}

export default async function CareerLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const role = getCareerById(id);
  return (
    <>
      {role && (
        <JsonLd
          data={[
            getJobPostingJsonLd({
              title: role.title,
              description: role.description,
              location: role.location,
              type: role.type,
              experience: role.experience,
              id: role.id,
            }),
            getBreadcrumbJsonLd([
              { name: "Home", url: "/" },
              { name: "Careers", url: "/careers" },
              { name: role.title, url: `/careers/${role.id}` },
            ]),
          ]}
        />
      )}
      {children}
    </>
  );
}
