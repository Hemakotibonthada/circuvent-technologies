"use client";

import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
  variant?: "text" | "circular" | "rectangular" | "rounded";
  width?: string | number;
  height?: string | number;
  count?: number;
}

export function Skeleton({
  className,
  variant = "text",
  width,
  height,
  count = 1,
}: SkeletonProps) {
  const baseClasses = "animate-pulse";

  const variantClasses = {
    text: "rounded-md",
    circular: "rounded-full",
    rectangular: "rounded-none",
    rounded: "rounded-2xl",
  };

  const style: React.CSSProperties = {
    width: width || undefined,
    height: height || (variant === "text" ? "1em" : undefined),
    background:
      "linear-gradient(90deg, var(--bg-surface) 25%, var(--bg-surface-hover) 50%, var(--bg-surface) 75%)",
    backgroundSize: "200% 100%",
  };

  if (count > 1) {
    return (
      <div className="space-y-3">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className={cn(baseClasses, variantClasses[variant], className)}
            style={{
              ...style,
              width: variant === "text" && i === count - 1 ? "60%" : style.width,
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(baseClasses, variantClasses[variant], className)}
      style={style}
    />
  );
}

/** Skeleton for a card with icon, title, and description */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("rounded-2xl p-6 space-y-4", className)}
      style={{
        background: "var(--bg-glass)",
        border: "1px solid var(--border-primary)",
      }}
    >
      <div className="flex items-start gap-3">
        <Skeleton variant="rounded" width={44} height={44} />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" height={16} className="w-3/4" />
          <Skeleton variant="text" height={12} className="w-1/2" />
        </div>
      </div>
      <Skeleton variant="text" height={12} count={3} />
      <div className="flex gap-2">
        <Skeleton variant="rounded" width={60} height={22} />
        <Skeleton variant="rounded" width={60} height={22} />
        <Skeleton variant="rounded" width={60} height={22} />
      </div>
    </div>
  );
}

/** Skeleton for the page header section */
export function PageHeaderSkeleton() {
  return (
    <section className="relative z-10 pt-32 pb-20">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="max-w-4xl space-y-4">
          <Skeleton variant="rounded" width={100} height={16} />
          <Skeleton variant="text" height={56} className="w-3/4" />
          <Skeleton variant="text" height={24} className="w-full" />
          <Skeleton variant="text" height={24} className="w-2/3" />
        </div>
      </div>
    </section>
  );
}

/** Skeleton for a grid of cards */
export function CardGridSkeleton({
  count = 6,
  columns = 3,
}: {
  count?: number;
  columns?: number;
}) {
  const colClasses: Record<number, string> = {
    2: "grid md:grid-cols-2 gap-6",
    3: "grid md:grid-cols-2 lg:grid-cols-3 gap-6",
    4: "grid sm:grid-cols-2 lg:grid-cols-4 gap-4",
  };

  return (
    <div className={colClasses[columns] || colClasses[3]}>
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Skeleton for a blog card */
export function BlogCardSkeleton() {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "var(--bg-glass)",
        border: "1px solid var(--border-primary)",
      }}
    >
      <div className="p-6 space-y-4">
        <div className="flex justify-between">
          <Skeleton variant="rounded" width={80} height={22} />
          <Skeleton variant="text" width={70} height={14} />
        </div>
        <Skeleton variant="text" height={22} className="w-full" />
        <Skeleton variant="text" height={14} count={3} />
        <div className="flex gap-1.5">
          <Skeleton variant="rounded" width={50} height={20} />
          <Skeleton variant="rounded" width={50} height={20} />
          <Skeleton variant="rounded" width={50} height={20} />
        </div>
        <div
          className="flex items-center justify-between pt-4"
          style={{ borderTop: "1px solid var(--border-primary)" }}
        >
          <div className="flex items-center gap-2">
            <Skeleton variant="circular" width={32} height={32} />
            <div className="space-y-1">
              <Skeleton variant="text" width={80} height={12} />
              <Skeleton variant="text" width={60} height={10} />
            </div>
          </div>
          <Skeleton variant="rounded" width={16} height={16} />
        </div>
      </div>
    </div>
  );
}

/** Skeleton for stat cards row */
export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="p-5 rounded-2xl text-center space-y-2"
          style={{
            background: "var(--bg-glass)",
            border: "1px solid var(--border-primary)",
          }}
        >
          <Skeleton variant="text" height={32} className="w-1/2 mx-auto" />
          <Skeleton variant="text" height={10} className="w-2/3 mx-auto" />
        </div>
      ))}
    </div>
  );
}
