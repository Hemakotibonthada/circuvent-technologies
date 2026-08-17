// Firmware & Changelog Hub — the latest known firmware per device type, so a
// user can see whether their device is behind and what changed.
//
// The catalogue is GENERATED from the firmware sources, which declare their own
// version and document their own history. It used to be hand-maintained and had
// drifted into fiction: twelve of thirteen entries advertised versions that were
// never built, the camera was fourteen minor versions stale in the other
// direction, and eleven device types were missing altogether.
//
// That is not a cosmetic problem. `isBehind` compares a device's reported
// version against this, so an invented "latest" tells every unit running the
// newest firmware there is that it is out of date, permanently — and an OTA
// campaign filtered on version matches nothing. The hub's own history records
// that exact failure happening once before.
//
// Regenerate after changing any firmware:
//   node scripts/generate-firmware-catalog.cjs

import { GENERATED_FIRMWARE_CATALOG } from "./firmware-catalog.generated";

export interface FirmwareInfo {
  deviceType: string;
  latestVersion: string;
  changelog: { version: string; notes: string[] }[];
}

export const FIRMWARE_CATALOG: FirmwareInfo[] = GENERATED_FIRMWARE_CATALOG;

export function getFirmwareInfo(deviceType: string): FirmwareInfo | undefined {
  return FIRMWARE_CATALOG.find((f) => f.deviceType === deviceType);
}

/** True when a device's reported fw_version is older than the catalog's latest (string compare on dotted versions). */
export function isBehind(current: string | undefined, latest: string): boolean {
  if (!current) return true;
  const a = current.split(".").map(Number);
  const b = latest.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}
