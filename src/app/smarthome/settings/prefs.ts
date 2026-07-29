"use client";

// Local-storage key registry for all settings-section preferences.
// Every key is namespaced with `cv-` so they stand out in a localStorage audit
// and don't collide with any host-page or third-party cookies.

export const NOTIFY_PREFS_KEY = "cv-notify-prefs";
export const REDUCED_MOTION_KEY = "cv-prefs-reduced-motion";
export const DENSITY_KEY = "cv-prefs-density";

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

export type Density = "comfortable" | "compact";
