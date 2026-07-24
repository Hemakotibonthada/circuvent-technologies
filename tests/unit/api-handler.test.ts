/**
 * @jest-environment node
 */
import { validate } from "@/lib/api-handler";

describe("api-handler: validate", () => {
  it("accepts a valid payload and coerces types", () => {
    const res = validate<{ email: string; qty: number; agree: boolean }>(
      { email: "a@b.com", qty: "3", agree: 1 },
      {
        email: { type: "email", required: true },
        qty: { type: "number", min: 1, max: 10 },
        agree: { type: "boolean" },
      }
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.email).toBe("a@b.com");
      expect(res.data.qty).toBe(3);
      expect(res.data.agree).toBe(true);
    }
  });

  it("reports missing required fields", () => {
    const res = validate({}, { email: { type: "email", required: true } });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.email).toMatch(/required/i);
  });

  it("rejects an invalid email and out-of-range number", () => {
    const res = validate(
      { email: "nope", qty: "99" },
      { email: { type: "email", required: true }, qty: { type: "number", max: 10 } }
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.email).toBeDefined();
      expect(res.errors.qty).toBeDefined();
    }
  });

  it("enforces string length bounds", () => {
    const res = validate(
      { name: "x" },
      { name: { type: "string", min: 2, max: 5 } }
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.name).toMatch(/at least 2/);
  });

  it("treats a non-object body as empty", () => {
    const res = validate(null, { email: { required: true } });
    expect(res.ok).toBe(false);
  });
});
