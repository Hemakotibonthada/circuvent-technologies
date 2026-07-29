import Image from "next/image";
import { cn } from "@/lib/utils";

interface ProductMediaProps {
  image?: string;
  accent: string;
  icon: string;
  name: string;
  className?: string;
  iconClass?: string;
  /** Passed to next/image so the browser picks the right candidate. */
  sizes?: string;
  /** Set on the first above-the-fold product image to improve LCP. */
  priority?: boolean;
}

/**
 * Product visual. Renders an optimised photo when `image` is set, otherwise a
 * branded gradient panel with the product emoji — themed via CSS vars.
 *
 * The wrapper reserves the space (callers size it via `className`), so filling
 * images never shift layout while loading.
 */
export default function ProductMedia({
  image,
  accent,
  icon,
  name,
  className,
  iconClass = "text-6xl",
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
  priority = false,
}: ProductMediaProps) {
  // The Next image optimizer rejects SVG unless dangerouslyAllowSVG is on, so
  // vector product art is served as-is while raster art is still optimised.
  const isVector = !!image && image.toLowerCase().endsWith(".svg");

  return (
    <div className={cn("relative overflow-hidden", className)} style={{ background: "var(--bg-secondary)" }}>
      {image ? (
        <Image
          src={image}
          alt={name}
          fill
          sizes={sizes}
          priority={priority}
          loading={priority ? undefined : "lazy"}
          unoptimized={isVector}
          className="object-cover"
        />
      ) : (
        <div
          className="grid h-full w-full place-items-center"
          style={{ background: `radial-gradient(circle at 50% 42%, ${accent}33, transparent 62%)` }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.15]"
            style={{
              backgroundImage:
                "linear-gradient(var(--grid-line-color) 1px, transparent 1px), linear-gradient(90deg, var(--grid-line-color) 1px, transparent 1px)",
              backgroundSize: "22px 22px",
            }}
          />
          <span aria-hidden="true" className={cn("relative drop-shadow-lg", iconClass)}>
            {icon}
          </span>
          {name && <span className="sr-only">{name}</span>}
        </div>
      )}
    </div>
  );
}
