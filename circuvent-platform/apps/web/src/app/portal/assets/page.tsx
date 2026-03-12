"use client";
import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import Link from "next/link";

interface Asset {
  id: string;
  assetCode: string;
  name: string;
  category: string;
  status: string;
  allocatedDate?: string;
  purchaseDate?: string;
  purchasePrice?: number;
  warrantyExpiry?: string;
  nextMaintenanceDate?: string;
  serialNumber?: string;
  condition: string;
  notes?: string;
}

interface AssetRequest {
  id: string;
  assetCategory: string;
  justification: string;
  status: string;
  createdAt: string;
  approvedBy?: string;
  remarks?: string;
}

const CATEGORY_ICONS: Record<string, string> = {
  LAPTOP: "💻", MONITOR: "🖥️", KEYBOARD: "⌨️", MOUSE: "🖱️",
  HEADSET: "🎧", PHONE: "📱", FURNITURE: "🪑", OTHER: "📦",
};

const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: "bg-emerald-900/50 text-emerald-400",
  ALLOCATED: "bg-blue-900/50 text-blue-400",
  UNDER_REPAIR: "bg-amber-900/50 text-amber-400",
  RETIRED: "bg-slate-100 dark:bg-slate-700 text-slate-400",
  PENDING: "bg-amber-900/50 text-amber-400",
  APPROVED: "bg-emerald-900/50 text-emerald-400",
  REJECTED: "bg-red-900/50 text-red-400",
  FULFILLED: "bg-cyan-900/50 text-cyan-400",
};

const ASSET_CATEGORIES = ["LAPTOP", "MONITOR", "KEYBOARD", "MOUSE", "HEADSET", "PHONE", "FURNITURE", "OTHER"];

export default function PortalAssetsPage() {
  const { token, user } = useAuth();
  const [employee, setEmployee] = useState<any>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [requests, setRequests] = useState<AssetRequest[]>([]);
  const [tab, setTab] = useState<"assets" | "requests">("assets");
  const [showRequest, setShowRequest] = useState(false);
  const [showDetail, setShowDetail] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ assetCategory: "LAPTOP", justification: "" });

  useEffect(() => { if (token) loadEmployee(); }, [token]);
  useEffect(() => { if (employee) { loadAssets(); loadRequests(); } }, [employee]);

  const loadEmployee = async () => {
    const res = await api.get<any[]>("/hr/employees", token!);
    if (res.success && res.data) setEmployee(res.data.find((e: any) => e.user?.email === user?.email) || res.data[0]);
  };

  const loadAssets = async () => {
    if (!employee) return;
    setLoading(true);
    const res = await api.get<Asset[]>(`/hr/assets?employeeId=${employee.id}`, token!);
    if (res.success) setAssets(res.data || []);
    setLoading(false);
  };

  const loadRequests = async () => {
    if (!employee) return;
    const res = await api.get<AssetRequest[]>(`/hr/asset-requests?employeeId=${employee.id}`, token!);
    if (res.success) setRequests(res.data || []);
  };

  const handleRequest = async () => {
    if (!employee || !form.justification) return;
    setSubmitting(true);
    await api.post("/hr/asset-requests", {
      employeeId: employee.id,
      assetCategory: form.assetCategory,
      justification: form.justification,
    }, token!);
    setShowRequest(false);
    setForm({ assetCategory: "LAPTOP", justification: "" });
    setSubmitting(false);
    loadRequests();
  };

  const isWarrantyExpiring = (date?: string) => {
    if (!date) return false;
    const diff = new Date(date).getTime() - Date.now();
    return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000;
  };

  const isMaintenanceDue = (date?: string) => {
    if (!date) return false;
    return new Date(date).getTime() <= Date.now() + 7 * 24 * 60 * 60 * 1000;
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/portal" className="text-sm text-brand-400 hover:text-brand-300">← Back to Portal</Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">🖥️ My Assets</h1>
        </div>
        <button onClick={() => setShowRequest(true)} className="px-4 py-2 bg-brand-600 text-slate-900 dark:text-white rounded-lg hover:bg-brand-700 text-sm">+ Request Asset</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-slate-900 dark:text-white">{assets.length}</p>
          <p className="text-xs text-slate-500">Assigned Assets</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-amber-400">{assets.filter(a => isWarrantyExpiring(a.warrantyExpiry)).length}</p>
          <p className="text-xs text-slate-500">Warranty Expiring</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-blue-400">{requests.filter(r => r.status === "PENDING").length}</p>
          <p className="text-xs text-slate-500">Pending Requests</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-lg p-1">
        <button onClick={() => setTab("assets")} className={`flex-1 py-2 text-sm rounded-md transition-colors ${tab === "assets" ? "bg-brand-600 text-white" : "text-slate-400 hover:text-white"}`}>
          Assigned Assets ({assets.length})
        </button>
        <button onClick={() => setTab("requests")} className={`flex-1 py-2 text-sm rounded-md transition-colors ${tab === "requests" ? "bg-brand-600 text-white" : "text-slate-400 hover:text-white"}`}>
          My Requests ({requests.length})
        </button>
      </div>

      {/* Assets Tab */}
      {tab === "assets" && (
        <div className="space-y-3">
          {loading ? (
            <div className="text-center text-slate-500 py-12">Loading assets...</div>
          ) : assets.length === 0 ? (
            <div className="text-center text-slate-500 py-12 bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl">No assets assigned to you</div>
          ) : (
            assets.map(asset => (
              <div key={asset.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 cursor-pointer hover:border-slate-700 transition-colors" onClick={() => setShowDetail(asset)}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{CATEGORY_ICONS[asset.category] || "📦"}</span>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-slate-500 font-mono">{asset.assetCode}</span>
                        <span className={`px-2 py-0.5 text-xs rounded ${STATUS_COLORS[asset.status] || STATUS_COLORS.AVAILABLE}`}>{asset.status}</span>
                      </div>
                      <h3 className="text-sm font-medium text-white">{asset.name}</h3>
                      <p className="text-xs text-slate-500 mt-1">{asset.category}</p>
                      {asset.serialNumber && <p className="text-xs text-slate-600 font-mono mt-0.5">S/N: {asset.serialNumber}</p>}
                    </div>
                  </div>
                  <div className="text-right">
                    {isWarrantyExpiring(asset.warrantyExpiry) && (
                      <span className="text-xs text-amber-400">⚠️ Warranty expiring</span>
                    )}
                    {isMaintenanceDue(asset.nextMaintenanceDate) && (
                      <span className="text-xs text-blue-400 block">🔧 Maintenance due</span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Requests Tab */}
      {tab === "requests" && (
        <div className="space-y-3">
          {requests.length === 0 ? (
            <div className="text-center text-slate-500 py-12 bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl">No asset requests</div>
          ) : (
            requests.map(req => (
              <div key={req.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">{CATEGORY_ICONS[req.assetCategory] || "📦"}</span>
                      <span className={`px-2 py-0.5 text-xs rounded ${STATUS_COLORS[req.status]}`}>{req.status}</span>
                    </div>
                    <h3 className="text-sm font-medium text-white">{req.assetCategory}</h3>
                    <p className="text-xs text-slate-400 mt-1">{req.justification}</p>
                    {req.remarks && <p className="text-xs text-slate-500 mt-1 italic">Remarks: {req.remarks}</p>}
                  </div>
                  <p className="text-xs text-slate-500">{new Date(req.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Asset Detail Modal */}
      {showDetail && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">{CATEGORY_ICONS[showDetail.category] || "📦"}</span>
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{showDetail.name}</h2>
                <p className="text-xs text-slate-500 font-mono">{showDetail.assetCode}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-slate-500 text-xs">Category</p><p className="text-slate-900 dark:text-white">{showDetail.category}</p></div>
              <div><p className="text-slate-500 text-xs">Condition</p><p className="text-slate-900 dark:text-white">{showDetail.condition || "Good"}</p></div>
              {showDetail.serialNumber && <div><p className="text-slate-500 text-xs">Serial Number</p><p className="text-white font-mono text-xs">{showDetail.serialNumber}</p></div>}
              {showDetail.allocatedDate && <div><p className="text-slate-500 text-xs">Allocated On</p><p className="text-slate-900 dark:text-white">{new Date(showDetail.allocatedDate).toLocaleDateString("en-IN")}</p></div>}
              {showDetail.purchaseDate && <div><p className="text-slate-500 text-xs">Purchase Date</p><p className="text-slate-900 dark:text-white">{new Date(showDetail.purchaseDate).toLocaleDateString("en-IN")}</p></div>}
              {showDetail.purchasePrice != null && <div><p className="text-slate-500 text-xs">Purchase Price</p><p className="text-slate-900 dark:text-white">₹{showDetail.purchasePrice.toLocaleString("en-IN")}</p></div>}
              <div>
                <p className="text-slate-500 text-xs">Warranty Expiry</p>
                <p className={`${showDetail.warrantyExpiry && isWarrantyExpiring(showDetail.warrantyExpiry) ? "text-amber-400" : "text-slate-900 dark:text-white"}`}>
                  {showDetail.warrantyExpiry ? new Date(showDetail.warrantyExpiry).toLocaleDateString("en-IN") : "N/A"}
                </p>
              </div>
              <div>
                <p className="text-slate-500 text-xs">Next Maintenance</p>
                <p className={`${showDetail.nextMaintenanceDate && isMaintenanceDue(showDetail.nextMaintenanceDate) ? "text-blue-400" : "text-slate-900 dark:text-white"}`}>
                  {showDetail.nextMaintenanceDate ? new Date(showDetail.nextMaintenanceDate).toLocaleDateString("en-IN") : "N/A"}
                </p>
              </div>
            </div>
            {showDetail.notes && (
              <div className="mt-3">
                <p className="text-slate-500 text-xs">Notes</p>
                <p className="text-white text-sm">{showDetail.notes}</p>
              </div>
            )}
            <div className="flex justify-end mt-5">
              <button onClick={() => setShowDetail(null)} className="px-4 py-2 text-slate-400 hover:text-white text-sm">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Request Asset Modal */}
      {showRequest && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Request New Asset</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Asset Category *</label>
                <select value={form.assetCategory} onChange={e => setForm({ ...form, assetCategory: e.target.value })}
                  className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm">
                  {ASSET_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_ICONS[c]} {c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Justification *</label>
                <textarea placeholder="Why do you need this asset?" value={form.justification}
                  onChange={e => setForm({ ...form, justification: e.target.value })}
                  className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" rows={3} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowRequest(false)} className="px-4 py-2 text-slate-400 hover:text-white text-sm">Cancel</button>
              <button onClick={handleRequest} disabled={submitting || !form.justification}
                className="px-4 py-2 bg-brand-600 text-slate-900 dark:text-white rounded-lg hover:bg-brand-700 text-sm disabled:opacity-50">
                {submitting ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
