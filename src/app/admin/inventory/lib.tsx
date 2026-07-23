"use client";
// Shared helpers + tiny UI primitives for the Inventory workspace.
import React from "react";
import { Loader2 } from "lucide-react";

export function tok(): string {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

const H = () => ({ "Content-Type": "application/json", "x-admin-token": tok() });

export async function invGet<T = any>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`/api/admin/inventory${path}`, { headers: { "x-admin-token": tok() } });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}
export async function invSend<T = any>(method: string, path: string, body?: unknown): Promise<{ ok: boolean; data: T }> {
  try {
    const r = await fetch(`/api/admin/inventory${path}`, { method, headers: H(), body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, data };
  } catch {
    return { ok: false, data: {} as T };
  }
}

export function money(n: number): string {
  return "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
}
export function fmtDate(iso?: string): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
  } catch {
    return "-";
  }
}
export function fmtDateTime(iso?: string): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "-";
  }
}

export const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-primary)" };
export const inputStyle: React.CSSProperties = { background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" };
export const inputCls = "rounded-lg border px-3 py-2 text-sm outline-none";
export const inputSm = "rounded-lg border px-2 py-1.5 text-sm outline-none";

export function Btn({ children, onClick, disabled, variant = "primary", type = "button", title }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; variant?: "primary" | "ghost" | "danger"; type?: "button" | "submit"; title?: string;
}) {
  const style: React.CSSProperties =
    variant === "primary" ? { background: "linear-gradient(135deg,#06b6d4,#8b5cf6)", color: "#fff" }
    : variant === "danger" ? { border: "1px solid var(--border-primary)", color: "#ef4444" }
    : { border: "1px solid var(--border-primary)", color: "var(--text-secondary)" };
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-opacity disabled:opacity-50"
      style={style}>
      {children}
    </button>
  );
}

export function Spinner() {
  return <div className="flex justify-center py-14"><Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--accent-cyan)" }} /></div>;
}
export function Empty({ text }: { text: string }) {
  return <p className="py-12 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>{text}</p>;
}
export function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: color + "22", color }}>{children}</span>;
}
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>{label}</span>
      {children}
    </label>
  );
}
export function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4" style={{ background: "rgba(0,0,0,0.55)" }} onClick={onClose}>
      <div className={`mt-10 w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-2xl p-6`} style={card} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{title}</h3>
          <button onClick={onClose} style={{ color: "var(--text-muted)" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function statusColor(s: string): string {
  return ({ draft: "#94a3b8", sent: "#06b6d4", partial: "#f59e0b", received: "#10b981", cancelled: "#ef4444",
    open: "#f59e0b", closed: "#10b981", in_transit: "#06b6d4" } as Record<string, string>)[s] || "#94a3b8";
}

export interface ProductRow {
  productId: string; name: string; slug: string; price: number; stock: number; available: boolean; category: string; custom?: boolean;
  sku: string; barcode: string; hsn: string; gstPct: number; costPrice: number; mrp: number;
  brandId?: string; categoryId?: string; supplierId?: string; locationId?: string;
  reorderPoint: number; reorderQty: number; leadTimeDays: number;
  weightG: number; lengthCm: number; widthCm: number; heightCm: number;
  tags: string[]; notes: string; batchTracked: boolean; serialTracked: boolean; active: boolean;
  stockValueCost: number; stockValueRetail: number; low: boolean;
}
