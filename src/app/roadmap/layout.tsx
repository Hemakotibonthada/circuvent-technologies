import { generatePageMetadata } from "@/lib/seo";

export const metadata = generatePageMetadata("roadmap");

export default function RoadmapLayout({ children }: { children: React.ReactNode }) {
  return children;
}
