"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Check, X, RotateCcw } from "lucide-react";
import { formatINR } from "@/lib/shop-data";

function tok(): string {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

interface ReturnReq {
  id: string;
  orderNo: string;
  email: string;
  reason: string;
  status: "requested" | "approved" | "rejected" | "refunded";
  refundAmount?: number;
  adminNote?: string;
  createdAt: string;
}

const TONE: Record<string, string> = {
  requested: "#f59e0b",
  approved: "#06b6d4",
  rejected: "#ef4444",
  refunded: "#10b981",
};

export default function ReturnsPanel() {
  const [items, setItems] = useState<ReturnReq[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/returns", { headers: { "x-admin-token": tok() } });
      if (res.ok) {
        const d = await res.json();
        setItems(d.returns || []);
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (id: string, action: string) => {
    let amount: number | undefined;
    let note: string | undefined;
    if (action === "refund") {
      const raw = window.prompt("Refund amount to wallet (₹). Leave blank to refund the full order total:", "");
      if (raw && raw.trim()) amount = Math.round(Number(raw));
    }
    if (action === "reject") {
      note = window.prompt("Reason for rejection (optional):", "") || undefined;
    }
    await fetch("/api/admin/returns", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ id, action, amount, note }),
    });
    load();
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>{items.length} return request{items.length === 1 ? "" : "s"}</p>
        <button onClick={load} className="flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium" style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--accent-cyan)" }} /></div>
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>No return requests.</p>
      ) : (
        <div className="space-y-2">
          {items.map((r) => (
            <div key={r.id} className="rounded-xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-primary)" }}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{r.orderNo}</span>
                <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: `${TONE[r.status]}22`, color: TONE[r.status] }}>{r.status}</span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>{r.email}</span>
                {r.refundAmount ? <span className="text-xs text-emerald-500">refunded {formatINR(r.refundAmount)}</span> : null}
              </div>
              <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>{r.reason}</p>
              {r.adminNote && <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>Note: {r.adminNote}</p>}
              {(r.status === "requested" || r.status === "approved") && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.status === "requested" && (
                    <>
                      <button onClick={() => act(r.id, "approve")} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white" style={{ background: "#06b6d4" }}>
                        <Check className="h-3.5 w-3.5" /> Approve
                      </button>
                      <button onClick={() => act(r.id, "reject")} className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium" style={{ borderColor: "var(--border-primary)", color: "#ef4444" }}>
                        <X className="h-3.5 w-3.5" /> Reject
                      </button>
                    </>
                  )}
                  <button onClick={() => act(r.id, "refund")} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white" style={{ background: "#10b981" }}>
                    <RotateCcw className="h-3.5 w-3.5" /> Refund to wallet
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
