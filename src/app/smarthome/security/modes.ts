"use client";

export type ModeId = "home" | "away" | "night" | "disarmed";

export interface ModeConfig {
  /** IDs of scenes to activate when this mode is engaged. */
  sceneIds: number[];
}

export type ModeMap = Record<ModeId, ModeConfig>;

export const DEFAULT_MODE_MAP: ModeMap = {
  home: { sceneIds: [] },
  away: { sceneIds: [] },
  night: { sceneIds: [] },
  disarmed: { sceneIds: [] },
};

export const MODE_IDS: ModeId[] = ["home", "away", "night", "disarmed"];

export interface ModeMeta {
  label: string;
  description: string;
  /** Disarmed is structurally dangerous — flag it in the UI. */
  danger?: boolean;
}

export const MODE_META: Record<ModeId, ModeMeta> = {
  home: {
    label: "Home",
    description: "Normal occupancy — perimeter monitoring active, interior sensors passive.",
  },
  away: {
    label: "Away",
    description: "All occupants out — full perimeter monitoring engaged, all entry points armed.",
  },
  night: {
    label: "Night",
    description: "Sleeping hours — perimeter armed, selective interior motion monitoring.",
  },
  disarmed: {
    label: "Disarmed",
    description: "Security suspended — for maintenance windows or trusted short-term access.",
    danger: true,
  },
};
