import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-cyan)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)] disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-cyan-500 to-violet-500 text-white shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:scale-[1.02] active:scale-[0.98]",
        outline:
          "border border-[var(--border-hover)] bg-[var(--bg-surface)] text-[var(--text-primary)] backdrop-blur-sm hover:bg-[var(--bg-surface-hover)] hover:border-[var(--accent-cyan)] hover:shadow-[var(--shadow-sm)]",
        ghost:
          "text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--accent-cyan-muted)]",
        link:
          "text-[var(--accent-cyan)] underline-offset-4 hover:underline",
        glass:
          "border border-[var(--border-primary)] bg-[var(--bg-glass)] text-[var(--text-primary)] backdrop-blur-xl hover:bg-[var(--bg-surface-hover)] shadow-[var(--shadow-md)]",
      },
      size: {
        default: "h-[44px] px-6 py-2",
        // sm and icon were 36px and 40px. A smaller button is still a button
        // and still gets hit with a fingertip, so the size variants change the
        // padding and the type, not how easy it is to press.
        sm: "min-h-[44px] rounded-lg px-4 text-xs",
        lg: "h-13 rounded-2xl px-8 text-base",
        icon: "h-[44px] w-[44px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
