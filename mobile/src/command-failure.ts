/**
 * Why a command did not happen.
 *
 * The app paints a control the moment it is pressed, so a failure that says
 * nothing is worse than one on a control that had not moved: the switch stays
 * where the finger left it and the screen quietly reports the opposite of the
 * truth. On a lock that is the thing somebody opened the app to check.
 *
 * A broadcast rather than an Alert. There are two dozen places that send
 * commands and a modal per failure would be unusable when a hub drops off —
 * a hundred taps producing a hundred dialogues. One banner, shown once,
 * replaced by whatever failed most recently.
 */

export interface CommandFailure {
  message: string;
  /**
   * True when the server refused rather than failed.
   *
   * A fault invites a retry; a refusal will never succeed on a second press.
   * Telling somebody with view-only access that the lock "failed" sends them
   * to press it again, and again.
   */
  refused: boolean;
  deviceId: string;
  at: number;
}

type Listener = (f: CommandFailure) => void;
const listeners = new Set<Listener>();

export function onCommandFailure(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emitCommandFailure(f: CommandFailure): void {
  for (const fn of listeners) {
    try {
      fn(f);
    } catch {
      /* one broken listener must not swallow the message for the rest */
    }
  }
}

/** Shapes an API result into something worth showing a person. */
export function notifyCommandFailed(
  res: { ok: boolean; status: number; data?: unknown },
  deviceId: string
): void {
  if (!res.ok) {
    const message =
      (res.data as { error?: string } | undefined)?.error ||
      (res.status === 0
        ? "No connection to your home."
        : `That did not go through (${res.status}).`);
    emitCommandFailure({ message, refused: res.status === 403, deviceId, at: Date.now() });
  }
}
