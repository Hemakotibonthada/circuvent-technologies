import { buildCsp } from "../src/lib/csp";

describe("environment-specific content security policy", () => {
  test("permits React development debugging without upgrading localhost HTTP", () => {
    expect(buildCsp(true)).toContain("'unsafe-eval'");
    expect(buildCsp(true)).not.toContain("upgrade-insecure-requests");
  });
  test("production and default policies never permit eval", () => {
    expect(buildCsp()).not.toContain("'unsafe-eval'");
    expect(buildCsp(false)).toContain("upgrade-insecure-requests");
    expect(buildCsp(false)).toContain("object-src 'none'");
  });
  test("building a development policy does not mutate production directives", () => {
    buildCsp(true);
    expect(buildCsp(false)).not.toContain("'unsafe-eval'");
  });
});
