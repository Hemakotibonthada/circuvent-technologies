import { cn } from "@/lib/utils";

interface ProductMediaProps {
  image?: string;
  accent: string;
  icon: string;
  name: string;
  className?: string;
  iconClass?: string;
}

/**
 * Product visual. Renders a photo when `image` is set, otherwise a
 * branded gradient panel with the product emoji — themed via CSS vars.
 */
export default function ProductMedia({
  image,
  accent,
  icon,
  name,
  className,
  iconClass = "text-6xl",
}: ProductMediaProps) {
  return (
    <div className={cn("relative overflow-hidden", className)} style={{ background: "var(--bg-secondary)" }}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt={name} loading="lazy" className="h-full w-full object-cover" />
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
          <span className={cn("relative drop-shadow-lg", iconClass)}>{icon}</span>
        </div>
      )}
    </div>
  );
}
