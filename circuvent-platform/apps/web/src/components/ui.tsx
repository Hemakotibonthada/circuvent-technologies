"use client";

import React from "react";
import { cn } from "@/lib/utils";

// ══════════════════════════════════════════════════════════════
// Button
// ══════════════════════════════════════════════════════════════

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "outline";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 text-slate-900 dark:text-white hover:bg-brand-700 border-brand-600 shadow-sm press-effect",
  secondary: "bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-200 dark:hover:bg-slate-600 dark:border-slate-700 shadow-sm press-effect",
  danger: "bg-red-600 text-slate-900 dark:text-white hover:bg-red-700 border-red-600 shadow-sm press-effect",
  ghost: "bg-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-white border-transparent",
  outline: "bg-transparent text-slate-600 hover:bg-slate-50 border-slate-300 dark:text-slate-300 dark:hover:bg-slate-100 dark:hover:bg-slate-800 dark:border-slate-600",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg border font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:opacity-50 disabled:cursor-not-allowed",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}

// ══════════════════════════════════════════════════════════════
// Card
// ══════════════════════════════════════════════════════════════

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
}

export function Card({ children, className, padding = true }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/50 animate-fade-in",
        padding && "p-6",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Badge
// ══════════════════════════════════════════════════════════════

type BadgeColor = "blue" | "green" | "red" | "amber" | "purple" | "slate" | "cyan" | "pink" | "emerald" | "orange";

interface BadgeProps {
  children: React.ReactNode;
  color?: BadgeColor;
  className?: string;
}

const badgeColors: Record<BadgeColor, string> = {
  blue: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20",
  green: "bg-green-100 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20",
  red: "bg-red-100 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20",
  amber: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
  purple: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20",
  slate: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:border-slate-500/20",
  cyan: "bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-400 dark:border-cyan-500/20",
  pink: "bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-500/10 dark:text-pink-400 dark:border-pink-500/20",
  emerald: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
  orange: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20",
};

export function Badge({ children, color = "slate", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        badgeColors[color],
        className
      )}
    >
      {children}
    </span>
  );
}

// ══════════════════════════════════════════════════════════════
// Input / Select / Textarea
// ══════════════════════════════════════════════════════════════

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, ...props }: InputProps) {
  return (
    <div className="space-y-1">
      {label && <label className="block text-sm font-medium text-slate-700 dark:text-slate-600 dark:text-slate-300">{label}</label>}
      <input
        className={cn(
          "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 transition-all duration-200 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:placeholder-slate-500 dark:focus:ring-brand-500/40",
          error && "border-red-500 dark:border-red-500",
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

export function Select({ label, options, className, ...props }: SelectProps) {
  return (
    <div className="space-y-1">
      {label && <label className="block text-sm font-medium text-slate-700 dark:text-slate-600 dark:text-slate-300">{label}</label>}
      <select
        className={cn(
          "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition-all duration-200 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:ring-brand-500/40",
          className
        )}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export function Textarea({ label, className, ...props }: TextareaProps) {
  return (
    <div className="space-y-1">
      {label && <label className="block text-sm font-medium text-slate-700 dark:text-slate-600 dark:text-slate-300">{label}</label>}
      <textarea
        className={cn(
          "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 transition-all duration-200 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:placeholder-slate-500 dark:focus:ring-brand-500/40",
          className
        )}
        rows={3}
        {...props}
      />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Table
// ══════════════════════════════════════════════════════════════

interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  className?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  loading?: boolean;
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  emptyMessage = "No data found",
  loading = false,
}: TableProps<T>) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <svg className="h-6 w-6 animate-spin text-brand-500" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-slate-500">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-800">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500",
                  col.className
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
          {data.map((item, idx) => (
            <tr
              key={keyExtractor(item)}
              onClick={() => onRowClick?.(item)}
              className={cn(
                "transition-colors hover:bg-slate-50 dark:hover:bg-slate-50 dark:hover:bg-slate-800/50",
                onRowClick && "cursor-pointer",
              )}
              style={{ animationDelay: `${idx * 0.03}s` }}
            >
              {columns.map((col) => (
                <td key={col.key} className={cn("px-4 py-3 text-sm text-slate-700 dark:text-slate-600 dark:text-slate-300", col.className)}>
                  {col.render ? col.render(item) : item[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Modal
// ══════════════════════════════════════════════════════════════

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

const modalSizes = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function Modal({ open, onClose, title, children, size = "md" }: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm dark:bg-black/60 animate-fade-in" onClick={onClose} />
      <div
        className={cn(
          "relative w-full rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 animate-scale-in",
          modalSizes[size]
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Stats / KPI Card
// ══════════════════════════════════════════════════════════════

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: { value: number; label: string };
  color?: BadgeColor;
}

export function StatCard({ title, value, subtitle, icon, trend, color = "blue" }: StatCardProps) {
  const colorBg: Record<string, string> = {
    blue: "border-blue-200 bg-blue-50 dark:border-blue-500/20 dark:bg-blue-500/5",
    green: "border-green-200 bg-green-50 dark:border-green-500/20 dark:bg-green-500/5",
    red: "border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-500/5",
    amber: "border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/5",
    purple: "border-purple-200 bg-purple-50 dark:border-purple-500/20 dark:bg-purple-500/5",
    cyan: "border-cyan-200 bg-cyan-50 dark:border-cyan-500/20 dark:bg-cyan-500/5",
    emerald: "border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/5",
    orange: "border-orange-200 bg-orange-50 dark:border-orange-500/20 dark:bg-orange-500/5",
    pink: "border-pink-200 bg-pink-50 dark:border-pink-500/20 dark:bg-pink-500/5",
    slate: "border-slate-200 bg-slate-50 dark:border-slate-500/20 dark:bg-slate-500/5",
  };

  return (
    <div className={cn("rounded-xl border p-5 card-hover", colorBg[color])}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{title}</p>
        {icon && <div className="text-slate-400 dark:text-slate-500">{icon}</div>}
      </div>
      <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{value}</p>
      {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
      {trend && (
        <p className={cn("mt-1 text-xs", trend.value >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
          {trend.value >= 0 ? "+" : ""}
          {trend.value}% {trend.label}
        </p>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Empty State
// ══════════════════════════════════════════════════════════════

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 py-16 text-center dark:border-slate-700 animate-fade-in">
      <div className="mb-4 rounded-full bg-slate-100 p-4 dark:bg-slate-800">
        <svg className="h-8 w-8 text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Tabs
// ══════════════════════════════════════════════════════════════

interface Tab {
  id: string;
  label: string;
  count?: number;
}

export function Tabs({
  tabs,
  activeTab,
  onChange,
}: {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-all duration-200",
            activeTab === tab.id
              ? "border-brand-500 text-brand-600 dark:text-brand-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white"
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// PageHeader
// ══════════════════════════════════════════════════════════════

export function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumbs,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
}) {
  return (
    <div className="mb-6 animate-fade-in">
      {breadcrumbs && (
        <nav className="mb-2 flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
          {breadcrumbs.map((crumb, i) => (
            <React.Fragment key={crumb.label}>
              {i > 0 && <span>/</span>}
              {crumb.href ? (
                <a href={crumb.href} className="hover:text-slate-600 dark:hover:text-slate-600 dark:text-slate-300">{crumb.label}</a>
              ) : (
                <span className="text-slate-600 dark:text-slate-400">{crumb.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>
    </div>
  );
}
