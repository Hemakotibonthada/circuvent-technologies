import JsonLd from "@/components/JsonLd";
import { generatePageMetadata, getBreadcrumbJsonLd, getFAQJsonLd } from "@/lib/seo";
import { SMART_HOME_FAQS } from "@/lib/smart-home-faqs";

// The page itself is a client component, so its metadata and structured data
// have to live here — without this layout the route shipped no title,
// description or canonical at all.
export const metadata = generatePageMetadata("smartHome");

export default function SmartHomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd
        data={[
          getFAQJsonLd(SMART_HOME_FAQS),
          getBreadcrumbJsonLd([
            { name: "Home", url: "/" },
            { name: "Smart Home", url: "/smart-home" },
          ]),
        ]}
      />
      {children}
    </>
  );
}
