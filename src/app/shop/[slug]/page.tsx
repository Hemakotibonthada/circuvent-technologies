import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { products } from "@/lib/shop-data";
import { getMergedProduct, getMergedProducts } from "@/lib/shop-catalog";
import { getProductJsonLd, getBreadcrumbJsonLd } from "@/lib/seo";
import JsonLd from "@/components/JsonLd";
import ProductDetailClient from "@/components/shop/ProductDetailClient";

export function generateStaticParams() {
  return products.map((p) => ({ slug: p.slug }));
}

// Re-render at most every 30s so admin price/offer/stock edits reach the
// prerendered detail pages (authoritative pricing is still enforced server-side
// at checkout via priceItems).
export const revalidate = 30;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const p = await getMergedProduct(slug);
  if (!p) return { title: "Product — Circuvent Store" };
  return {
    title: `${p.name} — Circuvent Store`,
    description: p.tagline,
    openGraph: { title: p.name, description: p.tagline, images: p.image ? [p.image] : undefined },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const all = await getMergedProducts();
  const product = all.find((p) => p.slug === slug);
  if (!product) notFound();
  const related = all.filter((p) => p.slug !== slug).slice(0, 3);
  return (
    <>
      <JsonLd
        data={[
          getProductJsonLd({
            name: product.name,
            slug: product.slug,
            description: product.description,
            price: product.price,
            image: product.image,
            rating: product.rating,
            reviewCount: product.reviewCount,
            stock: product.stock,
            available: product.available,
          }),
          getBreadcrumbJsonLd([
            { name: "Home", url: "/" },
            { name: "Store", url: "/shop" },
            { name: product.name, url: `/shop/${product.slug}` },
          ]),
        ]}
      />
      <ProductDetailClient product={product} related={related} />
    </>
  );
}
