// Rules for what an incident is allowed to have attached, shared by the
// upload route and its tests. Mirrors avatar.ts's shape deliberately: same
// problem (bytes a client controls, about to be stored and served back),
// same answer (a size ceiling and a type check that trusts bytes, not the
// header the client sent them with).
//
// WHY UPLOADS ARE PROXIED THROUGH THIS SERVER RATHER THAN PRESIGNED
//
// Downloads are presigned (see icm/attachments/route.ts) because a large file
// only needs to leave R2 once and there is no reason for this app's own
// function to sit in the middle of that. Uploads are different: Vercel caps a
// serverless function's request body at 4.5 MB, and that ceiling cannot be
// raised — so ICM_ATTACHMENT_MAX_BYTES is set safely under it. The trade is
// worth making here specifically because the upload path is where the actual
// bytes can still be inspected: a presigned PUT would hand a client a URL that
// goes straight to the bucket, and the only content check left would be the
// Content-Type header the client already chose to send — exactly what
// sniffing below exists to not trust. Larger attachments (video, big log
// bundles) are a real gap this leaves; the fix is a presigned PUT plus a
// follow-up HEAD to verify what actually landed, not implemented here.
import { randomBytes } from "node:crypto";
import { sniffImageType } from "./avatar";

/**
 * Ceiling on what will be stored.
 *
 * 4 MB, not the 4.5 MB Vercel enforces: multipart/form-data adds its own
 * overhead, and the failure mode of cutting it too close is a request that
 * Vercel's edge rejects with a bare 413 before this module's nicer message —
 * "please choose a file under..." — ever gets a chance to run.
 */
export const ICM_ATTACHMENT_MAX_BYTES = 4 * 1024 * 1024;

/**
 * What an incident is allowed to have attached.
 *
 * No `text/html`, no `image/svg+xml`: both can carry a `<script>` that runs
 * with this origin's cookies if the object is ever opened rather than
 * downloaded. Belt and braces rather than the only guard — every download
 * also forces `Content-Disposition: attachment` (see the GET handler) and the
 * site already sends `X-Content-Type-Options: nosniff` — but a bucket is
 * forever, and a future change to either of those should not turn this
 * allowlist into the only thing standing between an attachment and stored XSS.
 */
export const ICM_ATTACHMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/zip",
  "text/plain",
  "text/csv",
  "application/json",
  "application/octet-stream",
] as const;

export type IcmAttachmentType = (typeof ICM_ATTACHMENT_TYPES)[number];

const EXT: Record<IcmAttachmentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/json": "json",
  "application/octet-stream": "bin",
};

/** No NUL and no control bytes below a tab — real text doesn't have them; a mislabeled binary usually does. */
function looksLikeText(buf: Buffer): boolean {
  const head = buf.subarray(0, Math.min(buf.length, 4096));
  for (const b of head) {
    if (b === 0 || (b < 0x09 && b !== 0x0a && b !== 0x0d)) return false;
  }
  return true;
}

/** Starts with `{` or `[` once leading whitespace is skipped — not a parse, just enough to catch a wrong file picked by mistake. */
function looksLikeJson(buf: Buffer): boolean {
  const head = buf.subarray(0, Math.min(buf.length, 64)).toString("utf8").trimStart();
  return head.startsWith("{") || head.startsWith("[");
}

/**
 * Identifies a file from its leading bytes where that is possible at all.
 *
 * Images, PDF and zip have real signatures and are checked against them,
 * exactly like avatar.ts's `sniffImageType` — reused here for the three
 * formats the two modules share rather than re-implemented. Plain text, CSV
 * and JSON have no such signature; anything can be typed `text/plain`. For
 * those the check is only that the bytes are not obviously something else
 * wearing that label, which is why `checkIcmAttachment`'s doc calls this a
 * backstop and not the main event.
 */
export function sniffIcmAttachmentType(buf: Buffer, declared: string): IcmAttachmentType | null {
  const img = sniffImageType(buf);
  if (img) return img;

  if (buf.length >= 6 && (buf.toString("ascii", 0, 6) === "GIF87a" || buf.toString("ascii", 0, 6) === "GIF89a")) {
    return "image/gif";
  }
  if (buf.length >= 5 && buf.toString("ascii", 0, 5) === "%PDF-") return "application/pdf";
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && [0x03, 0x05, 0x07].includes(buf[2])) {
    return "application/zip";
  }

  if (declared === "application/json" && looksLikeJson(buf)) return "application/json";
  if ((declared === "text/plain" || declared === "text/csv") && looksLikeText(buf)) return declared;
  /*
   * Believed only because there is nothing left to check it against — the
   * point of this type existing at all is for the log dumps and other binary
   * files that have no signature of their own. What keeps an octet-stream
   * upload safe is the same belt-and-braces described on ICM_ATTACHMENT_TYPES,
   * not this function.
   */
  if (declared === "application/octet-stream") return "application/octet-stream";

  return null;
}

export interface IcmAttachmentCheck {
  ok: boolean;
  /** Present when ok. */
  type?: IcmAttachmentType;
  /** Present when not ok — safe to show whoever is uploading. */
  message?: string;
}

/** The single gate every upload passes through. */
export function checkIcmAttachment(buf: Buffer, declaredType: string): IcmAttachmentCheck {
  if (!buf.length) return { ok: false, message: "That file was empty." };
  if (buf.length > ICM_ATTACHMENT_MAX_BYTES) {
    return {
      ok: false,
      message: `Please choose a file under ${Math.round(ICM_ATTACHMENT_MAX_BYTES / (1024 * 1024))} MB.`,
    };
  }
  const type = sniffIcmAttachmentType(buf, declaredType.toLowerCase().trim());
  if (!type) {
    return { ok: false, message: "That file type isn't supported here." };
  }
  return { ok: true, type };
}

/**
 * Where one attachment's bytes live.
 *
 * Built from the incident id and a random suffix — never from the uploader's
 * filename. A key derived from the display name is a key an attacker chooses
 * the shape of, and it is also how two files called "screenshot.png" on the
 * same incident would collide. The incident id prefix is what lets every
 * attachment for one incident be found (and, if it is ever needed, deleted)
 * as a single prefix rather than by scanning a flat namespace.
 */
export function icmAttachmentKeyFor(incidentId: string, type: IcmAttachmentType): string {
  const safeId = incidentId.replace(/[^A-Za-z0-9-]/g, "") || "incident";
  return `icm/${safeId}/${randomBytes(8).toString("hex")}.${EXT[type]}`;
}

/** Bounds and cleans whatever the uploader's browser called the file, before it is kept as display metadata. */
export function sanitiseAttachmentName(raw: string): string {
  const cleaned = raw
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 200) || "attachment";
}

/**
 * A `Content-Disposition` value safe to sign into a presigned download.
 *
 * Carries the name twice, per RFC 6266. `filename=` is ASCII-only — anything
 * outside the printable range is replaced with `_` — because it is the form
 * every browser falls back to. `filename*` carries the exact UTF-8 name for
 * the browsers that read it, which by now is all of them; without it, an
 * attachment named with an accent or a non-Latin script downloads with its
 * name silently flattened to underscores instead of the name it was given.
 */
export function contentDispositionFor(name: string): string {
  const clean = sanitiseAttachmentName(name);
  const ascii = clean.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}
