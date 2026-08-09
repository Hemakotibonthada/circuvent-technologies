import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none",
  {
    variants: {
      /*
       * The -600 shades are graphics colours.
       *
       * A badge is small bold text on a 10%-tint fill, and measuring the whole
       * site found this one component accounting for 168 contrast failures:
       * cyan-600 reads 3.52:1 on the page background, emerald-600 3.61,
       * amber-600 3.05. One step darker clears AA while looking the same at a
       * glance. The dark-scheme shades were already fine and are untouched --
       * they sit on a dark fill, where -600 is the readable end.
       */
      variant: {
        default:
          "border-transparent bg-[var(--accent-cyan-muted)] text-[var(--text-secondary)] backdrop-blur-sm",
        primary:
          "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400",
        secondary:
          "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
        success:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        warning:
          "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
        destructive:
          "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
        outline:
          "border-[var(--border-hover)] text-[var(--text-tertiary)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
