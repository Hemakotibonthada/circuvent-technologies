import { validateField, validateForm, patterns, contactFormRules } from "@/lib/validation";

describe("validation: validateField", () => {
  it("enforces required", () => {
    expect(validateField("", { required: true })).toMatch(/required/i);
    expect(validateField("x", { required: true })).toBeNull();
  });

  it("enforces min/max length", () => {
    expect(validateField("ab", { minLength: 3 })).toMatch(/at least 3/);
    expect(validateField("abcd", { maxLength: 3 })).toMatch(/no more than 3/);
    expect(validateField("abc", { minLength: 3, maxLength: 3 })).toBeNull();
  });

  it("enforces patterns", () => {
    expect(validateField("nope", { pattern: patterns.email })).toMatch(/invalid/i);
    expect(validateField("a@b.co", { pattern: patterns.email })).toBeNull();
  });

  it("runs a custom validator", () => {
    const rule = { custom: (v: string) => (v === "ok" ? null : "bad") };
    expect(validateField("ok", rule)).toBeNull();
    expect(validateField("x", rule)).toBe("bad");
  });
});

describe("validation: patterns", () => {
  it.each([
    ["user@example.com", true],
    ["a.b+c@sub.domain.io", true],
    ["no-at", false],
    ["a@b", false],
  ])("email %s -> %s", (input, ok) => {
    expect(patterns.email.test(input as string)).toBe(ok);
  });

  it.each([
    ["my-slug-123", true],
    ["Bad_Slug", false],
    ["trailing-", false],
  ])("slug %s -> %s", (input, ok) => {
    expect(patterns.slug.test(input as string)).toBe(ok);
  });
});

describe("validation: validateForm", () => {
  it("collects errors across fields", () => {
    const res = validateForm({ name: "", email: "bad", message: "short" }, contactFormRules);
    expect(res.isValid).toBe(false);
    expect(res.errors.name).toBeDefined();
    expect(res.errors.email).toBeDefined();
    expect(res.errors.message).toBeDefined();
  });

  it("passes a valid form", () => {
    const res = validateForm(
      {
        name: "Ada Lovelace",
        email: "ada@circuvent.com",
        message: "This is a sufficiently long enquiry message.",
      },
      contactFormRules
    );
    expect(res.isValid).toBe(true);
    expect(Object.keys(res.errors)).toHaveLength(0);
  });
});
