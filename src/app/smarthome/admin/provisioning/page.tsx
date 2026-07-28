"use client";

import { useState } from "react";
import {
  PackagePlus, FileUp, QrCode, Zap, ClipboardList, TriangleAlert, Cpu, Tags,
  Check, X, Play, Upload, FileText, Layers, ScanLine, ShieldCheck,
} from "lucide-react";
import { provisioningStore, type ProvisioningJob } from "../_lib/sim";
import { useStore, uid } from "../_lib/store";
import { relativeTime, num } from "../_lib/format";
import {
  PageHeader, Panel, StatCard, Badge, Dot, Btn, Segmented, DataTable, Field, Input,
  Progress, SectionTitle, StaggerGrid, StaggerItem, EmptyState, type Column, type Tone,
} from "../_ui";

type Tab = "onboard" | "jobs" | "templates" | "errors";

export default function ProvisioningPage() {
  const jobs = useStore(provisioningStore);
  const [tab, setTab] = useState<Tab>("onboard");
  const active = jobs.filter((j) => j.status === "running" || j.status === "queued").length;
  const provisioned = jobs.reduce((s, j) => s + j.succeeded, 0);
  const failed = jobs.reduce((s, j) => s + j.failed, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Device onboarding & provisioning" icon={<PackagePlus className="h-5 w-5" />}
        subtitle="Register devices individually, in bulk, by QR, or zero-touch (JIT with X.509). Apply templates, tags, geo and staging states."
      />

      <StaggerGrid className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StaggerItem><StatCard label="Provisioned" value={num(provisioned)} icon={<Check className="h-4 w-4" />} tone="green" /></StaggerItem>
        <StaggerItem><StatCard label="Active jobs" value={num(active)} icon={<Play className="h-4 w-4" />} tone="brand" /></StaggerItem>
        <StaggerItem><StatCard label="Failed" value={num(failed)} icon={<TriangleAlert className="h-4 w-4" />} tone={failed ? "red" : "green"} /></StaggerItem>
        <StaggerItem><StatCard label="Templates" value="6" icon={<Layers className="h-4 w-4" />} tone="violet" /></StaggerItem>
      </StaggerGrid>

      <div className="flex gap-1 overflow-x-auto border-b border-white/10">
        {([["onboard", "Onboard", PackagePlus], ["jobs", "Jobs", ClipboardList], ["templates", "Templates", Layers], ["errors", "Errors", TriangleAlert]] as const).map(([v, l, Icon]) => (
          <button key={v} onClick={() => setTab(v)} className={`flex items-center gap-2 whitespace-nowrap px-3.5 py-2.5 text-sm font-medium transition ${tab === v ? "text-white" : "text-slate-400 hover:text-slate-200"}`} style={tab === v ? { boxShadow: "inset 0 -2px 0 #06b6d4" } : undefined}>
            <Icon className="h-4 w-4" />{l}
          </button>
        ))}
      </div>

      {tab === "onboard" && <OnboardTab />}
      {tab === "jobs" && <JobsTab jobs={jobs} />}
      {tab === "templates" && <TemplatesTab />}
      {tab === "errors" && <ErrorsTab />}
    </div>
  );
}

function OnboardTab() {
  const [method, setMethod] = useState<"manual" | "bulk" | "qr" | "jit">("manual");
  return (
    <div className="space-y-4">
      <Segmented<"manual" | "bulk" | "qr" | "jit">
        value={method} onChange={setMethod}
        options={[
          { value: "manual", label: <span className="flex items-center gap-1.5"><Cpu className="h-3.5 w-3.5" /> Manual</span> },
          { value: "bulk", label: <span className="flex items-center gap-1.5"><FileUp className="h-3.5 w-3.5" /> Bulk import</span> },
          { value: "qr", label: <span className="flex items-center gap-1.5"><QrCode className="h-3.5 w-3.5" /> QR scan</span> },
          { value: "jit", label: <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" /> Zero-touch</span> },
        ]}
      />
      {method === "manual" && <ManualForm />}
      {method === "bulk" && <BulkImport />}
      {method === "qr" && <QrScan />}
      {method === "jit" && <JitConfig />}
    </div>
  );
}

function ManualForm() {
  const [done, setDone] = useState(false);
  return (
    <Panel>
      <SectionTitle>Single device registration</SectionTitle>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Serial number"><Input placeholder="CV-SN-000123" /></Field>
        <Field label="MAC address"><Input placeholder="A4:CF:12:8B:00:01" className="font-mono" /></Field>
        <Field label="IMEI (cellular)"><Input placeholder="359881234567890" className="font-mono" /></Field>
        <Field label="Hardware model"><select className="ad-input"><option>CV-ESP32-S3</option><option>CV-ESP32-C6</option><option>CV-GW-LTE</option></select></Field>
        <Field label="Device name" hint="Auto-naming: DEV-{LOC}-{TYPE}-{XXXX}"><Input placeholder="DEV-NYC-PLUG-0001" /></Field>
        <Field label="Assign to tenant"><select className="ad-input"><option>Northwind Facilities</option><option>Aurora Energy</option><option>Cobalt Smart Homes</option></select></Field>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Btn variant="primary" onClick={() => { setDone(true); setTimeout(() => setDone(false), 2500); }}><ShieldCheck className="h-4 w-4" /> Register & issue claim cert</Btn>
        {done && <span className="flex items-center gap-1.5 text-sm text-green-400"><Check className="h-4 w-4" /> Registered — claim certificate issued</span>}
      </div>
    </Panel>
  );
}

function BulkImport() {
  const [rows, setRows] = useState<{ serial: string; model: string; ok: boolean }[] | null>(null);
  const runDryRun = () => {
    setRows(Array.from({ length: 8 }, (_, i) => ({ serial: `CV-SN-${1000 + i}`, model: ["CV-ESP32-S3", "CV-ESP32-C6"][i % 2], ok: i !== 3 && i !== 6 })));
  };
  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/15 py-12 text-center">
          <Upload className="mb-3 h-10 w-10 text-slate-500" />
          <div className="font-semibold text-white">Drop a CSV or JSON file</div>
          <p className="mt-1 text-sm ad-muted">Columns: serial, mac, imei, model, tenant, tags. Schema is validated with a dry-run before commit.</p>
          <div className="mt-4 flex gap-2">
            <Btn variant="subtle"><FileText className="h-4 w-4" /> Choose file</Btn>
            <Btn variant="primary" onClick={runDryRun}><Play className="h-4 w-4" /> Run dry-run</Btn>
          </div>
        </div>
      </Panel>
      {rows && (
        <Panel>
          <SectionTitle right={<Badge tone="green">{rows.filter((r) => r.ok).length} valid · <span className="text-red-300">{rows.filter((r) => !r.ok).length} errors</span></Badge>}>Dry-run preview</SectionTitle>
          <div className="space-y-1.5">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-white/5 bg-black/20 px-3 py-2 text-sm">
                {r.ok ? <Check className="h-4 w-4 text-green-400" /> : <X className="h-4 w-4 text-red-400" />}
                <span className="font-mono text-white">{r.serial}</span>
                <span className="ad-muted">{r.model}</span>
                {!r.ok && <span className="ml-auto text-xs text-red-300">duplicate serial</span>}
              </div>
            ))}
          </div>
          <Btn variant="primary" className="mt-4"><Upload className="h-4 w-4" /> Commit {rows.filter((r) => r.ok).length} devices</Btn>
        </Panel>
      )}
    </div>
  );
}

function QrScan() {
  return (
    <Panel>
      <SectionTitle>QR / barcode provisioning</SectionTitle>
      <div className="flex flex-col items-center justify-center py-8">
        <div className="relative grid h-56 w-56 place-items-center rounded-2xl border border-white/10 bg-black/40">
          <ScanLine className="h-24 w-24 text-cyan-400/40" />
          <div className="absolute inset-x-6 h-0.5 animate-pulse bg-cyan-400" style={{ top: "50%" }} />
          <div className="absolute left-4 top-4 h-6 w-6 border-l-2 border-t-2 border-cyan-400" />
          <div className="absolute right-4 top-4 h-6 w-6 border-r-2 border-t-2 border-cyan-400" />
          <div className="absolute bottom-4 left-4 h-6 w-6 border-b-2 border-l-2 border-cyan-400" />
          <div className="absolute bottom-4 right-4 h-6 w-6 border-b-2 border-r-2 border-cyan-400" />
        </div>
        <p className="mt-4 text-sm ad-muted">Point a webcam at the device QR label to auto-fill its identity and claim key.</p>
        <Btn variant="primary" className="mt-4"><QrCode className="h-4 w-4" /> Start camera</Btn>
      </div>
    </Panel>
  );
}

function JitConfig() {
  return (
    <Panel>
      <SectionTitle>Zero-touch / Just-in-time provisioning</SectionTitle>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <p className="text-sm ad-muted">Devices self-register on first connection using an X.509 client certificate signed by your issuing CA. No manual step required.</p>
          {[["Auto-approve JIT devices", true], ["Require TPM 2.0 / ATECC608 attestation", true], ["Quarantine until pre-flight passes", false]].map(([l, on]) => (
            <div key={l as string} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-4 py-3">
              <span className="text-sm text-white">{l}</span>
              <span className="flex items-center gap-1.5 text-xs" style={{ color: on ? "#4ade80" : "#64748b" }}><Dot tone={on ? "green" : "slate"} /> {on ? "on" : "off"}</span>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-white/10 bg-black/40 p-4 font-mono text-xs">
          <div className="mb-2 text-slate-500"># JIT provisioning template</div>
          <pre className="whitespace-pre-wrap text-cyan-300">{`{
  "provisioningTemplate": "cv-jit-v2",
  " caCert": "Device Issuing CA",
  "autoApprove": true,
  "attestation": "TPM2.0",
  "defaultTenant": "Northwind",
  "tags": { "env": "prod" }
}`}</pre>
        </div>
      </div>
    </Panel>
  );
}

function JobsTab({ jobs }: { jobs: ProvisioningJob[] }) {
  const methodTone: Record<string, Tone> = { manual: "slate", "bulk-csv": "brand", qr: "violet", jit: "green", api: "blue" };
  const statusTone: Record<string, Tone> = { queued: "slate", running: "brand", completed: "green", failed: "red" };
  const cols: Column<ProvisioningJob>[] = [
    { key: "name", header: "Job", render: (j) => (<div><div className="font-medium text-white">{j.name}</div><div className="text-[11px] ad-muted">{j.tenant} · {relativeTime(j.startedAt)}</div></div>) },
    { key: "method", header: "Method", render: (j) => <Badge tone={methodTone[j.method]}>{j.method}</Badge> },
    { key: "progress", header: "Progress", render: (j) => (
      <div className="min-w-[140px]">
        <div className="mb-1 flex justify-between text-[11px]"><span className="text-white tabular-nums">{num(j.succeeded)}/{num(j.total)}</span>{j.failed > 0 && <span className="text-red-300">{j.failed} failed</span>}</div>
        <Progress value={(j.succeeded / j.total) * 100} tone={j.failed > j.total * 0.1 ? "amber" : "brand"} height={5} />
      </div>
    ) },
    { key: "status", header: "Status", align: "right", render: (j) => <Badge tone={statusTone[j.status]}><Dot tone={statusTone[j.status]} pulse={j.status === "running"} /> {j.status}</Badge> },
  ];
  return <DataTable rows={jobs} columns={cols} rowKey={(j) => j.id} />;
}

function TemplatesTab() {
  const templates = [
    { name: "Production Plug", type: "smart-plug", tags: ["prod", "grid"], reportInterval: "15s", region: "auto" },
    { name: "Field Sensor", type: "motion-sensor", tags: ["field", "battery"], reportInterval: "60s", region: "auto" },
    { name: "Gateway (LTE)", type: "gateway", tags: ["prod", "cellular"], reportInterval: "30s", region: "manual" },
    { name: "Retail Camera", type: "camera", tags: ["retail", "poe"], reportInterval: "stream", region: "auto" },
    { name: "AquaGuard", type: "aquaguard", tags: ["water", "critical"], reportInterval: "10s", region: "auto" },
    { name: "Staging Unit", type: "any", tags: ["staging"], reportInterval: "30s", region: "manual" },
  ];
  return (
    <StaggerGrid className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {templates.map((t) => (
        <StaggerItem key={t.name}>
          <Panel>
            <div className="flex items-center gap-2"><Layers className="h-5 w-5 text-cyan-400" /><span className="font-semibold text-white">{t.name}</span></div>
            <div className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="ad-muted">Device type</span><span className="text-white">{t.type}</span></div>
              <div className="flex justify-between"><span className="ad-muted">Report interval</span><span className="text-white">{t.reportInterval}</span></div>
              <div className="flex justify-between"><span className="ad-muted">Geo assignment</span><span className="text-white">{t.region}</span></div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1">{t.tags.map((tag) => <span key={tag} className="inline-flex items-center gap-1 rounded bg-black/30 px-1.5 py-0.5 text-[10px] text-cyan-300"><Tags className="h-2.5 w-2.5" />{tag}</span>)}</div>
          </Panel>
        </StaggerItem>
      ))}
    </StaggerGrid>
  );
}

function ErrorsTab() {
  const errs = [
    { serial: "CV-SN-4821", reason: "Duplicate serial number", method: "bulk-csv", ts: Date.now() - 3.2e6 },
    { serial: "CV-SN-9930", reason: "Invalid X.509 certificate chain", method: "jit", ts: Date.now() - 7.6e6 },
    { serial: "CV-SN-1042", reason: "Pre-flight diagnostics failed (sensor timeout)", method: "manual", ts: Date.now() - 1.1e7 },
    { serial: "CV-SN-7781", reason: "Tenant device quota exceeded", method: "api", ts: Date.now() - 2.4e7 },
    { serial: "CV-SN-3310", reason: "Unknown hardware model", method: "bulk-csv", ts: Date.now() - 4.1e7 },
  ];
  if (errs.length === 0) return <EmptyState icon={<Check className="h-6 w-6" />} title="No provisioning errors" />;
  return (
    <Panel>
      <SectionTitle>Failed onboarding attempts</SectionTitle>
      <div className="space-y-2">
        {errs.map((e) => (
          <div key={e.serial} className="flex items-center gap-3 rounded-xl border border-red-500/15 bg-red-500/[0.06] px-4 py-3">
            <TriangleAlert className="h-4 w-4 text-red-400" />
            <div className="min-w-0 flex-1"><div className="font-mono text-sm text-white">{e.serial}</div><div className="text-xs text-red-300">{e.reason}</div></div>
            <Badge tone="slate">{e.method}</Badge>
            <span className="text-xs ad-muted">{relativeTime(e.ts)}</span>
            <Btn size="sm" variant="subtle">Retry</Btn>
          </div>
        ))}
      </div>
    </Panel>
  );
}
