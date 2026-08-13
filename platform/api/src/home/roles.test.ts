import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  can,
  canGrant,
  allows,
  isAccountHolder,
  normaliseRole,
  refusalFor,
  ROLES,
  type HomeRole,
  type Membership,
} from "./roles";

/**
 * These decide who can open somebody's front door.
 *
 * The cases below are weighted towards the ways a permission model quietly
 * grants more than intended — a guest inheriting control, an adult inviting an
 * owner, a member acting on the account — rather than towards the happy path,
 * which is one line and never the thing that goes wrong.
 */

const m = (role: HomeRole, over: Partial<Membership> = {}): Membership => ({
  homeId: 1,
  actorId: 2,
  role,
  ...over,
});

describe("what each role can do", () => {
  it("gives the owner everything", () => {
    for (const c of ["view", "control", "security", "manage-devices", "manage-automations", "manage-members", "account"] as const) {
      assert.equal(can("owner", c), true);
    }
  });

  it("lets an adult run the home but not give it away", () => {
    assert.equal(can("adult", "control"), true);
    assert.equal(can("adult", "security"), true);
    assert.equal(can("adult", "manage-devices"), true);
    // Inviting is how a household is quietly widened.
    assert.equal(can("adult", "manage-members"), false);
    assert.equal(can("adult", "account"), false);
  });

  it("lets a limited member use the home without changing it", () => {
    assert.equal(can("limited", "control"), true);
    assert.equal(can("limited", "manage-devices"), false);
    assert.equal(can("limited", "manage-automations"), false);
  });

  it("does NOT let a limited member unlock doors", () => {
    /*
     * The separation this file exists for: a household giving somebody the
     * lights should not hand over the deadbolt as a side effect.
     */
    assert.equal(can("limited", "security"), false);
  });

  it("gives a guest sight of the home and nothing more", () => {
    assert.equal(can("guest", "view"), true);
    assert.equal(can("guest", "control"), false);
    assert.equal(can("guest", "security"), false);
  });

  it("refuses a capability nobody declared", () => {
    assert.equal(can("guest", "nonsense" as never), false);
    assert.equal(can("nonsense" as HomeRole, "view"), false);
  });
});

describe("who may grant what", () => {
  it("lets the owner grant any lesser role", () => {
    assert.equal(canGrant("owner", "adult"), true);
    assert.equal(canGrant("owner", "limited"), true);
    assert.equal(canGrant("owner", "guest"), true);
  });

  it("never lets anybody create an owner", () => {
    // A home has exactly one, and granting one is handing the house away.
    assert.equal(canGrant("owner", "owner"), false);
    assert.equal(canGrant("adult", "owner"), false);
  });

  it("does not let an adult invite anybody at all", () => {
    assert.equal(canGrant("adult", "limited"), false);
    assert.equal(canGrant("adult", "guest"), false);
  });

  it("does not let a role grant itself", () => {
    for (const r of ROLES) assert.equal(canGrant(r, r), false);
  });

  it("never lets a lesser role grant a greater one", () => {
    for (const inviter of ROLES) {
      for (const granted of ROLES) {
        if (ROLES.indexOf(granted) <= ROLES.indexOf(inviter)) {
          assert.equal(canGrant(inviter, granted), false);
        }
      }
    }
  });
});

describe("acting on a home", () => {
  it("allows what the role allows", () => {
    assert.equal(allows(m("adult"), "control"), true);
    assert.equal(allows(m("guest"), "control"), false);
  });

  it("treats the account holder as the account holder", () => {
    assert.equal(isAccountHolder({ homeId: 7, actorId: 7, role: "owner" }), true);
  });

  it("refuses account actions to a member, whatever their role says", () => {
    /*
     * The row is not trusted. A bad migration or a hand-edited role reading
     * "owner" must not let somebody delete an account that is not theirs, so
     * the check is on identity rather than on the word.
     */
    assert.equal(isAccountHolder({ homeId: 7, actorId: 9, role: "owner" }), false);
  });
});

describe("normaliseRole", () => {
  it("accepts the roles that exist", () => {
    for (const r of ROLES) assert.equal(normaliseRole(r), r);
  });

  it("rejects anything else rather than defaulting", () => {
    // Defaulting an unknown role to "guest" would silently downgrade somebody;
    // defaulting to anything higher would silently promote them.
    assert.equal(normaliseRole("admin"), null);
    assert.equal(normaliseRole(""), null);
    assert.equal(normaliseRole(null), null);
    assert.equal(normaliseRole(3), null);
  });
});

describe("refusals", () => {
  it("tells a guest what to do about a lock", () => {
    const msg = refusalFor("guest", "security");
    assert.match(msg, /Guests cannot unlock/);
    assert.match(msg, /home owner/);
  });

  it("names the role that could do it instead", () => {
    assert.match(refusalFor("limited", "manage-devices"), /adults/);
    assert.match(refusalFor("adult", "manage-members"), /owner/);
  });

  it("never blames the person for a capability they were never given", () => {
    // Wording check: refusals explain the boundary rather than implying error.
    for (const r of ROLES) {
      for (const c of ["control", "security", "manage-devices", "manage-members", "account"] as const) {
        assert.doesNotMatch(refusalFor(r, c), /invalid|forbidden|denied/i);
      }
    }
  });
});
