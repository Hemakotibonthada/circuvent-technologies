"use client";

// Shared account avatar. The profile page and the sidebar must always agree on
// what a user looks like, so the initials, colour and uploaded-photo lookup all
// live here rather than being re-derived per call site.

import { useProfilePrefs } from "@/lib/smarthome-prefs";

/** Palette offered for the initials avatar. */
export const AVATAR_COLORS = [
  "#0ea5e9",
  "#8b5cf6",
  "#ec4899",
  "#f97316",
  "#10b981",
  "#f59e0b",
  "#6366f1",
  "#14b8a6",
];

export function initials(name: string, email: string): string {
  const src = name.trim() || email.split("@")[0] || "";
  const parts = src.split(/[\s._-]+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Stable colour derived from the email so an un-customised avatar never shifts. */
export function autoColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function firstName(name: string, email: string): string {
  const src = name.trim() || email.split("@")[0] || "there";
  return src.split(/[\s._-]+/)[0] || src;
}

export default function ProfileAvatar({
  name,
  email,
  size = 32,
  className = "",
}: {
  name: string;
  email: string;
  size?: number;
  className?: string;
}) {
  const { profile } = useProfilePrefs();
  const display = profile.displayName || name;
  const color = profile.avatarColor || autoColor(email);
  const box = { width: size, height: size };

  if (profile.photo) {
    return (
      // Data URL from the user's own file picker: next/image cannot optimise
      // these without a remote pattern, so a plain img is the correct element.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={profile.photo} alt="" style={box} className={`shrink-0 rounded-full object-cover ${className}`} />
    );
  }
  return (
    <span
      aria-hidden
      style={{ ...box, background: color, fontSize: Math.round(size * 0.4) }}
      className={`grid shrink-0 place-items-center rounded-full font-bold text-white ${className}`}
    >
      {initials(display, email)}
    </span>
  );
}
