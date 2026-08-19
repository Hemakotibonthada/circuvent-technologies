import { AVATAR_MAX_BYTES, avatarKeyFor, checkAvatar, sniffImageType } from "@/lib/avatar";
import { isSafeObjectKey } from "@/lib/object-store";

/*
 * The account page had a pencil badge on the avatar — the universal "change
 * photo" affordance — that jumped to a form with no picture in it, because
 * there was no way to have one. These cover the rules the upload now enforces.
 *
 * The interesting ones are not "does a JPEG work". They are the cases where
 * believing the caller would be a mistake.
 */

const jpeg = (extra = 0) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]), Buffer.alloc(extra)]);
const png = () =>
  Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8)]);
const webp = () => Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(4)]);

describe("what counts as an image", () => {
  it.each([
    ["JPEG", jpeg(), "image/jpeg"],
    ["PNG", png(), "image/png"],
    ["WebP", webp(), "image/webp"],
  ])("recognises a %s", (_name, buf, type) => {
    expect(sniffImageType(buf as Buffer)).toBe(type);
  });

  it("refuses HTML dressed as an image", () => {
    /*
     * These bytes are served back later from the site's own origin. A caller
     * announcing image/jpeg and sending a document is how a bucket ends up
     * hosting a page that inherits the origin's trust — so the declared type
     * is never consulted and only the leading bytes decide.
     */
    const html = Buffer.from("<html><script>alert(1)</script></html>");
    expect(sniffImageType(html)).toBeNull();
    expect(checkAvatar(html).ok).toBe(false);
  });

  it("refuses an SVG, which is a document that happens to draw", () => {
    expect(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'))).toBeNull();
  });

  it("refuses a file too short to identify rather than guessing", () => {
    expect(sniffImageType(Buffer.from([0xff, 0xd8]))).toBeNull();
  });

  it("refuses an empty upload", () => {
    expect(checkAvatar(Buffer.alloc(0))).toMatchObject({ ok: false });
  });

  it("refuses anything over the ceiling", () => {
    const big = jpeg(AVATAR_MAX_BYTES);
    expect(big.length).toBeGreaterThan(AVATAR_MAX_BYTES);
    expect(checkAvatar(big).ok).toBe(false);
  });

  it("accepts a normal picture and reports its real type", () => {
    expect(checkAvatar(jpeg(4000))).toMatchObject({ ok: true, type: "image/jpeg" });
  });

  it("explains a refusal in words a customer can act on", () => {
    const msg = checkAvatar(Buffer.from("not an image at all")).message ?? "";
    expect(msg).toMatch(/JPEG|PNG|WebP/i);
  });
});

describe("where a picture is stored", () => {
  it("keeps the customer's address out of the key", () => {
    /*
     * Keys appear in bucket listings, access logs and error messages.
     * "avatars/someone@example.com.jpg" puts an email address in all three.
     */
    const key = avatarKeyFor("Someone@Example.com", "image/jpeg");
    expect(key).not.toContain("Someone");
    expect(key).not.toContain("example.com");
    expect(key).not.toContain("@");
  });

  it("puts the same customer in the same folder", () => {
    const a = avatarKeyFor("someone@example.com", "image/jpeg");
    const b = avatarKeyFor("SOMEONE@EXAMPLE.COM", "image/png");
    expect(a.split("/")[1]).toBe(b.split("/")[1]);
  });

  it("gives every upload a new key", () => {
    // What lets the objects be cached immutably: a replacement is a different
    // object, so no cache can serve the old picture for the new one.
    const a = avatarKeyFor("someone@example.com", "image/jpeg");
    const b = avatarKeyFor("someone@example.com", "image/jpeg");
    expect(a).not.toBe(b);
  });

  it("matches the extension to the sniffed type, not the claimed one", () => {
    expect(avatarKeyFor("a@b.com", "image/png").endsWith(".png")).toBe(true);
    expect(avatarKeyFor("a@b.com", "image/webp").endsWith(".webp")).toBe(true);
  });

  it("produces keys the signer will accept", () => {
    for (const t of ["image/jpeg", "image/png", "image/webp"] as const) {
      expect(isSafeObjectKey(avatarKeyFor("someone@example.com", t))).toBe(true);
    }
  });
});

describe("keys the object store refuses", () => {
  it.each([
    ["empty", ""],
    ["absolute", "/avatars/x.jpg"],
    ["traversal", "avatars/../../etc/passwd"],
    ["double slash", "avatars//x.jpg"],
    ["a bare dot segment", "avatars/./x.jpg"],
  ])("refuses %s", (_name, key) => {
    expect(isSafeObjectKey(key)).toBe(false);
  });
});
