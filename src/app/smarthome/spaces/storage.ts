"use client";

// Types for the three locally-persisted configuration domains in Spaces.
// None of these have a server endpoint — they are stored in localStorage via
// usePersistentState and must be labelled as such wherever they appear in UI.

export interface DeviceGroup {
  id: string;
  name: string;
  icon: string;
  deviceIds: string[];
  createdAt: string;
}

export interface Site {
  id: string;
  name: string;
  address: string;
  timezone: string;
  roomNames: string[];
  createdAt: string;
}

export interface FloorPin {
  deviceId: string;
  /** Grid units (0–1000). Converted to SVG coordinates at render time. */
  x: number;
  y: number;
}

export interface FloorRoom {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FloorLayout {
  rooms: FloorRoom[];
  pins: FloorPin[];
  zoom: number;
}

export const EMPTY_LAYOUT: FloorLayout = { rooms: [], pins: [], zoom: 1 };

export const ROOM_ICONS = ["🏠", "🛋️", "🍳", "🛁", "🛏️", "💼", "🌿", "🚗", "🌡️", "💡"] as const;
export const GROUP_ICONS = ["💡", "🔌", "🚪", "🌡️", "🛡️", "🌿", "🏠", "⚡", "🎛️", "🌊"] as const;
export const TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Australia/Sydney",
] as const;
