"use client";

// Profile editor — all six ProfilePrefs fields, server-synced via useProfilePrefs().
// Opened as a right-hand Drawer from AccountPanel. Changes write through debounced
// to /api/smarthome/prefs (bearer-authenticated) so they persist across browsers.
// No browser-local callout is shown here because this is not a browser-only preference.

import { useCallback, useMemo, useRef, useState } from "react";
import { Camera, Check, Loader2, MapPin, Phone, Trash2, UserCircle } from "lucide-react";
import { useProfilePrefs } from "@/lib/smarthome-prefs";
import type { ControlUser } from "@/lib/control-plane";
import { AVATAR_COLORS, autoColor, initials } from "../ProfileAvatar";
import { Button, DetailRow, Field, Surface } from "../_kit/primitives";
import { Drawer, useToast } from "../_kit/overlays";

// Matches the cap in src/app/smarthome/profile/page.tsx — the preferences API
// stores prefs as JSON, so an oversized data URL bloats every write.
const MAX_PHOTO_BYTES = 400 * 1024;

// Curated fallback used when Intl.supportedValuesOf is not available (older
// environments). The native list is preferred so operators always see their
// real local zone in the dropdown.
const CURATED_ZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Helsinki",
  "Europe/Moscow",
  "Africa/Cairo",
  "Africa/Nairobi",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Perth",
  "Australia/Sydney",
  "Pacific/Auckland",
];

export default function ProfileEditor({
  open,
  onClose,
  user,
}: {
  open: boolean;
  onClose: () => void;
  user: ControlUser;
}) {
  const { profile, setProfile, loading, error } = useProfilePrefs();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoError, setPhotoError] = useState("");

  // Resolved display name and avatar color for the live preview inside the editor.
  const effectiveName = profile.displayName || user.name;
  const effectiveColor = profile.avatarColor || autoColor(user.email);

  // Pull the full IANA zone list from the runtime when available; fall back to
  // the curated list so the picker always has reasonable options.
  const zones = useMemo<string[]>(() => {
    try {
      const fn = (Intl as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
      return fn ? fn("timeZone") : CURATED_ZONES;
    } catch {
      return CURATED_ZONES;
    }
  }, []);

  const pickPhoto = useCallback(
    (file: File) => {
      setPhotoError("");
      if (!file.type.startsWith("image/")) {
        const msg = "Please choose an image file (JPEG, PNG, WebP…).";
        toast.err("Invalid file type", msg);
        setPhotoError(msg);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const url = String(reader.result ?? "");
        // The check mirrors profile/page.tsx: the data URL string length must
        // stay under MAX_PHOTO_BYTES because prefs are JSON-serialised and the
        // server rejects documents over its size limit.
        if (url.length > MAX_PHOTO_BYTES) {
          const limitKb = Math.round(MAX_PHOTO_BYTES / 1024);
          const msg = `Image is too large. Please choose one under ${limitKb} KB.`;
          toast.err("Photo too large", msg);
          setPhotoError(msg);
          return;
        }
        setProfile({ photo: url });
        setPhotoError("");
        toast.ok("Photo updated");
      };
      reader.onerror = () => {
        const msg = "Could not read that file. Try a different image.";
        toast.err("Read error", msg);
        setPhotoError(msg);
      };
      reader.readAsDataURL(file);
    },
    [setProfile, toast],
  );

  const removePhoto = useCallback(() => {
    setProfile({ photo: "" });
    setPhotoError("");
  }, [setProfile]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Edit profile"
      subtitle="Changes sync to every browser you sign in from."
      footer={
        <Button variant="primary" icon={Check} onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="space-y-7">
        {/* ── Avatar preview + photo controls ───────────── */}
        <section aria-label="Profile picture">
          <div
            className="mb-3 text-[13px] font-semibold"
            style={{ color: "var(--cv-muted)" }}
          >
            Profile picture
          </div>

          <div className="flex items-center gap-4">
            {/* Live preview of the avatar */}
            {profile.photo ? (
              // Data URL from user's file picker; next/image cannot optimise
              // data URLs without a remote pattern, so a plain img is correct.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.photo}
                alt=""
                className="h-20 w-20 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div
                className="grid h-20 w-20 shrink-0 select-none place-items-center rounded-full text-2xl font-bold"
                style={{ background: effectiveColor, color: "#fff" }}
                aria-hidden
              >
                {initials(effectiveName, user.email)}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                icon={Camera}
                onClick={() => fileRef.current?.click()}
              >
                Upload photo
              </Button>
              {profile.photo && (
                <Button variant="ghost" icon={Trash2} onClick={removePhoto}>
                  Remove
                </Button>
              )}
            </div>
          </div>

          {/* Hidden file input — accept only images */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            aria-label="Upload profile photo"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) pickPhoto(f);
              // Reset so the same file can be picked again after a rejection.
              e.target.value = "";
            }}
          />

          {photoError && (
            <p className="mt-2 text-xs" style={{ color: "#dc2626" }}>
              {photoError}
            </p>
          )}

          {/* Initials colour picker — hidden while a photo is set */}
          {!profile.photo && (
            <div className="mt-5">
              <div
                className="mb-2.5 text-[13px] font-semibold"
                style={{ color: "var(--cv-muted)" }}
              >
                Initials colour
              </div>
              <div className="flex flex-wrap gap-2.5">
                {AVATAR_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setProfile({ avatarColor: c })}
                    aria-label={`Set avatar colour to ${c}`}
                    aria-pressed={effectiveColor === c}
                    className="h-9 w-9 rounded-full transition focus:outline-none focus-visible:ring-2"
                    style={
                      {
                        background: c,
                        outline:
                          effectiveColor === c
                            ? "3px solid var(--cv-text)"
                            : "3px solid transparent",
                        outlineOffset: 2,
                        "--tw-ring-color": c,
                      } as React.CSSProperties
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ── Editable fields ───────────────────────────── */}
        <section aria-label="Profile fields">
          <div
            className="mb-3 text-[13px] font-semibold"
            style={{ color: "var(--cv-muted)" }}
          >
            Profile
          </div>
          <div className="space-y-4">
            <Field
              label="Display name"
              hint="Shown throughout the console. Falls back to your account name when empty."
            >
              {/* onBlur writes through; onChange would fire on every keystroke. */}
              <input
                className="cv-input text-sm"
                defaultValue={profile.displayName}
                placeholder={user.name}
                maxLength={60}
                onBlur={(e) => setProfile({ displayName: e.target.value.trim() })}
              />
            </Field>

            <Field
              label="Headline"
              hint="Short note shown under your name, e.g. 'Ground floor, Block B'."
            >
              <input
                className="cv-input text-sm"
                defaultValue={profile.headline}
                placeholder="e.g. Ground floor, Block B"
                maxLength={80}
                onBlur={(e) => setProfile({ headline: e.target.value.trim() })}
              />
            </Field>

            <Field label="Phone">
              <input
                className="cv-input text-sm"
                type="tel"
                defaultValue={profile.phone}
                placeholder="+1 …"
                maxLength={24}
                onBlur={(e) => setProfile({ phone: e.target.value.trim() })}
              />
            </Field>

            <Field
              label="Time zone"
              hint="Controls how timestamps are displayed. 'Follow this browser' uses the device's local zone."
            >
              {/* Timezone is a select so every change persists immediately —
                  operators can try zones and see the effect right away. */}
              <select
                className="cv-input text-sm"
                value={profile.timeZone}
                onChange={(e) => setProfile({ timeZone: e.target.value })}
              >
                <option value="">Follow this browser</option>
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        {/* ── Read-only account identity ─────────────────── */}
        <section aria-label="Account identity">
          <div
            className="mb-3 text-[13px] font-semibold"
            style={{ color: "var(--cv-muted)" }}
          >
            Account identity
          </div>
          <Surface padded={false}>
            <div className="px-4 py-1">
              <DetailRow label="Email">{user.email}</DetailRow>
              <DetailRow label="Account name">{user.name || "—"}</DetailRow>
              <DetailRow label="User ID">{user.id}</DetailRow>
            </div>
          </Surface>
          <p className="mt-2 text-xs" style={{ color: "var(--cv-muted)" }}>
            Email is your account identity and cannot be changed here. Contact your administrator to
            update it.
          </p>
        </section>

        {/* ── Sync status ───────────────────────────────── */}
        {(loading || error) && (
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--cv-muted)" }}>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {loading && !error && <span>Syncing…</span>}
            {error && (
              <span style={{ color: "#b45309" }}>{error}</span>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
}
