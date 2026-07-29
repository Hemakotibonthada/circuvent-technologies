"use client";

import { useEffect, useState } from "react";
import { KeyRound, QrCode, Copy, Check } from "lucide-react";
import { controlPlane } from "@/lib/control-plane";
import type { GatePass, Device } from "@/lib/control-plane";
import {
  Button,
  Field,
  TextInput,
  SelectInput,
  DetailRow,
  CopyField,
  Callout,
  Badge,
  formatDateTime,
} from "../_kit/primitives";
import { Modal, useToast } from "../_kit/overlays";

const VALIDITY_OPTIONS = [
  { value: "30", label: "30 minutes" },
  { value: "120", label: "2 hours" },
  { value: "480", label: "8 hours" },
  { value: "1440", label: "24 hours" },
  { value: "10080", label: "7 days" },
];

const MAX_USES_OPTIONS = [
  { value: "1", label: "Single use" },
  { value: "3", label: "3 uses" },
  { value: "10", label: "10 uses" },
  { value: "999", label: "Unlimited" },
];

const GATE_TYPES = new Set(["rfid-gate", "facedoor", "smart-lock"]);

async function buildQrDataUrl(data: string): Promise<string | null> {
  try {
    const { toDataURL } = await import("qrcode");
    return await toDataURL(data, { margin: 2, width: 220, color: { dark: "#000000", light: "#ffffff" } });
  } catch {
    return null;
  }
}

interface Props {
  open: boolean;
  onClose: () => void;
  devices: Device[];
  onCreated: () => void;
}

export function GatePassEditor({ open, onClose, devices, onCreated }: Props) {
  const toast = useToast();
  const [label, setLabel] = useState("Guest");
  const [deviceId, setDeviceId] = useState("");
  const [validToMinutes, setValidToMinutes] = useState("120");
  const [maxUses, setMaxUses] = useState("1");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<GatePass | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const gateDevices = devices.filter((d) => GATE_TYPES.has(d.type));

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setLabel("Guest");
      setDeviceId(gateDevices[0]?.id ?? "");
      setValidToMinutes("120");
      setMaxUses("1");
      setCreating(false);
      setCreated(null);
      setQrImage(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Generate QR image from the server-issued pass URL/token
  useEffect(() => {
    if (!created?.qr) return;
    let cancelled = false;
    void buildQrDataUrl(created.qr).then((url) => {
      if (!cancelled) setQrImage(url);
    });
    return () => {
      cancelled = true;
    };
  }, [created?.qr]);

  const handleCreate = async () => {
    if (!deviceId) {
      toast.err("Select a gate device first");
      return;
    }
    setCreating(true);
    const r = await controlPlane.createGatePass({
      deviceId,
      label: label.trim() || "Guest",
      validToMinutes: Number(validToMinutes),
      maxUses: Number(maxUses),
    });
    setCreating(false);
    if (r.ok && (r.data as { pass?: GatePass }).pass) {
      setCreated((r.data as { pass: GatePass }).pass);
      onCreated();
      toast.ok("Gate pass created");
    } else {
      toast.err("Failed to create gate pass");
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      // Clipboard may be blocked in insecure contexts
    }
  };

  const handleClose = () => {
    setCreated(null);
    setQrImage(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={created ? "Pass created" : "Create gate pass"}
      subtitle={
        created
          ? "Share the PIN or QR with your visitor."
          : "Generates a time-limited access code for a gate or door."
      }
      width="md"
      footer={
        created ? (
          <Button onClick={handleClose}>Done</Button>
        ) : (
          <>
            <Button onClick={handleClose}>Cancel</Button>
            <Button
              variant="primary"
              icon={KeyRound}
              onClick={handleCreate}
              busy={creating}
              disabled={!deviceId}
            >
              Create pass
            </Button>
          </>
        )
      }
    >
      {created ? (
        <div className="space-y-5">
          {/* Large PIN — scannable at a glance */}
          <div
            className="rounded-2xl p-6 text-center"
            style={{ background: "var(--cv-card-hi)", border: "1px solid var(--cv-border)" }}
          >
            <div className="mb-1 text-xs font-bold uppercase tracking-widest" style={{ color: "var(--cv-muted)" }}>
              PIN code
            </div>
            <div
              className="my-3 font-mono text-5xl font-extrabold tracking-[0.25em]"
              style={{ color: "var(--cv-accent-hi)" }}
            >
              {created.code}
            </div>
            <button
              onClick={() => copyToClipboard(created.code, "code")}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:brightness-110"
              style={{ background: "var(--cv-input-bg)", border: "1px solid var(--cv-border)", color: "var(--cv-text)" }}
            >
              {copied === "code" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              Copy PIN
            </button>
          </div>

          {/* QR code generated client-side from the server-issued redemption URL */}
          {qrImage ? (
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest" style={{ color: "var(--cv-muted)" }}>
                <QrCode className="h-3.5 w-3.5" />
                QR code
              </div>
              {/* White background is required for QR readability */}
              <img
                src={qrImage}
                alt={`QR code for gate pass ${created.code}`}
                width={220}
                height={220}
                className="rounded-xl border p-2"
                style={{ background: "#fff", borderColor: "var(--cv-border)" }}
              />
              <button
                onClick={() => copyToClipboard(created.qr, "qr")}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:brightness-110"
                style={{ background: "var(--cv-input-bg)", border: "1px solid var(--cv-border)", color: "var(--cv-text)" }}
              >
                {copied === "qr" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                Copy redemption link
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center py-4">
              <div className="text-sm" style={{ color: "var(--cv-muted)" }}>Generating QR…</div>
            </div>
          )}

          <div className="overflow-hidden rounded-2xl" style={{ border: "1px solid var(--cv-border)" }}>
            <DetailRow label="Label">{created.label}</DetailRow>
            <DetailRow label="Device">{created.device_id}</DetailRow>
            <DetailRow label="Valid until">{formatDateTime(created.valid_to)}</DetailRow>
            <DetailRow label="Max uses">
              {created.max_uses === 999 ? "Unlimited" : created.max_uses}
            </DetailRow>
            <DetailRow label="Status">
              <Badge tone="ok">{created.status}</Badge>
            </DetailRow>
          </div>

          <Callout tone="info">
            This pass was issued by the server. The PIN and QR code above are the authoritative credentials — once you close this dialog, you can still see the pass in the list but the full QR link will not be shown again.
          </Callout>
        </div>
      ) : (
        <div className="space-y-4">
          {gateDevices.length === 0 ? (
            <Callout tone="warning" title="No compatible devices">
              No RFID gate, smart door, or smart lock devices are registered in this fleet. Add one before creating a pass.
            </Callout>
          ) : (
            <>
              <Field label="Label — who is this for?">
                <TextInput
                  value={label}
                  onChange={setLabel}
                  placeholder="e.g. Delivery driver, Plumber"
                />
              </Field>

              <Field label="Gate or door device">
                <SelectInput
                  value={deviceId}
                  onChange={setDeviceId}
                  options={gateDevices.map((d) => ({
                    value: d.id,
                    label: `${d.name || d.id}${d.room ? ` · ${d.room}` : ""} (${d.type})`,
                  }))}
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Valid for">
                  <SelectInput
                    value={validToMinutes}
                    onChange={setValidToMinutes}
                    options={VALIDITY_OPTIONS}
                  />
                </Field>
                <Field label="Max uses">
                  <SelectInput
                    value={maxUses}
                    onChange={setMaxUses}
                    options={MAX_USES_OPTIONS}
                  />
                </Field>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
