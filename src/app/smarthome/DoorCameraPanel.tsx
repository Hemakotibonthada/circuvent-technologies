"use client";

/**
 * Turning an ordinary camera into the eyes of a door lock.
 *
 * FaceDoor was designed around "the hub's AI node" watching a camera and
 * telling the lock who is there. No such node exists in a Circuvent home, so
 * the control plane does that job with whichever camera is already pointed at
 * the door: it asks for a burst of snapshots, recognises whoever is in them,
 * and unlocks.
 *
 * This panel is deliberately honest about the trade. A camera on a wall is not
 * a doorbell camera, and the two things people will actually hit — having to
 * stand close, and the cat setting it off — are stated here rather than
 * discovered on a doorstep.
 */
import { useCallback, useEffect, useState } from "react";
import { ScanFace, Loader2, Camera, Trash2 } from "lucide-react";
import { controlPlane, type FaceDoorCamera, type Device } from "@/lib/control-plane";
import FacePanel from "./FacePanel";

export default function DoorCameraPanel({
  deviceId,
  deviceName,
}: {
  deviceId: string;
  deviceName?: string;
}) {
  const [door, setDoor] = useState<FaceDoorCamera | null>(null);
  const [locks, setLocks] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [d, devs] = await Promise.all([controlPlane.faceDoors(), controlPlane.devices()]);
    if (d.ok) setDoor((d.data.doors ?? []).find((x) => x.deviceId === deviceId) ?? null);
    if (devs.ok) setLocks((devs.data.devices ?? []).filter((x) => x.type === "facedoor"));
    setLoading(false);
  }, [deviceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (patch: Parameters<typeof controlPlane.saveFaceDoor>[1], label: string) => {
      setBusy(label);
      setError("");
      const r = await controlPlane.saveFaceDoor(deviceId, patch);
      if (r.ok) {
        setDoor(r.data.door);
        // The camera's own settings may have been changed to make this work.
        // Saying so is the difference between a helpful adjustment and the
        // next person concluding the camera is misconfigured.
        setNotice(r.data.changed?.length ? r.data.changed.join(". ") + "." : "");
      } else {
        setError((r.data as { error?: string })?.error || "Could not save that.");
      }
      setBusy("");
    },
    [deviceId]
  );

  const remove = useCallback(async () => {
    setBusy("remove");
    const r = await controlPlane.deleteFaceDoor(deviceId);
    if (r.ok) {
      setDoor(null);
      setNotice("");
    }
    setBusy("");
  }, [deviceId]);

  const capture = useCallback(async () => {
    setBusy("capture");
    setError("");
    const r = await controlPlane.captureFaceDoor(deviceId);
    setNotice(
      r.ok
        ? "Looking now. Stand in front of the camera — if you are enrolled, the door opens."
        : ""
    );
    if (!r.ok) setError((r.data as { error?: string })?.error || "Could not capture.");
    setBusy("");
  }, [deviceId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (!door) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
        <div className="flex items-start gap-3">
          <ScanFace className="mt-0.5 h-5 w-5 shrink-0 text-violet-400" />
          <div>
            <div className="font-semibold text-slate-200">Recognise faces with this camera</div>
            <p className="mt-1 text-sm text-slate-400">
              {deviceName || "This camera"} can watch for people and open a FaceDoor lock for
              anyone you enrol. It takes a short burst of stills whenever it sees movement, so
              nothing is streamed anywhere and no video is stored.
            </p>
            <ul className="mt-2 space-y-1 text-xs text-slate-500">
              <li>· People need to be reasonably close — about an arm&apos;s length works well.</li>
              <li>· Movement of any kind starts a burst, including pets and passing traffic.</li>
              <li>· Recognition takes about a second, so it is not instant.</li>
            </ul>
          </div>
        </div>
        {error && <div className="mt-3 text-sm text-red-400">{error}</div>}
        <button
          onClick={() => save({ enabled: true }, "enable")}
          disabled={busy === "enable"}
          className="mt-4 min-h-[44px] w-full rounded-xl border border-violet-500/40 bg-violet-500/10 py-2.5 font-semibold text-violet-200 hover:bg-violet-500/20 disabled:opacity-40 active:scale-95 transition"
        >
          {busy === "enable" ? "Setting up…" : "Use this camera for face unlock"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ScanFace className="h-5 w-5 text-violet-400" />
            <span className="font-semibold text-slate-200">Face unlock</span>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={door.enabled}
              onChange={(e) => save({ enabled: e.target.checked }, "toggle")}
              className="h-4 w-4 accent-violet-500"
            />
            {door.enabled ? "On" : "Off"}
          </label>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-slate-400">Lock to open</span>
            <select
              value={door.lockId ?? ""}
              onChange={(e) => save({ lockId: e.target.value || null }, "lock")}
              className="mt-1 min-h-[44px] w-full rounded-lg border border-white/15 bg-black/30 px-3 text-slate-100 outline-none focus:border-violet-500"
            >
              <option value="">No lock yet — recognise only</option>
              {locks.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name || l.id}
                </option>
              ))}
            </select>
            {!door.lockId && (
              <span className="mt-1 block text-xs text-slate-500">
                Faces are still recognised and logged. Nothing is unlocked until a lock is
                chosen — useful for enrolling everybody before the lock is fitted.
              </span>
            )}
          </label>

          <label className="text-sm">
            <span className="text-slate-400">Ignore repeat movement for</span>
            <select
              value={door.cooldownMs}
              onChange={(e) => save({ cooldownMs: Number(e.target.value) }, "cooldown")}
              className="mt-1 min-h-[44px] w-full rounded-lg border border-white/15 bg-black/30 px-3 text-slate-100 outline-none focus:border-violet-500"
            >
              <option value={2000}>2 seconds</option>
              <option value={4000}>4 seconds</option>
              <option value={8000}>8 seconds</option>
              <option value={20000}>20 seconds</option>
            </select>
            <span className="mt-1 block text-xs text-slate-500">
              Stops one person standing in view from being photographed over and over.
            </span>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span>{door.triggers.toLocaleString()} captures so far</span>
          {door.lastTriggerAt && (
            <span>· last {new Date(door.lastTriggerAt).toLocaleString()}</span>
          )}
        </div>

        {notice && <div className="mt-3 text-sm text-violet-300">{notice}</div>}
        {error && <div className="mt-3 text-sm text-red-400">{error}</div>}

        <div className="mt-4 flex gap-2">
          <button
            onClick={capture}
            disabled={busy === "capture" || !door.enabled}
            className="min-h-[44px] flex-1 rounded-xl border border-white/15 bg-black/20 py-2.5 font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-40 active:scale-95 transition flex items-center justify-center gap-2"
          >
            <Camera className="h-4 w-4" /> {busy === "capture" ? "Looking…" : "Look now"}
          </button>
          <button
            onClick={remove}
            disabled={busy === "remove"}
            className="min-h-[44px] rounded-xl border border-white/10 bg-black/20 px-4 text-slate-400 hover:bg-white/10 disabled:opacity-40 active:scale-95 transition flex items-center gap-2"
          >
            <Trash2 className="h-4 w-4" /> Stop
          </button>
        </div>
      </div>

      {/*
       * The roster hangs off the lock when there is one, so that enrolling
       * before and after a lock is fitted does not split a household in two.
       */}
      <FacePanel deviceId={door.lockId ?? deviceId} deviceName={deviceName} />
    </div>
  );
}
