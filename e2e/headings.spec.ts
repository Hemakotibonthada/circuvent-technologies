import { expect, test } from "@playwright/test";

/**
 * Every page needs exactly one h1.
 *
 * The checkout sign-in gate had none. It was missed because checkout has four
 * branches and only one of them was ever looked at: visiting /checkout with an
 * empty cart renders the "your cart is empty" branch, which does have an h1, so
 * a naive check passed. The gate only appears with something in the cart *and*
 * nobody signed in, and in that state the page began at h2 — a screen reader
 * jumping by heading found no top-level landmark.
 *
 * So these tests put the cart into the state that reveals each branch rather
 * than just requesting the URL.
 */

async function dismissConsent(page: import("@playwright/test").Page) {
  try {
    await page.getByRole("button", { name: /accept all/i }).click({ timeout: 4000 });
  } catch {
    /* banner already dismissed, or not shown */
  }
}

test.describe("heading structure", () => {
  test("checkout sign-in gate has exactly one h1", async ({ page }) => {
    await page.goto("/shop");
    await dismissConsent(page);

    // The gate only renders when there is something to check out.
    await page.getByRole("button", { name: /^Add to cart —/i }).first().click();
    await page.goto("/checkout");

    await expect(page.getByRole("heading", { name: /sign in to check out/i })).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
  });

  test("checkout with an empty cart has exactly one h1", async ({ page }) => {
    await page.goto("/checkout");
    await dismissConsent(page);
    await expect(page.locator("h1")).toHaveCount(1);
  });

  for (const route of ["/shop", "/cart", "/shop/circuvent-smart-plug", "/shop/account"]) {
    test(`${route} has exactly one h1`, async ({ page }) => {
      await page.goto(route);
      await dismissConsent(page);
      await page.locator("h1").first().waitFor({ state: "visible" });
      await expect(page.locator("h1")).toHaveCount(1);
    });
  }
});
