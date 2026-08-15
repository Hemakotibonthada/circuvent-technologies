/**
 * Whether a home is actually talking to itself, in the app's words.
 *
 * WHY THIS IS DUPLICATED FROM THE CONSOLE
 *
 * The app and the site are separate TypeScript projects and cannot import each
 * other, so `src/app/smarthome/home-link.ts` is mirrored here. Duplication is
 * correct; drift is not, and one surface learning something the other does not
 * is the shape of bug this codebase keeps finding.
 * tests/home-link-parity.test.ts fails if only one copy is taught something.
 *
 * WHY IT NEEDS SHOWING AT ALL
 *
 * The local bus (firmware/CircuventDevice/CvHomeLink.h) is invisible when it
 * works and almost invisible when it does not. A board with no home key, or one
 * that joined a different home, or one whose peers have all gone quiet, still
 * reports a healthy device, a healthy Wi-Fi link and working relays. The only
 * symptom is that a pad on the wall stops affecting a light in another room —
 * evidence in one room, symptom in another.
 */

export type HomeLinkPhase = "unprovisioned" | "up" | "failed" | "joining" | "unknown";

export interface HomeLinkState {
  phase: HomeLinkPhase;
  peers: number;
  detail: string;
}

const UNKNOWN: HomeLinkState = { phase: "unknown", peers: 0, detail: "" };

/** Reads `state.homeLink` / `state.homePeers`. */
export function readHomeLink(state: Record<string, unknown> | null | undefined): HomeLinkState {
  if (!state) return UNKNOWN;
  const raw = state.homeLink;
  const peersRaw = state.homePeers;
  const peers = typeof peersRaw === "number" && Number.isFinite(peersRaw) ? Math.max(0, Math.round(peersRaw)) : 0;
  if (typeof raw !== "string" || !raw.trim()) return { ...UNKNOWN, peers };

  const s = raw.trim().toLowerCase();
  if (s === "unprovisioned") return { phase: "unprovisioned", peers, detail: "" };
  if (s === "up") return { phase: "up", peers, detail: "" };
  if (s.startsWith("rebooting")) return { phase: "joining", peers, detail: raw.trim() };
  if (s === "failed" || s === "bad key") return { phase: "failed", peers, detail: raw.trim() };
  return { ...UNKNOWN, peers };
}

/**
 * What to tell the owner, or null when there is nothing worth saying.
 *
 * "up with no peers" gets its own sentence rather than being folded into
 * "working". A board alone on the bus is working *and* unable to do the one
 * thing the bus is for, and those two facts have to arrive together.
 */
export function homeLinkNotice(h: HomeLinkState): string | null {
  switch (h.phase) {
    case "unprovisioned":
      return "This board is not part of a home network yet, so it can only be switched through the internet. Add it to a home to let it talk to the other boards directly.";
    case "failed":
      return "The local home network could not start on this board. It still works through the internet, but it cannot drive loads on other boards.";
    case "joining":
      return "Joining the home network — the board restarts once to pick up the key.";
    case "up":
      return h.peers === 0
        ? "On the home network, but it cannot hear any other board. Cross-room switches from this panel will not reach anything until at least one other board is on the same home."
        : null;
    default:
      return null;
  }
}

/** True when this board can currently drive a load on another board. */
export function canReachPeers(h: HomeLinkState): boolean {
  return h.phase === "up" && h.peers > 0;
}

export interface GangBinding {
  gang: number;
  peerId: string;
  field: string;
}

/** Reads `bind1`..`bindN` into something a UI can render. */
export function readBindings(
  state: Record<string, unknown> | null | undefined,
  gangs: number
): GangBinding[] {
  const out: GangBinding[] = [];
  for (let i = 1; i <= gangs; i++) {
    const raw = state?.[`bind${i}`];
    if (typeof raw !== "string" || !raw.trim()) {
      out.push({ gang: i, peerId: "", field: "" });
      continue;
    }
    const idx = raw.indexOf(":");
    if (idx <= 0 || idx === raw.length - 1) {
      // A malformed binding reads as unbound: the firmware would not act on it
      // either, and showing it as live would claim a switch that does nothing.
      out.push({ gang: i, peerId: "", field: "" });
      continue;
    }
    out.push({ gang: i, peerId: raw.slice(0, idx), field: raw.slice(idx + 1) });
  }
  return out;
}

/** The wire form the firmware expects, or "" to clear the binding. */
export function bindingTarget(peerId: string, field: string): string {
  const p = peerId.trim();
  const f = field.trim();
  if (!p || !f) return "";
  return `${p}:${f}`;
}
