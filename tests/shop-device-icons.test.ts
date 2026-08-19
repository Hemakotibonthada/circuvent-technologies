jest.mock("react-native", () => ({ StatusBar: { setBarStyle: () => {} } }), { virtual: true });

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEVICE_META } from "@/app/smarthome/DeviceControls";

/*
 * The shop's device page keeps its own icon map.
 *
 * That was harmless while the page could only list devices claimed here — the
 * eight types it knew were roughly the eight anyone claimed that way. It stops
 * being harmless now that the page lists what a customer actually owns, because
 * a type missing from this map renders as a generic chip. Somebody's camera
 * appears in their own account as an unlabelled square.
 *
 * The map is not imported from DEVICE_META on purpose: that lives in a
 * five-thousand-line console component, and pulling it into the storefront
 * bundle to read twenty-seven icon names would be a poor trade. This test is
 * what makes the duplication safe.
 */

const PAGE = readFileSync(
  join(__dirname, "..", "src", "app", "shop", "devices", "page.tsx"),
  "utf8",
);

/** The keys of the page's TYPE_ICON literal. */
function shopIconTypes(): string[] {
  const at = PAGE.indexOf("const TYPE_ICON");
  if (at < 0) throw new Error("TYPE_ICON not found");
  const open = PAGE.indexOf("{", at);
  let depth = 0;
  let end = open;
  for (let i = open; i < PAGE.length; i++) {
    if (PAGE[i] === "{") depth++;
    else if (PAGE[i] === "}" && --depth === 0) {
      end = i;
      break;
    }
  }
  return [...PAGE.slice(open, end).matchAll(/^\s{2}"?([a-z0-9-]+)"?:/gm)].map((m) => m[1]);
}

describe("shop device icons", () => {
  const shopTypes = shopIconTypes();

  it("covers every device type the console knows", () => {
    const missing = Object.keys(DEVICE_META).filter((t) => !shopTypes.includes(t));
    expect(missing).toEqual([]);
  });

  it("invents no type the console has never heard of", () => {
    const extra = shopTypes.filter((t) => !(t in DEVICE_META));
    expect(extra).toEqual([]);
  });

  it("still falls back for a device type older firmware might report", () => {
    // Coverage today does not guarantee coverage after the next product; the
    // card must never render nothing.
    expect(PAGE).toContain("TYPE_ICON[device.type] || Cpu");
  });
});
