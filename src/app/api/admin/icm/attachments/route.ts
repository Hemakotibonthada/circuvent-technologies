import { NextResponse } from "next/server";
import { adminFromRequest, guard } from "@/lib/admin-auth";
import { logger } from "@/lib/logger";
import { deliverNotifications, flushIcm, getIncident, revalidateIcm, updateIncident } from "@/lib/icm-store";
import { addAttachment, removeAttachment } from "@/lib/icm";
import {
  checkIcmAttachment,
  contentDispositionFor,
  icmAttachmentKeyFor,
  ICM_ATTACHMENT_MAX_BYTES,
  sanitiseAttachmentName,
} from "@/lib/icm-attachments";
import { deleteObject, isObjectStoreConfigured, presignGet, putObject } from "@/lib/object-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Files attached to an incident: a screenshot, a log dump, a graph pasted in
 * mid-outage.
 *
 * A sibling of ../route.ts rather than another action on it, because that
 * route's actions all take and return one JSON body and this one takes bytes.
 * Authorisation is the same `guard(request, "icm")` every other ICM route
 * uses — there is no per-incident ACL in this system, so seeing the queue at
 * all is what "only staff who can see the incident" means here.
 *
 * Downloads are a presigned URL (GET, below), never a redirect and never a
 * plain link: a `<a href>` to a route that checks a header carries no
 * Authorization header on a plain navigation, and returns
 * `{"error":"Unauthorized"}` in a blank tab. That bug already shipped twice in
 * this codebase — PrivacyPanel's GDPR export and the attendance CSV buttons —
 * both fixed by fetching with the header first. This does the equivalent by
 * construction: the *request for a link* is authenticated, and the link it
 * hands back is good for a few minutes and needs no header at all.
 */

/** Same fallback and the same reasoning as actorOf() in ../route.ts: an attributed action, or the guard's own "impossible" case. */
function actorOf(request: Request): string {
  const admin = adminFromRequest(request);
  return admin?.email || "unknown";
}

/** Mirrors ../route.ts's notified(): deliver whatever this write made due, then flush before returning. */
async function notified<T>(incident: T): Promise<T> {
  try {
    await deliverNotifications();
  } catch {
    /* deliverNotifications already logs; the write is what the caller asked for. */
  }
  await flushIcm();
  return incident;
}

/** GET /api/admin/icm/attachments?id=…&attachmentId=… — a short-lived download link for one attachment. */
export async function GET(request: Request) {
  if (!guard(request, "icm")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await revalidateIcm();

  const url = new URL(request.url);
  const id = url.searchParams.get("id") || "";
  const attachmentId = url.searchParams.get("attachmentId") || "";

  const incident = getIncident(id);
  if (!incident) return NextResponse.json({ success: false, message: "No such incident." }, { status: 404 });

  const attachment = (incident.attachments ?? []).find((a) => a.id === attachmentId);
  if (!attachment) return NextResponse.json({ success: false, message: "No such attachment." }, { status: 404 });

  /*
   * Five minutes: long enough for a click to open a tab, short enough that a
   * link is not still good after it has been pasted somewhere. Matches the
   * control plane's own presigner (platform/api/src/storage/objects.ts).
   */
  const signedUrl = presignGet(attachment.key, 300, {
    responseContentDisposition: contentDispositionFor(attachment.name),
    responseContentType: attachment.contentType,
  });
  if (!signedUrl) {
    return NextResponse.json(
      { success: false, message: "Attachment storage isn't available on this deployment." },
      { status: 501 },
    );
  }

  return NextResponse.json({
    success: true,
    url: signedUrl,
    name: attachment.name,
    contentType: attachment.contentType,
    size: attachment.size,
  });
}

/** POST /api/admin/icm/attachments — upload. multipart/form-data: `incidentId`, `file`. */
export async function POST(request: Request) {
  if (!guard(request, "icm")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!isObjectStoreConfigured()) {
    // 501, not 500: nothing is broken, the deployment simply has no bucket —
    // see avatar's upload route for the same distinction and why it matters.
    return NextResponse.json(
      { success: false, message: "Attachment uploads aren't available on this deployment." },
      { status: 501 },
    );
  }

  await revalidateIcm();

  /*
   * Read as a minimal shape rather than the ambient `FormData` name.
   *
   * Node's and lib.dom's global FormData declarations do not structurally
   * agree in this toolchain (a `@types/node` version whose own contribution
   * is supposed to be a no-op when dom lib is present, but is not, in
   * practice, here) — so typing this by name is unreliable in a way that has
   * nothing to do with the actual runtime object, which is a real, complete
   * FormData either way. Narrowing this file's own contract to the two calls
   * it actually makes sidesteps the mismatch rather than fighting it.
   */
  interface UploadForm {
    get(name: string): string | File | null;
  }

  async function parseForm(): Promise<UploadForm | null> {
    try {
      return (await request.formData()) as unknown as UploadForm;
    } catch {
      return null;
    }
  }

  const form = await parseForm();
  if (!form) {
    return NextResponse.json({ success: false, message: "Could not read that upload." }, { status: 400 });
  }

  const incidentId = String(form.get("incidentId") || "").trim();
  if (!incidentId) return NextResponse.json({ success: false, message: "An incident is required." }, { status: 400 });

  const incident = getIncident(incidentId);
  if (!incident) return NextResponse.json({ success: false, message: "No such incident." }, { status: 404 });

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, message: "A file is required." }, { status: 400 });
  }

  /* Checked on the declared size before the bytes are pulled into memory,
     exactly as the avatar route checks content-length first. The real check
     is on the bytes below regardless — this only fails fast on the common case. */
  if (file.size > ICM_ATTACHMENT_MAX_BYTES) {
    return NextResponse.json(
      { success: false, message: `Please choose a file under ${Math.round(ICM_ATTACHMENT_MAX_BYTES / (1024 * 1024))} MB.` },
      { status: 413 },
    );
  }

  let buf: Buffer;
  try {
    buf = Buffer.from(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ success: false, message: "Could not read that file." }, { status: 400 });
  }

  const check = checkIcmAttachment(buf, file.type || "application/octet-stream");
  if (!check.ok || !check.type) {
    return NextResponse.json({ success: false, message: check.message }, { status: 400 });
  }

  const key = icmAttachmentKeyFor(incidentId, check.type);
  const stored = await putObject(key, buf, check.type);
  if (!stored) {
    // Never claim success for an upload that did not happen.
    logger.error("icm.attachment_put_failed", { incident: incidentId, key });
    return NextResponse.json(
      { success: false, message: "Could not save that file. Please try again." },
      { status: 502 },
    );
  }

  const actor = actorOf(request);
  const now = new Date().toISOString();
  const { incident: updated, error } = updateIncident(incidentId, (i) =>
    addAttachment(
      i,
      actor,
      { key, name: sanitiseAttachmentName(file.name), size: buf.byteLength, contentType: check.type! },
      now,
    ),
  );

  if (!updated || error) {
    // The object is written but nothing points at it — litter, not a leak,
    // and cheaper to leave than to risk deleting bytes a retry might still need.
    await deleteObject(key);
    return NextResponse.json(
      { success: false, message: error || "Could not save that attachment." },
      { status: error ? 409 : 500 },
    );
  }

  return NextResponse.json({ success: true, incident: await notified(updated) });
}

/** DELETE /api/admin/icm/attachments?id=…&attachmentId=… — remove one attachment. */
export async function DELETE(request: Request) {
  if (!guard(request, "icm")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await revalidateIcm();

  const url = new URL(request.url);
  const id = url.searchParams.get("id") || "";
  const attachmentId = url.searchParams.get("attachmentId") || "";

  const before = getIncident(id);
  const target = before?.attachments?.find((a) => a.id === attachmentId);

  const actor = actorOf(request);
  const now = new Date().toISOString();
  const { incident, error } = updateIncident(id, (i) => removeAttachment(i, actor, attachmentId, now));

  if (!incident) return NextResponse.json({ success: false, message: error }, { status: 404 });
  if (error) return NextResponse.json({ success: false, message: error, incident }, { status: 409 });

  /*
   * The record is the source of truth for whether an incident "has" this
   * attachment, so the response below reflects success as soon as that write
   * lands. Deleting the object is best-effort and logged rather than awaited
   * into the response: a bucket that is briefly unreachable should not turn
   * "removed from the incident" back into "failed to remove", it should leave
   * one orphaned object for a future sweep to find.
   */
  if (target) {
    deleteObject(target.key).then((ok) => {
      if (!ok) logger.error("icm.attachment_delete_failed", { incident: id, key: target.key });
    });
  }

  return NextResponse.json({ success: true, incident: await notified(incident) });
}
