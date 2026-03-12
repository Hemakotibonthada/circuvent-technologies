import { generatePageMetadata } from "@/lib/seo";

export const metadata = generatePageMetadata("caseStudies");

export default function CaseStudiesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
