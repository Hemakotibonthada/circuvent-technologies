import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { products, getProduct } from "@/lib/shop-data";
import ProductDetailClient from "@/components/shop/ProductDetailClient";

export function generateStaticParams() {
  return products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const p = getProduct(slug);
  if (!p) return { title: "Product — Circuvent Store" };
  return {
    title: `${p.name} — Circuvent Store`,
    description: p.tagline,
    openGraph: { title: p.name, description: p.tagline, images: p.image ? [p.image] : undefined },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) notFound();
  const related = products.filter((p) => p.slug !== slug).slice(0, 3);
  return <ProductDetailClient product={product} related={related} />;
}
