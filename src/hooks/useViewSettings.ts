"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  applyViewSettings,
  getServerViewSettingsSnapshot,
  getViewSettingsSnapshot,
  readViewSettings,
  resetViewSettings,
  saveViewSettings,
  subscribeViewSettings,
  type ViewSettings,
} from "@/lib/view-settings";

/**
 * Binds a component to the document-level view settings.
 *
 * `useSyncExternalStore` rather than useState + an effect: the settings live on
 * the document and in localStorage, which is exactly the external store this
 * hook exists for. It also gets the SSR case right by construction — the server
 * snapshot is the defaults, which is what the server actually rendered, so
 * there is no hydration mismatch and no flash of a wrongly-selected control.
 *
 * The *layout* does not wait for any of this. It is already correct before
 * paint, because the boot script in the root layout set the attributes.
 */
export function useViewSettings(): {
  settings: ViewSettings;
  ready: boolean;
  update: (patch: Partial<ViewSettings>) => void;
  reset: () => void;
} {
  const settings = useSyncExternalStore(
    subscribeViewSettings,
    getViewSettingsSnapshot,
    getServerViewSettingsSnapshot,
  );

  useEffect(() => {
    // Re-apply on mount: a browser restoring a bfcache page can hand back a
    // document whose inline script ran against the previous stored value.
    applyViewSettings(readViewSettings());
  }, []);

  const update = useCallback((patch: Partial<ViewSettings>) => {
    saveViewSettings(patch);
  }, []);

  const reset = useCallback(() => {
    resetViewSettings();
  }, []);

  /*
   * `ready` is retained so callers keep reading as intent rather than as a
   * fact about rendering. With an external store the snapshot is always the
   * real one on the client, so there is no longer a window in which it is not.
   */
  return { settings, ready: true, update, reset };
}
