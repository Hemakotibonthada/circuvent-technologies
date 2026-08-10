import { HIDDEN_ON, surfaceFromPath } from "@/components/ai/Assistant";

/*
 * The assistant is mounted once in the root layout, so where it appears is
 * decided entirely by the pathname. Which makes the boundary between
 * /smarthome and /smarthome/admin the thing worth pinning: they are the same
 * prefix, and hiding the button on one must not hide it on the other.
 */

describe("which surface a path belongs to", () => {
  it("separates the console from the staff console under the same prefix", () => {
    expect(surfaceFromPath("/smarthome")).toBe("smarthome");
    expect(surfaceFromPath("/smarthome/energy")).toBe("smarthome");
    expect(surfaceFromPath("/smarthome/admin")).toBe("admin");
    expect(surfaceFromPath("/smarthome/admin/fleet")).toBe("admin");
  });

  it("recognises the shop and everything else", () => {
    expect(surfaceFromPath("/shop/account")).toBe("shop");
    expect(surfaceFromPath("/")).toBe("site");
    expect(surfaceFromPath("/blog/anything")).toBe("site");
    expect(surfaceFromPath(null)).toBe("site");
  });
});

describe("where the assistant button is offered", () => {
  it("is not offered on the smart-home console, which has its own corner controls", () => {
    expect(HIDDEN_ON).toContain(surfaceFromPath("/smarthome"));
    expect(HIDDEN_ON).toContain(surfaceFromPath("/smarthome/energy"));
  });

  /*
   * The staff console is a different surface that happens to live under the
   * same path prefix. Hiding it there too would be an accident, not a decision.
   */
  it("is still offered on the staff console, the shop and the site", () => {
    expect(HIDDEN_ON).not.toContain(surfaceFromPath("/smarthome/admin"));
    expect(HIDDEN_ON).not.toContain(surfaceFromPath("/shop"));
    expect(HIDDEN_ON).not.toContain(surfaceFromPath("/"));
  });
});
