/**
 * A one-way channel for library code to report telemetry.
 *
 * TelemetryCollector owns the queue, the batching and the beacon, but it is a
 * React component: importing it from lib/ would drag React into modules that
 * run on the server and in tests. So the collector registers a sink here on
 * mount, and library code calls `emit` without knowing who — if anyone — is
 * listening.
 *
 * Nothing is buffered while there is no sink. A queue that filled up before
 * the collector mounted would flush a burst of events stamped with the wrong
 * moment, and telemetry that lies about when something happened is worse than
 * telemetry that missed it.
 */

export interface EmittedEvent {
  kind: "request" | "dependency" | "exception" | "event";
  path: string;
  method?: string;
  /** For dependencies: which service was called, e.g. "control-plane". */
  target?: string;
  durationMs?: number;
  status?: number;
  ok?: boolean;
  errorType?: string;
  errorMessage?: string;
}

type Sink = (e: EmittedEvent) => void;

let sink: Sink | null = null;

/** Called by TelemetryCollector on mount; the returned function detaches it. */
export function setTelemetrySink(next: Sink): () => void {
  sink = next;
  return () => {
    if (sink === next) sink = null;
  };
}

/** Report an event. A no-op on the server, and before the collector mounts. */
export function emit(e: EmittedEvent): void {
  if (typeof window === "undefined") return;
  try {
    sink?.(e);
  } catch {
    /*
     * Telemetry must never break the thing it is measuring. A throw here would
     * propagate into whatever call was being timed, which would turn a
     * reporting bug into an application failure.
     */
  }
}
