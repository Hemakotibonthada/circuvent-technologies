import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  charCount?: boolean;
  maxChars?: number;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, helperText, charCount, maxChars, id, value, ...props }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, "-");
    const currentLength = typeof value === "string" ? value.length : 0;

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-sm font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            {label}
          </label>
        )}
        <textarea
          id={textareaId}
          value={value}
          className={cn(
            "flex min-h-[120px] w-full rounded-xl px-4 py-3 text-sm transition-all duration-200 resize-y",
            "focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)] focus:ring-offset-1 focus:ring-offset-[var(--bg-primary)]",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "placeholder:text-[var(--text-muted)]",
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
        <div className="flex items-center justify-between">
          <div>
            {error && <p className="text-xs text-rose-500">{error}</p>}
            {helperText && !error && (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {helperText}
              </p>
            )}
          </div>
          {charCount && maxChars && (
            <p
              className={cn(
                "text-xs",
                currentLength > maxChars ? "text-rose-500" : ""
              )}
              style={currentLength <= maxChars ? { color: "var(--text-muted)" } : undefined}
            >
              {currentLength}/{maxChars}
            </p>
          )}
        </div>
      </div>
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
