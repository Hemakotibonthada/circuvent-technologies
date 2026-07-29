import crypto from "crypto";
import {
  checkPassword,
  passwordAge,
  suggestPassword,
  MAX_PASSWORD_AGE_DAYS,
  MIN_PASSWORD_LENGTH,
  PASSWORD_WARN_DAYS,
} from "./admin-password-policy";

const rand = (n: number) => Uint8Array.from(crypto.randomBytes(n));
const daysFromNow = (d: number) => new Date(Date.now() + d * 86400000).toISOString();

describe("checkPassword", () => {
  it("accepts a strong password", () => {
    const r = checkPassword("Tr9$vBmq2!Wnzk7L");
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
    expect(r.score).toBe(4);
  });

  it.each([
    ["shorter than the minimum", "Ab1!xyz"],
    ["missing a symbol", "Abcdefgh12345"],
    ["missing an uppercase letter", "abcdefgh123!@#"],
    ["missing a lowercase letter", "ABCDEFGH123!@#"],
    ["missing a number", "Abcdefghij!@#$"],
    ["containing whitespace", "Abcd 1234!xyzQ"],
    ["repeating a character three times", "Aaa!bcd1234567X"],
    ["walking the alphabet", "Zx9!abcdefQw2#p"],
    ["walking a keyboard row", "Zx9!qwertyQw2#p"],
    ["a common word", "P@ssw0rdP@ssw0rd"],
  ])("rejects a password %s", (_label, pw) => {
    expect(checkPassword(pw).ok).toBe(false);
  });

  it("sees through leet substitutions of common words", () => {
    // Would pass every class check; normalises to "...admin...".
    expect(checkPassword("Xk9!4dm1nQw2#pL").ok).toBe(false);
  });

  it("rejects passwords built from the account's own identity", () => {
    const identity = { email: "hemakoti@circuvent.tech", name: "Hema Koti" };
    expect(checkPassword("Hemakoti#2026Xy!", identity).ok).toBe(false);
    expect(checkPassword("Circuvent#2026Ab!", identity).ok).toBe(false);
    // The same password is fine for an unrelated account.
    expect(checkPassword("Hemakoti#2026Xy!", { email: "sam@example.com" }).ok).toBe(true);
  });

  it("reports every failure at once so the form can show a full checklist", () => {
    const r = checkPassword("abc");
    expect(r.errors.length).toBeGreaterThan(3);
    expect(new Set(r.errors).size).toBe(r.errors.length);
  });

  it("keeps score within the 0-4 range a strength meter can index", () => {
    for (const pw of ["", "a", "aB1!", "abcdefghijkl", "Tr9$vBmq2!Wnzk7L", "x".repeat(200)]) {
      const s = checkPassword(pw).score;
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(4);
    }
  });

  it("never scores a failing password above 1", () => {
    expect(checkPassword("abcdefghijklmnop").score).toBeLessThanOrEqual(1);
  });
});

describe("suggestPassword", () => {
  it("always returns a password that satisfies the policy", () => {
    // The generator retries a bounded number of times and returns "" if it
    // never lands a valid candidate. Prove that branch is unreachable.
    for (let i = 0; i < 2000; i++) {
      const pw = suggestPassword(rand);
      expect(pw).not.toBe("");
      expect(checkPassword(pw).ok).toBe(true);
    }
  });

  it("honours the requested length", () => {
    expect(suggestPassword(rand).length).toBe(20);
    expect(suggestPassword(rand, 32).length).toBe(32);
  });

  it("does not repeat itself", () => {
    const seen = new Set(Array.from({ length: 200 }, () => suggestPassword(rand)));
    expect(seen.size).toBe(200);
  });
});

describe("passwordAge", () => {
  it("treats an unknown age as expired rather than valid", () => {
    // Failing closed matters here: an unknown age on a staff credential is
    // exactly the case rotation exists to catch.
    expect(passwordAge({}).expired).toBe(true);
    expect(passwordAge({ passwordChangedAt: "not-a-date" }).expired).toBe(true);
  });

  it("falls back to createdAt for accounts predating the policy", () => {
    expect(passwordAge({ createdAt: daysFromNow(-10) }).expired).toBe(false);
  });

  it("expires exactly at the policy boundary", () => {
    expect(passwordAge({ passwordChangedAt: daysFromNow(-(MAX_PASSWORD_AGE_DAYS + 1)) }).expired).toBe(true);
    expect(passwordAge({ passwordChangedAt: daysFromNow(-(MAX_PASSWORD_AGE_DAYS - 1)) }).expired).toBe(false);
  });

  it("warns inside the notice window only", () => {
    const warn = passwordAge({ passwordChangedAt: daysFromNow(-(MAX_PASSWORD_AGE_DAYS - PASSWORD_WARN_DAYS + 1)) });
    expect(warn.expiringSoon).toBe(true);
    expect(warn.expired).toBe(false);
    expect(passwordAge({ passwordChangedAt: daysFromNow(-10) }).expiringSoon).toBe(false);
  });

  it("never reports an expired password as merely expiring soon", () => {
    const old = passwordAge({ passwordChangedAt: daysFromNow(-200) });
    expect(old.expired).toBe(true);
    expect(old.expiringSoon).toBe(false);
    expect(old.daysLeft).toBe(0);
  });

  it("honours a forced change on an otherwise fresh password", () => {
    expect(passwordAge({ passwordChangedAt: daysFromNow(-1), mustChangePassword: true }).expired).toBe(true);
  });

  it("exposes an expiry date the UI can render", () => {
    const age = passwordAge({ passwordChangedAt: daysFromNow(-1) });
    expect(Number.isNaN(Date.parse(age.expiresAt!))).toBe(false);
    expect(age.daysLeft).toBeLessThanOrEqual(MAX_PASSWORD_AGE_DAYS);
  });
});

describe("policy constants", () => {
  it("requires a 12-character minimum and a 90-day rotation", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(12);
    expect(MAX_PASSWORD_AGE_DAYS).toBe(90);
  });
});
