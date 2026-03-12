"use client";

import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import {
  PageHeader, Card, CardHeader, StatCard, Badge, Button,
  DataTable, Modal, Input, Select, Textarea, EmptyState,
} from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { api } from "@/lib/api-client";

/* ── colour maps ────────────────────────────────────────── */

type BadgeColor = "blue" | "green" | "red" | "amber" | "purple" | "slate" | "cyan" | "pink" | "emerald" | "orange";

const environmentColors: Record<string, BadgeColor> = {
  DEVELOPMENT: "blue",
  STAGING: "amber",
  PRODUCTION: "green",
  ALL: "purple",
};

/* ── types ──────────────────────────────────────────────── */

interface TargetingRule {
  id: string;
  attribute: string;
  operator: string;
  value: string;
}

interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description: string;
  isEnabled: boolean;
  environment: string;
  percentage: number;
  targetingRules: TargetingRule[];
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

interface FlagStats {
  totalFlags: number;
  enabled: number;
  disabled: number;
  withTargeting: number;
}

/* ── component ──────────────────────────────────────────── */

export default function FeatureFlagsPage() {
  const { token, isAdmin } = useAuth();

  /* ── data ─────────────────────────────────────────────── */
  const { data: flags, loading, refetch } = useApi<FeatureFlag[]>("/settings/feature-flags");
  const { data: stats } = useApi<FlagStats>("/settings/feature-flags/stats");

  /* ── state ────────────────────────────────────────────── */
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<FeatureFlag | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [filterEnv, setFilterEnv] = useState("ALL");

  const [form, setForm] = useState({
    key: "", name: "", description: "",
    environment: "ALL", percentage: "100",
  });

  const [rules, setRules] = useState<Array<{
    attribute: string; operator: string; value: string;
  }>>([]);

  /* ── helpers ──────────────────────────────────────────── */
  const flash = (type: "success" | "error", msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3000);
  };

  const filteredFlags = filterEnv === "ALL"
    ? (flags || [])
    : (flags || []).filter((f) => f.environment === filterEnv || f.environment === "ALL");

  /* ── actions ──────────────────────────────────────────── */
  const handleCreate = async () => {
    setSubmitting(true);
    const res = await api.post("/settings/feature-flags", {
      ...form,
      percentage: Number(form.percentage),
      targetingRules: rules
        .filter((r) => r.attribute && r.value)
        .map((r) => ({ attribute: r.attribute, operator: r.operator, value: r.value })),
    }, token || undefined);
    setSubmitting(false);
    if (res.success) {
      flash("success", "Feature flag created");
      setShowCreate(false);
      setForm({ key: "", name: "", description: "", environment: "ALL", percentage: "100" });
      setRules([]);
      refetch();
    } else flash("error", res.error || "Failed to create flag");
  };

  const handleToggle = async (flag: FeatureFlag) => {
    const res = await api.patch(`/settings/feature-flags/${flag.id}`, {
      isEnabled: !flag.isEnabled,
    }, token || undefined);
    if (res.success) {
      flash("success", `${flag.key} ${!flag.isEnabled ? "enabled" : "disabled"}`);
      refetch();
    } else flash("error", res.error || "Toggle failed");
  };

  const handleDelete = async (id: string) => {
    const res = await api.delete(`/settings/feature-flags/${id}`, token || undefined);
    if (res.success) { flash("success", "Flag deleted"); refetch(); setShowDetail(null); }
    else flash("error", res.error || "Delete failed");
  };

  const handleSeedDefaults = async () => {
    setSubmitting(true);
    const res = await api.post("/settings/feature-flags/seed", {}, token || undefined);
    setSubmitting(false);
    if (res.success) { flash("success", "Default flags seeded"); refetch(); }
    else flash("error", res.error || "Seed failed");
  };

  const handleUpdatePercentage = async (id: string, percentage: number) => {
    const res = await api.patch(`/settings/feature-flags/${id}`, { percentage }, token || undefined);
    if (res.success) { flash("success", "Rollout updated"); refetch(); }
    else flash("error", res.error || "Update failed");
  };

  /* ── rule builder helpers ─────────────────────────────── */
  const addRule = () => setRules([...rules, { attribute: "role", operator: "EQUALS", value: "" }]);
  const removeRule = (idx: number) => setRules(rules.filter((_, i) => i !== idx));
  const updateRule = (idx: number, field: string, value: string) => {
    const next = [...rules];
    next[idx] = { ...next[idx], [field]: value };
    setRules(next);
  };

  /* ── columns ──────────────────────────────────────────── */
  const flagColumns = [
    {
      key: "name", header: "Flag",
      render: (f: FeatureFlag) => (
        <div>
          <p className="font-medium text-slate-900 dark:text-white">{f.name}</p>
          <p className="text-xs text-slate-500 font-mono">{f.key}</p>
        </div>
      ),
    },
    { key: "description", header: "Description", render: (f: FeatureFlag) => <span className="text-xs text-slate-400">{f.description?.slice(0, 80)}</span> },
    { key: "environment", header: "Environment", render: (f: FeatureFlag) => <Badge color={environmentColors[f.environment] || "slate"}>{f.environment}</Badge> },
    {
      key: "percentage", header: "Rollout",
      render: (f: FeatureFlag) => (
        <div className="flex items-center gap-2">
          <div className="h-2 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className={`h-full rounded-full ${f.isEnabled ? "bg-green-500" : "bg-slate-600"}`} style={{ width: `${f.percentage}%` }} />
          </div>
          <span className="text-xs text-slate-400">{f.percentage}%</span>
        </div>
      ),
    },
    {
      key: "targeting", header: "Targeting",
      render: (f: FeatureFlag) => (f.targetingRules || []).length > 0 ?
        <Badge color="purple">{f.targetingRules.length} rule{f.targetingRules.length > 1 ? "s" : ""}</Badge>
        : <span className="text-slate-500">None</span>,
    },
    {
      key: "isEnabled", header: "Status",
      render: (f: FeatureFlag) => (
        <button
          onClick={() => handleToggle(f)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${f.isEnabled ? "bg-green-600" : "bg-slate-100 dark:bg-slate-700"}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${f.isEnabled ? "translate-x-6" : "translate-x-1"}`} />
        </button>
      ),
    },
    { key: "updatedAt", header: "Updated", render: (f: FeatureFlag) => <span className="text-xs text-slate-500">{formatDate(f.updatedAt)}</span> },
    {
      key: "actions", header: "",
      render: (f: FeatureFlag) => (
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setShowDetail(f)}>Details</Button>
        </div>
      ),
    },
  ];

  const s = stats || { totalFlags: 0, enabled: 0, disabled: 0, withTargeting: 0 };

  return (
    <div className="space-y-6">
      {feedback && (
        <div className={`fixed right-4 top-4 z-[100] rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
          feedback.type === "success" ? "border border-green-500/30 bg-green-500/10 text-green-400"
            : "border border-red-500/30 bg-red-500/10 text-red-400"
        }`}>{feedback.msg}</div>
      )}

      <PageHeader
        title="Feature Flags"
        subtitle="Manage feature rollouts and targeting rules"
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Feature Flags" }]}
        actions={
          isAdmin ? (
            <div className="flex gap-2">
              <Button onClick={() => setShowCreate(true)}>+ Create Flag</Button>
              <Button variant="secondary" onClick={handleSeedDefaults} loading={submitting}>Seed Defaults</Button>
            </div>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard title="Total Flags" value={s.totalFlags} color="blue" />
        <StatCard title="Enabled" value={s.enabled} color="green" />
        <StatCard title="Disabled" value={s.disabled} color="slate" />
        <StatCard title="With Targeting" value={s.withTargeting} color="purple" />
      </div>

      {/* filter */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-400">Environment:</span>
        {["ALL", "DEVELOPMENT", "STAGING", "PRODUCTION"].map((env) => (
          <button
            key={env}
            onClick={() => setFilterEnv(env)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filterEnv === env
                ? "bg-brand-600 text-slate-900 dark:text-white"
                : "bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            {env}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader title="Feature Flags" subtitle={`${filteredFlags.length} flags`} />
        <DataTable columns={flagColumns} data={filteredFlags} keyExtractor={(f) => f.id} loading={loading} emptyMessage="No feature flags found. Click 'Seed Defaults' to create standard flags." />
      </Card>

      {/* ── create flag modal ───────────────────────────── */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Feature Flag" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Flag Key" placeholder="enable_dark_mode" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value.replace(/\s/g, "_").toLowerCase() })} />
            <Input label="Display Name" placeholder="Dark Mode" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <Textarea label="Description" placeholder="What does this flag control?" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Environment" options={[
              { value: "ALL", label: "All Environments" },
              { value: "DEVELOPMENT", label: "Development" },
              { value: "STAGING", label: "Staging" },
              { value: "PRODUCTION", label: "Production" },
            ]} value={form.environment} onChange={(e) => setForm({ ...form, environment: e.target.value })} />
            <Input label="Rollout %" type="number" min="0" max="100" value={form.percentage} onChange={(e) => setForm({ ...form, percentage: e.target.value })} />
          </div>

          {/* targeting rules */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-200 p- dark:border-slate-7004">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Targeting Rules</h4>
              <Button size="sm" variant="outline" onClick={addRule}>+ Add Rule</Button>
            </div>

            {rules.length === 0 && (
              <p className="text-xs text-slate-500">No targeting rules. Flag will apply to all users within the rollout percentage.</p>
            )}

            <div className="space-y-2">
              {rules.map((rule, idx) => (
                <div key={idx} className="grid grid-cols-4 gap-2 rounded-lg border border-slate-200 dark:border-slate-800 p-2">
                  <Select options={[
                    { value: "role", label: "Role" },
                    { value: "department", label: "Department" },
                    { value: "country", label: "Country" },
                    { value: "userId", label: "User ID" },
                    { value: "employeeType", label: "Employee Type" },
                  ]} value={rule.attribute} onChange={(e) => updateRule(idx, "attribute", e.target.value)} />
                  <Select options={[
                    { value: "EQUALS", label: "Equals" },
                    { value: "NOT_EQUALS", label: "Not Equals" },
                    { value: "CONTAINS", label: "Contains" },
                    { value: "IN", label: "In List" },
                  ]} value={rule.operator} onChange={(e) => updateRule(idx, "operator", e.target.value)} />
                  <Input placeholder="Value" value={rule.value} onChange={(e) => updateRule(idx, "value", e.target.value)} />
                  <Button size="sm" variant="danger" onClick={() => removeRule(idx)}>✕</Button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} loading={submitting} disabled={!form.key || !form.name}>Create Flag</Button>
          </div>
        </div>
      </Modal>

      {/* ── detail modal ────────────────────────────────── */}
      <Modal open={!!showDetail} onClose={() => setShowDetail(null)} title={`Flag: ${showDetail?.key || ""}`} size="lg">
        {showDetail && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-slate-500">Name</p>
                <p className="text-sm font-medium text-slate-900 dark:text-white">{showDetail.name}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Environment</p>
                <Badge color={environmentColors[showDetail.environment] || "slate"}>{showDetail.environment}</Badge>
              </div>
              <div>
                <p className="text-xs text-slate-500">Status</p>
                <Badge color={showDetail.isEnabled ? "green" : "red"}>{showDetail.isEnabled ? "Enabled" : "Disabled"}</Badge>
              </div>
            </div>

            {showDetail.description && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                <p className="text-sm text-slate-600 dark:text-slate-300">{showDetail.description}</p>
              </div>
            )}

            {/* rollout slider */}
            <div>
              <p className="text-xs text-slate-500 mb-2">Rollout Percentage: {showDetail.percentage}%</p>
              <input
                type="range" min="0" max="100"
                value={showDetail.percentage}
                onChange={(e) => handleUpdatePercentage(showDetail.id, Number(e.target.value))}
                className="w-full accent-brand-500"
              />
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
              </div>
            </div>

            {/* targeting rules */}
            {(showDetail.targetingRules || []).length > 0 && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-200 p- dark:border-slate-7004">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Targeting Rules</h4>
                <div className="space-y-1">
                  {showDetail.targetingRules.map((rule) => (
                    <div key={rule.id} className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm">
                      <Badge color="purple">{rule.attribute}</Badge>
                      <span className="text-slate-500">{rule.operator}</span>
                      <span className="text-slate-900 dark:text-white font-mono">{rule.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-xs text-slate-500">
              <p>Created: {formatDate(showDetail.createdAt)}</p>
              <p>Updated: {formatDate(showDetail.updatedAt)}</p>
            </div>

            {isAdmin && (
              <div className="flex justify-between border-t border-slate-200 dark:border-slate-800 pt-4">
                <Button variant="danger" onClick={() => handleDelete(showDetail.id)}>Delete Flag</Button>
                <Button variant="outline" onClick={() => handleToggle(showDetail)}>
                  {showDetail.isEnabled ? "Disable" : "Enable"}
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
