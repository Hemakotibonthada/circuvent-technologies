"use client";

/**
 * The home network panel: what this board can reach, and what its pads drive.
 *
 * WHY THIS SCREEN EXISTS AT ALL
 *
 * The local bus is invisible by construction. When it works, a pad in the hall
 * switches a light in the bedroom and nobody thinks about how. When it does not
 * — no home key, the wrong home, every peer gone quiet — the device is still
 * online, its Wi-Fi is still fine, its relays still click, and the only symptom
 * is a switch that does nothing to a light in another room.
 *
 * That is the worst possible debugging position: the evidence is in one room
 * and the symptom is in another. So the state the firmware already publishes is
 * put on screen, including the awkward case of a board that is on the bus and
 * completely alone on it.
 *
 * It is also where a pad gets bound, because a feature nothing can configure is
 * a feature nobody has.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { controlPlane, type Device } from "@/lib/control-plane";
import {
  readHomeLink,
  homeLinkNotice,
  readBindings,
  bindingTarget,
  canReachPeers,
} from "@/app/smarthome/home-link";

/** Boolean outputs a peer board exposes, derived from the state it publishes. */
function outputsOf(d: Device): string[] {
  const s = (d.state ?? {}) as Record<string, unknown>;
  return Object.keys(s)
    .filter((k) => /^(g\d+|r\d+|power\d*)$/.test(k) && typeof s[k] === "boolean")
    .sort();
}

export function HomeNetworkPanel({
  device,
  gangs,
  onChanged,
}: {
  device: Device;
  gangs: number;
  onChanged?: () => void;
}) {
  const [peers, setPeers] = useState<Device[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");

  const link = useMemo(() => readHomeLink(device.state as Record<string, unknown>), [device.state]);
  const bindings = useMemo(
    () => readBindings(device.state as Record<string, unknown>, gangs),
    [device.state, gangs]
  );
  const notice = homeLinkNotice(link);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await controlPlane.devices();
      if (!alive || !r.ok) return;
      // Only boards that can own a switchable load, and never this one — a pad
      // bound to its own board is just a pad, and offering it invites a loop.
      setPeers((r.data.devices || []).filter((d) => d.id !== device.id && outputsOf(d).length > 0));
    })();
    return () => { alive = false; };
  }, [device.id]);

  const bind = useCallback(
    async (gang: number, peerId: string, field: string) => {
      setBusy(gang);
      setError("");
      const r = await controlPlane.command(device.id, {
        action: "bind",
        gang,
        target: bindingTarget(peerId, field),
      });
      setBusy(null);
      if (!r.ok) {
        setError("The board did not accept that. It may have gone offline — try again.");
        return;
      }
      onChanged?.();
    },
    [device.id, onChanged]
  );

  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-200">Home network</h3>
        <span
          className="rounded-full px-2.5 py-1 text-xs font-medium"
          style={{
            background: canReachPeers(link) ? "rgba(34,197,94,0.15)" : "rgba(148,163,184,0.15)",
            color: canReachPeers(link) ? "#4ade80" : "#94a3b8",
          }}
        >
          {link.phase === "up" ? `${link.peers} board${link.peers === 1 ? "" : "s"} in range` : link.phase}
        </span>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-slate-400">
        Pads bound here switch loads on other boards directly, over the local radio link — so they keep
        working when the internet is down.
      </p>

      {notice && (
        <p className="mt-3 rounded-lg border border-amber-400/25 bg-amber-400/10 p-3 text-xs leading-relaxed text-amber-200">
          {notice}
        </p>
      )}

      {link.phase === "up" && (
        <div className="mt-4 space-y-2">
          {bindings.map((b) => {
            const peer = peers.find((p) => p.id === b.peerId);
            return (
              <div key={b.gang} className="flex flex-wrap items-center gap-2 rounded-xl bg-black/20 p-2.5">
                <span className="w-16 text-xs font-medium text-slate-300">Gang {b.gang}</span>
                <select
                  aria-label={`Gang ${b.gang} target board`}
                  value={b.peerId}
                  disabled={busy === b.gang}
                  onChange={(e) => bind(b.gang, e.target.value, e.target.value ? b.field || "g1" : "")}
                  className="min-h-[36px] flex-1 rounded-lg border border-white/10 bg-black/30 px-2 text-xs text-slate-200"
                >
                  <option value="">This board&apos;s own relay</option>
                  {peers.map((p) => (
                    <option key={p.id} value={p.id}>{p.name || p.id}</option>
                  ))}
                </select>
                {b.peerId && (
                  <select
                    aria-label={`Gang ${b.gang} target output`}
                    value={b.field}
                    disabled={busy === b.gang}
                    onChange={(e) => bind(b.gang, b.peerId, e.target.value)}
                    className="min-h-[36px] w-28 rounded-lg border border-white/10 bg-black/30 px-2 text-xs text-slate-200"
                  >
                    {(peer ? outputsOf(peer) : [b.field]).map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                )}
                {b.peerId && !peer && (
                  /*
                   * A binding pointing at a board that is no longer in the
                   * account. Left visible rather than silently blanked: the pad
                   * genuinely does nothing now, and quietly showing it as
                   * unbound would hide why.
                   */
                  <span className="text-xs text-amber-300">board not found</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}
    </section>
  );
}
