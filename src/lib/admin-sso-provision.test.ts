/**
 * The console's SSO grant rules.
 *
 * These decide who gets into the admin console without a password, so the
 * cases that matter most here are the refusals.
 */
import {
  CONSOLE_ROLE_RANK,
  consoleRoleFromSso,
  roleClaimFromIdToken,
  ssoStaffUser,
  strongerConsoleRole,
} from "./admin-sso-provision";

/*
 * The store reaches for a database at import time, which a unit test has no
 * business doing. Only the two functions `authenticate` touches are needed, so
 * the staff list is a plain map here.
 */
const staffList = new Map<string, ReturnType<typeof ssoStaffUser>>();
jest.mock("./store", () => ({
  getAdminUser: (email: string) => staffList.get(email.trim().toLowerCase()) ?? null,
  upsertAdminUser: (u: { email: string }) => {
    staffList.set(u.email.trim().toLowerCase(), u as ReturnType<typeof ssoStaffUser>);
    return u;
  },
  load: () => ({}),
  save: () => {},
  countAdminUsers: () => staffList.size,
  recordStaffLogin: () => {},
  revalidate: async () => {},
  flushNow: async () => {},
}));

// eslint-disable-next-line import/first
import { ALL_ROLES, authenticate } from "./admin-auth";
// eslint-disable-next-line import/first
import { upsertAdminUser } from "./store";

/** Builds an id_token-shaped string. Only the payload is ever read. */
function idToken(payload: unknown): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o), "utf8").toString("base64url");
  return `${b64({ alg: "RS256" })}.${b64(payload)}.c2ln`;
}

describe("which identity roles open the console", () => {
  it("lets an explicit Administrator grant in as a superadmin", () => {
    // This is the case the Admins group produces: website-admin -> admin.
    expect(consoleRoleFromSso("admin")).toBe("superadmin");
  });

  /*
   * The one that would be a disaster. `staff` is website-admin's *default*
   * role, so every account in the company resolves to it merely by existing.
   * If it ever grants console access, single sign-on becomes a way for anyone
   * with a Circuvent mailbox to refund orders.
   */
  it("refuses the application's default role, which everybody holds", () => {
    expect(consoleRoleFromSso("staff")).toBeNull();
  });

  it("refuses a role it does not recognise rather than guessing", () => {
    for (const role of ["employee", "member", "payroll_admin", "owner", "administrator", ""]) {
      expect(consoleRoleFromSso(role)).toBeNull();
    }
  });

  it("refuses a missing or non-string claim", () => {
    expect(consoleRoleFromSso(null)).toBeNull();
    expect(consoleRoleFromSso(undefined)).toBeNull();
    expect(consoleRoleFromSso(42 as unknown as string)).toBeNull();
    expect(consoleRoleFromSso({} as unknown as string)).toBeNull();
  });

  it("reads a grant that arrives with odd casing or padding", () => {
    expect(consoleRoleFromSso("Admin")).toBe("superadmin");
    expect(consoleRoleFromSso("  ADMIN  ")).toBe("superadmin");
  });
});

describe("a grant meeting a role somebody was given by hand", () => {
  it("promotes when the group grant is stronger", () => {
    expect(strongerConsoleRole("support", "superadmin")).toBe("superadmin");
    expect(strongerConsoleRole("manager", "superadmin")).toBe("superadmin");
  });

  it("never demotes an existing role when the token grants nothing", () => {
    // Somebody added here by hand keeps what they were given, whatever the
    // identity service does or does not say about them.
    for (const role of ALL_ROLES) expect(strongerConsoleRole(role, null)).toBe(role);
  });

  it("leaves a stronger existing role alone", () => {
    expect(strongerConsoleRole("superadmin", "superadmin")).toBe("superadmin");
  });

  it("grants nothing when there is nothing on either side", () => {
    expect(strongerConsoleRole(null, null)).toBeNull();
    expect(strongerConsoleRole(undefined, null)).toBeNull();
  });

  it("ranks every console role, so no comparison silently comes out undefined", () => {
    for (const role of ALL_ROLES) expect(typeof CONSOLE_ROLE_RANK[role]).toBe("number");
    expect(new Set(Object.values(CONSOLE_ROLE_RANK)).size).toBe(ALL_ROLES.length);
    // Strongest first, matching the order the console lists them in.
    expect([...ALL_ROLES].sort((a, b) => CONSOLE_ROLE_RANK[b] - CONSOLE_ROLE_RANK[a])).toEqual(
      ALL_ROLES
    );
  });
});

describe("reading the role out of an id_token", () => {
  it("finds the claim", () => {
    expect(roleClaimFromIdToken(idToken({ role: "admin", sub: "x" }))).toBe("admin");
  });

  it("reads nothing from a token that is not one", () => {
    for (const bad of [null, undefined, "", "not-a-jwt", "a.b", "a.b.c.d", 7 as unknown as string]) {
      expect(roleClaimFromIdToken(bad)).toBeNull();
    }
  });

  it("reads nothing from an undecodable or role-less payload", () => {
    expect(roleClaimFromIdToken("aGVhZGVy.bm90LWpzb24.c2ln")).toBeNull();
    expect(roleClaimFromIdToken(idToken({ sub: "x" }))).toBeNull();
    expect(roleClaimFromIdToken(idToken({ role: ["admin"] }))).toBeNull();
  });

  /*
   * Nothing about a payload should be able to take the request down; a thrown
   * error inside the callback's try block redirects to a generic "exchange"
   * failure, which would hide the real reason.
   */
  it("never throws", () => {
    expect(() => roleClaimFromIdToken("....")).not.toThrow();
    expect(() => roleClaimFromIdToken(idToken(null))).not.toThrow();
  });
});

describe("the staff row a group grant creates", () => {
  it("cannot be signed in to with a password", () => {
    const user = ssoStaffUser("provisioned@circuvent.com", "Provisioned", "superadmin");
    upsertAdminUser(user);
    for (const guess of ["", "password", "Password1!", user.salt, user.hash, "admin"]) {
      expect(authenticate("provisioned@circuvent.com", guess)).toBeNull();
    }
  });

  it("gives each account its own credentials", () => {
    const a = ssoStaffUser("a@circuvent.com", "A", "superadmin");
    const b = ssoStaffUser("b@circuvent.com", "B", "superadmin");
    expect(a.hash).not.toBe(b.hash);
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is marked as having come from single sign-on", () => {
    const user = ssoStaffUser("c@circuvent.com", "C", "superadmin");
    expect(user.ssoProvisioned).toBe(true);
    expect(user.createdBy).toBe("sso");
    expect(user.active).toBe(true);
    // Not flagged for a password change: there is no password to change, and
    // the prompt would be a dead end.
    expect(user.mustChangePassword).toBeUndefined();
  });

  it("falls back to the address when the provider sends no name", () => {
    expect(ssoStaffUser("d@circuvent.com", "", "superadmin").name).toBe("d@circuvent.com");
  });
});
