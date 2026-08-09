/**
 * What the deployed control plane can actually do.
 *
 * WHY THE CLIENT ASKS
 *
 * "The server is not relaying video" is a true diagnosis that leaves the user
 * with nothing to do. The cause, every time it has happened here, is a
 * container older than the code — the WebSocket `watch` handler exists in the
 * repository and not in what is running, so cameras publish frames that are
 * accepted by the broker and dropped before they reach a browser.
 *
 * From the outside that is indistinguishable from a broken camera, and it cost
 * a real investigation: a device that had published 20,522 frames with zero
 * drops was suspected of a sensor fault, a ribbon fault and a firmware fault
 * in turn. /health now lists the build's capabilities, so the difference
 * between "your camera is broken" and "the server needs redeploying" is one
 * request rather than an afternoon.
 *
 * Deliberately fail-open. An older control plane has no `capabilities` field
 * at all, and treating a missing list as "supports nothing" would put a
 * warning on every working deployment. Unknown is reported as unknown.
 */
import { useEffect, useState } from "react";

const CONTROL_PLANE = process.env.NEXT_PUBLIC_CONTROL_PLANE_URL || "https://api.circuvent.com";

export interface ControlPlaneBuild {
  version?: string;
  commit?: string;
  builtAt?: string;
  capabilities?: string[];
}

export type CapabilityState = "unknown" | "present" | "absent";

let cached: { at: number; build: ControlPlaneBuild | null } | null = null;
const CACHE_MS = 60_000;

export async function fetchControlPlaneBuild(): Promise<ControlPlaneBuild | null> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.build;
  try {
    const r = await fetch(`${CONTROL_PLANE}/health`, { cache: "no-store" });
    // A 503 still carries the build stamp — "which version is down" is the
    // first question — so the body is read either way.
    const build = (await r.json()) as ControlPlaneBuild;
    cached = { at: Date.now(), build };
    return build;
  } catch {
    // Not cached: a network blip must not be remembered as "no capabilities"
    // for the next minute and put a false warning on a healthy deployment.
    return null;
  }
}

/**
 * Whether the running control plane advertises a capability.
 *
 * Only queried when `enabled` — this exists to explain a fault, and polling
 * another host on every camera page for a question nobody asked would be a
 * round trip spent on nothing.
 */
export function useControlPlaneCapability(name: string, enabled: boolean) {
  const [state, setState] = useState<CapabilityState>("unknown");
  const [build, setBuild] = useState<ControlPlaneBuild | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    void fetchControlPlaneBuild().then((b) => {
      if (stopped) return;
      setBuild(b);
      if (!b || !Array.isArray(b.capabilities)) {
        // No list means a build from before capabilities were reported — which
        // is itself a build from before the frame relay. Still reported as
        // unknown rather than absent, because inferring one missing field into
        // a definite diagnosis is how confident wrong answers get made.
        setState("unknown");
        return;
      }
      setState(b.capabilities.includes(name) ? "present" : "absent");
    });
    return () => {
      stopped = true;
    };
  }, [name, enabled]);

  return { state, build };
}

/** One sentence a user can act on, or null when there is nothing to add. */
export function stalePlaneAdvice(state: CapabilityState, build: ControlPlaneBuild | null): string | null {
  if (state === "absent") {
    const stamp = build?.commit && build.commit !== "unknown" ? ` (running ${build.commit})` : "";
    return (
      `The control plane is running a build that cannot relay camera video${stamp}. ` +
      `This is a server-side deploy, not a fault with the camera — rebuild it on the VM with ` +
      `\`docker compose up -d --build\` and video will start working.`
    );
  }
  if (state === "unknown" && build && !Array.isArray(build.capabilities)) {
    return (
      "The control plane did not report what it supports, which means it predates the camera frame " +
      "relay. Rebuilding it on the VM with `docker compose up -d --build` is the likely fix."
    );
  }
  return null;
}
