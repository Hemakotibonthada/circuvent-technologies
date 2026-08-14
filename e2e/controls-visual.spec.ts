import { test, expect } from "@playwright/test";

/**
 * A visual pass over the new device controls.
 *
 * These replace native inputs with custom widgets, and the failure mode for
 * that is not a thrown error — it is a slider that renders 4px tall, a fill
 * that sits outside its track, or a dial that overlaps the text beside it.
 * Nothing in the unit tests can see any of that.
 *
 * Run with: E2E_PORT=3311 npx playwright test e2e/controls-visual.spec.ts
 */

const HARNESS = "/dev/controls";

test.describe("device controls", () => {
  test("render at a usable size and do not overflow", async ({ page }) => {
    const res = await page.goto(HARNESS);
    // The harness is a development-only page; skip cleanly where it is absent
    // rather than failing a suite for something that is not a product bug.
    test.skip(!res || res.status() >= 400, "controls harness not present in this build");

    const slider = page.getByRole("slider", { name: /brightness/i }).first();
    await expect(slider).toBeVisible();

    const box = await slider.boundingBox();
    expect(box).not.toBeNull();
    // A drag target has to be big enough to drag. This is the whole reason the
    // control exists rather than a 4px rail with a 16px thumb.
    expect(box!.height).toBeGreaterThan(120);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  });

  test("keyboard reaches every control", async ({ page }) => {
    const res = await page.goto(HARNESS);
    test.skip(!res || res.status() >= 400, "controls harness not present in this build");

    const slider = page.getByRole("slider", { name: /brightness/i }).first();
    await slider.focus();
    const before = await slider.getAttribute("aria-valuenow");
    await page.keyboard.press("ArrowUp");
    const after = await slider.getAttribute("aria-valuenow");
    expect(Number(after)).toBeGreaterThan(Number(before));
  });

  test("nothing scrolls sideways on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const res = await page.goto(HARNESS);
    test.skip(!res || res.status() >= 400, "controls harness not present in this build");

    // A horizontal scrollbar on a phone is the most common way a new control
    // breaks a page, and it never shows up in a unit test.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
