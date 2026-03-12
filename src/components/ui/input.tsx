import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    { className, type, label, error, helperText, leftIcon, rightIcon, id, ...props },
    ref
  ) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: "var(--text-muted)" }}
            >
              {leftIcon}
            </div>
          )}
          <input
            type={type}
            id={inputId}
            className={cn(
              "flex h-11 w-full rounded-xl px-4 py-2 text-sm transition-all duration-200",
              "focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)] focus:ring-offset-1 focus:ring-offset-[var(--bg-primary)]",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "placeholder:text-[var(--text-muted)]",
              leftIcon && "pl-10",
              rightIcon && "pr-10",
              error && "ring-2 ring-rose-500/50",
              className
            )}
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-primary)",
              color: "var(--text-primary)",
            }}
            ref={ref}
            {...props}
          />
          {rightIcon && (
            <div
              className="absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: "var(--text-muted)" }}
            >
              {rightIcon}
            </div>
          )}
        </div>
        {error && (
          <p className="text-xs text-rose-500">{error}</p>
        )}
        {helperText && !error && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {helperText}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
