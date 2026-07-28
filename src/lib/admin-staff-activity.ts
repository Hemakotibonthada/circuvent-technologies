// Staff Login Activity — records every successful admin/staff login (time,
// email) for visibility into who accessed the control center and when.
// Parallel to (but independent of) the customer-facing `logins` map already
// tracked in store.ts for shop accounts.
//
// SERVER ONLY.

import { createFileStore, shortId } from "./data-file";

export interface StaffLoginEvent {
  id: string;
  email: string;
  at: string;
  userAgent?: string;
}

const store = createFileStore<{ events: StaffLoginEvent[] }>("admin-staff-activity.json", () => ({ events: [] }));

export function recordStaffLogin(email: string, userAgent?: string): StaffLoginEvent {
  return store.mutate((db) => {
    const event: StaffLoginEvent = { id: shortId("login"), email: email.toLowerCase(), at: new Date().toISOString(), userAgent };
    db.events.unshift(event);
    db.events = db.events.slice(0, 1000);
    return event;
  });
}

export function listStaffLogins(email?: string, limit = 100): StaffLoginEvent[] {
  const rows = store.read().events;
  return (email ? rows.filter((e) => e.email === email.toLowerCase()) : rows).slice(0, limit);
}

export function staffActivityStats(): { totalLogins: number; uniqueStaff: number; last24h: number } {
  const rows = store.read().events;
  const cutoff = Date.now() - 86_400_000;
  return {
    totalLogins: rows.length,
    uniqueStaff: new Set(rows.map((r) => r.email)).size,
    last24h: rows.filter((r) => new Date(r.at).getTime() >= cutoff).length,
  };
}
