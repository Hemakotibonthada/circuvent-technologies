import { expect, test } from "@playwright/test";

/**
 * Horizontal scroll on a phone.
 *
 * The product page scrolled sideways by 146px at 390px wide, and nothing in a
 * type check, a unit test or a build could see it: it was a layout result, not
 * a code error. The cause was the "You may also like" card being a grid item,
 * which defaults to `min-width: auto` and so refuses to shrink below its
 * min-content — and `truncate` sets `white-space: nowrap`, which made that
 * min-content the full untruncated tagline. The inner `min-w-0` could not help,
 * because the item wrapping it never shrank in the first place.
 *
 * Asserted by actually scrolling rather than by comparing scrollWidth to
 * clientWidth: an earlier check compared those and passed on pages where a
 * decorative blur sits outside the viewport but is clipped by an ancestor.
 * What matters is whether a thumb can drag the page sideways.
 */

const ROUTES = [
  "/shop",
  "/shop/circuvent-smart-plug",
  "/cart",
  "/checkout",
];

test.describe("mobile layout", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const route of ROUTES) {
    test(`${route} does not scroll sideways at 390px`, async ({ page }) => {
      await page.goto(route);
      /*
       * Deliberately not `networkidle`: the dev server holds an HMR websocket
       * open, so it never settles and the wait eats the whole timeout budget.
       * Waiting for the heading is both faster and true in dev and prod alike.
       */
      await page.locator("h1").first().waitFor({ state: "visible" });
      await page.waitForTimeout(400); // let entrance animations land

      const overscroll = await page.evaluate(() => {
        window.scrollTo(9999, 0);
        const x = window.scrollX;
        window.scrollTo(0, 0);
        return x;
      });

      expect(overscroll, `${route} can be dragged ${overscroll}px sideways`).toBe(0);
    });
  }
});
