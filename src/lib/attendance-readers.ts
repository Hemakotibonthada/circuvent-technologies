/**
 * The device types that read attendance cards.
 *
 * There are two models and they differ in what they can decide, not in what
 * they are for:
 *
 *   rfid-attend  caches the roster, decides access locally, drives a door, and
 *                keeps working through a network outage.
 *   rfid-only    reads the card and reports it. No roster, no door, no local
 *                decision — the server decides and the console registers.
 *
 * Both are terminals, both feed the same register, and both must appear
 * everywhere a reader can appear. This exists because that list was four
 * separate string literals — the presence check, the terminal picker, the
 * device tile and the shop icon — and adding the second model meant finding
 * all four. Missing one is silent in the worst way: a reader that is plugged
 * in, online and scanning, but that the console offers no way to register, so
 * every card it reads is discarded with no error anywhere.
 */
export const ATTENDANCE_READER_TYPES = ["rfid-attend", "rfid-only"] as const;

export type AttendanceReaderType = (typeof ATTENDANCE_READER_TYPES)[number];

/** True when this device is a card reader of either model. */
export function isAttendanceReader(type: string | null | undefined): boolean {
  return !!type && (ATTENDANCE_READER_TYPES as readonly string[]).includes(type);
}
