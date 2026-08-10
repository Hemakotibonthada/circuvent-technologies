"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftFromLine,
  ArrowRightToLine,
  Ban,
  Car,
  ChevronLeft,
  Clock,
  ListChecks,
  ScanSearch,
  ShieldCheck,
} from "lucide-react";
import {
  controlPlane,
  type PlateRead,
  type PlateRule,
  type PlateSummary,
  type Vehicle,
  type VehicleProfile,
  type Visit,
} from "@/lib/control-plane";
import {
  Badge,
  Button,
  Callout,
  DetailRow,
  EmptyState,
  ErrorState,
  Field,
  FilterChips,
  Kpi,
  KpiGrid,
  LoadingState,
  RelativeTime,
  SearchField,
  SelectInput,
  Surface,
  TextInput,
  downloadCsv,
  formatDateTime,
  toCsv,
  useVisiblePolling,
} from "../_kit/primitives";

const DECISION: Record<string, { label: string; fg: string; bg: string }> = {
  allow: { label: "Allowed", fg: "#22c55e", bg: "rgba(34,197,94,0.14)" },
  deny: { label: "Blocked", fg: "#ef4444", bg: "rgba(239,68,68,0.14)" },
  watch: { label: "Watchlist", fg: "#f59e0b", bg: "rgba(245,158,11,0.14)" },
  unknown: { label: "Unlisted", fg: "#94a3b8", bg: "rgba(148,163,184,0.12)" },
};

/**
 * Why a read produced no plate, in words somebody can act on.
 *
 * The raw reason codes are for logs. "no_recogniser" in particular has to
 * become a sentence, because it is not a camera fault at all and the natural
 * assumption when plates stop appearing is that the camera has broken.
 */
const REASON_TEXT: Record<string, string> = {
  no_recogniser: "No plate recogniser is configured on this deployment.",
  no_plate: "No plate was legible in any frame.",
  invalid_format: "Characters were read but they are not a valid registration.",
  timeout: "The recogniser did not answer in time.",
  provider_error: "The recogniser returned an error.",
};

function DecisionBadge({ decision }: { decision: string }) {
  const d = DECISION[decision] ?? DECISION.unknown;
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[12px] font-semibold"
      style={{ background: d.bg, color: d.fg }}
    >
      {d.label}
    </span>
  );
}

/**
 * The capture thumbnail.
 *
 * Fetched as a blob rather than pointed at with a plain <img src>, because the
 * endpoint requires the caller's bearer token and a browser sends no
 * Authorization header on an image request — the tag would silently render a
 * broken icon and look like a missing capture.
 */
function CaptureImage({ read }: { read: PlateRead }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!read.hasImage) return;
    let revoked: string | null = null;
    let cancelled = false;
    void controlPlane
      .authedBlob(controlPlane.plateReadImageUrl(read.id))
      .then((blob) => {
        if (cancelled) return;
        revoked = URL.createObjectURL(blob);
        setUrl(revoked);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [read.id, read.hasImage]);

  if (!read.hasImage) {
    return (
      <div
        className="flex h-20 w-28 shrink-0 items-center justify-center rounded-lg text-[11px]"
        style={{ background: "var(--cv-card-hi)", color: "var(--cv-text-dim)" }}
      >
        {/* Images expire before the metadata does — see ANPR_IMAGE_RETENTION_DAYS. */}
        No image
      </div>
    );
  }
  if (failed) {
    return (
      <div
        className="flex h-20 w-28 shrink-0 items-center justify-center rounded-lg text-[11px]"
        style={{ background: "var(--cv-card-hi)", color: "var(--cv-text-dim)" }}
      >
        Unavailable
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url ?? undefined}
      alt={read.pretty ? `Capture of ${read.pretty}` : "Unreadable vehicle capture"}
      className="h-20 w-28 shrink-0 rounded-lg object-cover"
      style={{ background: "#000" }}
    />
  );
}

function PlateLog({ onOpenVehicle }: { onOpenVehicle: (plate: string) => void }) {
  const [reads, setReads] = useState<PlateRead[] | null>(null);
  const [summary, setSummary] = useState<PlateSummary | null>(null);
  const [error, setError] = useState("");
  const [decision, setDecision] = useState<"all" | "allow" | "deny" | "watch" | "unknown">("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(0);

  const load = useCallback(() => {
    void controlPlane.plateReads({ limit: 200 }).then((r) => {
      if (r.ok) {
        setReads(r.data.reads ?? []);
        setError("");
      } else {
        setError((r.data as { error?: string })?.error || "Could not load the plate log.");
        setReads((prev) => prev ?? []);
      }
    });
    void controlPlane.plateSummary(7).then((r) => {
      if (r.ok) setSummary(r.data);
    });
  }, []);

  useEffect(load, [load]);
  // Polls only while the tab is visible, so a console left open on a second
  // monitor overnight does not keep the API busy for nobody.
  useVisiblePolling(load, 20000);

  const shown = useMemo(() => {
    if (!reads) return [];
    const q = query.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    return reads.filter((r) => {
      if (decision !== "all" && r.decision !== decision) return false;
      if (q && !(r.plate ?? "").includes(q)) return false;
      return true;
    });
  }, [reads, decision, query]);

  const addToList = async (read: PlateRead, kind: "allow" | "deny" | "watch") => {
    setBusy(read.id);
    try {
      const r = await controlPlane.addPlateRuleFromRead(read.id, kind);
      if (!r.ok) setError(r.data?.error || "Could not add that plate to the list.");
      else load();
    } finally {
      setBusy(0);
    }
  };

  const exportCsv = () => {
    downloadCsv(
      `plate-log-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(
        ["Time", "Plate", "Camera", "Decision", "Confidence", "Status", "Reason"],
        shown.map((r) => [
          formatDateTime(r.at),
          r.pretty ?? "",
          r.deviceName,
          r.decision,
          r.status === "recognised" ? r.confidence : "",
          r.status,
          r.reason ?? "",
        ])
      )
    );
  };

  if (error && !reads) return <ErrorState message={error} onRetry={load} />;
  if (!reads) return <LoadingState label="Loading plate log" />;

  return (
    <div>
      {/*
        Stated plainly rather than left to be deduced. With no recogniser the
        cameras still capture, the timeline still fills in and automations on
        arrival still run — but no plates are read, and the only visible
        symptom is an empty column that looks exactly like broken hardware.
      */}
      {summary?.recogniser === "none" && (
        <Callout tone="warning" title="No plate recogniser is configured">
          Vehicle arrivals are being captured and logged, but no number plates are being read. Set
          <code className="mx-1 rounded bg-black/30 px-1 py-0.5 text-[12px]">ANPR_PROVIDER</code>
          on the control plane to start reading plates. Everything else — arrival events, automations
          and the capture images — works without it.
        </Callout>
      )}

      {summary && (
        <KpiGrid cols={4}>
          <Kpi label="Vehicles (7d)" value={String(summary.total)} icon={Car} />
          <Kpi label="Plates read" value={String(summary.recognised)} icon={ScanSearch} />
          <Kpi label="Distinct vehicles" value={String(summary.uniquePlates)} icon={ListChecks} />
          <Kpi
            label="Blocked"
            value={String(summary.denied)}
            icon={Ban}
            tone={summary.denied > 0 ? "warning" : undefined}
          />
        </KpiGrid>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <SearchField value={query} onChange={setQuery} placeholder="Search a plate…" />
        <FilterChips
          value={decision}
          onChange={setDecision}
          options={[
            { value: "all", label: "All" },
            { value: "allow", label: "Allowed" },
            { value: "deny", label: "Blocked" },
            { value: "watch", label: "Watchlist" },
            { value: "unknown", label: "Unlisted" },
          ]}
        />
        <div className="ml-auto">
          <Button variant="ghost" onClick={exportCsv} disabled={!shown.length}>
            Export CSV
          </Button>
        </div>
      </div>

      {error && (
        <p className="mt-3 text-sm" style={{ color: "#f59e0b" }}>
          {error}
        </p>
      )}

      {!shown.length ? (
        <div className="mt-6">
          <EmptyState
            icon={Car}
            title={reads.length ? "Nothing matches that filter" : "No vehicles captured yet"}
            body={
              reads.length
                ? "Clear the search or pick a different decision."
                : "An ANPR camera records an entry each time a vehicle arrives at the lane it watches."
            }
          />
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {shown.map((r) => (
            <Surface key={r.id} padded={false}>
              <div className="flex items-center gap-4 p-3">
                <CaptureImage read={r} />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {r.plate ? (
                      <button
                        onClick={() => onOpenVehicle(r.plate!)}
                        className="cv-num text-[20px] font-bold underline-offset-4 hover:underline"
                        style={{ color: "var(--cv-text)" }}
                        title="See this vehicle's full history"
                      >
                        {r.pretty}
                      </button>
                    ) : (
                      <span className="cv-num text-[20px] font-bold" style={{ color: "var(--cv-text-dim)" }}>
                        Not identified
                      </span>
                    )}
                    <DirectionTag direction={r.direction} />
                    <DecisionBadge decision={r.decision} />
                    {r.status === "recognised" && (
                      <Badge tone={r.confidence >= 70 ? "ok" : "warning"}>{r.confidence}%</Badge>
                    )}
                  </div>

                  <div className="mt-1 text-[13px]" style={{ color: "var(--cv-muted)" }}>
                    {r.deviceName} · <RelativeTime iso={r.at} /> · {r.trigger}
                    {/* Agreement across the burst is the number that actually
                        earned the confidence, so it is shown rather than hidden
                        behind it. */}
                    {r.status === "recognised" && r.samples > 1 && ` · ${r.votes}/${r.samples} frames agreed`}
                  </div>

                  {r.status === "unrecognised" && (
                    <div className="mt-1 text-[12px]" style={{ color: "var(--cv-text-dim)" }}>
                      {REASON_TEXT[r.reason ?? ""] ?? "No plate could be read."}
                      {r.raw && r.reason === "invalid_format" && ` Read as “${r.raw}”.`}
                    </div>
                  )}
                </div>

                {r.plate && r.decision === "unknown" && (
                  <div className="flex shrink-0 flex-col gap-1.5">
                    <Button variant="ghost" icon={ShieldCheck} disabled={busy === r.id} onClick={() => void addToList(r, "allow")}>
                      Allow
                    </Button>
                    <Button variant="ghost" icon={Ban} disabled={busy === r.id} onClick={() => void addToList(r, "deny")}>
                      Block
                    </Button>
                  </div>
                )}
              </div>
            </Surface>
          ))}
        </div>
      )}
    </div>
  );
}

function PlateLists() {
  const [rules, setRules] = useState<PlateRule[] | null>(null);
  const [error, setError] = useState("");
  const [plate, setPlate] = useState("");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<"allow" | "deny" | "watch">("allow");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    void controlPlane.plateRules().then((r) => {
      if (r.ok) {
        setRules(r.data.rules ?? []);
        setError("");
      } else {
        setError((r.data as { error?: string })?.error || "Could not load the lists.");
        setRules((prev) => prev ?? []);
      }
    });
  }, []);

  useEffect(load, [load]);

  const add = async () => {
    if (!plate.trim()) return;
    setSaving(true);
    setError("");
    try {
      const r = await controlPlane.createPlateRule({ plate, kind, label });
      if (!r.ok) {
        setError(r.data?.error || "Could not save that plate.");
      } else {
        setPlate("");
        setLabel("");
        load();
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    const r = await controlPlane.deletePlateRule(id);
    if (!r.ok) setError("Could not remove that plate.");
    else load();
  };

  if (error && !rules) return <ErrorState message={error} onRetry={load} />;
  if (!rules) return <LoadingState label="Loading lists" />;

  const groups: { kind: "deny" | "watch" | "allow"; title: string; blurb: string }[] = [
    {
      kind: "deny",
      title: "Blocked",
      blurb: "Never admitted, and an alert is raised. Blocking wins over allowing if a plate is somehow on both.",
    },
    {
      kind: "allow",
      title: "Allowed",
      blurb: "Admitted automatically, but only when the read is confident. An uncertain read is never treated as allowed.",
    },
    { kind: "watch", title: "Watchlist", blurb: "Not blocked — but you are notified whenever it arrives." },
  ];

  return (
    <div>
      <Surface>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[180px] flex-1">
            <Field label="Number plate">
              <TextInput value={plate} onChange={setPlate} placeholder="KA 01 AB 1234" />
            </Field>
          </div>
          <div className="min-w-[150px] flex-1">
            <Field label="Label (optional)">
              <TextInput value={label} onChange={setLabel} placeholder="Dad's car" />
            </Field>
          </div>
          <div className="w-40">
            <Field label="List">
              <SelectInput
                value={kind}
                onChange={setKind}
                options={[
                  { value: "allow", label: "Allow" },
                  { value: "deny", label: "Block" },
                  { value: "watch", label: "Watch" },
                ]}
              />
            </Field>
          </div>
          <Button onClick={() => void add()} disabled={saving || !plate.trim()}>
            {saving ? "Adding…" : "Add"}
          </Button>
        </div>
        {error && (
          <p className="mt-3 text-sm" style={{ color: "#f59e0b" }}>
            {error}
          </p>
        )}
        <p className="mt-3 text-[12px] leading-relaxed" style={{ color: "var(--cv-text-dim)" }}>
          Spacing and dashes do not matter — a plate is stored in the same normalised form the camera
          reads, so “KA 01 AB 1234” and “KA01AB1234” are the same vehicle. A registration that is not
          a real Indian plate is rejected rather than saved as a rule that could never match.
        </p>
      </Surface>

      {groups.map((g) => {
        const rows = rules.filter((r) => r.kind === g.kind);
        return (
          <div key={g.kind} className="mt-6">
            <h3 className="text-[17px] font-bold" style={{ color: "var(--cv-text)" }}>
              {g.title}{" "}
              <span className="font-medium" style={{ color: "var(--cv-muted)" }}>
                ({rows.length})
              </span>
            </h3>
            <p className="mt-1 text-[13px]" style={{ color: "var(--cv-text-dim)" }}>
              {g.blurb}
            </p>
            {!rows.length ? (
              <p className="mt-3 text-sm" style={{ color: "var(--cv-text-dim)" }}>
                Nothing on this list.
              </p>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                {rows.map((r) => (
                  <Surface key={r.id} padded={false}>
                    <div className="flex items-center gap-3 p-3">
                      <span className="cv-num text-[17px] font-bold" style={{ color: "var(--cv-text)" }}>
                        {r.pretty}
                      </span>
                      {r.label && (
                        <span className="text-[13px]" style={{ color: "var(--cv-muted)" }}>
                          {r.label}
                        </span>
                      )}
                      <span className="ml-auto text-[12px]" style={{ color: "var(--cv-text-dim)" }}>
                        {r.hits > 0 ? (
                          <>
                            seen {r.hits}× · last <RelativeTime iso={r.lastHitAt} />
                          </>
                        ) : (
                          "never seen"
                        )}
                      </span>
                      <Button variant="ghost" onClick={() => void remove(r.id)}>
                        Remove
                      </Button>
                    </div>
                  </Surface>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Seconds -> "2h 14m". Zero-padding a dwell time reads as false precision. */
function humanDuration(sec: number | null): string {
  if (sec == null) return "—";
  if (sec < 60) return `${sec}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/** Direction chip. Absent — not guessed — when the lane could not resolve it. */
function DirectionTag({ direction }: { direction: "in" | "out" | null }) {
  if (!direction) return null;
  const inbound = direction === "in";
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold"
      style={{
        background: inbound ? "rgba(14,165,233,0.14)" : "rgba(148,163,184,0.14)",
        color: inbound ? "#0ea5e9" : "#94a3b8",
      }}
    >
      {inbound ? <ArrowRightToLine className="h-3 w-3" /> : <ArrowLeftFromLine className="h-3 w-3" />}
      {inbound ? "In" : "Out"}
    </span>
  );
}

/**
 * The vehicle list — distinct plates rather than the stream of sightings.
 *
 * "How often does this van come, and is it here now" is a different question
 * from "what happened at 18:04", and paging a log cannot answer it.
 */
function VehicleList({ onOpen }: { onOpen: (plate: string) => void }) {
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [insideNow, setInsideNow] = useState(0);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "inside" | "listed">("all");

  const load = useCallback(() => {
    void controlPlane.vehicles(30).then((r) => {
      if (r.ok) {
        setVehicles(r.data.vehicles ?? []);
        setInsideNow(r.data.insideNow ?? 0);
        setError("");
      } else {
        setError((r.data as { error?: string })?.error || "Could not load vehicles.");
        setVehicles((prev) => prev ?? []);
      }
    });
  }, []);

  useEffect(load, [load]);
  useVisiblePolling(load, 30000);

  const shown = useMemo(() => {
    if (!vehicles) return [];
    const q = query.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    return vehicles.filter((v) => {
      if (filter === "inside" && !v.inside) return false;
      if (filter === "listed" && !v.rule) return false;
      if (q && !v.plate.includes(q)) return false;
      return true;
    });
  }, [vehicles, query, filter]);

  if (error && !vehicles) return <ErrorState message={error} onRetry={load} />;
  if (!vehicles) return <LoadingState label="Loading vehicles" />;

  return (
    <div>
      <KpiGrid cols={3}>
        <Kpi label="Vehicles seen (30d)" value={String(vehicles.length)} icon={Car} />
        <Kpi label="On the property now" value={String(insideNow)} icon={ArrowRightToLine} tone={insideNow ? "info" : undefined} />
        <Kpi label="On a list" value={String(vehicles.filter((v) => v.rule).length)} icon={ListChecks} />
      </KpiGrid>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <SearchField value={query} onChange={setQuery} placeholder="Search a plate…" />
        <FilterChips
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "inside", label: "Inside now", count: insideNow },
            { value: "listed", label: "On a list" },
          ]}
        />
      </div>

      {!shown.length ? (
        <div className="mt-6">
          <EmptyState
            icon={Car}
            title={vehicles.length ? "Nothing matches that filter" : "No vehicles recorded yet"}
            body={
              vehicles.length
                ? "Clear the search or pick a different filter."
                : "Each vehicle an ANPR camera reads appears here with its own history."
            }
          />
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {shown.map((v) => (
            <Surface key={v.plate} padded={false} interactive onClick={() => onOpen(v.plate)}>
              <div className="flex flex-wrap items-center gap-3 p-3.5">
                <span className="cv-num text-[19px] font-bold" style={{ color: "var(--cv-text)" }}>
                  {v.pretty}
                </span>
                {v.inside && (
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold"
                    style={{ background: "rgba(14,165,233,0.14)", color: "#0ea5e9" }}
                  >
                    Inside now
                  </span>
                )}
                {v.rule && <DecisionBadge decision={v.rule} />}
                {v.label && (
                  <span className="text-[13px]" style={{ color: "var(--cv-muted)" }}>
                    {v.label}
                  </span>
                )}

                <div className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px]" style={{ color: "var(--cv-muted)" }}>
                  <span>
                    <b style={{ color: "var(--cv-text)" }}>{v.passes}</b> passes
                  </span>
                  <span>
                    {v.entries} in · {v.exits} out
                  </span>
                  {v.avgStaySec != null && <span>avg {humanDuration(v.avgStaySec)}</span>}
                  <span>
                    last <RelativeTime iso={v.lastSeen} />
                  </span>
                </div>
              </div>
            </Surface>
          ))}
        </div>
      )}
    </div>
  );
}

/** Status wording for a visit, including the two missed-read cases. */
const VISIT_STATUS: Record<Visit["status"], { label: string; tone: string; note?: string }> = {
  open: { label: "On the property", tone: "#0ea5e9" },
  closed: { label: "Completed", tone: "#22c55e" },
  entry_missed: {
    label: "Departure only",
    tone: "#f59e0b",
    note: "Seen leaving with no arrival recorded — the entry read was missed, or it was already here when this camera was installed.",
  },
  exit_missed: {
    label: "Arrival only",
    tone: "#f59e0b",
    note: "Arrived again before a departure was read, so the previous stay has no end time. No duration is shown rather than a guessed one.",
  },
};

/** One vehicle's full history: visits, times, dwell and every capture. */
function VehicleProfileView({ plate, onBack }: { plate: string; onBack: () => void }) {
  const [profile, setProfile] = useState<VehicleProfile | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    void controlPlane.vehicle(plate).then((r) => {
      if (r.ok) {
        setProfile(r.data);
        setError("");
      } else {
        setError((r.data as { error?: string })?.error || "Could not load that vehicle.");
      }
    });
  }, [plate]);

  useEffect(load, [load]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!profile) return <LoadingState label="Loading vehicle" />;

  const s = profile.summary;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Button variant="ghost" icon={ChevronLeft} onClick={onBack}>
          All vehicles
        </Button>
        <span className="cv-num text-[24px] font-bold" style={{ color: "var(--cv-text)" }}>
          {profile.pretty}
        </span>
        {s.inside && (
          <span
            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-semibold"
            style={{ background: "rgba(14,165,233,0.14)", color: "#0ea5e9" }}
          >
            Inside now
          </span>
        )}
        {profile.rule && <DecisionBadge decision={profile.rule.kind} />}
      </div>

      <KpiGrid cols={4}>
        <Kpi label="Total passes" value={String(s.passes)} icon={Car} hint={`${s.entries} in · ${s.exits} out`} />
        <Kpi label="Visits" value={String(s.visits)} icon={ListChecks} />
        <Kpi label="Average stay" value={humanDuration(s.avgStaySec)} icon={Clock} />
        <Kpi label="Longest stay" value={humanDuration(s.longestStaySec)} icon={Clock} />
      </KpiGrid>

      <Surface className="mt-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <DetailRow label="First seen">{formatDateTime(s.firstSeen)}</DetailRow>
          <DetailRow label="Last seen">{formatDateTime(s.lastSeen)}</DetailRow>
          <DetailRow label="Total time on site">{humanDuration(s.totalStaySec)}</DetailRow>
          <DetailRow label="Best read confidence">{s.bestConfidence}%</DetailRow>
          <DetailRow label="Cameras">{s.cameras.join(", ") || "—"}</DetailRow>
          <DetailRow label="List">
            {profile.rule ? `${profile.rule.kind}${profile.rule.label ? ` — ${profile.rule.label}` : ""}` : "Not listed"}
          </DetailRow>
        </div>
      </Surface>

      {/*
        Stated rather than hidden. A gap in the history is normal for a gate
        camera, and an unexplained gap gets read as the system being wrong
        about everything else too.
      */}
      {s.missedReads > 0 && (
        <div className="mt-4">
          <Callout tone="info" title={`${s.missedReads} visit${s.missedReads === 1 ? "" : "s"} with a missing read`}>
            A camera did not read this vehicle on one leg of the journey — it tailgated another vehicle
            through the barrier, the plate was obscured, or the camera was offline. Those stays are shown
            without a duration rather than with a guessed one.
          </Callout>
        </div>
      )}

      <h3 className="mt-6 text-[17px] font-bold" style={{ color: "var(--cv-text)" }}>
        Visits
      </h3>
      <div className="mt-3 flex flex-col gap-2">
        {profile.visits.map((v) => {
          const meta = VISIT_STATUS[v.status];
          return (
            <Surface key={v.id} padded={false}>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 p-3.5">
                <div className="min-w-[150px]">
                  <div className="text-[12px] font-medium" style={{ color: "var(--cv-muted)" }}>
                    In
                  </div>
                  <div className="text-[14px]" style={{ color: v.entryAt ? "var(--cv-text)" : "var(--cv-text-dim)" }}>
                    {v.entryAt ? formatDateTime(v.entryAt) : "Not recorded"}
                  </div>
                </div>
                <div className="min-w-[150px]">
                  <div className="text-[12px] font-medium" style={{ color: "var(--cv-muted)" }}>
                    Out
                  </div>
                  <div className="text-[14px]" style={{ color: v.exitAt ? "var(--cv-text)" : "var(--cv-text-dim)" }}>
                    {v.exitAt ? formatDateTime(v.exitAt) : v.status === "open" ? "Still here" : "Not recorded"}
                  </div>
                </div>
                <div className="min-w-[90px]">
                  <div className="text-[12px] font-medium" style={{ color: "var(--cv-muted)" }}>
                    Stay
                  </div>
                  <div className="text-[14px]" style={{ color: "var(--cv-text)" }}>
                    {humanDuration(v.durationSec)}
                  </div>
                </div>
                <span
                  className="ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold"
                  style={{ background: `${meta.tone}22`, color: meta.tone }}
                  title={meta.note}
                >
                  {meta.label}
                </span>
              </div>
            </Surface>
          );
        })}
      </div>

      <h3 className="mt-6 text-[17px] font-bold" style={{ color: "var(--cv-text)" }}>
        Captures{s.truncated ? " (most recent)" : ""}
      </h3>
      <div className="mt-3 flex flex-col gap-2">
        {profile.reads.map((r) => (
          <Surface key={r.id} padded={false}>
            <div className="flex items-center gap-4 p-3">
              <CaptureImage read={r} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <DirectionTag direction={r.direction} />
                  <span className="text-[14px]" style={{ color: "var(--cv-text)" }}>
                    {formatDateTime(r.at)}
                  </span>
                  <Badge tone={r.confidence >= 70 ? "ok" : "warning"}>{r.confidence}%</Badge>
                </div>
                <div className="mt-1 text-[13px]" style={{ color: "var(--cv-muted)" }}>
                  {r.deviceName} · {r.trigger}
                  {r.samples > 1 && ` · ${r.votes}/${r.samples} frames agreed`}
                </div>
              </div>
            </div>
          </Surface>
        ))}
      </div>
    </div>
  );
}

/**
 * Vehicles — the ANPR plate log, the vehicle register and the lists.
 *
 * A Security tab rather than a top-level section, following the direction this
 * console has already taken: `cameras`, `rooms`, `groups` and `floorplan` were
 * all standalone routes that got folded into a section. "Which vehicles came to
 * my property" is the same question the Access tab answers for people, so it
 * belongs beside it rather than adding a ninth item to the sidebar for a device
 * most accounts do not own.
 *
 * Three views share one tab through a segmented switch instead of taking three
 * of Security's tab slots — they are one workflow (see a plate, look up its
 * history, decide about it) and the actions move between them.
 */
export function VehiclesPanel() {
  const [view, setView] = useState<"log" | "vehicles" | "lists">("log");
  const [plate, setPlate] = useState<string | null>(null);

  // A selected vehicle takes over the panel, so switching view must clear it —
  // otherwise the segmented control appears to do nothing.
  const changeView = (v: "log" | "vehicles" | "lists") => {
    setPlate(null);
    setView(v);
  };

  return (
    <div>
      <div className="mb-5">
        <FilterChips
          value={view}
          onChange={changeView}
          options={[
            { value: "log", label: "Plate log" },
            { value: "vehicles", label: "Vehicles" },
            { value: "lists", label: "Allow & block" },
          ]}
        />
      </div>
      {plate ? (
        <VehicleProfileView plate={plate} onBack={() => setPlate(null)} />
      ) : view === "log" ? (
        <PlateLog onOpenVehicle={(p) => { setView("vehicles"); setPlate(p); }} />
      ) : view === "vehicles" ? (
        <VehicleList onOpen={setPlate} />
      ) : (
        <PlateLists />
      )}
    </div>
  );
}
