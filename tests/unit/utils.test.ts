import { cn } from "@/lib/utils";

describe("utils: cn", () => {
  it("joins class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("drops falsy values", () => {
    expect(cn("a", false, null, undefined, "", "b")).toBe("a b");
  });

  it("supports conditional objects", () => {
    expect(cn("base", { active: true, hidden: false })).toBe("base active");
  });

  it("de-duplicates conflicting tailwind classes (last wins)", () => {
    expect(cn("px-2 px-4")).toBe("px-4");
    expect(cn("text-sm", "text-lg")).toBe("text-lg");
  });
});
