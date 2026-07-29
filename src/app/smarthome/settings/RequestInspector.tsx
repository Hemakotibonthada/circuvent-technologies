"use client";

// Request inspector: lets an operator issue a real, authenticated read-only
// call to the control plane and inspect the raw JSON response.
// Write operations (command, claim, delete, patch) are deliberately excluded.

import { useState } from "react";
import { Play } from "lucide-react";
import { controlPlane } from "@/lib/control-plane";
import { Button, Callout, Field, SelectInput } from "../_kit/primitives";
import { useToast } from "../_kit/overlays";

type ReadMethod =
  | "devices"
  | "rooms"
  | "scenes"
  | "automations"
  | "events"
  | "energySummary"
  | "unreadCount"
  | "gatePasses"
  | "adminMe"
  | "adminHealth"
  | "adminStats";

const METHOD_OPTIONS: { value: ReadMethod; label: string }[] = [
  { value: "devices", label: "GET /devices" },
  { value: "rooms", label: "GET /rooms" },
  { value: "scenes", label: "GET /scenes" },
  { value: "automations", label: "GET /automations" },
  { value: "events", label: "GET /events?limit=20" },
  { value: "energySummary", label: "GET /energy/summary" },
  { value: "unreadCount", label: "GET /events/unread-count" },
  { value: "gatePasses", label: "GET /gate/passes" },
  { value: "adminMe", label: "GET /admin/me" },
  { value: "adminHealth", label: "GET /admin/health" },
  { value: "adminStats", label: "GET /admin/stats" },
];

async function dispatch(method: ReadMethod) {
  switch (method) {
    case "devices":
      return controlPlane.devices();
    case "rooms":
      return controlPlane.rooms();
    case "scenes":
      return controlPlane.scenes();
    case "automations":
      return controlPlane.automations();
    case "events":
      return controlPlane.events(20);
    case "energySummary":
      return controlPlane.energySummary();
    case "unreadCount":
      return controlPlane.unreadCount();
    case "gatePasses":
      return controlPlane.gatePasses();
    case "adminMe":
      return controlPlane.adminMe();
    case "adminHealth":
      return controlPlane.adminHealth();
    case "adminStats":
      return controlPlane.adminStats();
  }
}

export default function RequestInspector() {
  const [method, setMethod] = useState<ReadMethod>("devices");
  const [result, setResult] = useState<unknown>(null);
  const [httpStatus, setHttpStatus] = useState<number | null>(null);
  const [rtt, setRtt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const run = async () => {
    setBusy(true);
    const t0 = performance.now();
    const r = await dispatch(method);
    const elapsed = Math.round(performance.now() - t0);
    setRtt(elapsed);
    setHttpStatus(r.status);
    setResult(r.data);
    setBusy(false);
    if (!r.ok) {
      toast.err(
        "Request failed",
        r.status === 0 ? "Network error" : `HTTP ${r.status}`,
      );
    }
  };

  return (
    <div className="space-y-4">
      <Callout tone="info">
        Issues a real, authenticated read-only request to the control plane. The response is shown
        exactly as returned. Write operations are not available in this inspector.
      </Callout>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <Field label="Endpoint">
            <SelectInput<ReadMethod>
              value={method}
              onChange={setMethod}
              options={METHOD_OPTIONS}
            />
          </Field>
        </div>
        <Button variant="primary" icon={Play} onClick={run} busy={busy}>
          Send
        </Button>
      </div>

      {result !== null && (
        <div
          className="overflow-hidden rounded-2xl border"
          style={{ borderColor: "var(--cv-border)" }}
        >
          {/* Response metadata bar */}
          <div
            className="flex items-center justify-between border-b px-4 py-2.5"
            style={{ borderColor: "var(--cv-border)", background: "var(--cv-card-hi)" }}
          >
            <span className="text-xs font-bold" style={{ color: "var(--cv-muted)" }}>
              Response
            </span>
            <span className="text-xs tabular-nums" style={{ color: "var(--cv-text)" }}>
              HTTP{" "}
              <strong
                style={{
                  color:
                    httpStatus != null && httpStatus >= 200 && httpStatus < 300
                      ? "#16a34a"
                      : "#dc2626",
                }}
              >
                {httpStatus === 0 ? "network error" : httpStatus}
              </strong>{" "}
              · {rtt}ms
            </span>
          </div>

          {/* Raw JSON */}
          <pre
            className="overflow-x-auto p-4 text-xs"
            style={{
              background: "var(--cv-input-bg)",
              color: "var(--cv-text)",
              maxHeight: 400,
              fontFamily: "var(--font-mono, ui-monospace, monospace)",
              borderRadius: "0 0 1rem 1rem",
            }}
          >
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
