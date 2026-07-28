"use client";

import { useMemo, useState } from "react";
import {
  ShieldAlert, ShieldCheck, KeyRound, FileBadge, Bug, ShieldX, Lock, FileCheck2,
  Eye, RefreshCw, Ban, TriangleAlert, ScrollText, CircleCheck,
} from "lucide-react";
import { certsStore, type Certificate } from "../_lib/sim";
import { useStore, rng, int, pick } from "../_lib/store";
import { fmtDate, num } from "../_lib/format";
import {
  PageHeader, Panel, StatCard, Badge, Dot, Btn, Toggle, Tabs, DataTable, SectionTitle,
  StaggerGrid, StaggerItem, Progress, type Column, type Tone,
} from "../_ui";

type Tab = "certs" | "threats" | "compliance";
const certTone: Record<string, Tone> = { valid: "green", expiring: "amber", expired: "red", revoked: "slate" };

export default function SecurityPage() {
  const certs = useStore(certsStore);
  const [tab, setTab] = useState<Tab>("certs");
  const expiring = certs.filter((c) => c.status === "expiring").length;
  const revoked = certs.filter((c) => c.status === "revoked").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security & compliance" icon={<ShieldAlert className="h-5 w-5" />}
        subtitle="X.509 PKI, certificate lifecycle, CVE scanning, anomalous-traffic detection, device quarantine and SOC2/GDPR compliance."
      />

      <StaggerGrid className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StaggerItem><StatCard label="Certificates" value={num(certs.length)} icon={<FileBadge className="h-4 w-4" />} tone="brand" /></StaggerItem>
        <StaggerItem><StatCard label="Expiring < 30d" value={num(expiring)} icon={<TriangleAlert className="h-4 w-4" />} tone={expiring ? "amber" : "green"} /></StaggerItem>
        <StaggerItem><StatCard label="Revoked" value={num(revoked)} icon={<Ban className="h-4 w-4" />} tone="slate" /></StaggerItem>
        <StaggerItem><StatCard label="Compliance" value="SOC2 · ISO" icon={<FileCheck2 className="h-4 w-4" />} tone="green" sub="controls passing" /></StaggerItem>
      </StaggerGrid>

      <Tabs<Tab>
        value={tab} onChange={setTab}
        tabs={[
          { value: "certs", label: "PKI & Certificates", icon: <FileBadge className="h-4 w-4" />, count: certs.length },
          { value: "threats", label: "Threats", icon: <Bug className="h-4 w-4" /> },
          { value: "compliance", label: "Compliance", icon: <FileCheck2 className="h-4 w-4" /> },
        ]}
      />

      {tab === "certs" && <CertsTab certs={certs} />}
      {tab === "threats" && <ThreatsTab />}
      {tab === "compliance" && <ComplianceTab />}
    </div>
  );
}

function CertsTab({ certs }: { certs: Certificate[] }) {
  const revoke = (id: string) => certsStore.set((p) => p.map((c) => c.id === id ? { ...c, status: "revoked" } : c));
  const renew = (id: string) => certsStore.set((p) => p.map((c) => c.id === id ? { ...c, status: "valid", expiresAt: new Date(Date.now() + 365 * 864e5).toISOString() } : c));
  const cas = certs.filter((c) => c.type === "ca" || c.type === "intermediate");
  const cols: Column<Certificate>[] = [
    { key: "cn", header: "Common name", render: (c) => (<div className="flex items-center gap-2"><FileBadge className="h-4 w-4 text-cyan-400" /><span className="font-mono text-xs text-white">{c.cn}</span></div>) },
    { key: "type", header: "Type", render: (c) => <Badge tone={c.type === "ca" ? "brand" : c.type === "intermediate" ? "violet" : c.type === "server" ? "blue" : "slate"}>{c.type}</Badge> },
    { key: "serial", header: "Serial", render: (c) => <span className="font-mono text-[11px] ad-muted">{c.serial}</span> },
    { key: "expires", header: "Expires", align: "right", sort: (a, b) => +new Date(a.expiresAt) - +new Date(b.expiresAt), render: (c) => <span className="text-xs" style={{ color: c.status === "expiring" ? "#fbbf24" : c.status === "expired" ? "#f87171" : undefined }}>{fmtDate(c.expiresAt)}</span> },
    { key: "status", header: "Status", render: (c) => <Badge tone={certTone[c.status]}><Dot tone={certTone[c.status]} /> {c.status}</Badge> },
    { key: "act", header: "", align: "right", render: (c) => (
      <div className="flex justify-end gap-1">
        <button onClick={() => renew(c.id)} title="Renew (ACME/EST)" className="rounded p-1 text-slate-500 hover:text-green-300"><RefreshCw className="h-4 w-4" /></button>
        {c.status !== "revoked" && <button onClick={() => revoke(c.id)} title="Revoke (CRL/OCSP)" className="rounded p-1 text-slate-500 hover:text-red-300"><Ban className="h-4 w-4" /></button>}
      </div>
    ) },
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel>
          <SectionTitle>CA hierarchy</SectionTitle>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 font-medium text-white"><ShieldCheck className="h-4 w-4 text-cyan-400" /> Circuvent Root CA</div>
            <div className="ml-4 space-y-2 border-l border-white/10 pl-4">
              {cas.filter((c) => c.type === "intermediate").slice(0, 2).map((c) => (
                <div key={c.id}><div className="flex items-center gap-2 text-slate-200"><KeyRound className="h-3.5 w-3.5 text-violet-400" /> {c.cn}</div><div className="ml-5 text-[11px] ad-muted">issues device certs</div></div>
              ))}
            </div>
          </div>
          <Btn variant="subtle" className="mt-4 w-full"><KeyRound className="h-4 w-4" /> Import CA (BYOCA)</Btn>
        </Panel>
        <Panel className="lg:col-span-2">
          <SectionTitle>TLS / cipher policy</SectionTitle>
          <div className="space-y-2.5">
            {[["TLS 1.3", true], ["TLS 1.2", true], ["TLS 1.1 / 1.0", false], ["Automated renewal (ACME / EST)", true], ["OCSP stapling", true]].map(([l, on]) => (
              <div key={l as string} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-4 py-2.5">
                <span className="text-sm text-white">{l}</span>
                <span className="flex items-center gap-1.5 text-xs" style={{ color: on ? "#4ade80" : "#64748b" }}><Dot tone={on ? "green" : "slate"} /> {on ? "enabled" : "disabled"}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <DataTable rows={certs} columns={cols} rowKey={(c) => c.id} />
    </div>
  );
}

function ThreatsTab() {
  const cves = useMemo(() => {
    const r = rng("cve");
    return Array.from({ length: 5 }, (_, i) => ({ id: `CVE-2026-${1200 + int(r, 0, 800)}`, sev: pick(r, ["critical", "high", "medium", "medium", "low"]), fw: pick(r, ["2.9.5", "3.2.0", "3.3.2"]), affected: int(r, 2, 340), desc: pick(r, ["Buffer overflow in MQTT parser", "TLS downgrade on reconnect", "Improper cert validation", "Heap overflow in OTA writer", "Weak default credentials"]) }));
  }, []);
  const anomalies = useMemo(() => {
    const r = rng("anom");
    return Array.from({ length: 4 }, (_, i) => ({ device: `dev-${Math.random().toString(16).slice(2, 8)}`, kind: pick(r, ["Unusual payload size", "Message-rate spike (10x)", "Unexpected topic", "Geo-impossible connection"]), score: int(r, 82, 99) }));
  }, []);
  const sevTone: Record<string, Tone> = { critical: "red", high: "red", medium: "amber", low: "blue" };
  const [quarantined, setQuarantined] = useState<string[]>([]);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <SectionTitle right={<Badge tone="red">{cves.filter((c) => c.sev === "critical" || c.sev === "high").length} high+</Badge>}>CVE scanner</SectionTitle>
          <div className="space-y-2">
            {cves.map((c) => (
              <div key={c.id} className="rounded-xl border border-white/5 bg-black/20 px-3 py-2.5">
                <div className="flex items-center gap-2"><span className="font-mono text-sm text-white">{c.id}</span><Badge tone={sevTone[c.sev]}>{c.sev}</Badge><span className="ml-auto text-xs ad-muted">{c.affected} devices</span></div>
                <div className="mt-1 text-xs ad-muted">{c.desc} · fw ≤ {c.fw}</div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel>
          <SectionTitle>Anomalous traffic</SectionTitle>
          <div className="space-y-2">
            {anomalies.map((a) => {
              const q = quarantined.includes(a.device);
              return (
                <div key={a.device} className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/20 px-3 py-2.5">
                  <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: "rgba(239,68,68,.12)", color: "#f87171" }}><ShieldX className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1"><div className="font-mono text-sm text-white">{a.device}</div><div className="text-xs ad-muted">{a.kind} · score {a.score}</div></div>
                  <Btn size="sm" variant={q ? "ghost" : "danger"} onClick={() => setQuarantined((p) => q ? p.filter((x) => x !== a.device) : [...p, a.device])}>{q ? "Quarantined" : "Quarantine"}</Btn>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
      <Panel>
        <SectionTitle>Protections</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[["API rate limiting / DDoS shield", true], ["Tamper detection alerts", true], ["Session hijacking protection", true], ["Data masking / PII redaction", true], ["Secret manager (Vault)", true], ["Penetration-test mode", false]].map(([l, on]) => (
            <div key={l as string} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-4 py-3">
              <span className="flex items-center gap-2 text-sm text-white"><Lock className="h-4 w-4 text-cyan-400" /> {l}</span>
              <span className="flex items-center gap-1.5 text-xs" style={{ color: on ? "#4ade80" : "#64748b" }}><Dot tone={on ? "green" : "slate"} /></span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function ComplianceTab() {
  const frameworks = [
    { name: "SOC 2 Type II", pass: 94, total: 100, status: "Passing", icon: FileCheck2 },
    { name: "ISO 27001", pass: 88, total: 93, status: "Passing", icon: ShieldCheck },
    { name: "GDPR", pass: 41, total: 42, status: "1 action", icon: ScrollText },
  ];
  const [masking, setMasking] = useState({ pii: true, geo: true, at_rest: true });
  return (
    <div className="space-y-4">
      <StaggerGrid className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {frameworks.map((f) => (
          <StaggerItem key={f.name}>
            <Panel>
              <div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: "rgba(34,197,94,.12)", color: "#4ade80" }}><f.icon className="h-4 w-4" /></span><span className="font-semibold text-white">{f.name}</span></div>
              <div className="mt-3 flex items-end justify-between"><span className="text-2xl font-extrabold text-white">{f.pass}<span className="text-sm ad-muted">/{f.total}</span></span><Badge tone={f.status === "Passing" ? "green" : "amber"}>{f.status}</Badge></div>
              <div className="mt-2"><Progress value={(f.pass / f.total) * 100} tone="green" height={6} /></div>
              <Btn variant="subtle" className="mt-3 w-full"><FileCheck2 className="h-4 w-4" /> Export report</Btn>
            </Panel>
          </StaggerItem>
        ))}
      </StaggerGrid>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <SectionTitle>Data protection</SectionTitle>
          <div className="space-y-2.5">
            {([["pii", "PII redaction in dashboards"], ["geo", "Geolocation data masking"], ["at_rest", "AES-256 encryption at rest"]] as const).map(([k, l]) => (
              <div key={k} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-4 py-3"><span className="flex items-center gap-2 text-sm text-white"><Eye className="h-4 w-4 text-violet-400" /> {l}</span><Toggle checked={masking[k]} onChange={(v) => setMasking((s) => ({ ...s, [k]: v }))} /></div>
            ))}
          </div>
        </Panel>
        <Panel>
          <SectionTitle>GDPR data tools</SectionTitle>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-4 py-3"><span className="text-white">Right-to-erasure requests</span><Badge tone="amber">1 pending</Badge></div>
            <div className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-4 py-3"><span className="text-white">Immutable signed audit exports</span><CircleCheck className="h-4 w-4 text-green-400" /></div>
            <Btn variant="subtle" className="w-full"><ScrollText className="h-4 w-4" /> Run data-erasure workflow</Btn>
          </div>
        </Panel>
      </div>
    </div>
  );
}
