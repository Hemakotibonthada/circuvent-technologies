"use client";

import { useState } from "react";
import { Bell, BellOff, Check, Edit2, LogOut, Mail, ShieldCheck } from "lucide-react";
import { useConsole } from "../ConsoleProvider";
import { useIsAdmin } from "../_data/hooks";
import { useProfilePrefs } from "@/lib/smarthome-prefs";
import {
  Badge,
  Button,
  Callout,
  DetailRow,
  SectionTitle,
  Skeleton,
  StatusDot,
  Surface,
} from "../_kit/primitives";
import { ConfirmDialog, useToast } from "../_kit/overlays";
import ProfileAvatar from "../ProfileAvatar";
import ProfileEditor from "./ProfileEditor";
import PasswordSection from "./PasswordSection";
import PasskeySection from "./PasskeySection";
import AssistantsSection from "./AssistantsSection";

export default function AccountPanel() {
  const { user, ready, liveStatus, notifyPermission, enableNotifications, logout } = useConsole();
  const { isAdmin, checked: adminChecked } = useIsAdmin();
  const { profile } = useProfilePrefs();
  const toast = useToast();
  const [editorOpen, setEditorOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const handleEnableNotifications = async () => {
    await enableNotifications();
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      toast.ok("Notifications enabled", "This browser will receive device alerts.");
    }
  };

  if (!ready) {
    return (
      <div className="space-y-4 pt-2">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-36 rounded-2xl" />
      </div>
    );
  }

  if (!user) {
    return (
      <Callout tone="warning" title="Not signed in">
        Sign in to view and manage your account.
      </Callout>
    );
  }

  // After the guard above TypeScript narrows `user` to ControlUser.
  const effectiveName = profile.displayName || user.name;

  return (
    <div className="space-y-6 pt-1">
      {/* ── Identity card ─────────────────────────────── */}
      <Surface>
        <div className="flex items-center gap-4">
          {/* Avatar with inline camera edit trigger */}
          <div className="relative shrink-0">
            <ProfileAvatar name={user.name} email={user.email} size={64} />
            <button
              onClick={() => setEditorOpen(true)}
              aria-label="Edit profile picture"
              className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full shadow-md transition hover:brightness-110 focus:outline-none focus-visible:ring-2"
              style={
                {
                  background: "var(--cv-gradient)",
                  color: "#fff",
                  "--tw-ring-color": "var(--cv-accent)",
                } as React.CSSProperties
              }
            >
              <Edit2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="min-w-0 flex-1">
            <div
              className="truncate text-base font-extrabold"
              style={{ color: "var(--cv-text)" }}
            >
              {effectiveName || user.email}
            </div>
            {profile.headline && (
              <div className="mt-0.5 truncate text-sm" style={{ color: "var(--cv-muted)" }}>
                {profile.headline}
              </div>
            )}
            <div
              className="mt-0.5 flex items-center gap-1.5 text-xs"
              style={{ color: "var(--cv-muted)" }}
            >
              <Mail className="h-3 w-3 shrink-0" />
              <span className="truncate">{user.email}</span>
            </div>
            {adminChecked && isAdmin && (
              <div className="mt-2">
                <Badge tone="accent" icon={ShieldCheck}>
                  Administrator
                </Badge>
              </div>
            )}
          </div>

          <Button
            variant="secondary"
            icon={Edit2}
            onClick={() => setEditorOpen(true)}
            className="shrink-0"
          >
            Edit
          </Button>
        </div>
      </Surface>

      {/* ── Account details ───────────────────────────── */}
      <SectionTitle>Account details</SectionTitle>
      <Surface padded={false}>
        <div className="px-5 py-1">
          <DetailRow label="User ID">{user.id}</DetailRow>
          <DetailRow label="Display name">{effectiveName || "—"}</DetailRow>
          <DetailRow label="Email">{user.email}</DetailRow>
          {profile.phone && <DetailRow label="Phone">{profile.phone}</DetailRow>}
          {profile.timeZone && (
            <DetailRow label="Time zone">{profile.timeZone}</DetailRow>
          )}
          <DetailRow label="Role">
            {adminChecked ? (isAdmin ? "Administrator" : "Operator") : "—"}
          </DetailRow>
        </div>
      </Surface>
      <Callout tone="info">
        Email is your account identity and cannot be changed here. Display name, photo and contact
        details are synced to every browser you sign in from.
      </Callout>

      {/* ── Session ───────────────────────────────────── */}
      <SectionTitle>Session</SectionTitle>
      <Surface padded={false}>
        <div className="px-5 py-1">
          <DetailRow label="Realtime link">
            <span
              className="inline-flex items-center gap-2"
              style={{
                color:
                  liveStatus === "live"
                    ? "#16a34a"
                    : liveStatus === "connecting"
                      ? "var(--cv-accent)"
                      : "#dc2626",
              }}
            >
              <StatusDot online={liveStatus === "live"} pulse={liveStatus === "live"} />
              {liveStatus === "live"
                ? "Connected"
                : liveStatus === "connecting"
                  ? "Connecting…"
                  : "Offline"}
            </span>
          </DetailRow>
          <DetailRow label="Notification permission">
            {notifyPermission === "granted"
              ? "Granted"
              : notifyPermission === "denied"
                ? "Denied"
                : notifyPermission === "unsupported"
                  ? "Not supported"
                  : "Not requested"}
          </DetailRow>
        </div>
      </Surface>

      {/* ── Browser notifications ─────────────────────── */}
      <SectionTitle>Browser notifications</SectionTitle>
      <Surface>
        {notifyPermission === "granted" ? (
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ background: "var(--cv-gradient)", color: "#fff" }}
            >
              <Bell className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold" style={{ color: "var(--cv-text)" }}>
                Notifications enabled
              </div>
              <div className="text-xs" style={{ color: "var(--cv-muted)" }}>
                This browser will receive real-time alerts for device events.
              </div>
            </div>
            <Check className="h-5 w-5 shrink-0" style={{ color: "#16a34a" }} />
          </div>
        ) : notifyPermission === "denied" ? (
          <div className="flex items-start gap-3">
            <BellOff className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--cv-muted)" }} />
            <div className="text-sm" style={{ color: "var(--cv-muted)" }}>
              Notifications are blocked. Open your browser settings and allow notifications for
              this site to re-enable them.
            </div>
          </div>
        ) : notifyPermission === "unsupported" ? (
          <div className="text-sm" style={{ color: "var(--cv-muted)" }}>
            This browser does not support the Notifications API.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-sm" style={{ color: "var(--cv-text)" }}>
              Enable browser notifications to receive real-time alerts for device events, security
              triggers and automations — even when this tab is in the background.
            </div>
            <Button variant="primary" icon={Bell} onClick={handleEnableNotifications}>
              Enable notifications
            </Button>
          </div>
        )}
      </Surface>

      {/* ── Password & other devices ──────────────────── */}
      <PasswordSection />
      <PasskeySection />
      <AssistantsSection />

      {/* ── Sign out ──────────────────────────────────── */}
      <SectionTitle>Session actions</SectionTitle>
      <Button variant="danger" icon={LogOut} onClick={() => setConfirmLogout(true)}>
        Sign out
      </Button>

      {/* Profile editor — only mounted when user is confirmed non-null */}
      <ProfileEditor open={editorOpen} onClose={() => setEditorOpen(false)} user={user} />

      <ConfirmDialog
        open={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        onConfirm={() => {
          logout();
          setConfirmLogout(false);
        }}
        title="Sign out"
        body="You will be returned to the login screen. Locally-saved preferences remain on this device."
        confirmLabel="Sign out"
        danger
      />
    </div>
  );
}
