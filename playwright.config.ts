import { defineConfig, devices } from "@playwright/test";

/*
 * The port is configurable because 3000 is not reliably free.
 *
 * With reuseExistingServer, a stray process on 3000 does not cause an error —
 * it causes the entire suite to run against whatever that process is. On the
 * machine this was debugged on, an unrelated desktop app had held the port for
 * a week, so every assertion about the homepage was being made against a
 * different application, and the failures looked like the site had changed.
 */
const PORT = Number(process.env.E2E_PORT || 3000);
const BASE_URL = `http://localhost:${PORT}`;

/*
 * Which browsers to run.
 *
 * The workflow installs chromium and only chromium, while this config declared
 * three projects — so every CI run launched firefox and webkit, failed with
 * "Executable doesn't exist", and reported the suite as broken. Two files
 * disagreed and neither was obviously wrong on its own.
 *
 * Chromium is the default in CI because fast feedback that stays green is
 * worth more than triple coverage nobody can keep passing; the other engines
 * are a deliberate opt-in via E2E_BROWSERS, and remain the default locally
 * where they are usually installed. Whatever is listed here must be what the
 * workflow installs.
 */
const ALL_BROWSERS = ["chromium", "firefox", "webkit"] as const;
type BrowserName = (typeof ALL_BROWSERS)[number];

const requested = (process.env.E2E_BROWSERS || (process.env.CI ? "chromium" : ALL_BROWSERS.join(",")))
  .split(",")
  .map((s) => s.trim())
  .filter((s): s is BrowserName => (ALL_BROWSERS as readonly string[]).includes(s));

const DEVICE_FOR: Record<BrowserName, string> = {
  chromium: "Desktop Chrome",
  firefox: "Desktop Firefox",
  webkit: "Desktop Safari",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: (requested.length ? requested : ["chromium" as BrowserName]).map((name) => ({
    name,
    use: { ...devices[DEVICE_FOR[name]] },
  })),
  webServer: {
    /*
     * Run the built app, not the dev server.
     *
     * This said `npm run dev`, which compiles each route on first request — so
     * the first test to touch a page waited on a webpack build while its
     * 10-second assertion timed out, and the suite failed on content that was
     * present and correct. In CI it was worse than slow: the workflow builds
     * the app in the step before this one, and then this threw that away and
     * compiled everything again in development mode.
     *
     * Locally `next dev` is still the right thing when iterating, and
     * reuseExistingServer means a server you already have running is used
     * either way.
     */
    command: process.env.CI ? `npm run start -- -p ${PORT}` : `npm run dev -- -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180 * 1000,
  },
});
