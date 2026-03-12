"use client";

// ══════════════════════════════════════════════════════════════
// Marketing Dashboard — Campaign metrics, client engagement
// ══════════════════════════════════════════════════════════════

import React from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import { PageHeader, Card, StatCard, Badge } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";

export default function MarketingDashboard() {
  const { user } = useAuth();
  const { data: clients } = useApi<any[]>("/clients");
  const { data: leads } = useApi<any[]>("/clients/leads");
  const { data: invoices } = useApi<any[]>("/clients/invoices");
  const { data: myRecognitions } = useApi<any>("/hr/recognition/my");
  const { data: events } = useApi<any[]>("/hr/calendar/events/my");

  const activeClients = clients?.filter(c => c.status === "ACTIVE")?.length || 0;
  const hotLeads = leads?.filter(l => l.status === "QUALIFIED" || l.status === "PROPOSAL")?.length || 0;
  const totalRevenue = invoices?.filter(i => i.status === "PAID")?.reduce((s: number, i: any) => s + (i.totalAmount || 0), 0) || 0;
  const pendingInvoices = invoices?.filter(i => i.status === "SENT")?.length || 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Marketing Hub`}
        subtitle={`Welcome, ${user?.firstName || "Marketer"} — Drive growth and engagement`}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard title="Active Clients" value={activeClients} icon="💼" color="blue" />
        <StatCard title="Hot Leads" value={hotLeads} icon="🔥" color="red" />
        <StatCard title="Revenue" value={formatCurrency(totalRevenue)} icon="💰" color="green" />
        <StatCard title="Pending Invoices" value={pendingInvoices} icon="📄" color="amber" />
      </div>

      {/* Lead Pipeline */}
      <Card>
        <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Lead Pipeline</h3>
        <div className="grid grid-cols-5 gap-2">
          {["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "CLOSED_WON"].map(stage => {
            const count = leads?.filter(l => l.status === stage)?.length || 0;
            const colors: Record<string, string> = {
              NEW: "border-slate-500/20 bg-slate-500/5",
              CONTACTED: "border-blue-500/20 bg-blue-500/5",
              QUALIFIED: "border-amber-500/20 bg-amber-500/5",
              PROPOSAL: "border-purple-500/20 bg-purple-500/5",
              CLOSED_WON: "border-green-500/20 bg-green-500/5",
            };
            return (
              <div key={stage} className={`rounded-lg border p-4 text-center ${colors[stage] || ""}`}>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{count}</p>
                <p className="text-xs text-slate-400">{stage.replace(/_/g, " ")}</p>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Clients + Events */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Recent Clients</h3>
          <div className="space-y-2">
            {clients?.slice(0, 6).map((c: any) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800/50">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{c.companyName || c.name}</p>
                  <p className="text-xs text-slate-500">{c.industry || "—"}</p>
                </div>
                <Badge color={c.status === "ACTIVE" ? "green" : "slate"}>{c.status}</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Upcoming Events</h3>
          <div className="space-y-2">
            {events?.slice(0, 5).map((e: any) => (
              <div key={e.id} className="flex items-center gap-3 rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800/50">
                <span className="text-lg">📅</span>
                <div>
                  <p className="text-sm text-slate-900 dark:text-white">{e.title}</p>
                  <p className="text-xs text-slate-500">{new Date(e.startTime).toLocaleString("en-IN")}</p>
                </div>
              </div>
            ))}
            {(!events || events.length === 0) && (
              <p className="py-4 text-center text-sm text-slate-500">No upcoming events</p>
            )}
          </div>
        </Card>
      </div>

      {/* Recognition */}
      <Card>
        <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Recognition Points</h3>
        <div className="flex items-center gap-6">
          <div className="text-center">
            <p className="text-3xl font-bold text-slate-900 dark:text-white">{myRecognitions?.totalPoints || 0}</p>
            <p className="text-xs text-slate-400">Total Points</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-slate-900 dark:text-white">{myRecognitions?.received?.length || 0}</p>
            <p className="text-xs text-slate-400">Received</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-slate-900 dark:text-white">{myRecognitions?.given?.length || 0}</p>
            <p className="text-xs text-slate-400">Given</p>
          </div>
        </div>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          { label: "Client Portal", href: "/clients", icon: "💼" },
          { label: "Leads", href: "/clients", icon: "🎯" },
          { label: "Calendar", href: "/hr/calendar", icon: "📅" },
          { label: "Recognition", href: "/hr/recognition", icon: "🏆" },
        ].map((l) => (
          <a key={l.label} href={l.href} className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-200 p- dark:border-slate-7003 text-sm text-slate-600 dark:text-slate-300 hover:border-brand-500/50 hover:text-slate-900 dark:hover:text-white">
            <span>{l.icon}</span> {l.label}
          </a>
        ))}
      </div>
    </div>
  );
}
