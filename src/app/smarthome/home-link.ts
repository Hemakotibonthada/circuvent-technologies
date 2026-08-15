/**
 * Whether a home is actually talking to itself, and what each pad is wired to.
 *
 * WHY THIS EXISTS
 *
 * The local bus (firmware/CircuventDevice/CvHomeLink.h) lets boards drive each
 * other directly, so a pad in the hall can switch a light in a bedroom without
 * the command leaving the building. That is a large improvement and it has one
 * property that makes it dangerous to ship unwatched: when it stops working,
 * nothing breaks visibly.
 *
 * A board with no home key, a board that joined a different home, a board whose
 * peers have all gone quiet — every one of them reports a healthy device, a
 * healthy Wi-Fi link and a healthy relay. The only symptom is that a switch on
 * the wall no longer does anything to a light in another room, which reads as
 * failing hardware and is the most annoying possible thing to debug from a
 * different room.
 *
 * So the firmware publishes `homeLink` and `homePeers`, and this reads them.
 * A pad bound to a board that is not on the bus is a control that looks present
 * and does nothing, which is the failure this codebase keeps finding — the
 * whole point of surfacing it is to make that state say so out loud.
 */

export type HomeLinkPhase = "unprovisioned" | "up" | "failed" | "joining" | "unknown";

export interface HomeLinkState {
  phase: HomeLinkPhase;
  /** Boards heard from recently. Zero on a working bus means it is alone. */
  peers: number;
  detail: string;
}

const UNKNOWN: HomeLinkState = { phase: "unknown", peers: 0, detail: "" };

/** Reads `state.homeLink` / `state.homePeers`, as published by an adopting sketch. */
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
 * thing the bus is for, and those two facts have to arrive together or the
 * panel is telling a comfortable half-truth.
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
  /** 1-based gang number. */
  gang: number;
  /** Device id of the board that owns the load, or "" when unbound. */
  peerId: string;
  /** Field on that board, e.g. "g2". */
  field: string;
}

/**
 * Reads `bind1`..`bindN` into something a UI can render.
 *
 * The firmware stores a binding as "<peer-id>:<field>", the same shape it puts
 * on the wire, so there is one spelling of the idea rather than a wire format
 * and a display format that can disagree.
 */
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
      // A malformed binding is reported as unbound rather than half-applied:
      // the firmware would not act on it either, and showing it as live would
      // be the panel claiming a switch works when the board ignores it.
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
