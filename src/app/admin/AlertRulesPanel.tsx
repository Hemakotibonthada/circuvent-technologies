"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, Save, Send, FileBarChart, Loader2, CheckCircle2, Users } from "lucide-react";
import { GaugeChart } from "./charts";

function tok() {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

interface Settings {
  notifyEmail?: string;
  lowStockThreshold: number;
  onNewOrder: boolean;
  onLowStock: boolean;
  onPendingReturn: boolean;
  onOpenTicket: boolean;
  onExpiringBatch: boolean;
  dailyReport: boolean;
  reportRangeDays: number;
  /** Circuvent group addresses the report also goes to. */
  reportGroups?: string[];
  lastDigestAt?: string;
  lastReportAt?: string;
}

interface DirectoryGroup {
  id: string;
  email: string;
  name: string;
  description: string;
}

const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-primary)" };
const field = "w-full rounded-xl border px-3 py-2 text-sm outline-none";
const inputStyle = { background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" };

const TOGGLES: { key: keyof Settings; label: string }[] = [
  { key: "onNewOrder", label: "New orders" },
  { key: "onLowStock", label: "Low stock" },
  { key: "onPendingReturn", label: "Pending returns" },
  { key: "onOpenTicket", label: "Open support tickets" },
  { key: "onExpiringBatch", label: "Expiring batches" },
  { key: "dailyReport", label: "Daily performance report email" },
];

function fmt(iso?: string) {
  if (!iso) return "never";
  try {
    return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

export default function AlertRulesPanel() {
  const [s, setS] = useState<Settings | null>(null);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [canEdit, setCanEdit] = useState(true);
  const [groups, setGroups] = useState<DirectoryGroup[] | null>(null);
  const [directoryReady, setDirectoryReady] = useState(true);

  const load = useCallback(async () => {
    try {
      const [rr, ar] = await Promise.all([
        fetch("/api/admin/alerts/rules", { headers: { "x-admin-token": tok() } }),
        fetch("/api/admin/alerts", { headers: { "x-admin-token": tok() } }),
      ]);
      if (rr.ok) setS((await rr.json()).settings);
      if (ar.ok) setTotal((await ar.json()).total || 0);
    } catch {
      /* ignore */
    }
  }, []);

  /*
   * The groups a report can be addressed to, loaded once.
   *
   * Separate from the settings call because the directory is another service:
   * if it is unreachable the rules screen must still work, so a failure here
   * leaves an empty picker with an explanation rather than blocking the page.
   */
  const loadGroups = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/groups", { headers: { "x-admin-token": tok() } });
      if (!r.ok) {
        setGroups([]);
        setDirectoryReady(false);
        return;
      }
      const d = (await r.json()) as { groups: DirectoryGroup[]; configured: boolean };
      setGroups(d.groups ?? []);
      setDirectoryReady(d.configured !== false);
    } catch {
      setGroups([]);
      setDirectoryReady(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadGroups();
  }, [load, loadGroups]);

  /** Ticks or unticks one group as a recipient. */
  const toggleGroup = (email: string) => {
    setS((prev) => {
      if (!prev) return prev;
      const current = prev.reportGroups ?? [];
      return {
        ...prev,
        reportGroups: current.includes(email)
          ? current.filter((e) => e !== email)
          : [...current, email],
      };
    });
  };

  const save = async () => {
    if (!s) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/admin/alerts/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-admin-token": tok() },
        body: JSON.stringify(s),
      });
      const d = await r.json();
      if (r.ok && d.ok) {
        setS(d.settings);
        setMsg("Saved.");
      } else if (r.status === 403) {
        setCanEdit(false);
        setMsg(d.error || "Only managers can change alert rules.");
      } else {
        setMsg(d.error || "Could not save.");
      }
    } catch {
      setMsg("Network error.");
    }
    setBusy(false);
  };

  const trigger = async (path: string, body?: object) => {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": tok() },
        body: body ? JSON.stringify(body) : undefined,
      });
      const d = await r.json();
      if (d.sent) {
        // Names every address it reached. "Sent" beside a group nobody in it
        // received is the failure this screen exists to make visible.
        const to = Array.isArray(d.to) ? d.to.join(", ") : d.to;
        const failed = Array.isArray(d.failed) && d.failed.length ? ` Failed: ${d.failed.join(", ")}.` : "";
        setMsg(`Sent to ${to}.${failed}`);
      } else setMsg(d.reason || d.error || "Nothing sent.");
      load();
    } catch {
      setMsg("Network error.");
    }
    setBusy(false);
  };

  if (!s) {
    return (
      <div className="mt-6 flex justify-center rounded-2xl border p-8" style={card}>
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--accent-cyan)" }} />
      </div>
    );
  }

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });

  return (
    <div className="mt-6 rounded-2xl border p-6" style={card}>
      <h3 className="flex items-center gap-2 text-lg font-bold" style={{ color: "var(--text-primary)" }}>
        <BellRing className="h-5 w-5" style={{ color: "var(--accent-cyan)" }} /> Alert rules & notifications
      </h3>
      <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
        Choose which events trigger an emailed digest, and send reports on demand. Digests &amp; the daily report also run automatically via scheduled jobs.
      </p>

      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_auto]">
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {TOGGLES.map((t) => (
              <label
                key={t.key}
                className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}
              >
                <input
                  type="checkbox"
                  checked={!!s[t.key]}
                  disabled={!canEdit}
                  onChange={(e) => set(t.key, e.target.checked as never)}
                />
                {t.label}
              </label>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              Low-stock threshold
              <input
                type="number"
                min={0}
                className={field + " mt-1"}
                style={inputStyle}
                value={s.lowStockThreshold}
                disabled={!canEdit}
                onChange={(e) => set("lowStockThreshold", Math.max(0, Number(e.target.value) || 0))}
              />
            </label>
            <label className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              Report range (days)
              <select
                className={field + " mt-1"}
                style={inputStyle}
                value={s.reportRangeDays}
                disabled={!canEdit}
                onChange={(e) => set("reportRangeDays", Number(e.target.value))}
              >
                {[7, 30, 90, 180, 365].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs sm:col-span-1" style={{ color: "var(--text-tertiary)" }}>
              Notify email (blank = owner)
              <input
                type="email"
                className={field + " mt-1"}
                style={inputStyle}
                placeholder="alerts@circuvent.com"
                value={s.notifyEmail || ""}
                disabled={!canEdit}
                onChange={(e) => set("notifyEmail", e.target.value)}
              />
            </label>
          </div>

          {/*
            Who the report goes to, shown here rather than behind a settings
            page: this sits directly above "Send report now", so the recipients
            are visible at the moment somebody decides to send.
          */}
          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border-primary)" }}>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" style={{ color: "var(--accent-cyan)" }} />
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Also send to groups
              </span>
            </div>
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              Circuvent groups from the directory. Everyone in the group receives it, and
              membership is read at send time — nobody has to be added here when they join.
              The address above still receives it as well.
            </p>

            {groups === null ? (
              <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
                Loading groups…
              </p>
            ) : !directoryReady ? (
              <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
                The directory could not be reached, so no groups can be listed. The report
                will still go to the address above.
              </p>
            ) : groups.length === 0 ? (
              <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
                No mail-enabled groups exist yet. Create one in the identity console and it
                will appear here.
              </p>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {groups.map((g) => {
                  const checked = (s.reportGroups ?? []).includes(g.email);
                  return (
                    <label
                      key={g.id}
                      className="flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2"
                      style={{
                        borderColor: checked ? "var(--accent-cyan)" : "var(--border-primary)",
                        background: checked ? "var(--bg-glass)" : "transparent",
                        opacity: canEdit ? 1 : 0.6,
                      }}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={checked}
                        disabled={!canEdit}
                        onChange={() => toggleGroup(g.email)}
                      />
                      <span className="min-w-0">
                        <span
                          className="block truncate text-sm font-medium"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {g.name}
                        </span>
                        <span
                          className="block truncate text-xs"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {g.email}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            <p className="mt-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
              {(s.reportGroups ?? []).length
                ? `Report goes to ${s.notifyEmail || "the owner"} and ${(s.reportGroups ?? []).length} group(s).`
                : `Report goes to ${s.notifyEmail || "the owner"} only.`}{" "}
              Save to apply this to the scheduled report as well.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={save}
              disabled={busy || !canEdit}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save rules
            </button>
            <button
              onClick={() => trigger("/api/admin/alerts/run")}
              disabled={busy}
              className="flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold"
              style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}
            >
              <Send className="h-4 w-4" /> Send digest now
            </button>
            <button
              onClick={() =>
                trigger("/api/admin/reports/send", {
                  days: s.reportRangeDays,
                  // Sent from the screen's current state, so a tick applies to
                  // this send without having to save first.
                  groups: s.reportGroups ?? [],
                })
              }
              disabled={busy}
              className="flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold"
              style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}
            >
              <FileBarChart className="h-4 w-4" /> Send report now
            </button>
            {msg && (
              <span className="flex items-center gap-1 text-xs" style={{ color: "var(--accent-cyan)" }}>
                <CheckCircle2 className="h-3.5 w-3.5" /> {msg}
              </span>
            )}
          </div>

          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Last digest: {fmt(s.lastDigestAt)} · Last report: {fmt(s.lastReportAt)}
          </p>
        </div>

        <div className="flex flex-col items-center justify-center rounded-xl border p-4" style={{ borderColor: "var(--border-primary)" }}>
          <GaugeChart value={total} max={Math.max(10, total)} label="Open action items" color={total > 5 ? "#ef4444" : "#06b6d4"} />
        </div>
      </div>
    </div>
  );
}
