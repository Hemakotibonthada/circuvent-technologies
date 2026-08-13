# 24 — Testing

There are **four** test systems in this repository, because there are four
deployables and they do not share a runtime. Knowing which one your change needs
is most of the skill.

| # | What | Runner | Where the tests live | Command |
| --- | --- | --- | --- | --- |
| 1 | Web app, shared libraries, **and mobile logic** | Jest (jsdom) | `src/**/*.test.ts(x)`, `tests/**` | `npm test` |
| 2 | Control-plane API | Node's built-in runner | `platform/api/src/**/*.test.ts` | `cd platform/api && npm test` |
| 3 | Browser end-to-end | Playwright | `e2e/*.spec.ts` | `npm run test:e2e` |
| 4 | Mobile invariants | Custom check scripts + `tsc` | `mobile/scripts/check-*.js` | `cd mobile && npm run typecheck` |

---

## 1. Jest — the main suite

```bash
npm test                              # everything
npx jest src/lib/fuzzy.test.ts        # one file
npx jest fuzzy                        # anything matching "fuzzy"
npx jest -t "handles transposition"   # one test by name
npm run test:watch                    # re-run on save
npm run test:coverage
```

### It is Jest, not Vitest

The single most common mistake:

```ts
expect(value, "helpful message").toBe(3);   // ✗ Expect takes at most one argument
```

Jest has no message argument. If you want context on failure, put it in the
`it()` name or assert on a labelled object:

```ts
it("keeps the ring proportional to level", () => { ... });        // ✓
expect({ type, hasControl }).toEqual({ type, hasControl: true }); // ✓ shows which type
```

### Mobile code is tested here, not in `mobile/`

`mobile/` has **no test runner**. Mobile logic is tested from the root Jest
suite — `tests/mobile-*.test.ts` import directly from `mobile/src/`.

`jest.config.js` maps `react` and `react-dom` to the **root** copy on purpose.
`mobile/` has its own `node_modules`, so a hook imported from `mobile/src/`
would otherwise resolve a second React, and two Reacts means two hook
dispatchers — the second one null. The symptom is
`Cannot read properties of null (reading 'useRef')`, which looks like a broken
hook and is actually broken module resolution. Do not remove that mapping.

### Writing a good one

Test **behaviour and contracts**, not implementation.

```ts
// Good — pins a contract two systems depend on
it("offers a control for every device type the shop sells", () => {
  for (const product of products) {
    expect(Object.keys(DEVICE_META)).toContain(product.deviceType);
  }
});
```

```ts
// Bad — pins prose, breaks when someone rewords a comment
it("has the right description", () => {
  expect(source).toContain("// squash punctuation inside words");
});
```

That second one is a real mistake made in this repository. A test that asserts
on a comment fails when the comment improves.

---

## 2. Control plane — Node's built-in runner

```bash
cd platform/api
npm test                                    # all ~30 files
node --test --import tsx src/scenes.test.ts # one file
npm run typecheck
```

No Jest. Use `node:test` and `node:assert/strict`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("normalises a legacy state-shaped command", () => {
  assert.deepEqual(normaliseCommand("smart-plug", { power2: true }),
                   { action: "set", power2: true });
});
```

`scripts/run-tests.mjs` walks the tree and passes explicit paths, because
`--test src/**` is silently empty on Windows — a suite that "passes" without
running anything. It **exits non-zero when it finds no tests**, so a rename
cannot turn the suite into a green no-op. Keep that property.

---

## 3. Playwright — end-to-end

```bash
npm run test:e2e
npm run test:e2e:ui                   # interactive
npx playwright test e2e/headings.spec.ts
```

First time only: `npx playwright install`.

### Set `E2E_PORT`

`reuseExistingServer` is on locally. A stray process on port 3000 does **not**
error — the entire suite silently runs against whatever that process is. This
has happened: an unrelated desktop app held 3000 for a week and every assertion
about the homepage was made against a different application.

```bash
E2E_PORT=3123 npm run test:e2e
```

### Never `waitForLoadState("networkidle")`

Against the dev server it never resolves, because HMR holds a websocket open
forever. Wait for the thing you actually care about:

```ts
await expect(page.getByRole("heading", { name: "Shop" })).toBeVisible();  // ✓
```

That is also a better test — it asserts something real instead of a proxy.

### Browsers

Locally all three engines run. In CI only Chromium, because the workflow
installs only Chromium — and a config listing three projects made every CI run
fail with "Executable doesn't exist". **What the config lists must be what CI
installs.** Override with `E2E_BROWSERS=chromium,firefox`.

---

## 4. Mobile — invariant checks

```bash
cd mobile
npm run typecheck
```

That is a dozen checks, then `tsc`:

| Script | Catches |
| --- | --- |
| `check-device-types.js` | A device type registered in one table and not another |
| `check-command-map.js` | A control that builds no real command |
| `check-contrast.js` | Text below the contrast floor |
| `check-screen-theming.js` | A screen that ignores the theme |
| `check-nav-targets.mjs` | Navigation to a screen that does not exist |
| `check-permissions.js` | A permission used but not declared |
| `version-check.js` | `app.json`, `src/version.ts` and the build file disagreeing |
| `check-dialogs.js` | Dialogs that cannot be dismissed |

Each exists because it once shipped. When one fails it names the two files that
disagree — read the message, it is usually the whole diagnosis.

---

## 5. What to run for a given change

| You changed | Run |
| --- | --- |
| A shared library in `src/lib/` | `npx jest src/lib/<name>` |
| Shop or checkout | `npx jest src/lib/order` + `npm test` |
| Device controls / a device type | `npm test` **and** `cd mobile && npm run typecheck` |
| The control-plane API | `cd platform/api && npm test` |
| Anything visible on a page | the relevant `e2e/*.spec.ts` |
| Firmware | `python -m platformio run` in that device folder |

Before pushing:

```bash
npx tsc --noEmit && npm test && npm run lint
```

---

## 6. When to add a test

Always, for these:

- **A bug fix.** Write the failing test first. A fix with no test is an
  invitation to re-fix it later.
- **A new device type.** There are parity guards precisely so a new type cannot
  be half-registered.
- **Two things that must agree.** See
  [23 — Conventions §1](./23-conventions.md). This is the highest-value test in
  the codebase and the one most often missing.
- **Anything a customer is quoted** — prices, warranty, returns, delivery.

Skip it for pure styling with no logic, and generated files.

---

## 7. Debugging a failing test

```bash
npx jest path/to/file.test.ts -t "the failing name"   # narrow first
node --test --import tsx path/to/file.test.ts         # control plane
npx playwright test --debug e2e/thing.spec.ts         # step through
npx playwright show-report                            # after a failed e2e run
```

Playwright writes a trace on first retry and a screenshot on failure into
`test-results/` — open those before adding `console.log`.

If a test fails only when the whole suite runs, you have shared state. Look for
a module-level cache or a mock that is not reset.

### Failures that are not yours

The tree is worked on by several people. If a test fails in an area you have not
touched, check `git status` and `git diff` before assuming you caused it —
someone's in-progress work can break `tsc` and the suite for everybody. Confirm
with a clean checkout of your own branch rather than "fixing" code that is
merely unfinished.
