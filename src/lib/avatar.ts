// Profile picture rules, shared by the upload route and its tests.
//
// The browser downscales to a square JPEG before uploading (see AvatarPicker),
// so everything here is a backstop rather than the main event — but it is the
// only part an attacker cannot skip by calling the endpoint directly.

import { createHash, randomBytes } from "node:crypto";

/**
 * Ceiling on what will be stored.
 *
 * The client sends a 256×256 JPEG, which lands around 15–30 KB. 512 KB is
 * generous enough that an unusual image still succeeds and small enough that
 * the endpoint cannot be used as free storage.
 */
export const AVATAR_MAX_BYTES = 512 * 1024;

/** What the picker produces, and the only formats accepted. */
export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type AvatarType = (typeof AVATAR_TYPES)[number];

/**
 * Identifies an image from its leading bytes.
 *
 * The Content-Type header is written by the caller and means nothing: an
 * upload announcing `image/jpeg` can hold anything at all. Since these bytes
 * are served back later, believing the header is how a bucket ends up serving
 * an HTML document — with the site's own origin on it — from a URL that a
 * customer put there.
 *
 * Returns null for anything not recognised, which is a refusal, not a guess.
 */
export function sniffImageType(buf: Buffer): AvatarType | null {
  if (buf.length < 12) return null;

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "image/png";
  }

  // WebP: "RIFF" .... "WEBP"
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }

  return null;
}

const EXT: Record<AvatarType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Where one account's picture lives.
 *
 * The address is hashed rather than used directly: object keys turn up in
 * bucket listings, access logs and error messages, and "avatars/a@b.com.jpg"
 * puts a customer's email address in all of them.
 *
 * The random suffix makes every upload a new key, which is what lets the
 * objects be cached immutably and stops a replaced picture being served from
 * a cache that never heard about the replacement.
 */
export function avatarKeyFor(email: string, type: AvatarType): string {
  const who = createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 32);
  return `avatars/${who}/${randomBytes(8).toString("hex")}.${EXT[type]}`;
}

export interface AvatarCheck {
  ok: boolean;
  /** Present when ok. */
  type?: AvatarType;
  /** Present when not ok — safe to show a customer. */
  message?: string;
}

/** The single gate every upload passes through. */
export function checkAvatar(buf: Buffer): AvatarCheck {
  if (!buf.length) return { ok: false, message: "That file was empty." };
  if (buf.length > AVATAR_MAX_BYTES) {
    return { ok: false, message: `Please choose an image under ${Math.round(AVATAR_MAX_BYTES / 1024)} KB.` };
  }
  const type = sniffImageType(buf);
  if (!type) return { ok: false, message: "That doesn't look like a JPEG, PNG or WebP image." };
  return { ok: true, type };
}
