"use client";

/**
 * Face management for the FaceDoor lock.
 *
 * Who this door opens for, and why it refused the last person who tried.
 *
 * Enrolment happens in three places and this panel offers two of them: from a
 * photo chosen or captured here, and at the door itself for somebody standing
 * in front of it. The third is the phone app. All three land in the same
 * roster, because a household that enrols on a phone and then cannot see it on
 * a laptop will assume one of them is broken.
 *
 * Several faces per person is the whole point rather than a nicety: one sample
 * is a lock that stops recognising somebody the day they shave, put glasses
 * on, or come home after dark. The panel therefore leads with the sample count
 * and says plainly when somebody has too few to be recognised.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ScanFace,
  UserPlus,
  Trash2,
  Camera,
  DoorOpen,
  Clock,
  ShieldCheck,
  ShieldOff,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { controlPlane, type FaceProfile, type FaceAttempt } from "@/lib/control-plane";

/** Minimum faces before somebody is reliably recognised across a day. */
const RECOMMENDED_SAMPLES = 3;

export default function FacePanel({ deviceId, deviceName }: { deviceId: string; deviceName?: string }) {
  const [profiles, setProfiles] = useState<FaceProfile[]>([]);
  const [attempts, setAttempts] = useState<FaceAttempt[]>([]);
  const [limits, setLimits] = useState({ maxSamples: 12, maxProfiles: 50 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<"resident" | "guest" | "staff">("resident");
  const [uploadFor, setUploadFor] = useState<FaceProfile | null>(null);
  const [photoEnrolment, setPhotoEnrolment] = useState({ available: true, reason: "" });
  const fileInput = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [p, a] = await Promise.all([
      controlPlane.faceProfiles(deviceId),
      controlPlane.faceAttempts(deviceId, 40),
    ]);
    if (p.ok) {
      setProfiles(p.data.profiles ?? []);
      setLimits(p.data.limits ?? limits);
      /* Older control planes do not report capabilities; assume available
         rather than hiding a working button on an upgrade lag. */
      const cap = p.data.capabilities;
      setPhotoEnrolment({ available: cap ? cap.photoEnrolment : true, reason: cap?.reason ?? "" });
    } else {
      setError("Could not load who is enrolled on this door.");
    }
    /* A door with no history yet must still show its roster, so a failure here
       is not allowed to blank the page. */
    if (a.ok) setAttempts(a.data.attempts ?? []);
    setLoading(false);
  }, [deviceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const addPerson = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy("add");
    setError("");
    const r = await controlPlane.createFaceProfile({ deviceId, name, role: newRole });
    if (r.ok) {
      setNewName("");
      setNotice(`${name} added. Enrol at least ${RECOMMENDED_SAMPLES} faces so the door recognises them reliably.`);
      await load();
    } else {
      setError((r.data as { error?: string })?.error || "Could not add that person.");
    }
    setBusy("");
  }, [deviceId, newName, newRole, load]);

  const upload = useCallback(
    async (file: File) => {
      if (!uploadFor) return;
      setBusy(`upload-${uploadFor.id}`);
      setError("");
      const r = await controlPlane.enrolFaceImage(uploadFor.id, file);
      if (r.ok) {
        setNotice(
          r.data.remaining > 0
            ? `${r.data.total} faces stored for ${uploadFor.name}. Add another from a different angle, or with glasses on.`
            : `${uploadFor.name} is fully enrolled.`
        );
        await load();
      } else {
        /* The server's wording is used verbatim. It distinguishes "no face in
           that photo" from "that is a different person" from "too similar to
           one already stored", and each needs a different thing done. */
        setError((r.data as { error?: string })?.error || "That photo could not be used.");
      }
      setBusy("");
    },
    [uploadFor, load]
  );

  const enrolAtDoor = useCallback(
    async (profile?: FaceProfile) => {
      setBusy("door");
      setError("");
      const r = await controlPlane.startFaceEnrolment(
        profile ? { deviceId, profileId: profile.id } : { deviceId, name: newName.trim() || "New person" }
      );
      if (r.ok) {
        setNotice(
          `The door is enrolling ${r.data.name} for ${r.data.seconds} seconds. Ask them to look at the camera.`
        );
        await load();
      } else {
        setError("Could not start enrolment at the door.");
      }
      setBusy("");
    },
    [deviceId, newName, load]
  );

  const toggle = useCallback(
    async (p: FaceProfile) => {
      setBusy(`toggle-${p.id}`);
      await controlPlane.updateFaceProfile(p.id, { enabled: !p.enabled });
      await load();
      setBusy("");
    },
    [load]
  );

  const remove = useCallback(
    async (p: FaceProfile) => {
      if (!confirm(`Remove ${p.name}? The door will stop opening for them.`)) return;
      setBusy(`del-${p.id}`);
      await controlPlane.deleteFaceProfile(p.id);
      await load();
      setBusy("");
    },
    [load]
  );

  const setWindow = useCallback(
    async (p: FaceProfile, from: string, to: string) => {
      setBusy(`win-${p.id}`);
      await controlPlane.updateFaceProfile(p.id, {
        allowFrom: from || null,
        allowTo: to || null,
      });
      await load();
      setBusy("");
    },
    [load]
  );

  return (
    <div className="space-y-4">
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void upload(f);
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-bold text-white">
            <ScanFace className="h-5 w-5 text-violet-400" aria-hidden />
            Faces on {deviceName || "this door"}
          </h3>
          <p className="text-[13px] text-slate-400">
            Enrol several faces per person — glasses on and off, and after dark. One face is a
            lock that stops recognising somebody the day they shave.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex h-[40px] items-center gap-2 rounded-lg border border-white/15 px-3 text-sm text-slate-200 hover:bg-white/5"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">{error}</div>
      )}
      {notice && !error && (
        <div className="rounded-lg border border-cyan-800/50 bg-cyan-950/30 px-4 py-3 text-sm text-cyan-200">
          {notice}
        </div>
      )}

      {/* Add somebody */}
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-bold text-white">
          <UserPlus className="h-4 w-4 text-cyan-400" aria-hidden />
          Enrol somebody new
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Their name"
            aria-label="Name"
            className="h-[42px] min-w-[200px] flex-1 rounded-lg border border-white/15 bg-black/30 px-3 text-sm text-white placeholder:text-slate-500"
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as typeof newRole)}
            aria-label="Role"
            className="h-[42px] rounded-lg border border-white/15 bg-black/30 px-3 text-sm text-white"
          >
            <option value="resident">Resident</option>
            <option value="guest">Guest</option>
            <option value="staff">Staff</option>
          </select>
          <button
            onClick={() => void addPerson()}
            disabled={!newName.trim() || busy === "add"}
            className="h-[42px] rounded-lg bg-cyan-600 px-4 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy === "add" ? "Adding…" : "Add"}
          </button>
          <button
            onClick={() => void enrolAtDoor()}
            disabled={busy === "door"}
            className="inline-flex h-[42px] items-center gap-2 rounded-lg border border-white/15 px-4 text-sm text-slate-200 hover:bg-white/5 disabled:opacity-40"
            title="Put the door into enrolment mode for somebody standing at it"
          >
            <DoorOpen className="h-4 w-4" aria-hidden />
            Enrol at the door
          </button>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Photos are never stored. Each becomes a mathematical descriptor and is discarded — a
          descriptor cannot be turned back into a recognisable picture.
        </p>
        {!photoEnrolment.available && (
          /*
           * Said before somebody picks a photo, not after. Choosing a file,
           * waiting, and then being told it cannot be used reads as a broken
           * feature rather than as configuration nobody has set.
           */
          <div className="mt-2 rounded-lg border border-amber-800/40 bg-amber-950/20 px-3 py-2 text-[12px] text-amber-200">
            {photoEnrolment.reason || "Photo enrolment is not configured on this home."} Enrolling
            at the door works regardless.
          </div>
        )}
      </div>

      {/* Roster */}
      {!loading && profiles.length === 0 && (
        <div className="rounded-2xl border border-amber-800/40 bg-amber-950/20 px-4 py-6 text-center text-sm text-amber-200">
          Nobody is enrolled. This door will not open on a face — the keypad and fingerprint still work.
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {profiles.map((p) => {
          const thin = p.samples < RECOMMENDED_SAMPLES;
          return (
            <div key={p.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-bold text-white">{p.name}</div>
                  <div className="text-[12px] text-slate-400">
                    {p.enabled ? p.role : "suspended"} ·{" "}
                    <span style={{ color: thin ? "#fbbf24" : "#6ee7b7" }}>
                      {p.samples} face{p.samples === 1 ? "" : "s"}
                    </span>
                    {p.samples === 0
                      ? " — will not be recognised"
                      : thin
                        ? ` — add ${RECOMMENDED_SAMPLES - p.samples} more`
                        : ""}
                  </div>
                </div>
                <span
                  className="shrink-0 rounded-md px-2 py-1 text-[11px] font-bold"
                  style={{
                    background: p.enabled ? "rgba(16,185,129,0.15)" : "rgba(148,163,184,0.15)",
                    color: p.enabled ? "#6ee7b7" : "#cbd5e1",
                  }}
                >
                  {p.enabled ? "Allowed" : "Suspended"}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-slate-400">
                <Clock className="h-3.5 w-3.5" aria-hidden />
                <input
                  type="time"
                  defaultValue={p.allowFrom ?? ""}
                  aria-label={`${p.name} allowed from`}
                  onBlur={(e) => void setWindow(p, e.target.value, p.allowTo ?? "")}
                  className="h-[34px] rounded-md border border-white/15 bg-black/30 px-2 text-[12px] text-white"
                />
                <span>to</span>
                <input
                  type="time"
                  defaultValue={p.allowTo ?? ""}
                  aria-label={`${p.name} allowed until`}
                  onBlur={(e) => void setWindow(p, p.allowFrom ?? "", e.target.value)}
                  className="h-[34px] rounded-md border border-white/15 bg-black/30 px-2 text-[12px] text-white"
                />
                {/* Overnight is a normal shape for a window and the matcher
                    handles it; saying so stops somebody assuming it is a bug. */}
                <span className="text-[11px] text-slate-500">
                  {p.allowFrom && p.allowTo ? "Overnight windows are fine" : "Blank means always"}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    setUploadFor(p);
                    fileInput.current?.click();
                  }}
                  disabled={busy === `upload-${p.id}` || p.samples >= limits.maxSamples || !photoEnrolment.available}
                  title={!photoEnrolment.available ? photoEnrolment.reason : p.samples >= limits.maxSamples ? "This person has the maximum number of faces" : "Add a face from a photo"}
                  className="inline-flex h-[36px] items-center gap-1.5 rounded-lg border border-white/15 px-3 text-[13px] text-slate-200 hover:bg-white/5 disabled:opacity-40"
                >
                  {busy === `upload-${p.id}` ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Camera className="h-3.5 w-3.5" aria-hidden />
                  )}
                  Add a face
                </button>
                <button
                  onClick={() => void enrolAtDoor(p)}
                  disabled={busy === "door"}
                  className="inline-flex h-[36px] items-center gap-1.5 rounded-lg border border-white/15 px-3 text-[13px] text-slate-200 hover:bg-white/5 disabled:opacity-40"
                >
                  <DoorOpen className="h-3.5 w-3.5" aria-hidden />
                  At the door
                </button>
                <button
                  onClick={() => void toggle(p)}
                  disabled={busy === `toggle-${p.id}`}
                  className="inline-flex h-[36px] items-center gap-1.5 rounded-lg border border-white/15 px-3 text-[13px] text-slate-200 hover:bg-white/5 disabled:opacity-40"
                >
                  {p.enabled ? <ShieldOff className="h-3.5 w-3.5" aria-hidden /> : <ShieldCheck className="h-3.5 w-3.5" aria-hidden />}
                  {p.enabled ? "Suspend" : "Allow"}
                </button>
                <button
                  onClick={() => void remove(p)}
                  disabled={busy === `del-${p.id}`}
                  className="inline-flex h-[36px] items-center gap-1.5 rounded-lg border border-red-900/60 px-3 text-[13px] text-red-300 hover:bg-red-950/40 disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Remove
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* History — refusals included, and that is the point */}
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="mb-2 text-sm font-bold text-white">Recent attempts</div>
        {attempts.length === 0 ? (
          <div className="py-4 text-center text-[13px] text-slate-500">
            Nothing yet. Every face the door sees is recorded here, including the ones it turned away.
          </div>
        ) : (
          <ul className="max-h-[300px] space-y-1 overflow-y-auto">
            {attempts.map((a) => (
              <li
                key={a.id}
                className="flex items-baseline gap-2 rounded-md px-2 py-1.5 text-[12px]"
                style={{ background: a.granted ? "transparent" : "rgba(127,29,29,0.2)" }}
              >
                <span style={{ color: a.granted ? "#34d399" : "#f87171" }}>●</span>
                <span className="font-semibold text-slate-200">
                  {a.granted ? a.name : a.outcome === "unsure" ? "Unsure" : "Refused"}
                </span>
                <span className="min-w-0 flex-1 truncate text-slate-400">{a.reason}</span>
                <span className="shrink-0 text-slate-500">{new Date(a.at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-slate-500">
          Refusals are kept deliberately. A stranger at the door at three in the morning is the
          entry worth finding, and a list built only from successful unlocks would omit it.
        </p>
      </div>
    </div>
  );
}
