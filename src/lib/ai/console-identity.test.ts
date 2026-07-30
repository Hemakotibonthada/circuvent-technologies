import { mergePersona } from "./console-identity";

// This is a privilege decision, so the table is exhaustive on purpose. The
// rule is "never lower an established persona, never guess upward" — a
// control-plane outage returns "unknown", and unknown must never demote a user
// who is already authenticated against the website.

describe("mergePersona", () => {
  it("promotes a guest with a valid admin console token", () => {
    expect(mergePersona("guest", "admin")).toBe("admin");
  });

  it("promotes a guest with a valid customer console token", () => {
    // This is the mobile case: signed in to the control plane, no site cookie.
    expect(mergePersona("guest", "customer")).toBe("customer");
  });

  it("leaves a guest as a guest when the token could not be resolved", () => {
    expect(mergePersona("guest", "unknown")).toBe("guest");
  });

  it("does not demote a website customer when the console token is unusable", () => {
    expect(mergePersona("customer", "unknown")).toBe("customer");
  });

  it("does not demote an admin when the console token is only a customer", () => {
    // A site admin pasting someone else's console token must stay an admin
    // here; the control plane still gates what that token can actually read.
    expect(mergePersona("admin", "customer")).toBe("admin");
  });

  it("does not demote an admin when the token could not be resolved", () => {
    expect(mergePersona("admin", "unknown")).toBe("admin");
  });

  it("promotes a website customer holding an admin console token", () => {
    expect(mergePersona("customer", "admin")).toBe("admin");
  });
});
