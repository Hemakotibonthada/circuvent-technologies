"use client";

import { useApi, useAuth } from "@/hooks/use-auth";
import CEODashboard from "./ceo/page";
import HRManagerDashboard from "./hr/page";
import ManagerDashboard from "./manager/page";
import DeveloperDashboard from "./developer/page";
import CandidateDashboard from "./candidate/page";
import MarketingDashboard from "./marketing/page";
import InternDashboard from "./intern/page";

export default function DashboardPage() {
  const { user } = useAuth();
  const role = user?.role;

  // ── Role-based dashboard routing ──
  if (role === "CEO" || role === "SUPER_ADMIN") return <CEODashboard />;
  if (role === "HR_MANAGER") return <HRManagerDashboard />;
  if (role === "MANAGER" || role === "PRODUCT_MANAGER") return <ManagerDashboard />;
  if (role === "CANDIDATE") return <CandidateDashboard />;
  if (role === "MARKETING") return <MarketingDashboard />;
  if (role === "INTERN") return <InternDashboard />;
  if (role === "DEVELOPER" || role === "TESTER") return <DeveloperDashboard />;

  // ── Default: Admin / Engineer unified dashboard ──
  return <UnifiedDashboard />;
}

function UnifiedDashboard() {
  const { data: projDash } = useApi<any>("/projects/dashboard");
  const { data: iotDash } = useApi<any>("/iot/devices/dashboard/summary");
  const { data: hrDash } = useApi<any>("/hr/employees/dashboard");
  const { data: revDash } = useApi<any>("/clients/invoices/dashboard/revenue");
  const { data: aiDash } = useApi<any>("/ai/resources/dashboard");
  const { data: iotHealth } = useApi<any>("/iot/heartbeat/health");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Command Center</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Unified Operations Dashboard</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-slate-500">All systems operational</span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <KPI title="Projects" value={projDash?.active ?? "—"} sub={`${projDash?.totalProjects ?? 0} total`} color="blue" />
        <KPI title="IoT Online" value={iotDash?.online ?? "—"} sub={`${iotDash?.onlinePercentage ?? 0}%`} color="green" />
        <KPI title="Employees" value={hrDash?.totalEmployees ?? "—"} sub="Active" color="purple" />
        <KPI title="Revenue" value={revDash?.totalRevenue ? `₹${Math.round(revDash.totalRevenue / 100000)}L` : "—"} sub={`${revDash?.overdueInvoices ?? 0} overdue`} color="amber" />
        <KPI title="GPU Util." value={`${aiDash?.utilizationPercent ?? 0}%`} sub={`${aiDash?.available ?? 0} free`} color="cyan" />
        <KPI title="Alerts" value={iotHealth?.criticalAlerts ?? 0} sub={`${iotHealth?.warningAlerts ?? 0} warnings`} color={iotHealth?.criticalAlerts > 0 ? "red" : "slate"} />
      </div>

      {/* Alert Banner */}
      {iotHealth?.criticalAlerts > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-center justify-between dark:border-red-500/30 dark:bg-red-500/5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/20">
              <svg className="h-5 w-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.27 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">{iotHealth.criticalAlerts} Critical Alert(s)</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{iotHealth.devicesNeedingAttention?.length || 0} devices need attention</p>
            </div>
          </div>
          <a href="/iot/health" className="rounded-lg bg-red-100 px-4 py-2 text-xs font-medium text-red-700 hover:bg-red-200 dark:bg-red-500/20 dark:text-red-400 dark:hover:bg-red-500/30">View →</a>
        </div>
      )}

      {/* Quick Access */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {[
          { icon: "📊", title: "Projects", desc: "Sprints, BOM, R&D", href: "/projects", tags: ["Sprint Board", "BOM Tracker"] },
          { icon: "📡", title: "IoT", desc: "Devices, firmware, telemetry", href: "/iot", tags: ["Health Monitor", "OTA"] },
          { icon: "👥", title: "HR & Payroll", desc: "India compliance, PDFs", href: "/hr", tags: ["Payslip PDF", "EPF/ESI/TDS"] },
          { icon: "💼", title: "Clients", desc: "CRM, invoicing, GST", href: "/clients", tags: ["Pipeline", "Invoice PDF"] },
          { icon: "🤖", title: "AI Orchestrator", desc: "GPU pool, jobs, bots", href: "/ai", tags: ["Scheduler", "Risk Engine"] },
          { icon: "🔒", title: "Audit", desc: "ISO audit trail", href: "/audit", tags: ["Compliance", "Security"] },
        ].map((m) => (
          <a key={m.title} href={m.href} className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-brand-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/50 dark:hover:border-brand-500/50 dark:hover:bg-slate-900">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xl">{m.icon}</span>
              <h3 className="text-base font-semibold text-slate-900 group-hover:text-brand-600 dark:text-white dark:group-hover:text-brand-400">{m.title}</h3>
            </div>
            <p className="text-xs text-slate-500 mb-3 dark:text-slate-400">{m.desc}</p>
            <div className="flex gap-1.5">
              {m.tags.map((t) => <span key={t} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">{t}</span>)}
            </div>
          </a>
        ))}
      </div>

      {/* Platform Health */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
        <h3 className="mb-4 text-xs font-semibold text-slate-400 uppercase tracking-wider dark:text-slate-500">Platform</h3>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            ["Database", "PostgreSQL 17"],
            ["Services", "6 running"],
            ["WebSocket", "Active"],
            ["Gateway", "Port 3000"],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              <div>
                <p className="text-xs text-slate-500">{label}</p>
                <p className="text-sm text-slate-900 dark:text-white">{value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function KPI({ title, value, sub, color }: { title: string; value: string | number; sub: string; color: string }) {
  const c: Record<string, string> = {
    blue: "border-blue-200 bg-blue-50 dark:border-blue-500/30 dark:bg-blue-500/5",
    green: "border-green-200 bg-green-50 dark:border-green-500/30 dark:bg-green-500/5",
    purple: "border-purple-200 bg-purple-50 dark:border-purple-500/30 dark:bg-purple-500/5",
    amber: "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/5",
    cyan: "border-cyan-200 bg-cyan-50 dark:border-cyan-500/30 dark:bg-cyan-500/5",
    red: "border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/5",
    slate: "border-slate-200 bg-slate-50 dark:border-slate-500/30 dark:bg-slate-500/5",
  };
  return (
    <div className={`rounded-xl border p-4 ${c[color] || c.blue}`}>
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
      <p className="mt-0.5 text-xs text-slate-500">{sub}</p>
    </div>
  );
}
