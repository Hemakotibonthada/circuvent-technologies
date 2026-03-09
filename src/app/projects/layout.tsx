import { generatePageMetadata } from "@/lib/seo";

export const metadata = generatePageMetadata("projects");

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
