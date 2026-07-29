"use client";

import { useCallback } from "react";
import { CheckCheck, Trash2 } from "lucide-react";
import {
  Button, SeverityBadge, DetailRow, RelativeTime, Callout, formatDateTime,
} from "../_kit/primitives";
import { Drawer } from "../_kit/overlays";
import type { AppEvent, Device } from "@/lib/control-plane";
import { eventSeverity } from "../_data/hooks";

interface Props {
  event: AppEvent;
  device: Device | undefined;
  onClose: () => void;
  onMarkRead: () => Promise<void>;
  onDelete: () => Promise<void>;
}

export function EventDrawer({ event, device, onClose, onMarkRead, onDelete }: Props) {
  const sv = eventSeverity(event);

  const handleMarkRead = useCallback(async () => {
    if (!event.read) await onMarkRead();
  }, [event.read, onMarkRead]);

  return (
    <Drawer
      open
      onClose={onClose}
      title={event.title}
      subtitle={<SeverityBadge severity={sv} />}
      footer={
        <div className="flex w-full flex-wrap gap-2">
          {!event.read && (
            <Button icon={CheckCheck} onClick={handleMarkRead} variant="secondary">
              Mark read
            </Button>
          )}
          <Button icon={Trash2} onClick={onDelete} variant="danger">
            Delete
          </Button>
          <Button onClick={onClose} variant="ghost" className="ml-auto">
            Close
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {event.body && (
          <div
            className="rounded-xl px-4 py-3 text-sm"
            style={{ background: "var(--cv-card-hi)", color: "var(--cv-text)" }}
          >
            {event.body}
          </div>
        )}

        <div>
          <DetailRow label="Kind">{event.kind}</DetailRow>
          <DetailRow label="Severity">
            <SeverityBadge severity={sv} />
          </DetailRow>
          <DetailRow label="Time">{formatDateTime(event.ts)}</DetailRow>
          <DetailRow label="Relative">
            <RelativeTime iso={event.ts} />
          </DetailRow>
          <DetailRow label="Status">{event.read ? "Read" : "Unread"}</DetailRow>
          <DetailRow label="Event ID">#{event.id}</DetailRow>
        </div>

        {device && (
          <div>
            <div className="mb-2 text-[13px] font-semibold" style={{ color: "var(--cv-muted)" }}>
              Device
            </div>
            <DetailRow label="Name">{device.name}</DetailRow>
            <DetailRow label="Type">{device.type}</DetailRow>
            {device.room && <DetailRow label="Room">{device.room}</DetailRow>}
            <DetailRow label="Status">{device.online ? "Online" : "Offline"}</DetailRow>
          </div>
        )}

        {!device && event.device_id && (
          <Callout tone="info">
            Device <code>{event.device_id}</code> is not in your fleet — it may have been removed.
          </Callout>
        )}
      </div>
    </Drawer>
  );
}
