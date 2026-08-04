import {
  normalizePath,
  normalizeReferrer,
  visitorHash,
  classifyDevice,
  classifyBrowser,
  optedOut,
  _resetSalt,
} from "./traffic";

/**
 * The rules that stand between a client-supplied string and our database.
 *
 * The endpoint these back used to take whatever `page` the browser sent and
 * use it directly as a grouping key, so the assertions about cardinality here
 * are not hypothetical hardening — they are the fix for a way anyone could
 * have grown the table without bound from a console tab.
 */

describe("normalizePath", () => {
  it("keeps real routes as they are", () => {
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("/shop")).toBe("/shop");
    expect(normalizePath("/smart-home")).toBe("/smart-home");
  });

  it("collapses dynamic segments so cardinality stays bounded", () => {
    // Without this every product, post and order number becomes its own row
    // and "top pages" degenerates into a list of one-view entries.
    expect(normalizePath("/shop/sentinel-multi-sensor")).toBe("/shop/[slug]");
    expect(normalizePath("/shop/anything-at-all")).toBe("/shop/[slug]");
    expect(normalizePath("/blog/why-we-built-this")).toBe("/blog/[slug]");
    expect(normalizePath("/projects/nexus-ai")).toBe("/projects/[id]");
    expect(normalizePath("/shop/invoice/CV-2026-0001")).toBe("/shop/invoice/[orderNo]");
    expect(normalizePath("/smarthome/device/hub-a1b2")).toBe("/smarthome/device/[id]");
  });

  it("drops the query string and hash", () => {
    // ?utm_source=... would otherwise make every campaign click a new page.
    expect(normalizePath("/shop?sort=price&page=3")).toBe("/shop");
    expect(normalizePath("/about#team")).toBe("/about");
    expect(normalizePath("/?utm_source=x&utm_campaign=y")).toBe("/");
  });

  it("treats a trailing slash as the same page", () => {
    expect(normalizePath("/about/")).toBe("/about");
    expect(normalizePath("/")).toBe("/");
  });

  it("reduces an absolute URL to its path and never keeps the host", () => {
    expect(normalizePath("https://circuvent.com/shop")).toBe("/shop");
    // A row labelled with an attacker's host would be a stored-content problem
    // in every export and dashboard that renders it.
    expect(normalizePath("https://evil.example/phish")).toBe("/phish");
  });

  it("rejects assets and API calls, which are not page views", () => {
    for (const p of [
      "/api/visitors",
      "/_next/static/chunk.js",
      "/favicon.ico",
      "/logo.png",
      "/styles.css",
      "/robots.txt",
      "/sitemap.xml",
    ]) {
      expect(normalizePath(p)).toBeNull();
    }
  });

  it("rejects anything that cannot be a route", () => {
    expect(normalizePath("")).toBeNull();
    expect(normalizePath("   ")).toBeNull();
    expect(normalizePath("not-a-path")).toBeNull();
    expect(normalizePath(null)).toBeNull();
    expect(normalizePath(undefined)).toBeNull();
    expect(normalizePath(42)).toBeNull();
    expect(normalizePath({ toString: () => "/x" })).toBeNull();
  });

  it("rejects an over-long path rather than storing it", () => {
    expect(normalizePath("/" + "a".repeat(200))).toBeNull();
  });

  it("rejects deep paths, which are scans rather than pages", () => {
    expect(normalizePath("/a/b/c/d/e/f/g/h")).toBeNull();
  });

  it("rejects control characters that would corrupt a log or CSV", () => {
    expect(normalizePath("/about\n/evil")).toBeNull();
    expect(normalizePath("/about\u0000")).toBeNull();
  });

  it("bounds the key space under a hostile flood", () => {
    // The property that matters: a caller cannot mint unlimited distinct keys.
    const keys = new Set<string>();
    for (let i = 0; i < 5000; i++) {
      const k = normalizePath(`/shop/product-${i}?v=${i}#${i}`);
      if (k) keys.add(k);
    }
    expect(keys.size).toBe(1);
    expect([...keys]).toEqual(["/shop/[slug]"]);
  });
});

describe("normalizeReferrer", () => {
  it("keeps only the host", () => {
    // A full referrer can carry another site's session token in its query.
    expect(normalizeReferrer("https://news.ycombinator.com/item?id=123")).toBe("news.ycombinator.com");
    expect(normalizeReferrer("https://www.google.com/search?q=secret+thing")).toBe("google.com");
  });

  it("treats our own pages as internal navigation, not a referral", () => {
    expect(normalizeReferrer("https://circuvent.com/shop", "circuvent.com")).toBeNull();
    expect(normalizeReferrer("https://www.circuvent.com/shop", "circuvent.com")).toBeNull();
  });

  it("returns null for direct traffic and rubbish", () => {
    expect(normalizeReferrer("")).toBeNull();
    expect(normalizeReferrer(null)).toBeNull();
    expect(normalizeReferrer("not a url")).toBeNull();
    expect(normalizeReferrer(123)).toBeNull();
  });
});

describe("visitorHash", () => {
  beforeEach(() => _resetSalt());

  it("is stable for the same visitor within a day", () => {
    const a = visitorHash("1.2.3.4", "Mozilla/5.0");
    const b = visitorHash("1.2.3.4", "Mozilla/5.0");
    expect(a).toBe(b);
  });

  it("separates different visitors", () => {
    expect(visitorHash("1.2.3.4", "UA-A")).not.toBe(visitorHash("1.2.3.5", "UA-A"));
    expect(visitorHash("1.2.3.4", "UA-A")).not.toBe(visitorHash("1.2.3.4", "UA-B"));
  });

  it("cannot be reversed to an address", () => {
    const h = visitorHash("203.0.113.7", "Mozilla/5.0");
    expect(h).toMatch(/^[0-9a-f]{32}$/);
    expect(h).not.toContain("203");
    expect(h).not.toContain("113");
  });

  it("changes across days, so a visitor cannot be followed", () => {
    // The salt rotates at midnight. Without that, a stable hash of a small
    // address space is reversible by enumeration and the table becomes a
    // long-term record of one person's browsing.
    const today = visitorHash("1.2.3.4", "UA", new Date("2026-08-04T10:00:00Z"));
    const tomorrow = visitorHash("1.2.3.4", "UA", new Date("2026-08-05T10:00:00Z"));
    expect(today).not.toBe(tomorrow);
  });

  it("is stable across the same day at different hours", () => {
    const morning = visitorHash("1.2.3.4", "UA", new Date("2026-08-04T01:00:00Z"));
    const evening = visitorHash("1.2.3.4", "UA", new Date("2026-08-04T23:00:00Z"));
    expect(morning).toBe(evening);
  });
});

describe("classifyDevice", () => {
  it("recognises the common families", () => {
    expect(classifyDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148")).toBe("mobile");
    expect(classifyDevice("Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36")).toBe("mobile");
    expect(classifyDevice("Mozilla/5.0 (iPad; CPU OS 17_0) Safari/604.1")).toBe("tablet");
    expect(classifyDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1")).toBe("desktop");
  });

  it("flags crawlers rather than silently dropping them", () => {
    // A report that quietly discards bot hits looks wrong next to server logs,
    // and "how much of this is crawlers" is a question worth answering.
    for (const ua of [
      "Googlebot/2.1 (+http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0)",
      "curl/8.4.0",
      "python-requests/2.31.0",
      "HeadlessChrome/120.0.0.0",
    ]) {
      expect(classifyDevice(ua)).toBe("bot");
    }
  });

  it("defaults safely for a missing agent", () => {
    expect(classifyDevice(undefined)).toBe("desktop");
    expect(classifyDevice("")).toBe("desktop");
  });
});

describe("classifyBrowser", () => {
  it("resolves families that impersonate each other", () => {
    // Edge and Opera both claim Chrome; Chrome claims Safari. Order matters.
    expect(classifyBrowser("Mozilla/5.0 Chrome/120 Safari/537.36 Edg/120")).toBe("Edge");
    expect(classifyBrowser("Mozilla/5.0 Chrome/120 Safari/537.36 OPR/106")).toBe("Opera");
    expect(classifyBrowser("Mozilla/5.0 Chrome/120 Safari/537.36")).toBe("Chrome");
    expect(classifyBrowser("Mozilla/5.0 Version/17.0 Safari/605.1.15")).toBe("Safari");
    expect(classifyBrowser("Mozilla/5.0 Firefox/121.0")).toBe("Firefox");
  });

  it("does not guess", () => {
    expect(classifyBrowser("")).toBe("Unknown");
    expect(classifyBrowser(undefined)).toBe("Unknown");
  });
});

describe("optedOut", () => {
  const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });

  it("honours Do Not Track and Global Privacy Control", () => {
    expect(optedOut(headers({ dnt: "1" }))).toBe(true);
    expect(optedOut(headers({ "sec-gpc": "1" }))).toBe(true);
  });

  it("does not treat absence or 0 as an opt-out", () => {
    expect(optedOut(headers({}))).toBe(false);
    expect(optedOut(headers({ dnt: "0" }))).toBe(false);
  });
});
