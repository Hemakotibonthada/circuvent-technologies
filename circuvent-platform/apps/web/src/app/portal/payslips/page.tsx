"use client";
import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api";

export default function PayslipsPage() {
  const { token, user } = useAuth();
  const [employee, setEmployee] = useState<any>(null);
  const [slips, setSlips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [selectedSlip, setSelectedSlip] = useState<string | null>(null);

  useEffect(() => { if (token) loadEmployee(); }, [token]);
  useEffect(() => { if (employee) loadSlips(); }, [employee]);

  const loadEmployee = async () => {
    const res = await api.get<any[]>("/hr/employees", token!);
    if (res.success && res.data) setEmployee(res.data.find((e: any) => e.user?.email === user?.email) || res.data[0]);
  };

  const loadSlips = async () => {
    if (!employee) return;
    setLoading(true);
    const res = await api.get<any[]>(`/hr/payroll/${employee.id}/slips`, token!);
    if (res.success) setSlips(res.data || []);
    setLoading(false);
  };

  const downloadPayslip = async (slipId: string, month: number, year: number) => {
    setDownloading(slipId);
    try {
      const response = await fetch(`${API_BASE}/hr/payroll/v2/slips/${slipId}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const err = await response.json().catch(() => null);
        alert(err?.error || "Payslip PDF not available yet. Please contact HR.");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Payslip_${monthNames[month - 1]}_${year}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to download payslip. Please try again.");
    } finally {
      setDownloading(null);
    }
  };

  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const fmtINR = (v: number) => `₹${Number(v).toLocaleString("en-IN")}`;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="mb-6">
        <Link href="/portal" className="text-sm text-brand-600 dark:text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300">← Back to Portal</Link>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">💰 My Payslips</h1>
        <p className="text-slate-400 text-sm mt-1">View your monthly salary breakdowns and download payslips</p>
      </div>

      {/* Summary cards */}
      {!loading && slips.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wider">Total Payslips</p>
            <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">{slips.length}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wider">Latest Net Pay</p>
            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{fmtINR(slips[0]?.netSalary || 0)}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wider">Current FY Gross</p>
            <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
              {fmtINR(slips.reduce((sum: number, s: any) => sum + Number(s.grossSalary || 0), 0))}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wider">Total Deductions</p>
            <p className="text-xl font-bold text-red-600 dark:text-red-400 mt-1">
              {fmtINR(slips.reduce((sum: number, s: any) => sum + Number(s.totalDeductions || 0), 0))}
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center text-slate-500 py-12">Loading payslips...</div>
      ) : slips.length === 0 ? (
        <div className="text-center text-slate-500 py-12 bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl">No payslips generated yet</div>
      ) : (
        <div className="space-y-4">
          {slips.map(slip => (
            <div key={slip.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{monthNames[slip.month - 1]} {slip.year}</h3>
                  <div className={`mt-1 px-2 py-0.5 text-xs rounded inline-block ${slip.isPaid ? "bg-emerald-900/50 text-emerald-600 dark:text-emerald-400" : "bg-amber-900/50 text-amber-600 dark:text-amber-400"}`}>
                    {slip.isPaid ? "✓ Paid" : "⏳ Processing"}
                  </div>
                </div>
                <div className="text-right flex flex-col items-end gap-2">
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{fmtINR(slip.netSalary)}</p>
                  <p className="text-xs text-slate-500">Net Salary</p>
                  <button
                    onClick={() => downloadPayslip(slip.id, slip.month, slip.year)}
                    disabled={downloading === slip.id}
                    className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-wait transition-colors shadow-sm"
                  >
                    {downloading === slip.id ? (
                      <><span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" /> Downloading...</>
                    ) : (
                      <><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg> Download PDF</>
                    )}
                  </button>
                </div>
              </div>

              {/* Earnings summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                <div>
                  <p className="text-xs text-slate-500">Base Pay</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{fmtINR(slip.basePay)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">HRA</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{fmtINR(slip.hra)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Gross Salary</p>
                  <p className="text-sm text-slate-900 dark:text-white font-medium">{fmtINR(slip.grossSalary)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Deductions</p>
                  <p className="text-sm text-red-600 dark:text-red-400">-{fmtINR(slip.totalDeductions)}</p>
                </div>
              </div>

              {/* Full breakdown */}
              <details className="mt-3" open={selectedSlip === slip.id} onToggle={(e) => setSelectedSlip((e.target as HTMLDetailsElement).open ? slip.id : null)}>
                <summary className="text-xs text-brand-600 dark:text-brand-400 cursor-pointer hover:text-brand-300">View Full Breakdown</summary>

                {/* Earnings breakdown */}
                <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800/50">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">Earnings</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div><p className="text-xs text-slate-600">DA</p><p className="text-xs text-slate-400">{fmtINR(slip.da)}</p></div>
                    <div><p className="text-xs text-slate-600">Special Allow.</p><p className="text-xs text-slate-400">{fmtINR(slip.specialAllowance)}</p></div>
                    {slip.conveyanceAllowance > 0 && <div><p className="text-xs text-slate-600">Conveyance</p><p className="text-xs text-slate-400">{fmtINR(slip.conveyanceAllowance)}</p></div>}
                    {slip.lta > 0 && <div><p className="text-xs text-slate-600">LTA</p><p className="text-xs text-slate-400">{fmtINR(slip.lta)}</p></div>}
                    <div><p className="text-xs text-slate-600">Bonus</p><p className="text-xs text-slate-400">{fmtINR(slip.bonus)}</p></div>
                  </div>
                </div>

                {/* Deductions breakdown */}
                <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800/50">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">Deductions</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div><p className="text-xs text-slate-600">PF</p><p className="text-xs text-red-600 dark:text-red-400/70">-{fmtINR(slip.pfDeduction)}</p></div>
                    <div><p className="text-xs text-slate-600">ESI</p><p className="text-xs text-red-600 dark:text-red-400/70">-{fmtINR(slip.esiDeduction)}</p></div>
                    <div><p className="text-xs text-slate-600">Prof. Tax</p><p className="text-xs text-red-600 dark:text-red-400/70">-{fmtINR(slip.professionalTax)}</p></div>
                    <div><p className="text-xs text-slate-600">TDS</p><p className="text-xs text-red-600 dark:text-red-400/70">-{fmtINR(slip.tds)}</p></div>
                  </div>
                </div>

                {/* Employer contributions */}
                <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800/50">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">Employer Contributions</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div><p className="text-xs text-slate-600">Employer PF</p><p className="text-xs text-blue-600 dark:text-blue-400">{fmtINR(Math.round(Number(slip.basePay) * 0.12))}</p></div>
                    <div><p className="text-xs text-slate-600">Medical Ins.</p><p className="text-xs text-blue-600 dark:text-blue-400">{fmtINR(Math.round(Number(slip.grossSalary) * 0.03))}</p></div>
                    <div><p className="text-xs text-slate-600">Gratuity</p><p className="text-xs text-blue-600 dark:text-blue-400">{fmtINR(Math.round(Number(slip.basePay) * 15 / 26 / 12))}</p></div>
                    {Number(slip.grossSalary) <= 21000 && <div><p className="text-xs text-slate-600">Employer ESI</p><p className="text-xs text-blue-600 dark:text-blue-400">{fmtINR(Math.ceil(Number(slip.grossSalary) * 0.0325))}</p></div>}
                  </div>
                </div>
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
