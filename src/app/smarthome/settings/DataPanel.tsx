"use client";

// Data & Export tab:
// • Full-fleet JSON export (devices + rooms + scenes + automations + events) with
//   real data from the domain hooks.
// • Per-entity CSV exports using toCsv / downloadCsv from the kit.
// • Live localStorage audit with per-key byte breakdown and selective delete.
// • "Clear all local settings" goes through ConfirmDialog with requirePhrase.
// All destructive actions require explicit confirmation before executing.

import { useEffect, useState } from "react";
import {
  Download,
  FileJson,
  FileSpreadsheet,
  HardDrive,
  RefreshCcw,
  Trash2,
} from "lucide-react";
import { useFleet, useRooms, useScenes, useAutomations, useEvents } from "../_data/hooks";
import {
  Button,
  Callout,
  DetailRow,
  SectionTitle,
  Skeleton,
  Surface,
  downloadCsv,
  toCsv,
} from "../_kit/primitives";
import { ConfirmDialog, useToast } from "../_kit/overlays";

/* ---------- localStorage audit ------------------------------------ */

interface LocalEntry {
  key: string;
  bytes: number;
}

// Approximate size: localStorage stores UTF-16, so 2 bytes per code unit.
function utf16Bytes(s: string): number {
  return s.length * 2;
}

function scanLocalStorage(): LocalEntry[] {
  if (typeof window === "undefined") return [];
  const list: LocalEntry[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    const v = localStorage.getItem(k) ?? "";
    list.push({ key: k, bytes: utf16Bytes(k) + utf16Bytes(v) });
  }
  return list.sort((a, b) => b.bytes - a.bytes);
}

function useLocalStorageAudit() {
  const [entries, setEntries] = useState<LocalEntry[]>([]);

  const rescan = () => setEntries(scanLocalStorage());

  useEffect(() => {
    rescan();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totalBytes = entries.reduce((s, e) => s + e.bytes, 0);
  return { entries, totalBytes, rescan };
}

/* ---------- Panel ------------------------------------------------- */

export default function DataPanel() {
  const { devices, loading: fleetLoading } = useFleet();
  const { rooms, loading: roomsLoading } = useRooms();
  const { scenes, loading: scenesLoading } = useScenes();
  const { automations, loading: autosLoading } = useAutomations();
  const { events, loading: eventsLoading } = useEvents(500);
  const { entries, totalBytes, rescan } = useLocalStorageAudit();
  const toast = useToast();

  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const anyLoading =
    fleetLoading || roomsLoading || scenesLoading || autosLoading || eventsLoading;

  /* ── JSON export ──────────────────────────────────────────────── */
  const exportJson = () => {
    const payload = {
      exported: new Date().toISOString(),
      devices,
      rooms,
      scenes,
      automations,
      events,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `circuvent-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.ok("JSON exported", `${devices.length} devices · ${events.length} events`);
  };

  /* ── CSV exports ─────────────────────────────────────────────── */
  const exportDevicesCsv = () => {
    const csv = toCsv(
      ["ID", "Name", "Type", "Room", "Online", "FW Version", "Last Seen"],
      devices.map((d) => [
        d.id,
        d.name,
        d.type,
        d.room ?? "",
        d.online ? "Yes" : "No",
        d.fw_version ?? "",
        d.last_seen ?? "",
      ]),
    );
    downloadCsv(`circuvent-devices-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast.ok("Devices CSV downloaded");
  };

  const exportRoomsCsv = () => {
    const csv = toCsv(
      ["Name", "Icon", "Device count"],
      rooms.map((r) => [r.name, r.icon, r.count]),
    );
    downloadCsv(`circuvent-rooms-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast.ok("Rooms CSV downloaded");
  };

  const exportScenesCsv = () => {
    const csv = toCsv(
      ["ID", "Name", "Icon", "Favorite", "Created"],
      scenes.map((s) => [s.id, s.name, s.icon, s.favorite ? "Yes" : "No", s.created_at ?? ""]),
    );
    downloadCsv(`circuvent-scenes-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast.ok("Scenes CSV downloaded");
  };

  const exportAutomationsCsv = () => {
    const csv = toCsv(
      ["ID", "Name", "Enabled", "Trigger type", "Action type", "Created"],
      automations.map((a) => [
        a.id,
        a.name,
        a.enabled ? "Yes" : "No",
        a.trigger.type,
        a.action.type,
        a.created_at ?? "",
      ]),
    );
    downloadCsv(`circuvent-automations-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast.ok("Automations CSV downloaded");
  };

  const exportEventsCsv = () => {
    const csv = toCsv(
      ["ID", "Device ID", "Kind", "Title", "Body", "Read", "Timestamp"],
      events.map((e) => [
        e.id,
        e.device_id ?? "",
        e.kind,
        e.title,
        e.body,
        e.read ? "Yes" : "No",
        e.ts,
      ]),
    );
    downloadCsv(`circuvent-events-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast.ok("Events CSV downloaded");
  };

  /* ── localStorage management ──────────────────────────────────── */
  const deleteEntry = (key: string) => {
    localStorage.removeItem(key);
    rescan();
    setConfirmDeleteKey(null);
    toast.ok("Entry removed", key);
  };

  const clearAll = () => {
    setClearing(true);
    localStorage.clear();
    rescan();
    setClearing(false);
    setConfirmClearAll(false);
    toast.ok("All local settings cleared", "Reload to restore defaults.");
  };

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <div className="space-y-6 pt-1">
      {/* ── Full fleet JSON export ────────────────────── */}
      <SectionTitle>Fleet export</SectionTitle>
      <Surface>
        <div className="space-y-3">
          <p className="text-sm" style={{ color: "var(--cv-text)" }}>
            Download your complete configuration — devices, rooms, scenes, automations and the last
            500 events — as a single JSON file.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            {anyLoading ? (
              <Skeleton className="h-10 w-36 rounded-xl" />
            ) : (
              <>
                <Button variant="primary" icon={FileJson} onClick={exportJson}>
                  Export JSON
                </Button>
                <span className="text-xs" style={{ color: "var(--cv-muted)" }}>
                  {devices.length} devices · {rooms.length} rooms · {scenes.length} scenes ·{" "}
                  {automations.length} automations · {events.length} events
                </span>
              </>
            )}
          </div>
        </div>
      </Surface>

      {/* ── Per-entity CSV exports ────────────────────── */}
      <SectionTitle>CSV exports</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          {
            label: "Devices",
            count: devices.length,
            loading: fleetLoading,
            fn: exportDevicesCsv,
          },
          { label: "Rooms", count: rooms.length, loading: roomsLoading, fn: exportRoomsCsv },
          {
            label: "Scenes",
            count: scenes.length,
            loading: scenesLoading,
            fn: exportScenesCsv,
          },
          {
            label: "Automations",
            count: automations.length,
            loading: autosLoading,
            fn: exportAutomationsCsv,
          },
          {
            label: "Events",
            count: events.length,
            loading: eventsLoading,
            fn: exportEventsCsv,
          },
        ].map((item) => (
          <Surface key={item.label} className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold" style={{ color: "var(--cv-text)" }}>
                {item.label}
              </div>
              {item.loading ? (
                <Skeleton className="mt-1 h-3 w-14 rounded" />
              ) : (
                <div className="text-xs" style={{ color: "var(--cv-muted)" }}>
                  {item.count.toLocaleString()} records
                </div>
              )}
            </div>
            <Button
              variant="secondary"
              icon={FileSpreadsheet}
              onClick={item.fn}
              disabled={item.loading}
            >
              CSV
            </Button>
          </Surface>
        ))}
      </div>

      {/* ── Local storage audit ───────────────────────── */}
      <SectionTitle
        right={
          <button
            onClick={rescan}
            aria-label="Refresh storage audit"
            className="transition hover:opacity-70"
          >
            <RefreshCcw className="h-3.5 w-3.5" style={{ color: "var(--cv-muted)" }} />
          </button>
        }
      >
        Local storage
      </SectionTitle>
      <Callout tone="info">
        These entries live in this browser&apos;s <code>localStorage</code>. They are not on the control
        plane and will not sync to other devices or browsers.
      </Callout>
      <Surface padded={false}>
        <div className="px-5 py-1">
          <DetailRow label="Estimated size">
            {totalBytes > 0 ? `≈ ${(totalBytes / 1024).toFixed(1)} KB` : "0 B"}
          </DetailRow>
          <DetailRow label="Entries">{entries.length}</DetailRow>
        </div>
      </Surface>

      {entries.length > 0 && (
        <div
          className="overflow-hidden rounded-2xl border"
          style={{ borderColor: "var(--cv-border)" }}
        >
          {entries.map((entry, i) => (
            <div
              key={entry.key}
              className="flex items-center gap-3 px-4 py-2.5"
              style={{
                borderTop: i > 0 ? `1px solid var(--cv-border)` : undefined,
                background: "var(--cv-card)",
              }}
            >
              <HardDrive className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--cv-muted)" }} />
              <code
                className="min-w-0 flex-1 truncate font-mono text-xs"
                style={{ color: "var(--cv-text)" }}
              >
                {entry.key}
              </code>
              <span
                className="shrink-0 text-[11px] tabular-nums"
                style={{ color: "var(--cv-muted)" }}
              >
                {(entry.bytes / 1024).toFixed(2)} KB
              </span>
              <button
                onClick={() => setConfirmDeleteKey(entry.key)}
                aria-label={`Remove ${entry.key}`}
                className="shrink-0 opacity-50 transition hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" style={{ color: "#dc2626" }} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Button variant="danger" icon={Trash2} onClick={() => setConfirmClearAll(true)}>
        Clear all local settings
      </Button>

      {/* ── Confirm: delete single entry ──────────────── */}
      <ConfirmDialog
        open={confirmDeleteKey !== null}
        onClose={() => setConfirmDeleteKey(null)}
        onConfirm={() => {
          if (confirmDeleteKey) deleteEntry(confirmDeleteKey);
        }}
        title="Remove local entry"
        body={
          <>
            Remove{" "}
            <code className="rounded bg-opacity-10 px-1 font-mono text-xs">
              {confirmDeleteKey}
            </code>{" "}
            from <code>localStorage</code>? This cannot be undone.
          </>
        }
        confirmLabel="Remove"
        danger
      />

      {/* ── Confirm: clear all (requires typed phrase) ── */}
      <ConfirmDialog
        open={confirmClearAll}
        onClose={() => setConfirmClearAll(false)}
        onConfirm={clearAll}
        title="Clear all local settings"
        body="This will remove all locally-stored preferences, theme settings, notification prefs and cached console state from this browser. The action cannot be undone."
        confirmLabel="Clear all"
        requirePhrase="CLEAR ALL"
        danger
        busy={clearing}
      />
    </div>
  );
}
