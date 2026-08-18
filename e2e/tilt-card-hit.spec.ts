import { test, expect, type Page } from "@playwright/test";

/**
 * Tilt cards must answer a click where they are drawn.
 *
 * WHAT WENT WRONG
 *
 * The four Office-suite cards on the homepage are links wrapped in TiltCard.
 * They were clickable on a 1x Windows display and dead on a Retina MacBook —
 * same browser, same build. Nothing errored; the cursor even showed the
 * pointer, because `cursor: pointer` is painted from the same box that was
 * never being hit.
 *
 * TiltCard set `transform-style: preserve-3d`, which puts the subtree into a
 * 3D rendering context. Blink then hit-tests it by inverting the composited
 * layer's transform rather than through normal 2D hit-testing, and that
 * inversion happens against the rasterisation scale — so it is device-pixel-
 * ratio dependent. At 2x the hit region and the painted region stopped
 * agreeing. preserve-3d was buying nothing: it only matters when descendants
 * of a rotated element need their own Z positions, and every child here is
 * flat.
 *
 * WHY THE TEST IS elementFromPoint AND NOT click()
 *
 * These are `target="_blank"` links to other origins. Clicking asserts that a
 * new tab opened, which passes even when the click landed on some wrapper that
 * happened to bubble. Asking what the browser thinks is at the card's centre
 * is the actual question, and it fails for exactly the reason the bug existed.
 */

const CARDS = ["CV-365", "HRMS", "ATS", "Mail"] as const;

/** What the browser would deliver a click at this element's centre to. */
async function hitTargetAtCentre(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { found: false, matches: false, tag: "" };
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      found: true,
      // The anchor itself, or anything inside it, is a real hit.
      matches: Boolean(hit && (hit === el || el.contains(hit))),
      tag: hit ? `${hit.tagName.toLowerCase()}.${(hit.className || "").toString().slice(0, 60)}` : "none",
    };
  }, selector);
}

/**
 * Wait until an element has stopped moving, then return its box.
 *
 * `toBeVisible()` is not enough on this page. ScrollReveal fades each card in
 * from 40px below, and Playwright counts an element with opacity 0 as visible
 * — so a box captured too early is a box mid-entrance. Measuring hover drift
 * against that reported ~38px of "movement" that was really the reveal
 * animation, which is a flaky test rather than a real regression.
 */
async function settledBox(page: Page, selector: string) {
  const locator = page.locator(selector);
  await expect(locator).toBeVisible();

  /*
   * ScrollReveal renders a plain <div> for the first paint and swaps in a
   * motion.div once mounted, to avoid a hydration mismatch. That swap replaces
   * the subtree, so an element grabbed a moment earlier is detached — which
   * surfaces as "Element is not attached to the DOM" from whatever touches it
   * next. Retry through the swap rather than racing it.
   */
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      await locator.scrollIntoViewIfNeeded();
      break;
    } catch {
      await page.waitForTimeout(150);
    }
  }

  let previous = await locator.boundingBox().catch(() => null);
  let stable = 0;
  for (let poll = 0; poll < 30 && stable < 3; poll++) {
    await page.waitForTimeout(100);
    const next = await locator.boundingBox().catch(() => null);
    if (
      previous &&
      next &&
      Math.abs(next.x - previous.x) < 0.5 &&
      Math.abs(next.y - previous.y) < 0.5 &&
      Math.abs(next.width - previous.width) < 0.5 &&
      Math.abs(next.height - previous.height) < 0.5
    ) {
      stable += 1;
    } else {
      stable = 0;
    }
    previous = next;
  }
  expect(previous, `${selector} never settled`).not.toBeNull();
  expect(stable, `${selector} never stopped moving`).toBeGreaterThanOrEqual(3);
  return previous!;
}

for (const dpr of [1, 2]) {
  test.describe(`office suite cards at ${dpr}x`, () => {
    test.use({ deviceScaleFactor: dpr, viewport: { width: 1280, height: 900 } });

    test(`every card receives a click at its centre (${dpr}x)`, async ({ page }) => {
      await page.goto("/");

      for (const name of CARDS) {
        const selector = `a[aria-label="Explore Circuvent ${name}"]`;
        // Settling first also removes the "element is not attached" race that
        // a mid-reveal re-render produces.
        await settledBox(page, selector);

        const result = await hitTargetAtCentre(page, selector);
        expect(result.found, `${name} card is in the DOM`).toBe(true);
        expect(
          result.matches,
          `a click at the centre of the ${name} card should reach its link, but landed on ${result.tag}`,
        ).toBe(true);
      }
    });

    test(`hovering does not move the card out from under the pointer (${dpr}x)`, async ({ page }) => {
      /*
       * The card lifts and scales on hover. If the hit region did not follow
       * the paint, hovering was the moment the two diverged — which is why the
       * bug showed up on a real pointer and not in any static check.
       */
      await page.goto("/");
      const selector = `a[aria-label="Explore Circuvent CV-365"]`;
      await settledBox(page, selector);

      await page.locator(selector).hover();
      await page.waitForTimeout(400); // let the spring settle

      const result = await hitTargetAtCentre(page, selector);
      expect(
        result.matches,
        `while hovered, the centre of the card resolved to ${result.tag}`,
      ).toBe(true);
    });
  });
}

test.describe("tilt cards are flat", () => {
  test("no tilt wrapper creates a 3D rendering context", async ({ page }) => {
    /*
     * The root cause, pinned directly. preserve-3d anywhere in a tilt wrapper
     * puts a link back on the compositor hit-test path, and the symptom only
     * appears on a high-DPR display — which is not the machine most of this is
     * developed on.
     */
    await page.goto("/");
    // No scrolling: this scans the whole document, and ScrollReveal renders
    // its children whether or not they have been revealed. Touching the card
    // first only re-introduces the detach race for no benefit.
    await expect(page.locator('a[aria-label="Explore Circuvent CV-365"]')).toBeVisible();

    const offenders = await page.evaluate(() => {
      const bad: string[] = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
        const style = getComputedStyle(el);
        if (style.transformStyle !== "preserve-3d") continue;
        // Only care about wrappers that contain a link — those are the ones
        // whose hit-testing matters.
        if (!el.querySelector("a[href]")) continue;
        bad.push(`${el.tagName.toLowerCase()}.${(el.className || "").toString().slice(0, 60)}`);
      }
      return bad;
    });

    expect(offenders, "elements wrapping a link in a 3D rendering context").toEqual([]);
  });
});

test.describe("a card does not move away from the pointer", () => {
  /*
   * The second half of the same bug. A pointer-tracking tilt rotates the card
   * toward the cursor and lifts it, so the "Explore" affordance in the corner
   * moved as you aimed at it — and moved further the closer you got. Fitts's
   * law: a target that retreats is a target you miss.
   *
   * This is measured rather than asserted structurally, because the movement
   * came from three separate sources stacked (tilt rotation, a 4px lift and a
   * 1.02 scale) and any one of them returning would reproduce the complaint.
   */
  const MAX_DRIFT_PX = 1.5;

  test("the office-suite card stays put while the pointer crosses it", async ({ page }) => {
    await page.goto("/");
    const selector = 'a[aria-label="Explore Circuvent CV-365"]';
    // The reveal must be over before this means anything — see settledBox.
    const b = await settledBox(page, selector);

    // Aim at the corner the "Explore" affordance lives in — the worst case for
    // a tilt, because it is furthest from the centre of rotation.
    await page.mouse.move(b.x + b.width - 60, b.y + b.height - 30);
    await page.waitForTimeout(500); // springs settle

    const after = await page.locator(selector).boundingBox();
    expect(after).not.toBeNull();
    const a = after!;

    const drift = Math.max(
      Math.abs(a.x - b.x),
      Math.abs(a.y - b.y),
      Math.abs(a.width - b.width),
      Math.abs(a.height - b.height),
    );
    expect(
      drift,
      `card moved ${drift.toFixed(1)}px while the pointer approached its Explore link`,
    ).toBeLessThanOrEqual(MAX_DRIFT_PX);
  });

  test("no card that contains a link tracks the pointer", async ({ page }) => {
    /*
     * Structural companion to the measurement above, and the one that will
     * catch this on a page nobody wrote a test for. A rotating wrapper is
     * fine around decoration; around a link it moves the target.
     */
    for (const path of ["/", "/contact"]) {
      await page.goto(path);
      await page.waitForLoadState("domcontentloaded");
      // Nudge the pointer across the page so any tilt has been given a chance
      // to apply a transform.
      await page.mouse.move(640, 400);
      await page.mouse.move(660, 460);
      await page.waitForTimeout(300);

      const offenders = await page.evaluate(() => {
        const bad: string[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
          if (!el.querySelector("a[href]")) continue;
          const t = getComputedStyle(el).transform;
          if (!t || t === "none") continue;
          // matrix3d means a real 3D rotation is applied — a 2D matrix from a
          // static translate is not what this is about.
          if (t.startsWith("matrix3d")) {
            bad.push(`${el.tagName.toLowerCase()}.${(el.className || "").toString().slice(0, 50)} → ${t.slice(0, 40)}`);
          }
        }
        return bad;
      });

      expect(offenders, `${path}: wrappers rotating a link in 3D`).toEqual([]);
    }
  });
});
