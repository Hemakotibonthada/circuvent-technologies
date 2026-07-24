import type { Metadata } from "next";
import { projects } from "@/lib/projects-data";
import { generateProjectMetadata, getSoftwareJsonLd, getBreadcrumbJsonLd } from "@/lib/seo";
import JsonLd from "@/components/JsonLd";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const project = projects.find((p) => p.id === id);
  if (!project) return { title: "Project", robots: { index: false, follow: true } };
  return generateProjectMetadata({
    name: project.name,
    tagline: project.tagline,
    description: project.description,
    id: project.id,
    category: project.category,
    techStack: project.techStack,
  });
}

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = projects.find((p) => p.id === id);
  return (
    <>
      {project && (
        <JsonLd
          data={[
            getSoftwareJsonLd({
              name: project.name,
              description: project.description,
              id: project.id,
              techStack: project.techStack,
              status: project.status,
            }),
            getBreadcrumbJsonLd([
              { name: "Home", url: "/" },
              { name: "Projects", url: "/projects" },
              { name: project.name, url: `/projects/${project.id}` },
            ]),
          ]}
        />
      )}
      {children}
    </>
  );
}
