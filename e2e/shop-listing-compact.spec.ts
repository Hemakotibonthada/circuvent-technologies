import { expect, test } from "@playwright/test";

/**
 * The storefront has to put products on the first screen, and has to not clip
 * its own controls doing it.
 *
 * WHAT WENT WRONG
 *
 * The listing led with a full-bleed showcase: a single product, an oversized
 * decorative headline, and enough top padding to clear it. Measured against
 * the live site, the first product card sat 1806px down on a 390px phone —
 * 2.14 screens of scrolling before a shopper saw anything they could buy —
 * and 1216px down on a laptop. Below the showcase came a paragraph, a
 * four-column stat grid, a wrapping row of category chips and four bordered
 * trust tiles, each of which was individually reasonable and which together
 * cost another 470px.
 *
 * None of that is visible to a type check, a unit test or a build. It is a
 * layout result, so it is asserted as one.
 *
 * The second test exists because of the bug introduced while fixing the first.
 * Making the thumbnail rail scroll instead of wrap left it a flex item with
 * the default `min-width: auto`, so it refused to shrink below its six 44px
 * thumbs: the stage's info panel measured 412px inside a 358px stage and its
 * right-hand side — the price and the "Add to bag" button — was clipped by the
 * stage's own `overflow: hidden`.
 *
 * e2e/mobile-layout.spec.ts could not catch that, and neither could the
 * scrollWidth check it replaced: clipped content does not scroll. The page was
 * perfectly well behaved by both measures and visibly cut in half on a phone.
 * This asserts that content actually fits inside the box that clips it.
 */

/** Generous enough to survive font and platform differences, tight enough that
 *  re-adding a full-screen hero fails. Measured values when written: 1046px on
 *  the phone, 821px on both desktop sizes. */
const BUDGETS = [
  { name: "phone", width: 390, height: 844, maxFirstCard: 1250 },
  { name: "laptop", width: 1440, height: 900, maxFirstCard: 1000 },
  { name: "desktop", width: 1920, height: 1080, maxFirstCard: 1000 },
];

test.describe("shop listing stays compact", () => {
  for (const vp of BUDGETS) {
    test(`${vp.name}: a product is reachable within ${vp.maxFirstCard}px`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/shop");

      const card = page.locator("[data-testid='product-card']").first();
      await card.waitFor({ state: "attached" });

      const top = await card.evaluate(
        (el) => Math.round(el.getBoundingClientRect().top + window.scrollY),
      );

      expect(
        top,
        `first product card is ${top}px down at ${vp.width}px wide (${(top / vp.height).toFixed(2)} screens)`,
      ).toBeLessThanOrEqual(vp.maxFirstCard);
    });
  }
});

test.describe("the showcase does not clip its own contents", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("nothing inside the stage is wider than the stage", async ({ page }) => {
    await page.goto("/shop");
    await page.locator(".cv-stage").waitFor({ state: "visible" });
    await page.waitForTimeout(400); // entrance animation settles

    const clipped = await page.evaluate(() => {
      const stage = document.querySelector(".cv-stage");
      if (!stage) return [{ cls: "no .cv-stage found", overshoot: -1 }];
      const limit = stage.getBoundingClientRect().right;
      const out: { cls: string; overshoot: number }[] = [];
      stage.querySelectorAll("*").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0) return;
        // Decorative layers are allowed to bleed; they carry no controls or
        // text, and being clipped is the whole point of them.
        if (el.closest("[aria-hidden='true']")) return;
        // The thumbnail rail scrolls by design, so its contents overflowing
        // it is the intended behaviour rather than a clipped control —
        // `closest`, not a class check on the element itself, because it is
        // the thumbs *inside* the rail that stick out.
        if (el.closest(".cv-thumb-rail")) return;
        const overshoot = Math.round(r.right - limit);
        if (overshoot > 1) {
          out.push({ cls: (el.className?.toString?.() ?? "").slice(0, 70), overshoot });
        }
      });
      return out;
    });

    expect(
      clipped,
      `these are cut off by the stage's overflow:hidden — ${JSON.stringify(clipped)}`,
    ).toEqual([]);
  });
});
