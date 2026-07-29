import { hashPassword, verifyPassword, hasUsablePassword } from "./account";

// A stored credential that is missing or malformed is a data problem, not a
// crash. It used to escape verifyPassword as a thrown TypeError from
// Buffer.from(undefined), which the login route's catch-all turned into a 500 —
// so a user whose row had no password saw "the site is broken" and an operator
// got no signal at all. These cases must all resolve to a plain false.
describe("verifyPassword", () => {
  it("accepts the password it hashed", () => {
    const { salt, hash } = hashPassword("correct-horse-battery-staple");
    expect(verifyPassword("correct-horse-battery-staple", salt, hash)).toBe(true);
  });

  it("rejects the wrong password", () => {
    const { salt, hash } = hashPassword("correct-horse-battery-staple");
    expect(verifyPassword("wrong", salt, hash)).toBe(false);
  });

  it("salts each hash, so equal passwords do not collide", () => {
    const a = hashPassword("same-password");
    const b = hashPassword("same-password");
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  const broken: [string, unknown, unknown][] = [
    ["missing hash", "somesalt", undefined],
    ["missing salt", undefined, "abcdef"],
    ["both missing", undefined, undefined],
    ["null hash", "somesalt", null],
    ["null salt", null, "abcdef"],
    ["empty hash", "somesalt", ""],
    ["empty salt", "", "abcdef"],
    ["numeric hash", "somesalt", 12345],
    ["object hash", "somesalt", {}],
    ["hash of the wrong length", "somesalt", "aa"],
  ];

  it.each(broken)("returns false without throwing: %s", (_label, salt, hash) => {
    expect(() =>
      verifyPassword("any-password", salt as string, hash as string)
    ).not.toThrow();
    expect(verifyPassword("any-password", salt as string, hash as string)).toBe(false);
  });
});

describe("hasUsablePassword", () => {
  it("is true for a complete credential", () => {
    const { salt, hash } = hashPassword("pw");
    expect(hasUsablePassword({ salt, hash })).toBe(true);
  });

  it.each([
    ["null account", null],
    ["undefined account", undefined],
    ["no fields", {}],
    ["salt only", { salt: "s" }],
    ["hash only", { hash: "h" }],
    ["empty strings", { salt: "", hash: "" }],
  ])("is false for %s", (_label, acc) => {
    expect(hasUsablePassword(acc as { salt?: string; hash?: string } | null)).toBe(false);
  });
});
