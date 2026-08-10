/*
 * What to ask for at first launch, and when to lock the app.
 *
 * Kept free of react-native and expo imports so it can be tested. The parts
 * that matter here are decisions, not API calls: which permissions are worth
 * interrupting somebody for, whether a refusal can be asked about again, and
 * whether a device that cannot do biometrics should be locked out of its own
 * app. Every one of those is a rule that is easy to get subtly wrong and
 * impossible to notice afterwards.
 */

export type PermissionKey = "notifications" | "location" | "camera";

export type PermissionState = "granted" | "denied" | "undetermined";

export interface PermissionSpec {
  key: PermissionKey;
  title: string;
  /** Why we are asking, in terms of what the person gets. */
  why: string;
  /** False when the app is fully usable without it. */
  required: boolean;
}

/*
 * The order is deliberate: most obviously useful first.
 *
 * The first prompt is the one most likely to be granted, and a granted prompt
 * makes the next one more likely to be read rather than dismissed. Location is
 * last because it is the one people are most wary of and the one this app can
 * most easily do without.
 */
export const PERMISSIONS: PermissionSpec[] = [
  {
    key: "notifications",
    title: "Notifications",
    why: "So we can tell you when a device goes offline, a door is left open, or something needs attention while you are away.",
    required: false,
  },
  {
    key: "camera",
    title: "Camera",
    why: "To scan the QR code on a new device when you add it, and to view your cameras.",
    required: false,
  },
  {
    key: "location",
    title: "Location",
    why: "So automations can run when you arrive home or leave, and so we can suggest devices on the same network.",
    required: false,
  },
];

/**
 * Whether the operating system will actually show a prompt.
 *
 * iOS shows a permission dialog once. After a refusal, requesting again returns
 * denied immediately without displaying anything, so an app that keeps calling
 * request() appears to do nothing at all. Anything already decided has to be
 * sent to Settings instead, which is a different piece of UI and a different
 * sentence.
 */
export function canPrompt(state: PermissionState): boolean {
  return state === "undetermined";
}

/**
 * Whether to show the explanation screen at all.
 *
 * Only when there is something left that the OS would actually prompt for.
 * Showing it when every answer is already recorded produces a screen whose
 * buttons do nothing, which is worse than not showing it.
 */
export function shouldRunFirstRun(states: Record<PermissionKey, PermissionState>, alreadyRan: boolean): boolean {
  if (alreadyRan) return false;
  return PERMISSIONS.some((p) => canPrompt(states[p.key]));
}

/** The permissions still worth asking about, in order. */
export function pending(states: Record<PermissionKey, PermissionState>): PermissionSpec[] {
  return PERMISSIONS.filter((p) => canPrompt(states[p.key]));
}

/* ------------------------------------------------------------- biometrics -- */

export interface BiometricCapability {
  /** The device has the hardware. */
  hasHardware: boolean;
  /** The user has actually enrolled a fingerprint or a face. */
  isEnrolled: boolean;
  /** A device passcode or pattern is set. */
  hasPasscode: boolean;
}

export type LockDecision =
  | { lock: false; reason: "disabled" | "unavailable" | "recent" }
  | { lock: true };

/**
 * Whether the app can offer a biometric lock at all.
 *
 * Hardware alone is not enough: a phone with a fingerprint reader and nothing
 * enrolled cannot authenticate anybody. Offering the setting there produces a
 * switch that turns on and then locks the owner out of their own app with no
 * way back in — so it is offered only when something could actually succeed.
 * A device passcode counts, because that is a real fallback the OS will accept.
 */
export function biometricAvailable(cap: BiometricCapability): boolean {
  if (!cap.hasHardware || !cap.isEnrolled) return cap.hasPasscode;
  return true;
}

/** How long the app may sit in the background before it locks again. */
export const RELOCK_AFTER_MS = 60_000;

/**
 * Whether to demand a fingerprint now.
 *
 * Not on every return to the app. Switching out to read a code from a text
 * message, or to answer a call, and being challenged on the way back makes the
 * lock feel broken and is the reason people turn it off — at which point it
 * protects nothing. A minute is long enough to come back from that and short
 * enough that a phone left on a table is covered.
 */
export function shouldLock(opts: {
  enabled: boolean;
  available: boolean;
  backgroundedAt: number | null;
  now: number;
}): LockDecision {
  if (!opts.enabled) return { lock: false, reason: "disabled" };
  if (!opts.available) return { lock: false, reason: "unavailable" };
  // Never backgrounded: this is a cold start, which always locks.
  if (opts.backgroundedAt === null) return { lock: true };
  const away = opts.now - opts.backgroundedAt;
  // A clock that jumped backwards must not be read as "away for ages", nor as
  // a reason to skip the lock; treat anything nonsensical as a full absence.
  if (!Number.isFinite(away) || away < 0) return { lock: true };
  return away >= RELOCK_AFTER_MS ? { lock: true } : { lock: false, reason: "recent" };
}
