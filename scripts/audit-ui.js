/**
 * Whole-application UI audit.
 *
 * WHY A TOOL AND NOT A READ-THROUGH
 *
 * The console is 85 routes across six theme combinations. Nobody can hold that
 * in their head, and "looks fine to me" has already been wrong twice here — the
 * admin console rendered black-on-black at 1.07:1 while every unit test passed,
 * and a strict CSP silently refused every inline style while the page still
 * returned 200. Both were found by driving a browser and measuring.
 *
 * So this measures. For each route, in each theme, at desktop and phone widths:
 *
 *   contrast   text that cannot be read against what is actually painted
 *              behind it, per WCAG 2.1 (4.5:1 body, 3:1 for large text)
 *   targets    interactive elements below the 44x44 CSS px that Apple's HIG
 *              and WCAG 2.5.5 both settle on
 *   overflow   content wider than the viewport at 390px, which is a phone
 *   naming     interactive elements a screen reader would announce as nothing
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 * It does not judge taste. Spacing, hierarchy and colour choice are design
 * decisions; only the four properties above are defects with an objective
 * answer, and mixing the two would make the report arguable and therefore
 * ignorable.
 *
 * Usage:
 *   node scripts/audit-ui.js                      # console routes, all themes
 *   BASE=https://circuvent.com node scripts/audit-ui.js
 *   ROUTES=/smarthome,/smarthome/energy node scripts/audit-ui.js
 *   THEMES=glass-dark node scripts/audit-ui.js
 *   JSON=report.json node scripts/audit-ui.js
 */
const { chromium } = require("@playwright/test");
const { writeFileSync } = require("fs");

const BASE = process.env.BASE || "http://localhost:3001";
const THEME_KEY = "cv-console-theme";
const CONCURRENCY = Number(process.env.CONCURRENCY || 4);

const ALL_THEMES = [
  { mode: "glass", scheme: "dark" },
  { mode: "glass", scheme: "light" },
  { mode: "neo", scheme: "dark" },
  { mode: "neo", scheme: "light" },
  { mode: "aurora", scheme: "dark" },
  { mode: "aurora", scheme: "light" },
];

const CONSOLE_ROUTES = [
  "/smarthome", "/smarthome/devices", "/smarthome/rooms", "/smarthome/spaces",
  "/smarthome/automation", "/smarthome/scenes", "/smarthome/energy", "/smarthome/security",
  "/smarthome/insights", "/smarthome/settings", "/smarthome/cameras", "/smarthome/notifications",
  "/smarthome/reports", "/smarthome/weather", "/smarthome/presence", "/smarthome/timeline",
  "/smarthome/groups", "/smarthome/quick-actions", "/smarthome/widgets", "/smarthome/floorplan",
  "/smarthome/diagnostics", "/smarthome/firmware", "/smarthome/maintenance", "/smarthome/solar",
  "/smarthome/profile", "/smarthome/properties", "/smarthome/recipes", "/smarthome/backup",
  "/smarthome/command-center", "/smarthome/kiosk", "/smarthome/lifecycle", "/smarthome/benchmark",
  "/smarthome/energy-budget", "/smarthome/scene-scheduler", "/smarthome/notification-rules",
  "/smarthome/assistants", "/smarthome/developer", "/smarthome/away-mode",
  "/smarthome/admin", "/smarthome/admin/fleet", "/smarthome/admin/registry",
  "/smarthome/admin/telemetry", "/smarthome/admin/provisioning", "/smarthome/admin/ota",
  "/smarthome/admin/latency", "/smarthome/admin/alerts", "/smarthome/admin/rules",
  "/smarthome/admin/access", "/smarthome/admin/security", "/smarthome/admin/platform",
  "/smarthome/admin/dashboards", "/smarthome/admin/intelligence",
];

/*
 * The public site.
 *
 * This list was missing, and its absence was not obvious: the audit reported
 * a clean sweep across 52 routes while the marketing home page carried 255
 * contrast failures, 54 undersized targets and 42 unnamed controls. Everything
 * measured was clean; the front door was simply never measured. It is the
 * first page anyone sees, so it goes first.
 */
const PUBLIC_ROUTES = [
  "/", "/about", "/services", "/projects", "/stack", "/team", "/contact",
  "/architecture", "/blog", "/careers", "/case-studies", "/developers", "/docs",
  "/domains", "/faq", "/open-source", "/privacy", "/roadmap", "/returns-policy",
  "/shipping", "/shop", "/shop/devices", "/shop/account", "/cart", "/checkout",
  "/smart-home", "/terms", "/track", "/warranty", "/weather", "/app", "/admin",
];

const ALL_ROUTES = [...PUBLIC_ROUTES, ...CONSOLE_ROUTES];

const routes = (process.env.ROUTES || ALL_ROUTES.join(",")).split(",").filter(Boolean);
const themes = process.env.THEMES
  ? process.env.THEMES.split(",").map((t) => {
      const [mode, scheme] = t.split("-");
      return { mode, scheme };
    })
  : ALL_THEMES;

/* ------------------------------------------------------------------ */
/* The probe. Runs inside the page.                                     */
/* ------------------------------------------------------------------ */
const PROBE = () => {
  // 44 CSS px is the target, but getBoundingClientRect returns floats and a
  // deliberately-44px control routinely measures 43.996 after layout rounding.
  // Flagging those buried the real failures — a 16px text button — under a
  // hundred elements that were already correct.
  const MIN_TARGET = 43.5;

  const srgb = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
  const parse = (css) => {
    const m = /rgba?\(([^)]+)\)/.exec(css || "");
    if (!m) return null;
    const p = m[1].split(",").map(parseFloat);
    return { rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 };
  };
  const ratio = (a, b) => {
    const x = lum(a) + 0.05;
    const y = lum(b) + 0.05;
    return Math.round((Math.max(x, y) / Math.min(x, y)) * 100) / 100;
  };
  const where = (el) => {
    const bits = [el.tagName.toLowerCase()];
    if (el.id) bits.push(`#${el.id}`);
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
    if (cls) bits.push(`.${cls}`);
    return bits.join("");
  };

  const out = { contrast: [], targets: [], naming: [], focus: [], overflow: null };

  /*
   * The painted background behind an element.
   *
   * Climbing matters: nearly every surface in this console is translucent, so
   * an element's own backgroundColor is usually rgba(...,0) and comparing
   * against that would score everything as perfect contrast against nothing.
   * Gradient fills are reported as unknown rather than guessed — a gradient is
   * a background-image with no single colour, and pretending otherwise
   * produced false alarms that made an earlier report ignorable.
   */
  const backdrop = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== "none") return { gradient: true };
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0.55) return { rgb: c.rgb };
      n = n.parentElement;
    }
    const body = parse(getComputedStyle(document.body).backgroundColor);
    return body && body.a > 0.55 ? { rgb: body.rgb } : { unknown: true };
  };

  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") return false;
    if (parseFloat(cs.opacity) < 0.15) return false;
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  };

  // ---- contrast ----
  for (const el of document.querySelectorAll("body *")) {
    if (el.children.length > 0) continue;
    const text = (el.textContent || "").trim();
    if (!text || !visible(el)) continue;
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    const bg = backdrop(el);
    if (!fg || !bg.rgb) continue;

    const px = parseFloat(cs.fontSize);
    const bold = Number(cs.fontWeight) >= 700;
    // WCAG "large text": 18.66px bold or 24px regular.
    const large = px >= 24 || (bold && px >= 18.66);
    const need = large ? 3 : 4.5;
    const cr = ratio(fg.rgb, bg.rgb);
    if (cr < need) {
      out.contrast.push({ el: where(el), text: text.slice(0, 44), fg: cs.color, bg: `rgb(${bg.rgb.join(",")})`, ratio: cr, need });
    }
  }

  // ---- touch targets + accessible names ----
  const interactive = document.querySelectorAll(
    'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="switch"], [role="tab"], [tabindex]:not([tabindex="-1"])'
  );
  for (const el of interactive) {
    if (!visible(el)) continue;
    // Hidden from assistive technology on purpose -- a decorative duplicate
    // link behind a card, for instance -- so it needs no name.
    if (el.closest('[aria-hidden="true"]')) continue;
    const r = el.getBoundingClientRect();
    // An inline link inside a paragraph is not a control and is exempt from
    // the target rule; WCAG says the same.
    const inline = el.tagName === "A" && getComputedStyle(el).display === "inline";
    if (!inline && (r.width < MIN_TARGET || r.height < MIN_TARGET)) {
      out.targets.push({ el: where(el), w: Math.round(r.width), h: Math.round(r.height), text: (el.textContent || "").trim().slice(0, 30) });
    }
    /*
     * A form control wrapped in a label takes its name from that label, and
     * so does one referenced by `for`. Checkboxes in the shop filters are
     * written that way and were being reported as unnamed.
     */
    const labelled =
      el.closest("label")?.textContent?.trim() ||
      (el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent?.trim() : "") ||
      "";
    const name =
      (el.getAttribute("aria-label") || "").trim() ||
      (el.textContent || "").trim() ||
      labelled ||
      (el.getAttribute("title") || "").trim() ||
      (el.getAttribute("alt") || "").trim() ||
      (el.getAttribute("placeholder") || "").trim() ||
      (el.getAttribute("aria-labelledby") ? "by-id" : "");
    if (!name) out.naming.push({ el: where(el) });
  }

  // ---- keyboard focus visibility ----
  /*
   * A keyboard user has to be able to see where they are. The site defines a
   * global :focus-visible outline, but a global rule is easy to lose: a
   * component that sets `outline: none` for its own hover treatment, or a
   * focus ring the same colour as the surface it sits on, both leave someone
   * tabbing through the page with no idea what is selected.
   *
   * Focus is forced rather than simulated. :focus-visible only matches when
   * the browser decides the interaction was keyboard-like, so each element is
   * focused and then measured for an actual painted indicator.
   */
  const focusables = [...interactive].filter(visible).slice(0, 40);
  /*
   * Freeze transitions while measuring.
   *
   * Nav links carry `transition-all duration-300`, so the focus ring animates
   * from 0 to 2px. Reading the computed style immediately after focus() caught
   * every one of them at 0px and reported 1,500 controls with no focus
   * indicator when the indicator was simply still fading in. Disabling
   * transitions gives the settled appearance, which is what a keyboard user
   * ends up looking at.
   */
  const freeze = document.createElement("style");
  freeze.textContent = "*, *::before, *::after { transition: none !important; animation: none !important; }";
  document.head.appendChild(freeze);
  for (const el of focusables) {
    const before = getComputedStyle(el);
    const beforeShadow = before.boxShadow;
    const beforeOutline = before.outlineWidth;
    try {
      el.focus({ preventScroll: true });
    } catch {
      continue;
    }
    if (document.activeElement !== el) continue;
    const after = getComputedStyle(el);
    const outlineW = parseFloat(after.outlineWidth) || 0;
    const hasOutline = outlineW >= 1 && after.outlineStyle !== "none";
    const shadowChanged = after.boxShadow !== beforeShadow && after.boxShadow !== "none";
    const outlineChanged = after.outlineWidth !== beforeOutline;
    if (!hasOutline && !shadowChanged && !outlineChanged) {
      out.focus.push({ el: where(el), text: (el.textContent || "").trim().slice(0, 30) });
      continue;
    }
    // An indicator that is there but invisible against its surface is no
    // better than none. 3:1 is the WCAG figure for a non-text indicator.
    if (hasOutline) {
      const oc = parse(after.outlineColor);
      const bg = backdrop(el);
      // The halo counts too: the indicator is two rings, and it is visible if
      // either of them contrasts with what is behind the control.
      const halo = (after.boxShadow.match(/rgba?\([^)]+\)/) || [])[0];
      const hc = halo ? parse(halo) : null;
      const okOutline = oc && bg.rgb && ratio(oc.rgb, bg.rgb) >= 3;
      const okHalo = hc && bg.rgb && hc.a > 0.5 && ratio(hc.rgb, bg.rgb) >= 3;
      if (oc && bg.rgb && !okOutline && !okHalo) {
        out.focus.push({ el: where(el), text: (el.textContent || "").trim().slice(0, 30), outline: after.outlineColor, ratio: ratio(oc.rgb, bg.rgb) });
      }
    }
  }
  try {
    document.activeElement instanceof HTMLElement && document.activeElement.blur();
  } catch {}
  freeze.remove();

  // ---- horizontal overflow ----
  const doc = document.documentElement;
  if (doc.scrollWidth > doc.clientWidth + 1) {
    const wide = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.right > doc.clientWidth + 1 && r.width > 8 && visible(el)) wide.push({ el: where(el), right: Math.round(r.right) });
      if (wide.length > 5) break;
    }
    out.overflow = { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, culprits: wide };
  }

  return out;
};

/* ------------------------------------------------------------------ */
async function auditOne(browser, theme, route, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(
    ([k, v]) => window.localStorage.setItem(k, v),
    [THEME_KEY, JSON.stringify({ mode: theme.mode, scheme: theme.scheme, accentKey: "brand" })]
  );
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 120)));
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    /*
     * Wait for the page to stop moving before measuring.
     *
     * The console renders its dark styling server-side and only applies the
     * operator's chosen scheme once the theme provider hydrates. Measuring at a
     * fixed 900ms caught heavier routes mid-swap and reported white-on-white
     * text that is black-on-light a second later. Two findings in a clean run
     * were this, not the product — an audit that cries wolf gets ignored, so it
     * waits for the theme class and for CSS animations to finish.
     */
    await page
      .waitForFunction(
        (scheme) => {
          const root = document.querySelector(".cv-theme");
          return !root || root.classList.contains(`cv-${scheme}`);
        },
        theme.scheme,
        { timeout: 8000 }
      )
      .catch(() => {});
    await page
      .waitForFunction(() => !document.getAnimations().some((a) => a.playState === "running"), undefined, { timeout: 5000 })
      .catch(() => {});
    await page.waitForTimeout(400);
    /*
     * Put the browser into keyboard modality before measuring focus.
     *
     * :focus-visible deliberately does not match when script moves focus after
     * a mouse interaction -- that is the whole point of it over :focus. So a
     * probe that calls el.focus() and looks for a ring finds nothing, on every
     * element, and reports the entire site as having no focus indicator. One
     * Tab tells Chromium the user is on the keyboard; after that, programmatic
     * focus matches and the measurement reflects what a keyboard user sees.
     */
    await page.keyboard.press("Tab").catch(() => {});
    const r = await page.evaluate(PROBE);
    return { ...r, errors };
  } catch (e) {
    return { contrast: [], targets: [], naming: [], focus: [], overflow: null, errors: [`LOAD: ${String(e.message).slice(0, 100)}`] };
  } finally {
    await ctx.close();
  }
}

async function pool(items, n, fn) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    })
  );
  return out;
}

(async () => {
  const browser = await chromium.launch();
  const jobs = [];
  for (const theme of themes) {
    for (const route of routes) {
      /*
       * The console theme only applies under /smarthome. Public pages render
       * identically in all six, so measuring them six times buys nothing but
       * runtime.
       */
      const themed = route.startsWith("/smarthome");
      if (!themed && theme !== themes[0]) continue;
      jobs.push({ theme, route, width: 1440 });
      // Phone width only needs one theme: overflow and target size do not
      // depend on colour, and six times the runtime buys nothing.
      if (theme === themes[0]) jobs.push({ theme, route, width: 390 });
    }
  }

  process.stderr.write(`auditing ${routes.length} routes x ${themes.length} themes (${jobs.length} loads)\n`);
  let done = 0;
  const results = await pool(jobs, CONCURRENCY, async (j) => {
    const r = await auditOne(browser, j.theme, j.route, j.width);
    done++;
    if (done % 25 === 0) process.stderr.write(`  ${done}/${jobs.length}\n`);
    return { ...j, ...r };
  });
  await browser.close();

  // ---- roll up ----
  const byRoute = new Map();
  for (const r of results) {
    const k = r.route;
    if (!byRoute.has(k)) byRoute.set(k, { route: k, contrast: 0, targets: 0, naming: 0, focus: 0, overflow: 0, errors: 0, worst: [], samples: [], focusSamples: [], errorSamples: [] });
    const e = byRoute.get(k);
    e.contrast += r.contrast.length;
    e.naming += r.naming.length;
    e.focus += r.focus.length;
    for (const f of r.focus.slice(0, 3)) if (e.focusSamples.length < 5) e.focusSamples.push({ theme: `${r.theme.mode}-${r.theme.scheme}`, ...f });
    e.errors += r.errors.length;
    for (const m of r.errors) if (e.errorSamples.length < 4 && !e.errorSamples.includes(m)) e.errorSamples.push(m);
    if (r.width === 390) {
      e.targets += r.targets.length;
      if (r.overflow) e.overflow += 1;
    }
    for (const c of r.contrast.slice(0, 3)) e.worst.push({ theme: `${r.theme.mode}-${r.theme.scheme}`, ...c });
    for (const t of r.targets.slice(0, 2)) e.samples.push(t);
  }

  const rows = [...byRoute.values()].sort(
    (a, b) => b.contrast + b.targets * 2 + b.naming + b.focus - (a.contrast + a.targets * 2 + a.naming + a.focus)
  );

  const totals = rows.reduce(
    (t, r) => ({
      contrast: t.contrast + r.contrast,
      targets: t.targets + r.targets,
      naming: t.naming + r.naming,
      focus: t.focus + r.focus,
      overflow: t.overflow + r.overflow,
      errors: t.errors + r.errors,
    }),
    { contrast: 0, targets: 0, naming: 0, focus: 0, overflow: 0, errors: 0 }
  );

  console.log("route".padEnd(40) + "contrast  targets  naming   focus  overflow  errors");
  console.log("-".repeat(90));
  for (const r of rows) {
    if (!r.contrast && !r.targets && !r.naming && !r.focus && !r.overflow && !r.errors) continue;
    console.log(
      r.route.padEnd(40) +
        String(r.contrast).padStart(8) +
        String(r.targets).padStart(9) +
        String(r.naming).padStart(8) +
        String(r.focus).padStart(8) +
        String(r.overflow).padStart(10) +
        String(r.errors).padStart(8)
    );
  }
  console.log("-".repeat(90));
  console.log(
    "TOTAL".padEnd(40) +
      String(totals.contrast).padStart(8) +
      String(totals.targets).padStart(9) +
      String(totals.naming).padStart(8) +
      String(totals.focus).padStart(8) +
      String(totals.overflow).padStart(10) +
      String(totals.errors).padStart(8)
  );

  const loadFailures = rows.reduce((n, r) => n + (r.errorSamples || []).filter((m) => m.startsWith("LOAD:")).length, 0);
  if (loadFailures) {
    console.log("");
    console.log(`!! ${loadFailures} route/theme combinations never loaded. Every zero above is meaningless.`);
    console.log(`!! Check the server at ${BASE} is actually serving a production build.`);
    for (const r of rows) {
      const f = (r.errorSamples || []).find((m) => m.startsWith("LOAD:"));
      if (f) { console.log(`   ${r.route}: ${f.split("\n")[0]}`); break; }
    }
  }

  if (process.env.JSON) {
    writeFileSync(process.env.JSON, JSON.stringify({ base: BASE, totals, loadFailures, routes: rows }, null, 2));
    process.stderr.write(`\nwrote ${process.env.JSON}\n`);
  }
  if (loadFailures) process.exitCode = 2;
})();
