"use client";

import { Trash2, CheckCheck } from "lucide-react";
import {
  Button,
  SeverityBadge,
  DetailRow,
  RelativeTime,
  Badge,
  Callout,
} from "../_kit/primitives";
import { Drawer, useToast } from "../_kit/overlays";
import { eventSeverity } from "../_data/hooks";
import type { AppEvent } from "@/lib/control-plane";
import type { EventFeed } from "../_data/hooks";

interface Props {
  event: AppEvent | null;
  onClose: () => void;
  feed: EventFeed;
}

export function EventDrawer({ event, onClose, feed }: Props) {
  const toast = useToast();

  const handleMarkRead = async () => {
    await feed.markRead([event!.id]);
    toast.ok("Event marked as read");
    onClose();
  };

  const handleRemove = async () => {
    await feed.remove(event!.id);
    toast.ok("Event dismissed");
    onClose();
  };

  const severity = event ? eventSeverity(event) : "info";

  return (
    <Drawer
      open={!!event}
      onClose={onClose}
      title={event?.title ?? ""}
      subtitle={event ? <SeverityBadge severity={severity} /> : undefined}
      footer={
        event ? (
          <>
            {!event.read && (
              <Button icon={CheckCheck} onClick={handleMarkRead}>
                Mark read
              </Button>
            )}
            <Button icon={Trash2} variant="danger" onClick={handleRemove}>
              Dismiss
            </Button>
          </>
        ) : null
      }
    >
      {event && (
        <div className="space-y-4">
          {event.body && (
            <p className="text-sm leading-relaxed" style={{ color: "var(--cv-text)" }}>
              {event.body}
            </p>
          )}

          {severity === "critical" && (
            <Callout tone="critical" title="Critical security event">
              This event requires immediate attention. Acknowledge or investigate before dismissing.
            </Callout>
          )}

          <div
            className="overflow-hidden rounded-2xl"
            style={{ border: "1px solid var(--cv-border)" }}
          >
            <DetailRow label="Severity">
              <SeverityBadge severity={severity} />
            </DetailRow>
            <DetailRow label="Kind">
              <Badge tone="neutral">{event.kind}</Badge>
            </DetailRow>
            <DetailRow label="Status">
              {event.read ? (
                <span style={{ color: "var(--cv-muted)" }}>Read</span>
              ) : (
                <Badge tone="accent">Unread</Badge>
              )}
            </DetailRow>
            <DetailRow label="Time">
              <RelativeTime iso={event.ts} />
            </DetailRow>
            <DetailRow label="Timestamp">
              {new Date(event.ts).toLocaleString()}
            </DetailRow>
            {event.device_id && (
              <DetailRow label="Device ID">
                <code className="font-mono text-xs" style={{ color: "var(--cv-text)" }}>
                  {event.device_id}
                </code>
              </DetailRow>
            )}
            <DetailRow label="Event ID">#{event.id}</DetailRow>
          </div>
        </div>
      )}
    </Drawer>
  );
}
