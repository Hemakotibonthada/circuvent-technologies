"use client";

import { useState } from "react";
import {
  DownloadCloud, HardDrive, FileCode2, Plus, Play, Pause, RotateCcw, Ban, ShieldCheck,
  Check, Upload, GitCompareArrows, Rocket, Package,
} from "lucide-react";
import { controlPlane } from "@/lib/control-plane";
import { campaignsStore, firmwareStore, FW_VERSIONS, type OtaCampaign, type Firmware } from "../_lib/sim";
import { useStore, uid } from "../_lib/store";
import { relativeTime, num, bytes } from "../_lib/format";
import {
  PageHeader, Panel, StatCard, Badge, Dot, Btn, Tabs, DataTable, Drawer, Modal, Field,
  Input, Progress, SectionTitle, StaggerGrid, StaggerItem, CopyButton, type Column, type Tone,
} from "../_ui";

type Tab = "campaigns" | "firmware" | "config";

const campaignTone: Record<string, Tone> = { draft: "slate", rolling: "brand", paused: "amber", completed: "green", aborted: "red" };

export default function OtaPage() {
  const campaigns = useStore(campaignsStore);
  const firmware = useStore(firmwareStore);
  const [tab, setTab] = useState<Tab>("campaigns");
  const rolling = campaigns.filter((c) => c.status === "rolling").length;
  const updating = campaigns.reduce((s, c) => s + c.downloading, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="OTA & configuration" icon={<DownloadCloud className="h-5 w-5" />}
        subtitle="Firmware repository, staggered rollout campaigns with automated rollback, live progress and remote config management."
      />

      <StaggerGrid className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StaggerItem><StatCard label="Rolling campaigns" value={num(rolling)} icon={<Rocket className="h-4 w-4" />} tone="brand" /></StaggerItem>
        <StaggerItem><StatCard label="Devices updating" value={num(updating)} icon={<DownloadCloud className="h-4 w-4" />} tone="violet" /></StaggerItem>
        <StaggerItem><StatCard label="Firmware builds" value={num(firmware.length)} icon={<Package className="h-4 w-4" />} tone="blue" /></StaggerItem>
        <StaggerItem><StatCard label="Signed" value={`${Math.round((firmware.filter((f) => f.signed).length / Math.max(1, firmware.length)) * 100)}%`} icon={<ShieldCheck className="h-4 w-4" />} tone="green" /></StaggerItem>
      </StaggerGrid>

      <Tabs<Tab>
        value={tab} onChange={setTab}
        tabs={[
          { value: "campaigns", label: "Campaigns", icon: <Rocket className="h-4 w-4" />, count: campaigns.length },
          { value: "firmware", label: "Firmware", icon: <HardDrive className="h-4 w-4" />, count: firmware.length },
          { value: "config", label: "Config", icon: <FileCode2 className="h-4 w-4" /> },
        ]}
      />

      {tab === "campaigns" && <CampaignsTab campaigns={campaigns} firmware={firmware} />}
      {tab === "firmware" && <FirmwareTab firmware={firmware} />}
      {tab === "config" && <ConfigTab />}
    </div>
  );
}

function CampaignsTab({ campaigns, firmware }: { campaigns: OtaCampaign[]; firmware: Firmware[] }) {
  const [sel, setSel] = useState<OtaCampaign | null>(null);
  const [create, setCreate] = useState(false);
  const cols: Column<OtaCampaign>[] = [
    { key: "name", header: "Campaign", render: (c) => (<div><div className="font-medium text-white">{c.name}</div><div className="text-[11px] ad-muted">fw {c.firmware} · {c.strategy}</div></div>) },
    { key: "target", header: "Target", render: (c) => <span className="font-mono text-xs text-slate-300">{c.target}</span> },
    { key: "progress", header: "Progress", render: (c) => (
      <div className="min-w-[150px]">
        <div className="mb-1 flex justify-between text-[11px]"><span className="text-white tabular-nums">{num(c.success)}/{num(c.total)}</span>{c.failed > 0 && <span className="text-red-300">{c.failed} failed</span>}</div>
        <Progress value={(c.success / Math.max(1, c.total)) * 100} tone={c.status === "aborted" ? "red" : "brand"} height={5} />
      </div>
    ) },
    { key: "status", header: "Status", align: "right", render: (c) => <Badge tone={campaignTone[c.status]}><Dot tone={campaignTone[c.status]} pulse={c.status === "rolling"} /> {c.status}</Badge> },
  ];
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Btn variant="primary" onClick={() => setCreate(true)}><Plus className="h-4 w-4" /> New campaign</Btn></div>
      <DataTable rows={campaigns} columns={cols} rowKey={(c) => c.id} onRowClick={setSel} />
      <CampaignDrawer campaign={sel} onClose={() => setSel(null)} />
      <NewCampaignModal open={create} onClose={() => setCreate(false)} firmware={firmware} />
    </div>
  );
}

function CampaignDrawer({ campaign, onClose }: { campaign: OtaCampaign | null; onClose: () => void }) {
  if (!campaign) return null;
  const phases = [
    { label: "Pending", value: campaign.pending, color: "#64748b" },
    { label: "Downloading", value: campaign.downloading, color: "#06b6d4" },
    { label: "Success", value: campaign.success, color: "#22c55e" },
    { label: "Failed", value: campaign.failed, color: "#ef4444" },
  ];
  const total = Math.max(1, campaign.total);
  const setStatus = (status: OtaCampaign["status"]) => campaignsStore.set((p) => p.map((c) => c.id === campaign.id ? { ...c, status } : c));
  return (
    <Drawer open={!!campaign} onClose={onClose} title={campaign.name} width={520}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={campaignTone[campaign.status]}>{campaign.status}</Badge>
          <Badge tone="blue">fw {campaign.firmware}</Badge>
          <span className="ml-auto text-xs ad-muted">{relativeTime(campaign.createdAt)}</span>
        </div>

        <div className="ad-card rounded-xl p-4">
          <div className="mb-2 flex justify-between text-sm"><span className="ad-muted">Rollout strategy</span><span className="font-medium text-white">{campaign.strategy}</span></div>
          <div className="mb-2 flex justify-between text-sm"><span className="ad-muted">Target</span><span className="font-mono text-white">{campaign.target}</span></div>
          <div className="flex justify-between text-sm"><span className="ad-muted">Total devices</span><span className="font-semibold text-white">{num(campaign.total)}</span></div>
        </div>

        <div>
          <SectionTitle>Deployment phases</SectionTitle>
          <div className="mb-3 flex h-3 overflow-hidden rounded-full">
            {phases.map((p) => <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />)}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {phases.map((p) => (
              <div key={p.label} className="flex items-center justify-between rounded-lg border border-white/5 bg-black/20 px-3 py-2">
                <span className="flex items-center gap-2 text-sm text-slate-300"><span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} /> {p.label}</span>
                <span className="font-semibold text-white tabular-nums">{num(p.value)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-sm">
          <div className="flex items-center gap-2 font-medium text-amber-300"><RotateCcw className="h-4 w-4" /> Automated rollback armed</div>
          <p className="mt-1 text-xs ad-muted">Aborts and reverts if failure rate exceeds 10%. Pre-checks: battery &gt; 50%, stable network.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {campaign.status === "rolling" ? <Btn variant="subtle" className="flex-1" onClick={() => setStatus("paused")}><Pause className="h-4 w-4" /> Pause</Btn> : <Btn variant="primary" className="flex-1" onClick={() => setStatus("rolling")}><Play className="h-4 w-4" /> Resume</Btn>}
          <Btn variant="danger" className="flex-1" onClick={() => { setStatus("aborted"); onClose(); }}><Ban className="h-4 w-4" /> Abort</Btn>
        </div>
      </div>
    </Drawer>
  );
}

function NewCampaignModal({ open, onClose, firmware }: { open: boolean; onClose: () => void; firmware: Firmware[] }) {
  const [name, setName] = useState("");
  const [fw, setFw] = useState<string>(FW_VERSIONS[0]);
  const [target, setTarget] = useState("All active");
  const [strategy, setStrategy] = useState("5% → 25% → 100%");
  const [broadcasting, setBroadcasting] = useState(false);

  const create = async () => {
    const total = 200 + Math.floor(Math.random() * 2000);
    campaignsStore.set((p) => [{ id: uid("campaign"), name: name || `${fw} rollout`, firmware: fw, target, total, pending: total, downloading: 0, success: 0, failed: 0, status: "rolling", strategy, createdAt: new Date().toISOString() }, ...p]);
    // Best-effort real broadcast to the control plane.
    setBroadcasting(true);
    try { await controlPlane.adminOtaBroadcast({ url: `https://ota.circuvent.com/fw/${fw}.bin`, version: fw }); } catch { /* offline demo */ }
    setBroadcasting(false);
    onClose(); setName("");
  };

  return (
    <Modal open={open} onClose={onClose} title="Create OTA campaign" wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Campaign name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Security rollout Q3" /></Field>
        <Field label="Firmware version"><select className="ad-input" value={fw} onChange={(e) => setFw(e.target.value)}>{FW_VERSIONS.map((v) => <option key={v}>{v}</option>)}</select></Field>
        <Field label="Target audience"><select className="ad-input" value={target} onChange={(e) => setTarget(e.target.value)}><option>All active</option><option>region: eu-central-1</option><option>model: CV-ESP32-S3</option><option>fw &lt; 3.3.0</option><option>tag: prod</option></select></Field>
        <Field label="Rollout strategy"><select className="ad-input" value={strategy} onChange={(e) => setStrategy(e.target.value)}><option>5% → 25% → 100%</option><option>Canary 2%</option><option>All at once</option><option>Ring deployment</option></select></Field>
      </div>
      <div className="mt-3 rounded-xl border border-white/5 bg-black/20 p-3 text-xs ad-muted">
        Scheduled for low-usage window (02:00 device-local). Delta updates enabled. A/B partition verification on. Signed binary enforced.
      </div>
      <Btn variant="primary" className="mt-4 w-full" disabled={broadcasting} onClick={create}><Rocket className="h-4 w-4" /> {broadcasting ? "Dispatching…" : "Launch campaign"}</Btn>
    </Modal>
  );
}

function FirmwareTab({ firmware }: { firmware: Firmware[] }) {
  const [upload, setUpload] = useState(false);
  const channelTone: Record<string, Tone> = { stable: "green", beta: "amber", canary: "violet" };
  const cols: Column<Firmware>[] = [
    { key: "version", header: "Version", sort: (a, b) => a.version.localeCompare(b.version), render: (f) => (<div className="flex items-center gap-2"><Package className="h-4 w-4 text-cyan-400" /><span className="font-mono font-medium text-white">v{f.version}</span></div>) },
    { key: "model", header: "Model", render: (f) => <span className="text-slate-300">{f.model}</span> },
    { key: "channel", header: "Channel", render: (f) => <Badge tone={channelTone[f.channel]}>{f.channel}</Badge> },
    { key: "size", header: "Size", align: "right", sort: (a, b) => a.sizeBytes - b.sizeBytes, render: (f) => <span className="tabular-nums text-slate-300">{bytes(f.sizeBytes)}</span> },
    { key: "sha", header: "SHA-256", render: (f) => (<span className="flex items-center gap-1.5 font-mono text-[11px] ad-muted">{f.sha256.slice(0, 12)}… <CopyButton text={f.sha256} /></span>) },
    { key: "signed", header: "Signed", align: "center", render: (f) => f.signed ? <ShieldCheck className="mx-auto h-4 w-4 text-green-400" /> : <span className="text-xs text-red-400">unsigned</span> },
    { key: "up", header: "Uploaded", align: "right", render: (f) => <span className="text-xs ad-muted">{relativeTime(f.uploadedAt)}</span> },
  ];
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Btn variant="primary" onClick={() => setUpload(true)}><Upload className="h-4 w-4" /> Upload firmware</Btn></div>
      <DataTable rows={firmware} columns={cols} rowKey={(f) => f.id} />
      <Modal open={upload} onClose={() => setUpload(false)} title="Upload firmware binary">
        <div className="space-y-3">
          <div className="flex flex-col items-center rounded-xl border-2 border-dashed border-white/15 py-10"><Upload className="mb-2 h-8 w-8 text-slate-500" /><span className="text-sm ad-muted">Drop a .bin file — SHA-256 is computed automatically</span></div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Version"><Input placeholder="3.4.2" className="font-mono" /></Field>
            <Field label="Channel"><select className="ad-input"><option>stable</option><option>beta</option><option>canary</option></select></Field>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-white/5 bg-black/20 px-4 py-2.5 text-sm"><span className="text-white">Require digital signature</span><Check className="h-4 w-4 text-green-400" /></div>
          <Btn variant="primary" className="w-full" onClick={() => setUpload(false)}><Upload className="h-4 w-4" /> Upload & verify</Btn>
        </div>
      </Modal>
    </div>
  );
}

function ConfigTab() {
  const current = `{
  "reportIntervalSec": 30,
  "mqttKeepAlive": 60,
  "telemetryBatch": 8,
  "powerSaveMode": false,
  "otaChannel": "stable"
}`;
  const [draft, setDraft] = useState(`{
  "reportIntervalSec": 15,
  "mqttKeepAlive": 45,
  "telemetryBatch": 12,
  "powerSaveMode": true,
  "otaChannel": "stable"
}`);
  const currentLines = current.split("\n");
  const draftLines = draft.split("\n");
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <SectionTitle right={<Badge tone="slate">v42 · current</Badge>}>Current config</SectionTitle>
          <pre className="max-h-72 overflow-auto rounded-lg bg-black/40 p-3 font-mono text-xs text-slate-300">{current}</pre>
        </Panel>
        <Panel>
          <SectionTitle right={<Badge tone="brand">draft</Badge>}>New config</SectionTitle>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} className="ad-input h-72 resize-none font-mono text-xs" />
        </Panel>
      </div>
      <Panel>
        <SectionTitle><span className="flex items-center gap-2"><GitCompareArrows className="h-4 w-4" /> Diff</span></SectionTitle>
        <div className="rounded-lg bg-black/40 p-3 font-mono text-xs">
          {draftLines.map((line, i) => {
            const changed = currentLines[i] !== line;
            return (
              <div key={i} className="grid grid-cols-2 gap-4">
                <div className={currentLines[i] !== line ? "text-red-300/80" : "text-slate-500"}>{currentLines[i] ? `- ${currentLines[i]}` : ""}</div>
                <div className={changed ? "text-green-300" : "text-slate-500"}>{`+ ${line}`}</div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex gap-2">
          <Btn variant="primary"><Rocket className="h-4 w-4" /> Push to fleet</Btn>
          <Btn variant="subtle"><RotateCcw className="h-4 w-4" /> Rollback to v41</Btn>
        </div>
      </Panel>
    </div>
  );
}
