import {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
} from "@/lib/account";

describe("account: password hashing", () => {
  it("produces a salt and hash and verifies the correct password", () => {
    const { salt, hash } = hashPassword("Hunter2!");
    expect(salt).toHaveLength(32); // 16 random bytes -> hex
    expect(hash).toHaveLength(128); // 64 bytes -> hex
    expect(verifyPassword("Hunter2!", salt, hash)).toBe(true);
  });

  it("rejects an incorrect password", () => {
    const { salt, hash } = hashPassword("correct-horse");
    expect(verifyPassword("battery-staple", salt, hash)).toBe(false);
  });

  it("uses a random salt so identical passwords hash differently", () => {
    const a = hashPassword("same");
    const b = hashPassword("same");
    expect(a.salt).not.toEqual(b.salt);
    expect(a.hash).not.toEqual(b.hash);
  });
});

describe("account: session tokens", () => {
  it("round-trips an email through sign/verify", () => {
    const token = signToken("User@Circuvent.com");
    expect(verifyToken(token)).toBe("user@circuvent.com"); // normalized
  });

  it("rejects a tampered token", () => {
    const token = signToken("user@circuvent.com");
    const tampered = Buffer.from("attacker@evil.com:deadbeef").toString("base64");
    expect(verifyToken(tampered)).toBeNull();
    // Flipping a char in the real token also fails.
    const flipped = token.slice(0, -2) + (token.endsWith("A") ? "B" : "A") + "=";
    expect(verifyToken(flipped)).toBeNull();
  });

  it("returns null for empty/garbage input", () => {
    expect(verifyToken(null)).toBeNull();
    expect(verifyToken(undefined)).toBeNull();
    expect(verifyToken("not-a-token")).toBeNull();
  });
});
