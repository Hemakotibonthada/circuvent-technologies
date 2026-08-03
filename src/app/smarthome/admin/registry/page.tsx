"use client";

/**
 * Device Registry — internal team only.
 *
 * The single place an operator answers "somebody is holding a unit; what is it,
 * whose is it, what has it done, and what has been done to it". Everything here
 * is served by /admin routes behind the admin role, and AdminShell already
 * gates the whole section on a live role check against the control plane.
 *
 * Two things this page is deliberately blunt about, because getting them wrong
 * costs a customer their device:
 *
 *  - a device key CANNOT be looked up. Only a bcrypt hash is stored. The button
 *    says "reissue", not "reveal", and states the consequence before it acts.
 *  - transferring a unit between accounts is an audited action with a required
 *    reason, and both accounts are notified.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Search, QrCode, KeyRound, UserCheck, FileText, Printer, Download, Check,
  TriangleAlert, ShieldCheck, RefreshCcw, Cpu, Link2, ClipboardList, History,
} from "lucide-react";
import { controlPlane, type AdminDeviceRecord, type DeviceReport } from "@/lib/control-plane";
import {
  Panel, PageHeader, SectionTitle, Btn, Badge, Dot, Field, Input, Tabs,
  EmptyState, LoadingState, CopyButton, Modal, StatCard,
} from "../_ui";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function relative(iso: string | null | undefined): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "never";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Renders a QR client-side; the qrcode package is already a dependency. */
function useQr(payload: string | null, size = 200): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!payload) {
      setSrc(null);
      return;
    }
    void (async () => {
      try {
        const { toDataURL } = await import("qrcode");
        const url = await toDataURL(payload, {
          margin: 1,
          width: size,
          color: { dark: "#000000", light: "#ffffff" },
        });
        if (!cancelled) setSrc(url);
      } catch {
        if (!cancelled) setSrc(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [payload, size]);
  return src;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] py-2 last:border-0">
      <span className="text-[12px] text-slate-500">{label}</span>
      <span className="text-right text-[13px] font-medium text-slate-200">{children}</span>
    </div>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <code className="font-mono text-[12px] text-cyan-300">{children}</code>;
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

function LookupBar({ onPick }: { onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<AdminDeviceRecord[] | null>(null);
  const [matchedBy, setMatchedBy] = useState("");
  const [error, setError] = useState("");

  const run = useCallback(
    async (term: string) => {
      if (term.trim().length < 2) return;
      setBusy(true);
      setError("");
      setResults(null);
      const r = await controlPlane.adminDeviceLookup(term.trim());
      setBusy(false);
      if (!r.ok) {
        setError(r.data?.error ?? "Lookup failed.");
        return;
      }
      setMatchedBy(r.data.matchedBy);
      setResults(r.data.devices ?? []);
      // An exact serial identifies one unit — open it rather than making the
      // operator click a single-row list while a customer waits on the phone.
      if (r.data.matchedBy === "serial" && r.data.devices?.length === 1) {
        onPick(r.data.devices[0].id);
      }
    },
    [onPick]
  );

  return (
    <Panel>
      <SectionTitle right={matchedBy === "serial" ? <Badge tone="green">exact serial</Badge> : undefined}>
        Find a device
      </SectionTitle>
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            className="ad-input w-full pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void run(q);
            }}
            placeholder="Serial from the label, device id, name, or owner email"
            aria-label="Search devices"
          />
        </div>
        <Btn variant="primary" onClick={() => void run(q)} disabled={busy || q.trim().length < 2}>
          {busy ? "Searching…" : <><Search className="h-4 w-4" /> Search</>}
        </Btn>
      </div>
      <p className="mt-2 text-[12px] text-slate-500">
        Serials are checksummed — case, spaces and dashes are ignored, and a misread character is
        rejected rather than quietly returning nothing.
      </p>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[13px] text-amber-200">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {results && results.length === 0 && !error && (
        <div className="mt-4">
          <EmptyState title="No matches" hint="Try the device id or the owner's email address." />
        </div>
      )}

      {results && results.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
          {results.map((d, i) => (
            <button
              key={d.id}
              onClick={() => onPick(d.id)}
              className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.05]"
              style={{ borderTop: i ? "1px solid rgba(255,255,255,.06)" : undefined }}
            >
              <Dot tone={d.online ? "green" : "slate"} pulse={d.online} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-white">{d.name || d.id}</span>
                <span className="block truncate font-mono text-[11px] text-slate-500">
                  {d.serial ?? "no serial"} · {d.id}
                </span>
              </span>
              <span className="hidden text-right text-[11px] text-slate-500 sm:block">
                <span className="block">{d.owner_email ?? "unclaimed"}</span>
                <span className="block">{relative(d.last_seen)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Claim on behalf of a customer                                       */
/* ------------------------------------------------------------------ */

function ClaimForUser({ onDone }: { onDone: (id: string) => void }) {
  const [device, setDevice] = useState("");
  const [key, setKey] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    const r = await controlPlane.adminClaimForUser({
      device: device.trim(),
      key: key.trim(),
      ownerEmail: email.trim(),
      note: note.trim() || undefined,
    });
    setBusy(false);
    if (r.ok) {
      setMsg({ tone: "ok", text: `Linked ${r.data.deviceId} to ${r.data.ownerEmail}.` });
      setDevice("");
      setKey("");
      setNote("");
      onDone(r.data.deviceId);
    } else {
      setMsg({ tone: "bad", text: r.data?.error ?? "Could not link the device." });
    }
  };

  const ready = device.trim().length > 2 && key.trim().length > 4 && /@/.test(email);

  return (
    <Panel>
      <SectionTitle>Add a device to a customer&apos;s account</SectionTitle>
      <p className="mb-4 text-[13px] text-slate-400">
        For when the customer has the unit and its key but cannot finish the claim themselves. The
        key is verified against the device before anything changes, so this proves the credential
        really was produced — it is not a bare transfer.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Serial or device id" hint="Either works.">
          <Input value={device} onChange={(e) => setDevice(e.target.value)} placeholder="CV-PLG-4K7M-92XH" />
        </Field>
        <Field label="Device key" hint="From the customer's claim card or setup response.">
          <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="the key the customer has" />
        </Field>
        <Field label="Customer email" hint="Must already have a Circuvent account.">
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@example.com" />
        </Field>
        <Field label="Case reference" hint="Optional — recorded in the audit trail.">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ticket 4471" />
        </Field>
      </div>
      {msg && (
        <div
          className={`mt-3 flex items-start gap-2 rounded-xl border p-3 text-[13px] ${
            msg.tone === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-red-500/30 bg-red-500/10 text-red-200"
          }`}
        >
          {msg.tone === "ok" ? (
            <Check className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{msg.text}</span>
        </div>
      )}
      <div className="mt-4">
        <Btn variant="primary" onClick={submit} disabled={busy || !ready}>
          {busy ? "Linking…" : <><UserCheck className="h-4 w-4" /> Link to account</>}
        </Btn>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Reissue key                                                         */
/* ------------------------------------------------------------------ */

function ReissueKeyModal({
  deviceId,
  open,
  onClose,
  onDone,
}: {
  deviceId: string;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setNote("");
      setIssued(null);
      setError("");
    }
  }, [open]);

  const submit = async () => {
    setBusy(true);
    setError("");
    const r = await controlPlane.adminReissueKey(deviceId, note.trim());
    setBusy(false);
    if (r.ok) {
      setIssued(r.data.key);
      onDone();
    } else {
      setError(r.data?.error ?? "Could not reissue the key.");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Reissue device key">
      {issued ? (
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[13px] text-amber-100">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Copy this now — it is shown once and stored only as a hash. The device is offline
              under its old key until it is set up again with this one.
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-3">
            <code className="min-w-0 flex-1 break-all font-mono text-[12px] text-cyan-300">{issued}</code>
            <CopyButton text={issued} />
          </div>
          <Btn variant="primary" onClick={onClose}>Done</Btn>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-[13px] leading-relaxed text-slate-300">
            <p className="mb-2 font-semibold text-white">The existing key cannot be looked up.</p>
            <p>
              We store only a bcrypt hash of it, so nobody — support, engineering, or an
              administrator — can read it back. The only option is to issue a new one.
            </p>
            <p className="mt-2">
              Doing that <strong className="text-amber-300">disconnects the device</strong> until it
              is re-claimed or re-flashed with the new key, and the owner is notified.
            </p>
          </div>
          <Field label="Reason" hint="Required. Recorded against this device permanently.">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Customer lost the claim card — ticket 4471"
            />
          </Field>
          {error && <p className="text-[13px] text-red-300">{error}</p>}
          <div className="flex gap-2">
            <Btn variant="primary" onClick={submit} disabled={busy || note.trim().length < 3}>
              {busy ? "Reissuing…" : <><KeyRound className="h-4 w-4" /> Reissue key</>}
            </Btn>
            <Btn onClick={onClose}>Cancel</Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Assign                                                              */
/* ------------------------------------------------------------------ */

function AssignModal({
  deviceId,
  currentOwner,
  open,
  onClose,
  onDone,
}: {
  deviceId: string;
  currentOwner: string | null;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setEmail(currentOwner ?? "");
      setNote("");
      setError("");
    }
  }, [open, currentOwner]);

  const submit = async (unassign: boolean) => {
    setBusy(true);
    setError("");
    const r = await controlPlane.adminAssignDevice(deviceId, unassign ? null : email.trim(), note.trim());
    setBusy(false);
    if (r.ok) {
      onDone();
      onClose();
    } else {
      setError(r.data?.error ?? "Could not reassign the device.");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Transfer device">
      <div className="space-y-4">
        <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-[13px] text-slate-300">
          Transfers on our authority alone, without the device key — for RMAs and mis-shipped
          orders. Both the losing and gaining accounts are notified, and the reason is recorded
          permanently.
        </div>
        <Field label="New owner email" hint="Must already have an account.">
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@example.com" />
        </Field>
        <Field label="Reason" hint="Required.">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="RMA 4471 — replacement unit" />
        </Field>
        {error && <p className="text-[13px] text-red-300">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Btn
            variant="primary"
            onClick={() => submit(false)}
            disabled={busy || !/@/.test(email) || note.trim().length < 3}
          >
            {busy ? "Transferring…" : <><UserCheck className="h-4 w-4" /> Transfer</>}
          </Btn>
          {currentOwner && (
            <Btn variant="danger" onClick={() => submit(true)} disabled={busy || note.trim().length < 3}>
              Unassign
            </Btn>
          )}
          <Btn onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Printable label                                                     */
/* ------------------------------------------------------------------ */

function LabelCard({ report }: { report: DeviceReport }) {
  const qr = useQr(report.qr.label, 260);
  const printRef = useRef<HTMLDivElement>(null);

  /**
   * Prints just the label.
   *
   * window.print() would put the whole console — sidebar, tables and all — onto
   * label stock. Writing the fragment into an isolated iframe keeps the output
   * to the thing being labelled.
   */
  const print = () => {
    const node = printRef.current;
    if (!node) return;
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc) {
      document.body.removeChild(frame);
      return;
    }
    doc.open();
    doc.write(
      `<!doctype html><html><head><title>${report.identity.serial ?? report.identity.id}</title>` +
        `<style>@page{margin:8mm}body{font-family:ui-sans-serif,system-ui,sans-serif;color:#000;margin:0}` +
        `.lbl{display:flex;gap:14px;align-items:center;border:1px solid #000;border-radius:6px;padding:10px;width:74mm}` +
        `.sn{font-family:ui-monospace,monospace;font-size:13px;font-weight:700;letter-spacing:.5px}` +
        `.ty{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#444}` +
        `.bd{font-size:9px;color:#666;margin-top:2px}img{width:26mm;height:26mm}</style>` +
        `</head><body>${node.innerHTML}</body></html>`
    );
    doc.close();
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    // Give the print dialog time to take the document before tearing it down.
    setTimeout(() => document.body.removeChild(frame), 1000);
  };

  return (
    <Panel>
      <SectionTitle
        right={
          <Btn onClick={print} disabled={!qr}>
            <Printer className="h-4 w-4" /> Print label
          </Btn>
        }
      >
        Device label
      </SectionTitle>

      <div ref={printRef}>
        <div
          className="lbl flex items-center gap-4 rounded-xl border border-white/10 bg-white p-3"
          style={{ width: "fit-content" }}
        >
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qr}
              alt={`QR code for ${report.identity.serial ?? report.identity.id}`}
              width={104}
              height={104}
            />
          ) : (
            <div className="grid h-[104px] w-[104px] place-items-center text-[11px] text-slate-500">QR…</div>
          )}
          <div>
            <div className="ty text-[10px] uppercase tracking-[1px] text-slate-600">{report.identity.type}</div>
            <div className="sn font-mono text-[13px] font-bold text-black">
              {report.identity.serial ?? report.identity.id}
            </div>
            <div className="bd text-[9px] text-slate-500">circuvent.com/setup</div>
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-[12px] leading-relaxed text-slate-400">
        <p className="mb-1 font-semibold text-slate-200">The label carries nothing secret.</p>
        Every unit ships identical firmware with no baked-in credential, so the QR holds only the
        product type and serial — enough for the app to skip manual setup, and nothing that would
        make a photograph of the box sensitive.
      </div>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 font-mono text-[11px] text-slate-400">
          {report.qr.label}
        </code>
        <CopyButton text={report.qr.label} />
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Dossier                                                             */
/* ------------------------------------------------------------------ */

type ReportTab = "overview" | "control" | "events" | "telemetry" | "audit";

function DeviceDossier({ id, onClose }: { id: string; onClose: () => void }) {
  const [report, setReport] = useState<DeviceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<ReportTab>("overview");
  const [reissue, setReissue] = useState(false);
  const [assign, setAssign] = useState(false);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const r = await controlPlane.adminDeviceReport(id, 200);
    setLoading(false);
    if (r.ok) {
      setReport(r.data.report);
      setNotes(r.data.report.identity.notes ?? "");
    } else {
      setError((r.data as { error?: string })?.error ?? "Could not load the device report.");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveNotes = async () => {
    setSavingNotes(true);
    await controlPlane.adminUpdateDevice(id, { notes });
    setSavingNotes(false);
    void load();
  };

  const downloadJson = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `device-${report.identity.serial ?? report.identity.id}-report.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (loading) {
    return (
      <Panel>
        <LoadingState label="Building the device record…" />
      </Panel>
    );
  }
  if (error || !report) {
    return (
      <Panel>
        <EmptyState
          icon={<TriangleAlert className="h-6 w-6" />}
          title="Could not load this device"
          hint={error}
          action={
            <Btn onClick={() => void load()}>
              <RefreshCcw className="h-4 w-4" /> Retry
            </Btn>
          }
        />
      </Panel>
    );
  }

  const idn = report.identity;
  const own = report.ownership;
  const cred = report.credentials;
  const con = report.connectivity;

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-center gap-3">
          <Dot tone={con.online ? "green" : "slate"} pulse={con.online} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold text-white">{idn.name || idn.id}</h2>
            <p className="truncate font-mono text-[12px] text-slate-500">
              {idn.serial ?? "no serial"} · {idn.id}
            </p>
          </div>
          <Badge tone={con.online ? "green" : "slate"}>{con.online ? "Online" : "Offline"}</Badge>
          <Btn onClick={onClose}>Close</Btn>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Telemetry records" value={con.telemetryRecords.toLocaleString()} icon={<Cpu className="h-4 w-4" />} />
          <StatCard label="Commands issued" value={con.commandsIssued.toLocaleString()} icon={<ClipboardList className="h-4 w-4" />} />
          <StatCard label="Key reissues" value={String(cred.rotations)} icon={<KeyRound className="h-4 w-4" />} tone={cred.rotations > 0 ? "amber" : "brand"} />
          <StatCard label="Last seen" value={relative(con.lastSeen)} icon={<History className="h-4 w-4" />} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Btn variant="primary" onClick={() => setAssign(true)}>
            <UserCheck className="h-4 w-4" /> Transfer owner
          </Btn>
          <Btn onClick={() => setReissue(true)}>
            <KeyRound className="h-4 w-4" /> Reissue key
          </Btn>
          <Btn onClick={downloadJson}>
            <Download className="h-4 w-4" /> JSON
          </Btn>
          <Btn onClick={() => void load()}>
            <RefreshCcw className="h-4 w-4" /> Refresh
          </Btn>
        </div>
      </Panel>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "overview", label: "Overview" },
          { value: "control", label: "Control log", count: report.controlLog.length },
          { value: "events", label: "Events", count: report.events.length },
          { value: "telemetry", label: "Telemetry", count: report.telemetry.length },
          { value: "audit", label: "Audit", count: report.auditLog.length },
        ]}
      />

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel>
            <SectionTitle>Identity</SectionTitle>
            <Row label="Serial"><Mono>{idn.serial ?? "—"}</Mono></Row>
            <Row label="Device id"><Mono>{idn.id}</Mono></Row>
            <Row label="Hardware id"><Mono>{idn.hwid ?? "—"}</Mono></Row>
            <Row label="Type">{idn.type}</Row>
            <Row label="Firmware">{idn.firmware ?? "—"}</Row>
            <Row label="Batch">{idn.batch || "—"}</Row>
            <Row label="Registered">{fmt(idn.registeredAt)}</Row>
            <Row label="Room">{idn.room ?? "—"}</Row>
          </Panel>

          <Panel>
            <SectionTitle>Ownership</SectionTitle>
            <Row label="Claimed">
              {own.claimed ? <Badge tone="green">Yes</Badge> : <Badge tone="amber">Unclaimed</Badge>}
            </Row>
            <Row label="Owner">{own.ownerEmail ?? "—"}</Row>
            <Row label="Name">{own.ownerName || "—"}</Row>
            <Row label="Account id"><Mono>{own.ownerId ?? "—"}</Mono></Row>

            <div className="mt-4">
              <SectionTitle>Credentials</SectionTitle>
              <div className="mb-2 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-3 text-[12.5px] leading-relaxed text-amber-100">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{cred.note}</span>
              </div>
              <Row label="Issued">{fmt(cred.issuedAt)}</Row>
              <Row label="Last reissued">{fmt(cred.lastRotatedAt)}</Row>
              <Row label="Reissues">{cred.rotations}</Row>
            </div>
          </Panel>

          <LabelCard report={report} />

          <Panel>
            <SectionTitle>Current state</SectionTitle>
            {Object.keys(report.state).length === 0 ? (
              <EmptyState title="No state reported" hint="This device has not published since it was registered." />
            ) : (
              Object.entries(report.state).map(([k, v]) => (
                <Row key={k} label={k}>
                  <Mono>{typeof v === "object" ? JSON.stringify(v) : String(v)}</Mono>
                </Row>
              ))
            )}

            <div className="mt-4">
              <SectionTitle>Internal notes</SectionTitle>
              <textarea
                className="ad-input min-h-[90px] w-full"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="RMA history, batch faults, customer context…"
              />
              <div className="mt-2">
                <Btn onClick={saveNotes} disabled={savingNotes || notes === (idn.notes ?? "")}>
                  {savingNotes ? "Saving…" : "Save notes"}
                </Btn>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Never shown to the customer.</p>
            </div>
          </Panel>
        </div>
      )}

      {tab === "control" && (
        <Panel>
          <SectionTitle
            right={
              report.summary.truncated ? (
                <Badge tone="amber">latest {report.summary.historyLimit}</Badge>
              ) : undefined
            }
          >
            Control log
          </SectionTitle>
          {report.controlLog.length === 0 ? (
            <EmptyState title="No commands recorded" />
          ) : (
            <div className="overflow-hidden rounded-xl border border-white/10">
              {report.controlLog.map((c, i) => (
                <div
                  key={`${c.at}-${i}`}
                  className="flex flex-wrap items-center gap-3 px-4 py-2.5"
                  style={{ borderTop: i ? "1px solid rgba(255,255,255,.06)" : undefined }}
                >
                  <span className="w-44 shrink-0 font-mono text-[11px] text-slate-500">{fmt(c.at)}</span>
                  <span className="w-52 shrink-0 truncate text-[12px] text-slate-400">{c.by ?? "—"}</span>
                  <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-cyan-300">
                    {JSON.stringify(c.command)}
                  </code>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {tab === "events" && (
        <Panel>
          <SectionTitle>Events</SectionTitle>
          {report.events.length === 0 ? (
            <EmptyState title="No events" />
          ) : (
            <div className="overflow-hidden rounded-xl border border-white/10">
              {report.events.map((e, i) => (
                <div
                  key={`${e.at}-${i}`}
                  className="flex flex-wrap items-center gap-3 px-4 py-2.5"
                  style={{ borderTop: i ? "1px solid rgba(255,255,255,.06)" : undefined }}
                >
                  <span className="w-44 shrink-0 font-mono text-[11px] text-slate-500">{fmt(e.at)}</span>
                  <Badge tone={e.kind === "alert" || e.kind === "security" ? "amber" : "slate"}>{e.kind}</Badge>
                  <span className="min-w-0 flex-1 text-[13px] text-slate-200">
                    {e.title}
                    {e.body ? <span className="text-slate-500"> — {e.body}</span> : null}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {tab === "telemetry" && (
        <Panel>
          <SectionTitle right={<span className="text-[11px] text-slate-500">{con.telemetryRecords.toLocaleString()} total</span>}>
            Telemetry
          </SectionTitle>
          {report.telemetry.length === 0 ? (
            <EmptyState title="No telemetry" />
          ) : (
            <div className="max-h-[520px] overflow-auto rounded-xl border border-white/10">
              {report.telemetry.map((t, i) => (
                <div
                  key={`${t.at}-${i}`}
                  className="flex gap-3 px-4 py-2"
                  style={{ borderTop: i ? "1px solid rgba(255,255,255,.06)" : undefined }}
                >
                  <span className="w-44 shrink-0 font-mono text-[11px] text-slate-500">{fmt(t.at)}</span>
                  <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-slate-300">
                    {JSON.stringify(t.data)}
                  </code>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {tab === "audit" && (
        <Panel>
          <SectionTitle>Administrative audit</SectionTitle>
          <p className="mb-3 text-[12.5px] text-slate-400">
            Every ownership change and credential reissue made by our team. Never shown to the
            customer, and kept even if the operator&apos;s account is later deleted.
          </p>
          {report.auditLog.length === 0 ? (
            <EmptyState title="Nothing recorded" hint="No operator has changed this device." />
          ) : (
            <div className="overflow-hidden rounded-xl border border-white/10">
              {report.auditLog.map((a, i) => (
                <div
                  key={`${a.at}-${i}`}
                  className="px-4 py-3"
                  style={{ borderTop: i ? "1px solid rgba(255,255,255,.06)" : undefined }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] text-slate-500">{fmt(a.at)}</span>
                    <Badge tone={a.action === "reissue-key" ? "amber" : "slate"}>{a.action}</Badge>
                    <span className="text-[12px] text-slate-300">{a.actor}</span>
                  </div>
                  {a.note && <p className="mt-1 text-[13px] text-slate-200">{a.note}</p>}
                  {Object.keys(a.detail).length > 0 && (
                    <code className="mt-1 block font-mono text-[11px] text-slate-500">{JSON.stringify(a.detail)}</code>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      <ReissueKeyModal deviceId={id} open={reissue} onClose={() => setReissue(false)} onDone={load} />
      <AssignModal
        deviceId={id}
        currentOwner={own.ownerEmail ?? null}
        open={assign}
        onClose={() => setAssign(false)}
        onDone={load}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function RegistryPage() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<QrCode className="h-5 w-5" />}
        title="Device Registry"
        subtitle="Internal only — look a unit up by the serial on its case, read its full record, print labels, transfer ownership and reissue credentials."
      />

      {selected ? (
        <DeviceDossier id={selected} onClose={() => setSelected(null)} />
      ) : (
        <>
          <LookupBar onPick={setSelected} />
          <ClaimForUser onDone={setSelected} />
          <Panel>
            <SectionTitle>What this page can and cannot do</SectionTitle>
            <ul className="space-y-2 text-[13px] leading-relaxed text-slate-400">
              <li className="flex gap-2">
                <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                <span>
                  <strong className="text-slate-200">Find any unit</strong> by the serial printed on
                  it, its device id, its name, or the owner&apos;s email.
                </span>
              </li>
              <li className="flex gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                <span>
                  <strong className="text-slate-200">Produce a complete record</strong> — identity,
                  ownership, live state, every command, every event and the operator audit trail —
                  downloadable to attach to a ticket.
                </span>
              </li>
              <li className="flex gap-2">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <span>
                  <strong className="text-slate-200">It cannot show an existing device key.</strong>{" "}
                  Only a bcrypt hash is stored, so there is nothing to display. If a customer has
                  lost theirs, reissue it — which disconnects the unit until it is set up again.
                </span>
              </li>
            </ul>
          </Panel>
        </>
      )}
    </div>
  );
}
