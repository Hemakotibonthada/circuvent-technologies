import { expect, test } from "@playwright/test";

/**
 * The shop redesign's promises, asserted in a real browser.
 *
 * Everything here failed at least once while the page was being built, which
 * is the whole reason it is written down:
 *
 *  - the tilt silently did nothing, because a conditional `useTransform` broke
 *    hook order;
 *  - the reduced-motion path still tilted, because the guard was checked after
 *    the motion values were already wired;
 *  - the hero shipped a second copy of the trust row that already existed
 *    150px below it;
 *  - the stat labels measured 2.36:1 in dark mode.
 *
 * None of those show up in a type check or a build.
 */

test.describe("shop hero", () => {
  test("server-renders its heading and the crawlable category links", async ({ page }) => {
    // Deliberately checks the HTML the server sent, not the hydrated DOM: this
    // page carries JSON-LD and canonicals, so the content has to exist for a
    // crawler that runs no JavaScript.
    const res = await page.request.get("/shop");
    expect(res.status()).toBe(200);
    const html = await res.text();

    expect(html).toContain('id="shop-hero-title"');
    expect(html).toContain("application/ld+json");
    expect(html).toContain("/shop?cat=");
  });

  test("does not repeat the trust row that already exists below it", async ({ page }) => {
    await page.goto("/shop");
    /*
     * `exact` matters here. The first version matched any text containing
     * "6-month warranty" and found two hits — but one was the hero's prose
     * ("...and a 6-month warranty on every product"), which is a sentence, not
     * a duplicated tile. The regression worth catching is a second *tile* with
     * that heading, so the assertion has to match the heading exactly.
     */
    const tileHeading = page.getByText("6-month warranty", { exact: true });
    await expect(tileHeading).toHaveCount(1);
  });

  test("keeps the 3D stage away from assistive technology", async ({ page }) => {
    await page.goto("/shop");
    // The stage duplicates three products that are already real cards in the
    // grid. It is decorative, so it must not be announced.
    const stage = page.locator('header [aria-hidden="true"]').first();
    await expect(stage).toHaveAttribute("aria-hidden", "true");
  });
});

test.describe("product card depth", () => {
  test("tilts into a real 3D transform on hover", async ({ page }) => {
    await page.goto("/shop");
    const card = page.locator("article").first();
    await card.scrollIntoViewIfNeeded();

    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    // Off-centre, so both rotateX and rotateY are non-zero.
    await page.mouse.move(box!.x + box!.width * 0.85, box!.y + box!.height * 0.2);
    await page.waitForTimeout(450);

    const transform = await page.evaluate(() => {
      const el = document.querySelector("article [style*='preserve-3d'] > div");
      return el ? getComputedStyle(el).transform : "none";
    });

    /*
     * `matrix3d` rather than `matrix` is the whole assertion. A 2D skew would
     * look broadly similar in a screenshot and serialise as `matrix(...)`, so
     * this is what distinguishes a perspective projection from a cheap fake.
     */
    expect(transform.startsWith("matrix3d")).toBe(true);
  });

  test("stays completely flat under prefers-reduced-motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/shop");
    const card = page.locator("article").first();
    await card.scrollIntoViewIfNeeded();

    const box = await card.boundingBox();
    await page.mouse.move(box!.x + box!.width * 0.85, box!.y + box!.height * 0.2);
    await page.waitForTimeout(350);

    const transform = await page.evaluate(() => {
      const el = document.querySelector("article [style*='preserve-3d'] > div");
      return el ? getComputedStyle(el).transform : "none";
    });

    // Flat, not "less tilted" — parallax is a vestibular trigger, so the
    // correct amount when it is switched off is none.
    expect(transform.startsWith("matrix3d")).toBe(false);
  });
});

test.describe("responsive", () => {
  for (const width of [375, 768, 1024, 1440]) {
    test(`has no horizontal scroll at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/shop");
      await page.waitForTimeout(400);
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      );
      expect(overflows).toBe(false);
    });
  }
});
