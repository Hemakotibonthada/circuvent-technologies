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
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
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
