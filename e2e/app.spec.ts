import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  test("homepage loads correctly", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Circuvent Technologies/);
    await expect(page.locator("text=We Build")).toBeVisible();
  });

  test("navigation links work", async ({ page }) => {
    await page.goto("/");

    // Click Projects link
    await page.click('a[href="/projects"]');
    await expect(page).toHaveURL(/\/projects/);
    await expect(page.locator("text=Our Projects")).toBeVisible({ timeout: 10000 });

    // Click Blog link
    await page.click('a[href="/blog"]');
    await expect(page).toHaveURL(/\/blog/);

    // Click About link
    await page.click('a[href="/about"]');
    await expect(page).toHaveURL(/\/about/);

    // Click Contact link
    await page.click('a[href="/contact"]');
    await expect(page).toHaveURL(/\/contact/);
  });

  test("logo links to home", async ({ page }) => {
    await page.goto("/projects");
    await page.click('a[aria-label="Circuvent Technologies home"]');
    await expect(page).toHaveURL("/");
  });
});

test.describe("Projects Page", () => {
  test("displays project cards", async ({ page }) => {
    await page.goto("/projects");
    // Wait for cards to render
    const cards = page.locator("[class*='rounded-2xl']");
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
  });

  test("category filter works", async ({ page }) => {
    await page.goto("/projects");
    // Click AI & Agents category
    await page.click("text=AI & Agents");
    // Should still be on projects page
    await expect(page).toHaveURL(/\/projects/);
  });

  test("search filter works", async ({ page }) => {
    await page.goto("/projects");
    const searchInput = page.locator('input[placeholder*="Search"]');
    await searchInput.fill("NEXUS");
    // Should filter to show matching projects
    await expect(page.locator("text=NEXUS AI OS")).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Blog Page", () => {
  test("displays blog posts", async ({ page }) => {
    await page.goto("/blog");
    await expect(page.locator("text=Engineering Insights")).toBeVisible({ timeout: 10000 });
  });

  test("blog post detail page loads", async ({ page }) => {
    await page.goto("/blog");
    // Click the first blog card
    const firstCard = page.locator('a[href^="/blog/"]').first();
    await firstCard.click();
    // Should navigate to blog post
    await expect(page).toHaveURL(/\/blog\/.+/);
    // Should show back link
    await expect(page.locator("text=Back to Blog")).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Contact Page", () => {
  test("contact form renders", async ({ page }) => {
    await page.goto("/contact");
    await expect(page.locator('input[placeholder*="John"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('textarea')).toBeVisible();
    await expect(page.locator("text=Send Message")).toBeVisible();
  });

  test("form validation works", async ({ page }) => {
    await page.goto("/contact");
    // Click submit without filling form
    await page.click("text=Send Message");
    // Should show validation errors
    await expect(page.locator("text=Name is required")).toBeVisible({ timeout: 5000 });
  });
});

test.describe("SEO", () => {
  // Derived from the same source as the app (src/lib/config.ts) rather than a
  // hardcoded literal. This assertion previously expected "circuvent.tech",
  // which is not the configured origin, so the test failed on every run.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://circuvent.com";
  const siteHost = new URL(siteUrl).hostname;

  test("sitemap.xml is accessible", async ({ page }) => {
    const response = await page.goto("/sitemap.xml");
    expect(response?.status()).toBe(200);
    const content = await page.content();
    expect(content).toContain("urlset");
    expect(content).toContain(siteHost);
  });

  test("robots.txt is accessible", async ({ page }) => {
    const response = await page.goto("/robots.txt");
    expect(response?.status()).toBe(200);
    const content = await page.content();
    expect(content).toContain("User-agent");
    expect(content).toContain("Sitemap");
  });

  test("pages have proper meta titles", async ({ page }) => {
    await page.goto("/projects");
    await expect(page).toHaveTitle(/Projects/);

    await page.goto("/blog");
    await expect(page).toHaveTitle(/Blog/);

    await page.goto("/contact");
    await expect(page).toHaveTitle(/Contact/);
  });
});

test.describe("Command Palette (Search)", () => {
  test("opens with Ctrl+K", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Control+k");
    await expect(page.locator('input[placeholder*="Search"]')).toBeVisible({ timeout: 5000 });
  });

  test("searches and navigates", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Control+k");
    const searchInput = page.locator('input[placeholder*="Search projects"]');
    await searchInput.fill("NEXUS");
    await expect(page.locator("text=NEXUS AI OS")).toBeVisible({ timeout: 5000 });
    // Press Enter to navigate
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
  });

  test("closes with Escape", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Control+k");
    await expect(page.locator('input[placeholder*="Search"]')).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator('input[placeholder*="Search"]')).not.toBeVisible();
  });
});

test.describe("Theme Toggle", () => {
  test("theme toggle is visible", async ({ page }) => {
    await page.goto("/");
    const themeButton = page.locator('button[aria-label*="Switch theme"]');
    await expect(themeButton).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Responsive Design", () => {
  test("mobile menu opens on small screens", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    const menuButton = page.locator('button[aria-label="Toggle menu"]');
    await expect(menuButton).toBeVisible({ timeout: 10000 });
    await menuButton.click();
    // Navigation links should be visible
    await expect(page.locator("text=Projects").first()).toBeVisible();
  });
});
