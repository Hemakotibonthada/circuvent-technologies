"use client";

// Local-storage key registry for all settings-section preferences.
// Every key is namespaced with `cv-` so they stand out in a localStorage audit
// and don't collide with any host-page or third-party cookies.

export const NOTIFY_PREFS_KEY = "cv-notify-prefs";
export const REDUCED_MOTION_KEY = "cv-prefs-reduced-motion";
/*
 * Density moved to src/lib/view-settings.ts, which owns the key and actually
 * applies it. Re-exported rather than redeclared so there is one definition of
 * what a density is — the local copy was a two-value union while the applied
 * setting has three, and a second definition is how they get out of step.
 */
export { DENSITY_KEY, type Density } from "@/lib/view-settings";

export interface NotifyPrefs {
  criticalAlerts: boolean;
  warningAlerts: boolean;
  securityEvents: boolean;
  deviceOffline: boolean;
  automationEvents: boolean;
  successEvents: boolean;
}

export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = {
  criticalAlerts: true,
  warningAlerts: true,
  securityEvents: true,
  deviceOffline: true,
  automationEvents: false,
  successEvents: false,
};
