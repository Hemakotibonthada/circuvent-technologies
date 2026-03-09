import * as React from "react";
import { cn } from "@/lib/utils";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, helperText, options, placeholder, id, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-sm font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            {label}
          </label>
        )}
        <select
          id={selectId}
          className={cn(
            "flex h-11 w-full rounded-xl px-4 py-2 text-sm transition-all duration-200 appearance-none cursor-pointer",
            "focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)] focus:ring-offset-1 focus:ring-offset-[var(--bg-primary)]",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error && "ring-2 ring-rose-500/50",
            className
          )}
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-primary)",
            color: "var(--text-primary)",
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 12px center",
            paddingRight: "40px",
          }}
          ref={ref}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </option>
          ))}
        </select>
        {error && <p className="text-xs text-rose-500">{error}</p>}
        {helperText && !error && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {helperText}
          </p>
        )}
      </div>
    );
  }
);
Select.displayName = "Select";

export { Select };
