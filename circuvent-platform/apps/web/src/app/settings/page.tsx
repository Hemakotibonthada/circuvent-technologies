"use client";

import React, { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader, Card, CardHeader, Badge, Button, Tabs, Input, Select } from "@/components/ui";

export default function SettingsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("general");

  const tabs = [
    { id: "general", label: "General" }, { id: "services", label: "Services" }, { id: "security", label: "Security" }, { id: "api", label: "API & Integrations" }, { id: "features", label: "Feature Flags" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Platform Settings" subtitle="Configuration, services, security, and feature management" />
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* General Tab */}
      {activeTab === "general" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Platform Information" />
            <dl className="space-y-3">
              {[
                ["Platform", "Circuvent Technologies Pvt. Ltd."],
                ["Version", "2.0.0 (Phase 2)"],
                ["Architecture", "Modular Microservices + DDD"],
                ["Database", "PostgreSQL 17 + Prisma ORM"],
                ["Auth", "JWT + RBAC + Sessions"],
                ["Real-Time", "WebSocket (ws)"],
                ["PDF Engine", "PDFKit v0.15"],
                ["Base Currency", "INR"],
                ["Tax Compliance", "India (EPF, ESI, TDS, PT, GST)"],
                ["Source Files", "200+"],
                ["Lines of Code", "25,000+"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between border-b border-slate-200/50 dark:border-slate-800/50 pb-2">
                  <dt className="text-sm text-slate-400">{label}</dt>
                  <dd className="text-sm font-medium text-slate-900 dark:text-white">{value}</dd>
                </Card>
              ))}
            </dl>
          </div>

          <Card>
            <CardHeader title="Supported Modules" />
            <div className="space-y-3">
              {[
                { name: "Project & Engineering Tracker", icon: "📊", enabled: true },
                { name: "IoT Device Registry", icon: "📡", enabled: true },
                { name: "HR & Payroll Engine", icon: "👥", enabled: true },
                { name: "Client & Consulting Portal", icon: "💼", enabled: true },
                { name: "AI Resource Orchestrator", icon: "🤖", enabled: true },
                { name: "Audit & Compliance", icon: "🔒", enabled: true },
              ].map((mod) => (
                <div key={mod.name} className="flex items-center justify-between rounded-lg bg-slate-100 dark:bg-slate-800/50 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span>{mod.icon}</span>
                    <span className="text-sm text-slate-900 dark:text-white">{mod.name}</span>
                  </Card>
                  <Badge color={mod.enabled ? "green" : "red"}>{mod.enabled ? "Active" : "Disabled"}</Badge>
                </div>
              ))}
            </div>
          </div>

          <Card>
            <CardHeader title="Currencies" />
            <div className="flex flex-wrap gap-2">
              {["INR", "USD", "EUR", "GBP", "AED", "SGD", "JPY", "AUD", "CAD"].map((c) => (
                <Badge key={c} color={c === "INR" ? "green" : "slate"}>{c}</Badge>
              ))}
            </Card>
          </div>

          <Card>
            <CardHeader title="R&D Tax Categories" />
            <div className="flex flex-wrap gap-2">
              {["SOFTWARE_DEVELOPMENT", "HARDWARE_PROTOTYPING", "IOT_FIRMWARE", "AI_ML_RESEARCH", "COMPONENT_PROCUREMENT", "TESTING_VALIDATION", "DESIGN_ENGINEERING"].map((c) => (
                <Badge key={c} color="emerald">{c.replace(/_/g, " ")}</Badge>
              ))}
            </Card>
          </div>
        </div>
      )}

      {/* Services Tab */}
      {activeTab === "services" && (
        <Card>
          <CardHeader title="Microservice Status" />
          <div className="space-y-3">
            {[
              { name: "API Gateway", port: 3000, desc: "Auth, proxy, rate limiting, notifications" },
              { name: "Project Tracker", port: 3001, desc: "Sprints, BOM, hardware revisions" },
              { name: "IoT Registry", port: 3002, desc: "Devices, heartbeat, firmware, telemetry" },
              { name: "HR & Payroll", port: 3003, desc: "Employees, salary, leaves, expenses, statutory" },
              { name: "Client Portal", port: 3004, desc: "Leads, invoicing, CRM activities" },
              { name: "Web Dashboard", port: 3005, desc: "Next.js 14 frontend" },
              { name: "AI Orchestrator", port: 3006, desc: "GPU pool, training jobs, trading bots" },
            ].map((svc) => (
              <div key={svc.name} className="flex items-center justify-between rounded-lg bg-slate-100 dark:bg-slate-800/50 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  <div>
                    <span className="text-sm font-medium text-slate-900 dark:text-white">{svc.name}</span>
                    <p className="text-xs text-slate-500">{svc.desc}</p>
                  </Card>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-slate-500">:{svc.port}</span>
                  <Badge color="green">Running</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Security Tab */}
      {activeTab === "security" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Authentication Config" />
            <dl className="space-y-3">
              {[
                ["Method", "JWT (JSON Web Token)"],
                ["Access Token Expiry", "15 minutes"],
                ["Refresh Token Expiry", "7 days"],
                ["Session Management", "Server-side with DB"],
                ["Password Hashing", "bcrypt (12 rounds)"],
                ["Rate Limiting (Auth)", "10 attempts / 15 min"],
                ["Rate Limiting (API)", "120 requests / min"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between border-b border-slate-200/50 dark:border-slate-800/50 pb-2">
                  <dt className="text-sm text-slate-400">{label}</dt>
                  <dd className="text-sm text-slate-900 dark:text-white">{value}</dd>
                </Card>
              ))}
            </dl>
          </div>
          <Card>
            <CardHeader title="RBAC Roles" />
            <div className="space-y-3">
              {[
                { role: "ADMIN", perms: "Full access to all modules, user management, statutory config", color: "red" },
                { role: "ENGINEER", perms: "Projects, IoT, own HR data, AI job submission", color: "blue" },
                { role: "CLIENT", perms: "Client portal, own invoices, project visibility", color: "green" },
              ].map((r) => (
                <div key={r.role} className="rounded-lg border border-slate-200 dark:border-slate-800 p-4">
                  <Badge color={r.color as any}>{r.role}</Badge>
                  <p className="mt-2 text-xs text-slate-400">{r.perms}</p>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* API Tab */}
      {activeTab === "api" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="API Endpoints" />
            <div className="space-y-2">
              {[
                ["Auth", "/api/auth/*"],
                ["Projects", "/api/projects/*"],
                ["IoT Devices", "/api/iot/*"],
                ["HR & Payroll", "/api/hr/*"],
                ["Clients", "/api/clients/*"],
                ["AI", "/api/ai/*"],
                ["Health", "/api/health"],
                ["Audit", "/api/audit"],
                ["Notifications", "/api/notifications"],
              ].map(([name, path]) => (
                <div key={name} className="flex justify-between rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800/50">
                  <span className="text-sm text-slate-900 dark:text-white">{name}</span>
                  <span className="font-mono text-xs text-brand-600 dark:text-brand-400">{path}</span>
                </Card>
              ))}
            </div>
          </div>
          <Card>
            <CardHeader title="WebSocket Channels" />
            <div className="space-y-2">
              {[
                ["iot:telemetry", "Real-time sensor data ingestion"],
                ["iot:heartbeat", "Device health heartbeat monitoring"],
                ["iot:alerts", "Device alert notifications"],
                ["iot:commands", "Device command dispatch"],
                ["gpu:monitor", "GPU utilization metrics"],
                ["notifications", "User notification delivery"],
              ].map(([channel, desc]) => (
                <div key={channel} className="rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800/50">
                  <span className="font-mono text-xs text-cyan-600 dark:text-cyan-400">{channel}</span>
                  <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Feature Flags Tab */}
      {activeTab === "features" && (
        <Card>
          <CardHeader title="Feature Flags" subtitle="Enable or disable platform features" />
          <div className="space-y-3">
            {[
              { flag: "WebSocket Real-Time", desc: "Live IoT telemetry and notifications via WebSocket", enabled: true },
              { flag: "PDF Generation", desc: "Payslip and invoice PDF generation with PDFKit", enabled: true },
              { flag: "AI Orchestrator", desc: "GPU resource management and ML training jobs", enabled: true },
              { flag: "Multi-Currency", desc: "Support for 9 currencies with exchange rate conversion", enabled: true },
              { flag: "Auto-Escalation", desc: "Automatic escalation of stale approval workflows (48h)", enabled: true },
              { flag: "R&D Auto-Tagging", desc: "Auto-tag eligible expenses and projects for R&D tax benefits", enabled: true },
              { flag: "Heartbeat Monitoring", desc: "IoT device heartbeat with threshold-based alerting", enabled: true },
              { flag: "ISO Audit Trail", desc: "Comprehensive audit logging for all write operations", enabled: true },
              { flag: "BOM Export", desc: "Export Bill of Materials in CSV, PDF, and JSON formats", enabled: true },
              { flag: "Gratuity Calculator", desc: "Payment of Gratuity Act compliant calculation", enabled: true },
            ].map((f) => (
              <div key={f.flag} className="flex items-center justify-between rounded-lg bg-slate-100 dark:bg-slate-800/50 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{f.flag}</p>
                  <p className="text-xs text-slate-500">{f.desc}</p>
                </Card>
                <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${f.enabled ? "bg-green-600" : "bg-slate-100 dark:bg-slate-700"}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${f.enabled ? "translate-x-6" : "translate-x-1"}`} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
