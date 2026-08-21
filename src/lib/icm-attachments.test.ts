import {
  checkIcmAttachment,
  sniffIcmAttachmentType,
  icmAttachmentKeyFor,
  sanitiseAttachmentName,
  contentDispositionFor,
  ICM_ATTACHMENT_MAX_BYTES,
  ICM_ATTACHMENT_TYPES,
} from "./icm-attachments";

/* ---------------------------------------------------------------- fixtures -- */

const jpeg = () => Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(12).fill(0)]);
const png = () => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(8).fill(0)]);
const webp = () => Buffer.concat([Buffer.from("RIFF", "ascii"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBP", "ascii")]);
const gif = () => Buffer.from("GIF89a" + "\x00".repeat(10), "ascii");
const pdf = () => Buffer.from("%PDF-1.4\n%rest of a fake pdf", "ascii");
const zip = () => Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
const text = (s = "line one\nline two") => Buffer.from(s, "utf8");
const controlBytes = () => Buffer.from([0x41, 0x42, 0x00, 0x01, 0x02, 0x43]);

describe("sniffIcmAttachmentType", () => {
  it.each([
    ["jpeg", jpeg(), "image/jpeg"],
    ["png", png(), "image/png"],
    ["webp", webp(), "image/webp"],
    ["gif", gif(), "image/gif"],
    ["pdf", pdf(), "application/pdf"],
    ["zip", zip(), "application/zip"],
  ] as const)("recognises %s from its magic bytes regardless of the declared type", (_name, buf, expected) => {
    // The declared type is deliberately wrong here (always "text/plain") to
    // pin the contract: for anything with a real signature, the bytes win,
    // not the header the client sent them with.
    expect(sniffIcmAttachmentType(buf, "text/plain")).toBe(expected);
  });

  it("accepts text/plain only when both declared and unsuspicious", () => {
    expect(sniffIcmAttachmentType(text(), "text/plain")).toBe("text/plain");
  });

  it("refuses to trust text/plain over bytes that look binary", () => {
    // No signature matches control bytes, and the declared type has no
    // signature of its own to fall back on — this is the case the backstop
    // exists for: a mislabeled binary claiming to be plain text.
    expect(sniffIcmAttachmentType(controlBytes(), "text/plain")).toBeNull();
  });

  it("accepts text/csv the same way as text/plain", () => {
    expect(sniffIcmAttachmentType(text("a,b,c\n1,2,3"), "text/csv")).toBe("text/csv");
  });

  it("accepts application/json only when the content actually starts like JSON", () => {
    expect(sniffIcmAttachmentType(text('{"a":1}'), "application/json")).toBe("application/json");
    expect(sniffIcmAttachmentType(text("[1,2,3]"), "application/json")).toBe("application/json");
  });

  it("refuses application/json declared over content that isn't", () => {
    expect(sniffIcmAttachmentType(text("not json at all"), "application/json")).toBeNull();
  });

  it("trusts application/octet-stream unconditionally — it is the one type with nothing to check", () => {
    expect(sniffIcmAttachmentType(controlBytes(), "application/octet-stream")).toBe("application/octet-stream");
  });

  it("rejects a declared type this allowlist does not recognise", () => {
    expect(sniffIcmAttachmentType(text("hello"), "application/msword")).toBeNull();
  });
});

describe("checkIcmAttachment", () => {
  it("rejects an empty file", () => {
    const r = checkIcmAttachment(Buffer.alloc(0), "image/png");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/empty/i);
  });

  it("rejects a file over the size ceiling", () => {
    const big = Buffer.alloc(ICM_ATTACHMENT_MAX_BYTES + 1);
    const r = checkIcmAttachment(big, "application/octet-stream");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/MB/);
  });

  it("accepts a file at exactly the size ceiling", () => {
    const r = checkIcmAttachment(Buffer.concat([png(), Buffer.alloc(ICM_ATTACHMENT_MAX_BYTES - png().length)]), "image/png");
    expect(r.ok).toBe(true);
  });

  it("returns the sniffed type on success, not just a boolean", () => {
    const r = checkIcmAttachment(png(), "image/png");
    expect(r.ok).toBe(true);
    expect(r.type).toBe("image/png");
  });

  it("rejects an unsupported type with a message safe to show the uploader", () => {
    const r = checkIcmAttachment(controlBytes(), "text/plain");
    expect(r.ok).toBe(false);
    expect(r.message).toBeTruthy();
  });

  it("lower-cases and trims the declared type before checking it", () => {
    const r = checkIcmAttachment(text("hello"), "  TEXT/PLAIN  ");
    expect(r.ok).toBe(true);
    expect(r.type).toBe("text/plain");
  });
});

describe("ICM_ATTACHMENT_TYPES", () => {
  it("excludes html and svg, which can carry a script", () => {
    expect(ICM_ATTACHMENT_TYPES).not.toContain("text/html");
    expect(ICM_ATTACHMENT_TYPES).not.toContain("image/svg+xml");
  });
});

describe("icmAttachmentKeyFor", () => {
  it("namespaces the key under icm/<incidentId>/ with the right extension", () => {
    const key = icmAttachmentKeyFor("INC-42", "application/pdf");
    expect(key).toMatch(/^icm\/INC-42\/[0-9a-f]+\.pdf$/);
  });

  it.each([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
    ["image/gif", "gif"],
    ["application/zip", "zip"],
    ["text/plain", "txt"],
    ["text/csv", "csv"],
    ["application/json", "json"],
    ["application/octet-stream", "bin"],
  ] as const)("maps %s to .%s", (type, ext) => {
    expect(icmAttachmentKeyFor("INC-1", type)).toMatch(new RegExp(`\\.${ext}$`));
  });

  it("strips anything that is not alphanumeric or a hyphen from the incident id", () => {
    // Nothing about the storage key may come from attacker-controlled input
    // beyond a scrubbed id — a path traversal attempt or a stray slash must
    // not survive into the key.
    const key = icmAttachmentKeyFor("../../etc/passwd", "application/pdf");
    expect(key).not.toContain("..");
    expect(key).not.toContain("/etc/");
    expect(key.startsWith("icm/")).toBe(true);
  });

  it("falls back to a generic segment when the id sanitises away to nothing", () => {
    const key = icmAttachmentKeyFor("/////", "application/pdf");
    expect(key).toMatch(/^icm\/incident\//);
  });

  it("never repeats a suffix, so two uploads for the same incident cannot collide", () => {
    const a = icmAttachmentKeyFor("INC-1", "image/png");
    const b = icmAttachmentKeyFor("INC-1", "image/png");
    expect(a).not.toBe(b);
  });
});

describe("sanitiseAttachmentName", () => {
  it("trims surrounding whitespace", () => {
    expect(sanitiseAttachmentName("  report.pdf  ")).toBe("report.pdf");
  });

  it("collapses newlines and tabs into single spaces", () => {
    expect(sanitiseAttachmentName("weird\r\nname\twith\ttabs.txt")).toBe("weird name with tabs.txt");
  });

  it("caps the length at 200 characters", () => {
    const long = "a".repeat(500) + ".png";
    expect(sanitiseAttachmentName(long).length).toBe(200);
  });

  it("falls back to a generic name for a blank filename", () => {
    expect(sanitiseAttachmentName("   ")).toBe("attachment");
    expect(sanitiseAttachmentName("")).toBe("attachment");
  });
});

describe("contentDispositionFor", () => {
  it("carries a plain ascii name in both forms", () => {
    const cd = contentDispositionFor("report.pdf");
    expect(cd).toBe(`attachment; filename="report.pdf"; filename*=UTF-8''report.pdf`);
  });

  it("keeps the exact name in filename* even when the ascii fallback must mangle it", () => {
    // "café.png" must still download with its real name in browsers that read
    // filename* — which by now is effectively all of them — rather than
    // silently becoming "caf_.png" everywhere.
    const cd = contentDispositionFor("café.png");
    expect(cd).toContain(`filename*=UTF-8''${encodeURIComponent("café.png")}`);
    expect(cd).toContain(`filename="caf_.png"`);
  });

  it("replaces a double quote in the ascii fallback so the header cannot be broken out of", () => {
    const cd = contentDispositionFor('quote"name.txt');
    expect(cd).toContain(`filename="quote'name.txt"`);
  });
});
