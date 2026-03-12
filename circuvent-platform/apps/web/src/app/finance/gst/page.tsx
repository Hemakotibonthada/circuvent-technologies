"use client";
import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import Link from "next/link";

export default function GSTPage() {
  const { token } = useAuth();
  const { data: summary } = useApi<any>("/finance/gst/summary");
  const { data: rates } = useApi<any>("/finance/gst/rates");
  const [calc, setCalc] = useState({ amount: "", rate: "18", isInterState: false });
  const [result, setResult] = useState<any>(null);

  const handleCalc = async () => {
    if (!calc.amount) return;
    const res = await api.post("/finance/gst/calculate", { amount: Number(calc.amount), rate: Number(calc.rate), isInterState: calc.isInterState }, token || undefined);
    if (res.success) setResult(res.data);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="mb-6">
        <Link href="/finance" className="text-sm text-brand-600 dark:text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300">← Finance</Link>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">🏛️ GST Management</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* GST Summary */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">GST Summary</h2>
          {summary ? (
            <div className="space-y-3">
              <div className="flex justify-between text-sm"><span className="text-slate-400">Output Tax (Collected)</span><span className="text-blue-600 dark:text-blue-400 font-mono">₹{Number(summary.outputTax).toLocaleString("en-IN")}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-400">Input Credit (Paid)</span><span className="text-emerald-600 dark:text-emerald-400 font-mono">₹{Number(summary.inputCredit).toLocaleString("en-IN")}</span></div>
              <div className="flex justify-between text-sm p-2 bg-slate-100 dark:bg-slate-800 rounded-lg font-semibold">
                <span className="text-slate-900 dark:text-white">Net Liability</span>
                <span className={summary.netLiability > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}>₹{Number(summary.netLiability).toLocaleString("en-IN")}</span>
              </div>
              {summary.refundable > 0 && <p className="text-xs text-emerald-600 dark:text-emerald-400">ITC Refundable: ₹{Number(summary.refundable).toLocaleString("en-IN")}</p>}
            </div>
          ) : <p className="text-slate-500 text-sm text-center py-4">No GST data</p>}
        </div>

        {/* GST Calculator */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">🧮 GST Calculator</h2>
          <div className="space-y-3">
            <input type="number" placeholder="Base Amount (₹)" value={calc.amount} onChange={e => setCalc({ ...calc, amount: e.target.value })}
              className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm" />
            <div className="flex gap-3">
              <select value={calc.rate} onChange={e => setCalc({ ...calc, rate: e.target.value })}
                className="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 text-sm">
                <option value="0">0%</option><option value="0.25">0.25%</option><option value="5">5%</option>
                <option value="12">12%</option><option value="18">18%</option><option value="28">28%</option>
              </select>
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={calc.isInterState} onChange={e => setCalc({ ...calc, isInterState: e.target.checked })}
                  className="rounded border-slate-600" />
                Inter-State
              </label>
            </div>
            <button onClick={handleCalc} className="w-full px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm">Calculate GST</button>

            {result && (
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-400">Base Amount</span><span className="text-slate-900 dark:text-white font-mono">₹{Number(result.baseAmount).toLocaleString("en-IN")}</span></div>
                {!result.isInterState ? (
                  <>
                    <div className="flex justify-between"><span className="text-slate-400">CGST ({Number(result.rate) / 2}%)</span><span className="text-emerald-600 dark:text-emerald-400 font-mono">₹{Number(result.cgst).toLocaleString("en-IN")}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">SGST ({Number(result.rate) / 2}%)</span><span className="text-blue-600 dark:text-blue-400 font-mono">₹{Number(result.sgst).toLocaleString("en-IN")}</span></div>
                  </>
                ) : (
                  <div className="flex justify-between"><span className="text-slate-400">IGST ({result.rate}%)</span><span className="text-purple-600 dark:text-purple-400 font-mono">₹{Number(result.igst).toLocaleString("en-IN")}</span></div>
                )}
                <div className="flex justify-between font-bold border-t border-slate-200 dark:border-slate-700 pt-2"><span className="text-slate-900 dark:text-white">Grand Total</span><span className="text-slate-900 dark:text-white font-mono">₹{Number(result.grandTotal).toLocaleString("en-IN")}</span></div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* HSN/SAC Rate Table */}
      {rates && (
        <div className="mt-6 bg-white border dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">📋 HSN/SAC Rate Reference</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(rates as Record<string, any[]>).map(([category, items]) => (
              <div key={category}>
                <h3 className="text-xs text-brand-600 dark:text-brand-400 uppercase font-semibold mb-2">{category}</h3>
                <div className="space-y-1">
                  {items.map((item: any) => (
                    <div key={item.code} className="flex justify-between text-xs bg-slate-100 dark:bg-slate-800/50 rounded px-2 py-1">
                      <span className="text-slate-400">{item.code} — {item.description}</span>
                      <span className="text-amber-600 dark:text-amber-400 font-semibold">{item.rate}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
