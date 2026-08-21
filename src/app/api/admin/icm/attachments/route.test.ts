/**
 * @jest-environment node
 *
 * jsdom has no Request/Response/File/FormData; a route handler that reads a
 * multipart upload cannot be exercised there. Mirrors ../route.test.ts, which
 * documents the same reason for the same annotation.
 */
import { GET, POST, DELETE } from "./route";
import { fileIncident, getIncident } from "@/lib/icm-store";
import { ICM_ATTACHMENT_MAX_BYTES, contentDispositionFor } from "@/lib/icm-attachments";

let who = "ops@circuvent.com";
let allowed = true;
jest.mock("@/lib/admin-auth", () => ({
  guard: () => (allowed ? { email: who } : null),
  adminFromRequest: () => (allowed ? { email: who } : null),
}));

/*
 * icm-store's deliverNotifications dynamically imports order-core's sendMail.
 * Mocked for the same reason ../route.test.ts mocks it: what these tests are
 * about is the attachments route's own HTTP behaviour, not whether a page
 * goes out when an incident changes.
 */
jest.mock("@/lib/order-core", () => ({
  sendMail: jest.fn(async () => true),
}));

/*
 * The one seam this suite actually cares about controlling: whether the
 * bucket is configured, and whether a put/delete/presign succeeds. Real
 * validation (checkIcmAttachment, icmAttachmentKeyFor, contentDispositionFor)
 * is left unmocked on purpose — it is the route's actual contract with an
 * uploader, and stubbing it here would just prove the mock works.
 */
let configured = true;
const put = jest.fn(async (_key: string, _body: Buffer, _type?: string) => true);
const del = jest.fn(async (_key: string) => true);
const presign = jest.fn(
  (_key: string, _expires?: number, _opts?: Record<string, string>) =>
    "https://example.r2.cloudflarestorage.com/signed" as string | null,
);
jest.mock("@/lib/object-store", () => ({
  isObjectStoreConfigured: () => configured,
  putObject: (...args: [string, Buffer, string?]) => put(...args),
  deleteObject: (...args: [string]) => del(...args),
  presignGet: (...args: [string, number?, Record<string, string>?]) => presign(...args),
}));

const url = "https://circuvent.com/api/admin/icm/attachments";
const get = (qs: string) => GET(new Request(`${url}${qs}`));
const post = (form: FormData) => POST(new Request(url, { method: "POST", body: form }));
const del2 = (qs: string) => DELETE(new Request(`${url}${qs}`, { method: "DELETE" }));

/** A fresh incident so each test owns its own record instead of sharing state with the others. */
function newIncident(title = "Gateway timeouts") {
  return fileIncident({ title, severity: 2, owningTeam: "Platform", createdBy: "ops@circuvent.com" });
}

/** Real PNG magic bytes — sniffing is the route's actual contract here and is deliberately not mocked. */
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

/** A small, real text file — the sniffing it must pass is the route's, and is deliberately not mocked. */
function uploadForm(
  incidentId: string,
  opts: { name?: string; type?: string; bytes?: Uint8Array<ArrayBuffer> } = {},
) {
  const form = new FormData();
  form.set("incidentId", incidentId);
  const bytes = opts.bytes ?? new TextEncoder().encode("hello world");
  form.set("file", new File([bytes], opts.name ?? "notes.txt", { type: opts.type ?? "text/plain" }));
  return form;
}

beforeEach(() => {
  who = "ops@circuvent.com";
  allowed = true;
  configured = true;
  put.mockClear();
  del.mockClear();
  presign.mockClear();
  put.mockResolvedValue(true);
  del.mockResolvedValue(true);
  presign.mockReturnValue("https://example.r2.cloudflarestorage.com/signed");
});

describe("GET — presigned download link", () => {
  it("refuses a caller the guard rejects, same as every other ICM route", async () => {
    allowed = false;
    const res = await get("?id=INC-0001&attachmentId=att-1");
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Forbidden");
  });

  it("404s for an incident that does not exist", async () => {
    const res = await get("?id=INC-9999&attachmentId=att-1");
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/no such incident/i);
  });

  it("404s for an incident that exists but has no such attachment", async () => {
    const inc = newIncident();
    const res = await get(`?id=${inc.id}&attachmentId=att-missing`);
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/no such attachment/i);
  });

  it("answers 501, not a bare failure, when the store cannot sign a link", async () => {
    const inc = newIncident();
    const uploaded = await (await post(uploadForm(inc.id))).json();
    const attachmentId = uploaded.incident.attachments[0].id;

    presign.mockReturnValueOnce(null);
    const res = await get(`?id=${inc.id}&attachmentId=${attachmentId}`);
    expect(res.status).toBe(501);
    expect((await res.json()).message).toMatch(/isn't available/i);
  });

  it("signs a short-lived link carrying the display name, not the storage key", async () => {
    const inc = newIncident();
    const uploaded = await (
      await post(uploadForm(inc.id, { name: "graph.png", type: "image/png", bytes: PNG_BYTES }))
    ).json();
    const attachment = uploaded.incident.attachments[0];

    const res = await get(`?id=${inc.id}&attachmentId=${attachment.id}`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      success: true,
      url: "https://example.r2.cloudflarestorage.com/signed",
      name: "graph.png",
      contentType: attachment.contentType,
      size: attachment.size,
    });
    // Five minutes, and the human filename signed into the response headers —
    // never the object's own storage key, which the display name never touches.
    expect(presign).toHaveBeenCalledWith(attachment.key, 300, {
      responseContentDisposition: contentDispositionFor(attachment.name),
      responseContentType: attachment.contentType,
    });
  });
});

describe("POST — upload", () => {
  it("refuses a caller the guard rejects before ever touching the store", async () => {
    allowed = false;
    const res = await post(uploadForm("INC-0001"));
    expect(res.status).toBe(403);
    expect(put).not.toHaveBeenCalled();
  });

  it("answers 501 when this deployment has no bucket configured", async () => {
    configured = false;
    const inc = newIncident();
    const res = await post(uploadForm(inc.id));
    expect(res.status).toBe(501);
    expect(put).not.toHaveBeenCalled();
  });

  it("requires an incident id", async () => {
    const form = new FormData();
    form.set("file", new File([new TextEncoder().encode("x")], "a.txt", { type: "text/plain" }));
    const res = await post(form);
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/incident is required/i);
  });

  it("404s for an incident that does not exist", async () => {
    const res = await post(uploadForm("INC-9999"));
    expect(res.status).toBe(404);
  });

  it("requires a file", async () => {
    const inc = newIncident();
    const form = new FormData();
    form.set("incidentId", inc.id);
    const res = await post(form);
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/file is required/i);
  });

  it("rejects an oversized upload by the declared size, before reading the bytes", async () => {
    const inc = newIncident();
    const big = new Uint8Array(ICM_ATTACHMENT_MAX_BYTES + 1);
    const res = await post(uploadForm(inc.id, { bytes: big }));
    expect(res.status).toBe(413);
    // The size ceiling is what rejected this, not a bytes-read that never
    // needed to happen — proof the fast path in the route actually short-circuits.
    expect(put).not.toHaveBeenCalled();
  });

  it("rejects content that doesn't pass the same sniffing icm-attachments.ts enforces everywhere else", async () => {
    const inc = newIncident();
    // Control bytes declared as plain text: no signature matches and the
    // declared type has none of its own — checkIcmAttachment's backstop case.
    const bad = new Uint8Array([0x41, 0x00, 0x01, 0x02, 0x43]);
    const res = await post(uploadForm(inc.id, { bytes: bad, type: "text/plain" }));
    expect(res.status).toBe(400);
    expect(put).not.toHaveBeenCalled();
    expect(getIncident(inc.id)?.attachments ?? []).toHaveLength(0);
  });

  it("never claims success for an upload that did not happen", async () => {
    // The rule this test exists for: a monitor that once logged its own
    // expected-400 probe as a failure, and a desk app that once showed a green
    // "clocked in" for a refused card. Here the equivalent bug would be an
    // incident that gained an attachment record for bytes the bucket refused.
    const inc = newIncident();
    put.mockResolvedValueOnce(false);

    const res = await post(uploadForm(inc.id));
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.success).toBe(false);
    expect(body.message).toBeTruthy();
    // The record was never written — checked against the store directly, not
    // just the response, since a response can lie but the store cannot.
    expect(getIncident(inc.id)?.attachments ?? []).toHaveLength(0);
  });

  it("stores the file under a key derived from the incident id, never the uploader's filename", async () => {
    const inc = newIncident();
    const res = await post(uploadForm(inc.id, { name: "../../etc/passwd.txt" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    const [key, buf, contentType] = put.mock.calls[0];
    expect(key).toMatch(new RegExp(`^icm/${inc.id}/[0-9a-f]+\\.txt$`));
    expect(key).not.toContain("..");
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(contentType).toBe("text/plain");

    const attachment = body.incident.attachments[0];
    expect(attachment).toMatchObject({
      key,
      name: "../../etc/passwd.txt", // the display name is free to be anything; only the key is derived
      size: 11,
      contentType: "text/plain",
      uploadedBy: who,
    });

    // Persisted, not just echoed in this one response.
    expect(getIncident(inc.id)?.attachments).toHaveLength(1);
    const lastEntry = body.incident.timeline.at(-1);
    expect(lastEntry.kind).toBe("attachment");
    expect(lastEntry.id).toBe(attachment.id);
  });
});

describe("DELETE — remove an attachment", () => {
  it("refuses a caller the guard rejects", async () => {
    allowed = false;
    const res = await del2("?id=INC-0001&attachmentId=att-1");
    expect(res.status).toBe(403);
    expect(del).not.toHaveBeenCalled();
  });

  it("404s for an incident that does not exist", async () => {
    const res = await del2("?id=INC-9999&attachmentId=att-1");
    expect(res.status).toBe(404);
  });

  it("409s, incident attached, for an attachment that does not exist on a real incident", async () => {
    const inc = newIncident();
    const res = await del2(`?id=${inc.id}&attachmentId=att-missing`);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.message).toMatch(/no such attachment/i);
    expect(body.incident).toBeTruthy();
    // Nothing to delete from the bucket when nothing matched in the record.
    expect(del).not.toHaveBeenCalled();
  });

  it("removes the record immediately and cleans up the object best-effort", async () => {
    const inc = newIncident();
    const uploaded = await (await post(uploadForm(inc.id))).json();
    const attachment = uploaded.incident.attachments[0];

    const res = await del2(`?id=${inc.id}&attachmentId=${attachment.id}`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.incident.attachments).toHaveLength(0);
    expect(del).toHaveBeenCalledWith(attachment.key);

    // The removal is a distinct timeline entry, and — unlike the attachment
    // entry — does not reuse the attachment's id, so a stale download button
    // can never attach itself to this row.
    const lastEntry = body.incident.timeline.at(-1);
    expect(lastEntry.kind).toBe("attachment");
    expect(lastEntry.text).toContain("removed attachment");
    expect(lastEntry.id).not.toBe(attachment.id);

    expect(getIncident(inc.id)?.attachments ?? []).toHaveLength(0);
  });
});
