"use client";

/**
 * Turning browser notifications on.
 *
 * The interesting states are not "on" and "off". They are: this browser cannot
 * do it at all, the user has permanently refused, the deployment has no keys,
 * and the subscription silently disappeared. Each needs a different sentence,
 * and a toggle that renders them all as "off" leaves somebody flipping a
 * switch that will never stay on.
 *
 * PERMISSION IS ASKED FOR ONCE, EVER.
 *
 * A denied permission cannot be re-requested from script — the browser will
 * not show the prompt again, and calling requestPermission returns "denied"
 * immediately without any UI. Anything that keeps offering to enable
 * notifications after that is offering something it cannot deliver, so the
 * only honest response is to explain where the browser's own setting lives.
 *
 * Which also means the prompt must not be fired on page load. A permission
 * request the user did not ask for is usually dismissed, and dismissal is
 * permanent. It is triggered from an explicit action.
 */
import { useCallback, useEffect, useState } from "react";
import { getToken } from "@/lib/control-plane";

export type PushState =
  /** Still working out where we stand. */
  | "checking"
  /** No service worker or no Push API — an old browser, or Safari without a home-screen install. */
  | "unsupported"
  /** The deployment has no VAPID keys, so nothing can be sent. */
  | "unconfigured"
  /** Available, not yet enabled. */
  | "idle"
  /** The browser refused, permanently, and only the user can undo it. */
  | "denied"
  | "subscribing"
  | "enabled"
  | "error";

export interface WebPush {
  state: PushState;
  /** Human explanation for whatever state we are in. */
  message: string;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
}

/**
 * VAPID keys travel base64url; PushManager wants raw bytes.
 *
 * The ArrayBuffer is allocated explicitly rather than letting Uint8Array pick
 * one, because a plain Uint8Array is typed over ArrayBufferLike — which
 * includes SharedArrayBuffer — and applicationServerKey will not accept that.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const MESSAGES: Record<PushState, string> = {
  checking: "Checking notification support…",
  unsupported: "This browser cannot show notifications. On iPhone, add Circuvent to the Home Screen first.",
  unconfigured: "Browser notifications are not configured on this deployment.",
  idle: "Get told when something needs attention, even with no tab open.",
  denied: "Notifications are blocked. Your browser will not ask again — turn them back on in its site settings.",
  subscribing: "Asking your browser…",
  enabled: "Notifications are on for this browser.",
  error: "Could not turn notifications on.",
};

export function useWebPush(): WebPush {
  const [state, setState] = useState<PushState>("checking");
  const [message, setMessage] = useState(MESSAGES.checking);

  const set = useCallback((next: PushState, custom?: string) => {
    setState(next);
    setMessage(custom ?? MESSAGES[next]);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (typeof window === "undefined") return;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (!cancelled) set("unsupported");
        return;
      }

      // Ask the server before the browser: if there are no keys, there is
      // nothing to subscribe to and the permission prompt would be spent for
      // nothing — and it can only be spent once.
      try {
        const res = await fetch("/api/push/key");
        const body = await res.json().catch(() => null);
        if (!body?.configured) {
          if (!cancelled) set("unconfigured", body?.message);
          return;
        }
      } catch {
        if (!cancelled) set("error", "Could not reach the notification service.");
        return;
      }

      if (Notification.permission === "denied") {
        if (!cancelled) set("denied");
        return;
      }

      try {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (!cancelled) set(existing ? "enabled" : "idle");
      } catch {
        if (!cancelled) set("idle");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [set]);

  const enable = useCallback(async () => {
    set("subscribing");
    try {
      const keyRes = await fetch("/api/push/key");
      const keyBody = await keyRes.json().catch(() => null);
      if (!keyBody?.configured || !keyBody.key) {
        set("unconfigured", keyBody?.message);
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        // Includes "default", which is what a dismissed prompt leaves behind.
        set(permission === "denied" ? "denied" : "idle", permission === "denied" ? undefined : "Notifications were not enabled.");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const subscription =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          // Required by Chrome: a push must always result in something the
          // user sees. Silent pushes are not permitted.
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyBody.key),
        }));

      const consoleToken = getToken();
      if (!consoleToken) {
        set("error", "Sign in to the smart-home console first.");
        return;
      }

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ consoleToken, subscription: subscription.toJSON() }),
      });
      const body = await res.json().catch(() => null);
      if (!body?.ok) {
        set("error", body?.message ?? "Could not register this browser.");
        return;
      }
      set("enabled");
    } catch {
      set("error");
    }
  }, [set]);

  const disable = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        /*
         * Tell the server before unsubscribing locally.
         *
         * The endpoint is the only handle on the record, and once the browser
         * has thrown the subscription away it is gone from here too — leaving
         * a row the server keeps trying to push to until the push service
         * finally reports it dead.
         */
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe();
      }
      set("idle");
    } catch {
      set("error", "Could not turn notifications off.");
    }
  }, [set]);

  return { state, message, enable, disable };
}
