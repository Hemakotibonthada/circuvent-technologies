"use client";
import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import Link from "next/link";

export default function PayslipsPage() {
  const { token, user } = useAuth();
  const [employee, setEmployee] = useState<any>(null);
  const [slips, setSlips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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

  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="mb-6">
        <Link href="/portal" className="text-sm text-brand-400 hover:text-brand-300">← Back to Portal</Link>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">💰 My Payslips</h1>
        <p className="text-slate-400 text-sm mt-1">View your monthly salary breakdowns and download payslips</p>
      </div>

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
                  <div className={`mt-1 px-2 py-0.5 text-xs rounded inline-block ${slip.isPaid ? "bg-emerald-900/50 text-emerald-400" : "bg-amber-900/50 text-amber-400"}`}>
                    {slip.isPaid ? "✓ Paid" : "⏳ Processing"}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-emerald-400">₹{Number(slip.netSalary).toLocaleString("en-IN")}</p>
                  <p className="text-xs text-slate-500">Net Salary</p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                <div>
                  <p className="text-xs text-slate-500">Base Pay</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">₹{Number(slip.basePay).toLocaleString("en-IN")}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">HRA</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">₹{Number(slip.hra).toLocaleString("en-IN")}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Gross Salary</p>
                  <p className="text-sm text-slate-900 dark:text-white font-medium">₹{Number(slip.grossSalary).toLocaleString("en-IN")}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Deductions</p>
                  <p className="text-sm text-red-400">-₹{Number(slip.totalDeductions).toLocaleString("en-IN")}</p>
                </div>
              </div>
              <details className="mt-3">
                <summary className="text-xs text-brand-400 cursor-pointer hover:text-brand-300">View Full Breakdown</summary>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 pt-3 border-t border-slate-200 dark:border-slate-800/50">
                  <div><p className="text-xs text-slate-600">DA</p><p className="text-xs text-slate-400">₹{Number(slip.da).toLocaleString("en-IN")}</p></div>
                  <div><p className="text-xs text-slate-600">Special Allow.</p><p className="text-xs text-slate-400">₹{Number(slip.specialAllowance).toLocaleString("en-IN")}</p></div>
                  <div><p className="text-xs text-slate-600">Bonus</p><p className="text-xs text-slate-400">₹{Number(slip.bonus).toLocaleString("en-IN")}</p></div>
                  <div><p className="text-xs text-slate-600">PF</p><p className="text-xs text-red-400/70">-₹{Number(slip.pfDeduction).toLocaleString("en-IN")}</p></div>
                  <div><p className="text-xs text-slate-600">ESI</p><p className="text-xs text-red-400/70">-₹{Number(slip.esiDeduction).toLocaleString("en-IN")}</p></div>
                  <div><p className="text-xs text-slate-600">Prof. Tax</p><p className="text-xs text-red-400/70">-₹{Number(slip.professionalTax).toLocaleString("en-IN")}</p></div>
                  <div><p className="text-xs text-slate-600">TDS</p><p className="text-xs text-red-400/70">-₹{Number(slip.tds).toLocaleString("en-IN")}</p></div>
                </div>
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
