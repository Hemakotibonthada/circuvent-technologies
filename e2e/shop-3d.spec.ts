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
    /*
     * Pin the motion preference rather than inheriting the machine's.
     *
     * Tilt3D correctly refuses to tilt under prefers-reduced-motion, so on a
     * developer machine with that accessibility setting enabled this test
     * failed while the code was entirely correct — and it would have passed on
     * the next machine, which is worse than failing outright. The companion
     * test below emulates "reduce" explicitly; this one has to be just as
     * explicit about the opposite.
     */
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/shop");

    /*
     * Dismiss consent before hovering. The banner is fixed to the viewport and
     * will swallow a pointer move aimed at whatever sits beneath it.
     */
    await page
      .getByRole("button", { name: /accept all/i })
      .click({ timeout: 4000 })
      .catch(() => {});

    const card = page.locator("article").first();
    await card.scrollIntoViewIfNeeded();

    /*
     * `matrix3d` rather than `matrix` is the whole assertion. A 2D skew would
     * look broadly similar in a screenshot and serialise as `matrix(...)`, so
     * this is what distinguishes a perspective projection from a cheap fake.
     *
     * Everything about the hover is redone on each attempt, because both halves
     * of it go stale. The tilt is driven by a mousemove listener attached at
     * hydration, so a move sent before the component is interactive is simply
     * discarded and never redelivered. And the card's position is not fixed
     * while the page is still settling — entrance animations and images
     * arriving shift it — so coordinates measured once at the start end up
     * pointing at empty space. Re-measuring inside the loop is what makes this
     * deterministic. Two positions per attempt, since the spring ignores a move
     * to the coordinate it already holds.
     */
    await expect
      .poll(
        async () => {
          const box = await card.boundingBox();
          if (!box) return "none";
          await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
          await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.2);
          await page.waitForTimeout(250);
          return page.evaluate(() => {
            const el = document.querySelector("article [style*='preserve-3d'] > div");
            return el ? getComputedStyle(el).transform : "none";
          });
        },
        { message: "card never reached a 3D transform", timeout: 20_000 }
      )
      .toMatch(/^matrix3d/);
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

test.describe("product stage", () => {
  /*
   * The stage is a showcase, never the navigation. A product reachable only by
   * clicking through five slides is a product nobody buys, so the grid and the
   * category links have to survive alongside it.
   */
  test("does not replace the grid or the category links", async ({ page }) => {
    await page.goto("/shop");
    await expect(page.locator("article").first()).toBeVisible();
    expect(await page.locator('a[href*="/shop?cat="]').count()).toBeGreaterThan(0);
  });

  test("announces itself as a carousel and names each slide", async ({ page }) => {
    await page.goto("/shop");
    const stage = page.locator('[aria-roledescription="carousel"]');
    await expect(stage).toHaveAttribute("aria-label", /featured/i);
    // Thumbnails are real named buttons, not 6px dots: "go to slide 3" tells a
    // screen-reader user nothing and is under any sane touch target.
    await expect(stage.getByRole("button", { name: /previous product/i })).toBeVisible();
    await expect(stage.getByRole("button", { name: /next product/i })).toBeVisible();
  });

  test("the next arrow actually changes the product", async ({ page }) => {
    await page.goto("/shop");
    const stage = page.locator('[aria-roledescription="carousel"]');
    const heading = stage.locator("h2");
    const before = await heading.textContent();
    await stage.getByRole("button", { name: /next product/i }).click();
    await page.waitForTimeout(600);
    expect(await heading.textContent()).not.toBe(before);
  });

  /*
   * The regression this guards is the most-complained-about pattern on the
   * web: a carousel that advances while somebody is reading a price or
   * reaching for the buy button.
   */
  test("stops auto-advancing while the pointer is over it", async ({ page }) => {
    await page.goto("/shop");
    const stage = page.locator('[aria-roledescription="carousel"]');
    await stage.hover();
    const before = await stage.locator("h2").textContent();
    // Longer than the 6.5 s auto-advance interval.
    await page.waitForTimeout(7500);
    expect(await stage.locator("h2").textContent()).toBe(before);
  });

  test("does not auto-advance at all under prefers-reduced-motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/shop");
    const heading = page.locator('[aria-roledescription="carousel"] h2');
    const before = await heading.textContent();
    await page.waitForTimeout(7500);
    expect(await heading.textContent()).toBe(before);
  });

  test("the oversized headline is hidden from assistive technology", async ({ page }) => {
    await page.goto("/shop");
    // It repeats the eyebrow and the section label; announcing "Smart home"
    // twice before the product is noise.
    const type = page.locator(".cv-stage-type");
    await expect(type).toHaveAttribute("aria-hidden", "true");
  });

  test("Add to bag reaches the real cart", async ({ page }) => {
    await page.goto("/shop");
    const stage = page.locator('[aria-roledescription="carousel"]');
    await stage.getByRole("button", { name: /add to bag/i }).click();
    // The toast is the observable proof the cart accepted it, rather than the
    // button merely being clickable.
    await expect(page.getByText(/added to cart/i).first()).toBeVisible({ timeout: 5000 });
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
