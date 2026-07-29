import JsonLd from "@/components/JsonLd";
import {
  generatePageMetadata,
  getAboutPageJsonLd,
  getBreadcrumbJsonLd,
} from "@/lib/seo";

export const metadata = generatePageMetadata("about");

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd
        data={[
          getAboutPageJsonLd({
            description:
              "Circuvent Technologies engineers intelligent systems across AI, IoT and full-stack software — 53+ projects, 8 in production, built local-first and in the open.",
          }),
          getBreadcrumbJsonLd([
            { name: "Home", url: "/" },
            { name: "About", url: "/about" },
          ]),
        ]}
      />
      {children}
    </>
  );
}
