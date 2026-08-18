/**
 * The products an incident can be filed against, and who owns each one.
 *
 * WHY THIS EXISTS
 *
 * "Owning service" was a free-text field on the declare dialog — a comma-
 * separated box with `control-plane, mqtt` as its placeholder. Every incident
 * in the queue shows "—" for it, which is what a field nobody fills in looks
 * like, and the reason is ordinary: at 2am nobody types a taxonomy from memory.
 *
 * It also meant the field could not route anything. Notifications go to
 * `owningTeam`, which was picked from a separate dropdown, so filing against
 * the mobile app and routing it to Platform was two independent choices and
 * they disagreed whenever somebody was in a hurry.
 *
 * A product now carries its team. Choosing what broke picks who is paged,
 * because those are the same decision — and `recipientsFor` in icm-notify.ts
 * already turns a team name into a distribution list.
 *
 * KEPT DELIBERATELY SHORT
 *
 * One entry per thing that can be down on its own and has somebody to wake.
 * A taxonomy nobody can hold in their head gets the first option picked every
 * time, which is worse than free text because it looks deliberate.
 */

export interface IcmProduct {
  /** Stable id, stored on the incident. Never renamed — it is in history. */
  id: string;
  label: string;
  /** Routed here unless the person filing overrides it. */
  team: string;
  hint: string;
}

/**
 * Team names must match the rota and contact tables in the ICM store, or an
 * incident routes to a team that resolves to no addresses. `icm-products.test`
 * pins that every team here is one the store knows.
 */
export const ICM_PRODUCTS: readonly IcmProduct[] = [
  { id: "website", label: "Website & shop", team: "Web", hint: "circuvent.com, checkout, orders" },
  { id: "cv365", label: "CV-365", team: "Workspace", hint: "Docs, Sheets, Chat, Meetings" },
  { id: "hrms", label: "HRMS", team: "Workspace", hint: "Employees, payroll, attendance" },
  { id: "ats", label: "ATS", team: "Workspace", hint: "Hiring pipeline, interviews" },
  { id: "mail", label: "Mail", team: "Workspace", hint: "IMAP/SMTP, calendar, contacts" },
  { id: "control-plane", label: "Control plane", team: "Platform", hint: "Device API, WebSocket, MQTT bridge" },
  { id: "broker", label: "MQTT broker", team: "Platform", hint: "Mosquitto, device connectivity" },
  { id: "smarthome", label: "Smart-home console", team: "Web", hint: "/smarthome, device controls" },
  { id: "mobile", label: "Mobile app", team: "Mobile", hint: "Android and iOS" },
  { id: "firmware", label: "Device firmware", team: "Firmware", hint: "ESP32 fleet, OTA" },
  { id: "identity", label: "Identity & access", team: "Platform", hint: "Sign-in, sessions, SSO" },
  { id: "billing", label: "Payments", team: "Web", hint: "Razorpay, invoicing, wallets" },
];

export function productById(id: string): IcmProduct | undefined {
  return ICM_PRODUCTS.find((p) => p.id === id);
}

/** Human labels for the ids stored on an incident. */
export function productLabels(ids: readonly string[]): string[] {
  return ids.map((id) => productById(id)?.label ?? id);
}

/**
 * The team that should own an incident affecting these products.
 *
 * Returns null rather than guessing when the choice is ambiguous. Two products
 * owned by different teams is a real situation — a checkout failure caused by
 * the broker — and silently picking the first would route half of those to the
 * wrong rota. The dialog leaves the team dropdown to the person instead, which
 * is the one moment they actually know the answer.
 */
export function teamForProducts(ids: readonly string[]): string | null {
  const teams = new Set<string>();
  for (const id of ids) {
    const p = productById(id);
    if (p) teams.add(p.team);
  }
  return teams.size === 1 ? [...teams][0] : null;
}

/** Every team named by the catalogue, for seeding contacts and rotas. */
export function productTeams(): string[] {
  return [...new Set(ICM_PRODUCTS.map((p) => p.team))].sort();
}
