// Shipping Zones & Rates — pincode-prefix based shipping zones with their own
// rate, free-shipping threshold and ETA. Independent from the shop's default
// flat-rate shipping constant; checkout can consult `resolveZoneForPincode`
// to quote a zone-specific rate once wired in (left as a pure function here
// so it can be adopted without touching the checkout route in this pass).
//
// SERVER ONLY.

import { createFileStore, shortId } from "./data-file";

export interface ShippingZone {
  id: string;
  name: string;
  pincodePrefixes: string[]; // e.g. ["560", "561"] matches pincodes starting with those digits
  ratePerOrder: number;
  freeShippingThreshold: number;
  etaDays: number;
  active: boolean;
}

const store = createFileStore<{ zones: ShippingZone[] }>("admin-shipping.json", () => ({ zones: [] }));

export function listZones(): ShippingZone[] {
  return store.read().zones;
}

export function upsertZone(input: Partial<ShippingZone> & { name: string; pincodePrefixes: string[] }): ShippingZone {
  return store.mutate((db) => {
    const existing = input.id ? db.zones.find((z) => z.id === input.id) : undefined;
    if (existing) {
      Object.assign(existing, input);
      return existing;
    }
    const created: ShippingZone = {
      id: shortId("zone"),
      name: input.name,
      pincodePrefixes: input.pincodePrefixes,
      ratePerOrder: input.ratePerOrder ?? 60,
      freeShippingThreshold: input.freeShippingThreshold ?? 999,
      etaDays: input.etaDays ?? 5,
      active: input.active ?? true,
    };
    db.zones.unshift(created);
    return created;
  });
}

export function deleteZone(id: string): boolean {
  return store.mutate((db) => {
    const before = db.zones.length;
    db.zones = db.zones.filter((z) => z.id !== id);
    return db.zones.length < before;
  });
}

/** Finds the most specific (longest prefix match) active zone for a pincode. */
export function resolveZoneForPincode(pincode: string): ShippingZone | null {
  const zones = store.read().zones.filter((z) => z.active);
  let best: ShippingZone | null = null;
  let bestLen = -1;
  for (const z of zones) {
    for (const prefix of z.pincodePrefixes) {
      if (pincode.startsWith(prefix) && prefix.length > bestLen) {
        best = z;
        bestLen = prefix.length;
      }
    }
  }
  return best;
}
