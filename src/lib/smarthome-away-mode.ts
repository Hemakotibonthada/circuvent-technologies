// Vacation / Away Mode — activating it creates REAL time-based automations
// via the existing control-plane automations API (so lights genuinely turn
// on/off on a schedule), and remembers which automation ids it created so
// deactivating cleanly removes exactly those and nothing else. The on/off
// preference state itself is local (localStorage); the automations it
// creates are real, server-side (control plane) objects.

const KEY = "cv-console-away-mode";

export interface AwayModeState {
  enabled: boolean;
  startDate?: string;
  endDate?: string;
  deviceId?: string;
  automationIds: number[];
}

function defaults(): AwayModeState {
  return { enabled: false, automationIds: [] };
}

export function getState(): AwayModeState {
  if (typeof window === "undefined") return defaults();
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...defaults(), ...(JSON.parse(raw) as Partial<AwayModeState>) } : defaults();
  } catch {
    return defaults();
  }
}

export function saveState(state: AwayModeState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}
