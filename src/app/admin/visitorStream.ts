/**
 * Opens the admin visitor stream.
 *
 * Exists because getting this wrong is silent and looks like a backend fault.
 * EventSource cannot set request headers, and the admin guard reads the token
 * only from `authorization` or `x-admin-token`, so `new EventSource(url)` with
 * nothing attached is guaranteed to 401. The panel then renders "Offline"
 * forever — next to another panel, on the same page, showing "Live".
 *
 * That happened twice. The stream route has accepted `?token=` for exactly this
 * reason all along, and two of three callers used it; the third was written by
 * copying a version that predated the fix. A shared opener removes the chance
 * rather than documenting it.
 *
 * Reconnection is part of the contract, not an extra: serverless functions cap
 * execution time, so a long-lived stream is periodically terminated by the
 * platform. Without a retry the panel goes dark after a few minutes and stays
 * that way until someone reloads.
 */
export interface VisitorStream {
  /** Stops reconnecting and closes the current stream. */
  close: () => void;
}

export function openVisitorStream(opts: {
  onData: (payload: unknown) => void;
  onOpen?: () => void;
  onClosed?: () => void;
  retryMs?: number;
}): VisitorStream {
  const retryMs = opts.retryMs ?? 4000;
  let es: EventSource | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const connect = () => {
    if (closed) return;
    const token = typeof window === "undefined" ? null : sessionStorage.getItem("admin-token");
    if (!token) {
      // No session yet. Retry rather than give up: this mounts before the token
      // is written on some routes, and failing permanently there is the same
      // stuck-on-Offline symptom by a different path.
      retry = setTimeout(connect, retryMs);
      return;
    }
    es = new EventSource(`/api/visitors/stream?token=${encodeURIComponent(token)}`);
    es.onopen = () => opts.onOpen?.();
    es.onmessage = (e) => {
      try {
        opts.onData(JSON.parse(e.data));
      } catch {
        /* a malformed frame must not tear down the stream */
      }
    };
    es.onerror = () => {
      opts.onClosed?.();
      es?.close();
      es = null;
      if (!closed) retry = setTimeout(connect, retryMs);
    };
  };
  connect();

  return {
    close: () => {
      closed = true;
      if (retry) clearTimeout(retry);
      es?.close();
      es = null;
    },
  };
}
