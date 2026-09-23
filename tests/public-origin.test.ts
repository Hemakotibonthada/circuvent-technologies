/** @jest-environment node */
import { publicRequestOrigin } from "../src/lib/public-origin";

describe("publicRequestOrigin", () => {
  const req = (url: string, headers: Record<string, string> = {}) => ({
    url,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? headers[name] ?? null },
  });

  test("uses Traefik X-Forwarded-Host over bind-address request.url", () => {
    expect(
      publicRequestOrigin(
        req("http://0.0.0.0:3022/api/admin/auth/sso/start", {
          "x-forwarded-host": "home.circuvent.com",
          "x-forwarded-proto": "https",
          host: "0.0.0.0:3022",
        })
      )
    ).toBe("https://home.circuvent.com");
  });

  test.each([
    ["iot.circuvent.com"],
    ["icm.circuvent.com"],
    ["insights.circuvent.com"],
    ["attendance.circuvent.com"],
    ["circuvent.com"],
  ])("keeps %s when Host is that public hostname", (host) => {
    expect(
      publicRequestOrigin(req(`https://${host}/api/admin/auth/sso/callback`, { host }))
    ).toBe(`https://${host}`);
  });

  test("does not invent 0.0.0.0 into the origin", () => {
    const prev = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://circuvent.com";
    delete process.env.FRONTEND_URL;
    try {
      expect(publicRequestOrigin(req("http://0.0.0.0:3022/x", { host: "0.0.0.0:3022" }))).toBe(
        "https://circuvent.com"
      );
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = prev;
    }
  });

  test("does not prefer FRONTEND_URL when a public Host is present", () => {
    const prevF = process.env.FRONTEND_URL;
    const prevS = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.FRONTEND_URL = "https://circuvent.com";
    process.env.NEXT_PUBLIC_SITE_URL = "https://circuvent.com";
    try {
      expect(
        publicRequestOrigin(
          req("http://0.0.0.0:3022/api/admin/auth/sso/start", {
            "x-forwarded-host": "iot.circuvent.com",
            "x-forwarded-proto": "https",
            host: "0.0.0.0:3022",
          })
        )
      ).toBe("https://iot.circuvent.com");
    } finally {
      if (prevF === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = prevF;
      if (prevS === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = prevS;
    }
  });
});
