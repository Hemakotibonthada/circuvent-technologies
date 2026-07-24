import { generatePageMetadata } from "@/lib/seo";

export const metadata = generatePageMetadata("track");

export default function TrackLayout({ children }: { children: React.ReactNode }) {
  return children;
}
