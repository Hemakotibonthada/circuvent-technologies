jest.mock("react-native", () => ({ StatusBar: { setBarStyle: () => {} } }), { virtual: true });

import { DEVICE_META as MOBILE_META } from "../mobile/src/theme";
import { DEVICE_META as WEB_META } from "@/app/smarthome/DeviceControls";
import { products } from "@/lib/shop-data";

/**
 * The console and the app must agree on what devices exist.
 *
 * Every device bug found in this codebase has been a version of the same
 * thing: one platform knew about a device or a field and the other did not.
 * The console could not dim a smart light the phone dimmed happily, because
 * only the phone's capability table spelled the type "smart-light". The
 * console did not know curtains or locks existed at all. The phone offered a
 * switch on a touchboard field its firmware never reads while the console did
 * not.
 *
 * None of those failed loudly. Each one shipped, and each looked like a
 * hardware fault from the customer's side.
 *
 * The shop is the third party to the agreement: a product on sale with no
 * entry on either platform is a device somebody can buy and then not control.
 */
describe("device type parity", () => {
  const webTypes = Object.keys(WEB_META).sort();
  const mobileTypes = Object.keys(MOBILE_META).sort();

  it("the console knows every type the app knows", () => {
    expect(mobileTypes.filter((t) => !webTypes.includes(t))).toEqual([]);
  });

  it("the app knows every type the console knows", () => {
    expect(webTypes.filter((t) => !mobileTypes.includes(t))).toEqual([]);
  });

  it.each(products.map((p) => p.id))("both platforms know %s, which the shop sells", (type) => {
    expect(webTypes).toContain(type);
    expect(mobileTypes).toContain(type);
  });

  /*
   * Names are allowed to differ in wording — the console has more room than a
   * phone tile — but a type that is a real product on one platform and a raw
   * slug on the other is the failure this file exists for.
   */
  it.each(Object.keys(WEB_META))("%s reads as a product name on both, not a slug", (type) => {
    expect(WEB_META[type].label).not.toBe(type);
    expect(MOBILE_META[type].label).not.toBe(type);
  });
});
