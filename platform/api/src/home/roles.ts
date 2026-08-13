/**
 * Household sharing.
 *
 * A home has one account that owns it and any number of people who live in it.
 * Until now those were the same thing: every device row carries a single
 * `owner_id`, so a partner, a grown child or a housekeeper could only get in
 * by being handed the account password — which grants them everything
 * including the ability to lock the owner out, and leaves no record of who
 * actually opened the door.
 *
 * THE SHAPE THIS TAKES, AND WHY
 *
 * A member acts *within* a home rather than alongside it. When a member makes
 * a request, the home's owner id is what scopes every query — which is what
 * lets the 113 existing `WHERE owner_id = $1` sites keep working unchanged and
 * keep meaning the right thing. Their own identity is carried separately, so
 * the audit trail says who did it and account-level actions can refuse them.
 *
 * That separation is the whole safety argument, and it is why `actorId` and
 * `homeId` are two fields rather than one clever value.
 */

export type HomeRole = "owner" | "adult" | "limited" | "guest";

/**
 * Roles, most trusted first.
 *
 * The list is short on purpose: a permission model nobody can hold in their
 * head is one where somebody grants more than they meant to.
 */
export const ROLES: HomeRole[] = ["owner", "adult", "limited", "guest"];

export type Capability =
  /** See devices, rooms, scenes, history. */
  | "view"
  /** Turn things on and off, run scenes. */
  | "control"
  /** Unlock doors, open gates, disarm alarms. */
  | "security"
  /** Add, remove, rename or reconfigure devices. */
  | "manage-devices"
  /** Create and edit automations. */
  | "manage-automations"
  /** Invite, change or remove other members. */
  | "manage-members"
  /** Billing, account deletion, transferring the home. */
  | "account";

/** Every capability, in a stable order. */
export const ALL_CAPABILITIES: Capability[] = [
  "view",
  "control",
  "security",
  "manage-devices",
  "manage-automations",
  "manage-members",
  "account",
];

const CAPABILITIES: Record<HomeRole, Capability[]> = {
  owner: [
    "view",
    "control",
    "security",
    "manage-devices",
    "manage-automations",
    "manage-members",
    "account",
  ],
  /*
   * An adult can run the home but cannot give away access to it. Inviting is
   * how a household is quietly widened, and it belongs to whoever is
   * answerable for the account.
   */
  adult: ["view", "control", "security", "manage-devices", "manage-automations"],
  /*
   * Everyday control without the ability to change what the home is. Intended
   * for older children, and for anybody who should be able to turn the lights
   * on without being able to delete the cameras.
   */
  limited: ["view", "control"],
  /*
   * Deliberately not "control". A guest can see the home is fine; letting a
   * houseguest open the front door by default is a decision somebody should
   * make on purpose rather than inherit.
   */
  guest: ["view"],
};

/**
 * Every capability a role has, as a list a client can test against.
 *
 * The map itself stays private to `roles.ts` — this is the only way out of it,
 * so there is one definition of what a role means and screens read it rather
 * than restating it.
 */
export function capabilitiesOf(role: HomeRole): Capability[] {
  return ALL_CAPABILITIES.filter((c) => can(role, c));
}

export function can(role: HomeRole, capability: Capability): boolean {
  return CAPABILITIES[role]?.includes(capability) ?? false;
}

/**
 * Whether an inviter may grant a role.
 *
 * Nobody may grant a role at or above their own, and nobody may create an
 * owner — a home has exactly one. Without this an adult could invite an owner
 * and hand the house away.
 */
export function canGrant(inviter: HomeRole, granted: HomeRole): boolean {
  if (!can(inviter, "manage-members")) return false;
  if (granted === "owner") return false;
  return ROLES.indexOf(granted) > ROLES.indexOf(inviter);
}

export interface Membership {
  homeId: number;
  actorId: number;
  role: HomeRole;
}

/**
 * Whether this request may act on the home.
 *
 * `security` is separate from `control` because unlocking a door is not the
 * same act as turning on a lamp, and a household giving a cleaner the lights
 * should not be handing over the deadbolt as a side effect.
 */
export function allows(m: Membership, capability: Capability): boolean {
  return can(m.role, capability);
}

/**
 * Account-level actions belong to the owner, and the check is on identity
 * rather than on role.
 *
 * A member whose role somehow read "owner" — a bad migration, a hand-edited
 * row — would otherwise be able to delete the account. Comparing ids means the
 * only person who can do that is the account itself.
 */
export function isAccountHolder(m: Membership): boolean {
  return m.actorId === m.homeId;
}

export function normaliseRole(v: unknown): HomeRole | null {
  return typeof v === "string" && (ROLES as string[]).includes(v) ? (v as HomeRole) : null;
}

/** Human wording for a refusal, used verbatim by the API. */
export function refusalFor(role: HomeRole, capability: Capability): string {
  switch (capability) {
    case "security":
      return role === "guest"
        ? "Guests cannot unlock doors. Ask the home owner to change your access."
        : "Your access does not include locks, alarms and aircraft.";
    case "manage-devices":
      return "Only adults in this home can add or remove devices.";
    case "manage-automations":
      return "Only adults in this home can change automations.";
    case "manage-members":
      return "Only the home owner can invite or remove people.";
    case "account":
      return "Only the home owner can change account settings.";
    case "control":
      return "Your access to this home is view-only.";
    default:
      return "You do not have access to this home.";
  }
}
