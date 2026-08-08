"use client";

/**
 * The owner's report for one of their own devices.
 *
 * Served by GET /devices/:id/report, which uses the same assembler as the
 * operator report with `audience: "owner"` — so the internal fields are
 * genuinely absent from the response rather than merely not rendered here.
 * Nothing on this screen needs to redact anything.
 */

import { useCallback, useEffect, useState } from "react";
import { FileText, Download, Printer, RefreshCcw, QrCode, ChevronDown } from "lucide-react";
import { controlPlane, CONTROL_PLANE_URL, getToken, type DeviceReport } from "@/lib/control-plane";
import { buildFallbackReport } from "./fallbackReport";
import { Button, Callout, EmptyState, SectionTitle, Surface, DetailRow } from "../../_kit/primitives";

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function useQr(payload: string | null): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!payload) return;
    void (async () => {
      try {
        const { toDataURL } = await import("qrcode");
        const url = await toDataURL(payload, { margin: 1, width: 180 });
        if (!cancelled) setSrc(url);
      } catch {
        if (!cancelled) setSrc(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [payload]);
  return src;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border" style={{ borderColor: "var(--cv-border)", background: "var(--cv-card)" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center justify-between px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="text-sm font-bold" style={{ color: "var(--cv-text)" }}>{title}</span>
        <ChevronDown
          className="h-4 w-4 transition-transform"
          style={{ color: "var(--cv-muted)", transform: open ? "rotate(180deg)" : undefined }}
        />
      </button>
      {open && <div className="border-t px-4 py-3" style={{ borderColor: "var(--cv-border)" }}>{children}</div>}
    </div>
  );
}

export default function DeviceReportCard({ deviceId }: { deviceId: string }) {
  const [report, setReport] = useState<DeviceReport | null>(null);
  const [partial, setPartial] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [shown, setShown] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setPartial([]);
    const r = await controlPlane.deviceReport(deviceId, 200);
    if (r.ok) { setReport(r.data.report); setLoading(false); return; }
    // A 404 here does not mean the device is missing — it means this control
    // plane build has no reporting endpoint. Rather than show the raw
    // "Not found" to someone looking straight at the device, assemble what the
    // deployed routes can actually supply. See fallbackReport.ts.
    if (r.status === 404) {
      const fb = await buildFallbackReport(deviceId, 200);
      setLoading(false);
      if (fb) { setReport(fb); setPartial(fb.partial); return; }
      setError(
        "This control plane build has no device-reporting endpoint, and the device record " +
        "could not be read either. Everything else on this page is live."
      );
      return;
    }
    setLoading(false);
    setError((r.data as { error?: string })?.error ?? "Could not build the report.");
  }, [deviceId]);

  const qr = useQr(report?.qr.label ?? null);

  const downloadJson = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${report.identity.serial ?? report.identity.id}-report.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /**
   * CSV comes from the API so the file a customer sends to support is byte-for
   * byte the one support generates themselves — a second formatter here would
   * be a second thing to keep in step.
   *
   * Fetched with the session token and turned into a blob rather than opened
   * as a link: the endpoint is Authorization-header authenticated, so a plain
   * window.open would arrive unauthenticated and 401.
   */
  const downloadCsv = async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(
        `${CONTROL_PLANE_URL}/devices/${encodeURIComponent(deviceId)}/report?limit=200&format=csv`,
        { headers: { authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        setError("Could not download the CSV.");
        return;
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${report?.identity.serial ?? deviceId}-report.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      setError("Could not download the CSV.");
    }
  };

  if (!shown) {
    return (
      <Surface>
        <div className="flex flex-wrap items-center gap-3">
          <FileText className="h-5 w-5 shrink-0" style={{ color: "var(--cv-accent)" }} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold" style={{ color: "var(--cv-text)" }}>Device report</div>
            <p className="text-[13px]" style={{ color: "var(--cv-muted)" }}>
              Everything recorded for this device — identity, activity, every command and event —
              in one document you can download or send to support.
            </p>
          </div>
          <Button
            onClick={() => {
              setShown(true);
              void load();
            }}
          >
            Generate
          </Button>
        </div>
      </Surface>
    );
  }

  if (loading && !report) {
    return (
      <Surface>
        <div className="text-sm" style={{ color: "var(--cv-muted)" }}>Building the report…</div>
      </Surface>
    );
  }

  if (error && !report) {
    return (
      <Surface>
        <EmptyState title="Report not available yet" body={error} />
        <div className="mt-3">
          <Button variant="secondary" icon={RefreshCcw} onClick={load}>Retry</Button>
        </div>
      </Surface>
    );
  }

  if (!report) return null;

  const idn = report.identity;
  const con = report.connectivity;

  return (
    <div className="space-y-3">
      <SectionTitle
        right={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={Download} onClick={downloadJson}>JSON</Button>
            <Button variant="secondary" icon={FileText} onClick={downloadCsv}>CSV</Button>
            <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print</Button>
            <Button variant="secondary" icon={RefreshCcw} onClick={load} busy={loading}>Refresh</Button>
          </div>
        }
      >
        Device report
      </SectionTitle>

      <p className="text-[12px]" style={{ color: "var(--cv-muted)" }}>
        Generated {fmt(report.generatedAt)}
        {report.summary.truncated
          ? ` · showing the most recent ${report.summary.historyLimit} entries per section`
          : ""}
      </p>

      {/* An absent section must not read as an empty one. Without this, a blank
          audit log says "nothing was ever done to this device" when what it
          actually means is "this control plane build does not record it". */}
      {partial.length > 0 && (
        <div
          className="rounded-xl px-4 py-3 text-[12px]"
          style={{ background: "var(--cv-card-hi)", border: "1px solid var(--cv-border)", color: "var(--cv-muted)" }}
        >
          <b style={{ color: "var(--cv-text)" }}>Assembled from live device data.</b>{" "}
          The connected control plane has no reporting endpoint, so this was built from the device
          record, its telemetry and the event feed. These are <b>not available</b> from this build
          and are shown blank rather than as zero: {partial.join(", ")}. Everything displayed is
          real and current.
        </div>
      )}

      <Surface padded={false}>
        <div className="px-5 py-1">
          <DetailRow label="Serial">
            <code className="font-mono text-xs">{idn.serial ?? "—"}</code>
          </DetailRow>
          <DetailRow label="Device ID">
            <code className="font-mono text-xs">{idn.id}</code>
          </DetailRow>
          <DetailRow label="Type">{idn.type}</DetailRow>
          <DetailRow label="Firmware">{idn.firmware ?? "—"}</DetailRow>
          <DetailRow label="Room">{idn.room ?? "—"}</DetailRow>
          <DetailRow label="Added">{fmt(idn.registeredAt)}</DetailRow>
          <DetailRow label="Status">{con.online ? "Online" : "Offline"}</DetailRow>
          <DetailRow label="Last seen">{fmt(con.lastSeen)}</DetailRow>
          <DetailRow label="First reading">{fmt(con.firstTelemetryAt)}</DetailRow>
          <DetailRow label="Readings recorded">{con.telemetryRecords.toLocaleString()}</DetailRow>
          <DetailRow label="Commands sent">{con.commandsIssued.toLocaleString()}</DetailRow>
        </div>
      </Surface>

      <Callout tone="info" title="About your device key">
        {report.credentials.note} It was issued {fmt(report.credentials.issuedAt)}
        {report.credentials.rotations > 0
          ? ` and has been reissued ${report.credentials.rotations} time${report.credentials.rotations === 1 ? "" : "s"}.`
          : "."}
      </Callout>

      {qr && (
        <Surface>
          <div className="flex flex-wrap items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt={`Setup QR code for ${idn.serial ?? idn.id}`} width={110} height={110} className="rounded-lg bg-white p-1" />
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-1.5 text-sm font-bold" style={{ color: "var(--cv-text)" }}>
                <QrCode className="h-4 w-4" /> Setup code
              </div>
              <p className="text-[13px]" style={{ color: "var(--cv-muted)" }}>
                The same code as on the unit. It holds only the product type and serial — nothing
                secret — so it is safe to share with support or print as a replacement label.
              </p>
            </div>
          </div>
        </Surface>
      )}

      <Section title={`Current state (${Object.keys(report.state).length})`}>
        {Object.keys(report.state).length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--cv-muted)" }}>Nothing reported yet.</p>
        ) : (
          Object.entries(report.state).map(([k, v]) => (
            <DetailRow key={k} label={k}>
              <code className="font-mono text-xs">{typeof v === "object" ? JSON.stringify(v) : String(v)}</code>
            </DetailRow>
          ))
        )}
      </Section>

      <Section title={`Control history (${report.controlLog.length})`}>
        {report.controlLog.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--cv-muted)" }}>No commands recorded.</p>
        ) : (
          <div className="space-y-1.5">
            {report.controlLog.map((c, i) => (
              <div key={`${c.at}-${i}`} className="flex flex-wrap gap-2 text-[12px]">
                <span className="w-40 shrink-0" style={{ color: "var(--cv-muted)" }}>{fmt(c.at)}</span>
                <code className="min-w-0 flex-1 font-mono" style={{ color: "var(--cv-text)" }}>
                  {JSON.stringify(c.command)}
                </code>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={`Events (${report.events.length})`}>
        {report.events.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--cv-muted)" }}>No events.</p>
        ) : (
          <div className="space-y-1.5">
            {report.events.map((e, i) => (
              <div key={`${e.at}-${i}`} className="flex flex-wrap gap-2 text-[12px]">
                <span className="w-40 shrink-0" style={{ color: "var(--cv-muted)" }}>{fmt(e.at)}</span>
                <span className="min-w-0 flex-1" style={{ color: "var(--cv-text)" }}>
                  {e.title}
                  {e.body ? ` — ${e.body}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={`Readings (${report.telemetry.length})`}>
        {report.telemetry.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--cv-muted)" }}>No readings.</p>
        ) : (
          <div className="max-h-80 space-y-1.5 overflow-auto">
            {report.telemetry.map((t, i) => (
              <div key={`${t.at}-${i}`} className="flex flex-wrap gap-2 text-[12px]">
                <span className="w-40 shrink-0" style={{ color: "var(--cv-muted)" }}>{fmt(t.at)}</span>
                <code className="min-w-0 flex-1 font-mono" style={{ color: "var(--cv-text)" }}>
                  {JSON.stringify(t.data)}
                </code>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
