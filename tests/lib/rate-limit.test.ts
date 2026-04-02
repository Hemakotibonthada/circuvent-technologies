import { rateLimit } from "@/lib/rate-limit";

describe("rateLimit", () => {
  beforeEach(() => {
    // Reset the rate limit map between tests by using unique keys
  });

  it("allows requests under the limit", () => {
    const id = `test-allow-${Date.now()}`;
    const result = rateLimit("contact", id);
    expect(result.ok).toBe(true);
  });

  it("blocks after exceeding the limit", () => {
    const id = `test-block-${Date.now()}`;
    // contact limit is 5 per minute
    for (let i = 0; i < 5; i++) {
      expect(rateLimit("contact", id).ok).toBe(true);
    }
    const blocked = rateLimit("contact", id);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("uses default limit for unknown keys", () => {
    const id = `test-default-${Date.now()}`;
    // default limit is 10
    for (let i = 0; i < 10; i++) {
      expect(rateLimit("unknown-route", id).ok).toBe(true);
    }
    expect(rateLimit("unknown-route", id).ok).toBe(false);
  });

  it("isolates different identifiers", () => {
    const id1 = `test-iso1-${Date.now()}`;
    const id2 = `test-iso2-${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      rateLimit("contact", id1);
    }
    expect(rateLimit("contact", id1).ok).toBe(false);
    expect(rateLimit("contact", id2).ok).toBe(true);
  });
});
