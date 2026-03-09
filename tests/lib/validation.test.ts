import {
  validateField,
  validateForm,
  contactFormRules,
  newsletterRules,
  patterns,
} from "@/lib/validation";

describe("Validation", () => {
  describe("validateField", () => {
    it("validates required fields", () => {
      expect(validateField("", { required: true })).toBe("This field is required.");
      expect(validateField("value", { required: true })).toBeNull();
    });

    it("validates min length", () => {
      expect(validateField("ab", { minLength: 3 })).toBe("Must be at least 3 characters.");
      expect(validateField("abc", { minLength: 3 })).toBeNull();
    });

    it("validates max length", () => {
      expect(validateField("abcdef", { maxLength: 5 })).toBe("Must be no more than 5 characters.");
      expect(validateField("abcde", { maxLength: 5 })).toBeNull();
    });

    it("validates pattern", () => {
      expect(validateField("invalid", { pattern: patterns.email, message: "Invalid email" })).toBe("Invalid email");
      expect(validateField("test@example.com", { pattern: patterns.email })).toBeNull();
    });

    it("validates with custom function", () => {
      const custom = (val: string) => (val === "admin" ? "Reserved name" : null);
      expect(validateField("admin", { custom })).toBe("Reserved name");
      expect(validateField("user", { custom })).toBeNull();
    });
  });

  describe("validateForm", () => {
    it("validates contact form — valid data", () => {
      const result = validateForm(
        {
          name: "John Doe",
          email: "john@example.com",
          message: "This is a valid test message with enough characters.",
        },
        contactFormRules
      );
      expect(result.isValid).toBe(true);
      expect(Object.keys(result.errors)).toHaveLength(0);
    });

    it("validates contact form — missing required fields", () => {
      const result = validateForm(
        { name: "", email: "", message: "" },
        contactFormRules
      );
      expect(result.isValid).toBe(false);
      expect(result.errors.name).toBeTruthy();
      expect(result.errors.email).toBeTruthy();
      expect(result.errors.message).toBeTruthy();
    });

    it("validates contact form — invalid email", () => {
      const result = validateForm(
        {
          name: "John",
          email: "not-an-email",
          message: "This is a valid message with enough content.",
        },
        contactFormRules
      );
      expect(result.isValid).toBe(false);
      expect(result.errors.email).toBeTruthy();
    });

    it("validates newsletter — valid email", () => {
      const result = validateForm({ email: "test@example.com" }, newsletterRules);
      expect(result.isValid).toBe(true);
    });

    it("validates newsletter — invalid email", () => {
      const result = validateForm({ email: "bad" }, newsletterRules);
      expect(result.isValid).toBe(false);
    });
  });
});
