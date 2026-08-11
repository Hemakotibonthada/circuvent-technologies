import { DEVICE_META, deviceMeta } from "@/app/smarthome/DeviceControls";
import { products } from "@/lib/shop-data";

/**
 * The console has to recognise every device the company sells.
 *
 * smart-light, smart-fan, curtain and smart-lock all had firmware, a shop
 * listing and a place in Add Device, and none of them were in DEVICE_META — so
 * a customer's own dashboard showed their Circuvent Smart Light as
 * "smart-light" with a generic chip icon. Nothing failed; it just looked
 * unfinished, on the screen the owner uses every day.
 *
 * Derived from the catalogue rather than a hand-written list, so the next
 * product to ship cannot be forgotten here quietly.
 *
 * Keyed on the product id, not the slug. The slug is a marketing URL and the
 * two genuinely differ — circuvent-anpr-camera is the device type "anpr-cam",
 * and circuvent-watertank-duo is "watertank" — so deriving the type from the
 * URL invents products that do not exist.
 */

describe("console device catalogue", () => {
  const soldTypes = products.map((p) => p.id);

  it.each(soldTypes)("recognises %s, which the shop sells", (type) => {
    // A missing entry does not throw — it silently renders the slug, which is
    // exactly why this went unnoticed. Assert on the label, not on absence.
    expect(deviceMeta(type).label).not.toBe(type);
  });

  it.each(["smart-light", "smart-fan", "curtain", "smart-lock"])(
    "%s has a real name, icon and accent",
    (type) => {
      const meta = DEVICE_META[type];
      expect(meta).toBeDefined();
      expect(meta.label).toMatch(/^[A-Z]/);
      expect(meta.icon).toBeDefined();
      expect(meta.accent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(meta.blurb.length).toBeGreaterThan(0);
    }
  );

  it("still falls back rather than throwing for a type it has never seen", () => {
    // Add Device can register anything; an unknown type must render, not crash.
    const meta = deviceMeta("not-a-real-type");
    expect(meta.label).toBe("not-a-real-type");
    expect(meta.icon).toBeDefined();
  });

  it("falls back for an empty type without rendering a blank name", () => {
    expect(deviceMeta("").label).toBe("Device");
  });
});
