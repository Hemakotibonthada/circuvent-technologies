# 23 — Conventions

How code is written here, and why. Most of these rules exist because breaking
them once shipped a bug.

---

## 1. The rule that matters most: parity

**Almost every real bug in this codebase has been one surface knowing something
another surface did not.** Not a crash. Not a failed request. A control that is
simply absent, or a button that does nothing, on one screen out of six.

Some real examples:

- A device type was registered in the phone app but not in the web console's
  type table. Customers could dim a lamp on their phone and not in a browser.
  Nothing errored.
- The shop sold 21 products; the console's display table knew 19. Two products
  appeared with a raw type id and a generic icon.
- The scene editor offered a **Power** toggle for a curtain. The command builder
  refuses power on a curtain, and the editor drops actions with no command — so
  the row was offered, configured, saved, and silently vanished.
- A payload shape was repaired when a schedule triggered it and published raw
  when a scene triggered it. The same automation worked or did not depending on
  what fired it.

They share a shape: **two tables that must agree, no mechanism forcing them to,
and no error when they disagree.**

### What to do about it

When you add a fact about a device — a type, a field, a control, an icon, a
label — **search for every table that already stores that kind of fact** before
you add it to one:

```bash
git grep -n "smart-plug"       # or whatever the nearest existing type is
```

Then either make one table derive from another, or **add a test that fails when
they disagree**.

### The guard-test pattern

This is the house pattern, and `tests/` is full of it:

| Guard | Forces agreement between |
| --- | --- |
| `tests/device-type-parity.test.ts` | Every place a device type is registered |
| `tests/mobile-toggle-fields.test.ts` | Mobile toggles ↔ real commands |
| `tests/tile-visual-parity.test.ts` | Web tile visuals ↔ mobile tile visuals |
| `tests/session-parity.test.ts` | Session handling across surfaces |
| `tests/admin-nav-parity.test.ts` | Admin navigation ↔ routes that exist |
| `tests/api-docs-match.test.ts` | Documented API ↔ implemented API |

`mobile/scripts/check-device-types.js` and `check-command-map.js` do the same job
outside Jest, which is why `npm run typecheck` in `mobile/` runs a dozen scripts
rather than just the compiler.

**Write both directions.** A good guard asserts that every declared control
builds a real command *and* that every accepted command has a control. One
direction only catches half the class — the half that produces dead buttons, not
the half that produces missing ones.

**Duplication is sometimes correct — but pin it.** The web app and the phone app
are separate TypeScript projects and cannot import each other. Where a curve or
a constant genuinely must exist twice, that is fine; add a parity test so the
two copies cannot drift. `tile-visual-parity` exists for exactly this, and it
caught a real bug the day it was written.

---

## 2. Comment the *why*, never the *what*

The code already says what it does. A comment repeating it is noise that goes
stale.

```ts
// Bad — restates the code
// set the return window to 7
export const RETURN_DAYS = 7;
```

```ts
// Good — explains why this exists here, and what breaks if you move it
// These numbers are quoted to the shopper at the point of purchase, so they
// must agree with the policy pages that are the actual contract. `shop-policy
// .test.ts` asserts the policy pages still state the same figures — editing
// /warranty alone will fail the build rather than silently leave the product
// page advertising terms the company no longer offers.
export const RETURN_DAYS = 7;
```

Comment when there is a **decision, a constraint, or a trap**:

- Why this and not the obvious alternative
- What breaks if someone "simplifies" it
- Which other file must change with it
- Why a value is what it is

`src/lib/brand.ts` and `src/lib/shop-policy.ts` are the reference examples.

---

## 3. One owner per fact

If a number is quoted in two places, they will disagree eventually. The support
email did: the invoice offered a personal address while outbound mail used a
monitored one, and customers kept replying to the personal one for years.

- **Anything a customer reads** → `src/lib/brand.ts`
- **Commercial terms** → `src/lib/shop-policy.ts`
- **Warranty length** → `src/lib/warranty.ts` (re-exported, not restated)
- **What reaches hardware** → `src/lib/smarthome-command-map.ts`

Re-export rather than restate. `shop-policy.ts` re-exports `WARRANTY_MONTHS`
instead of declaring a second copy, and says so in a comment.

---

## 4. Make the failure loud

The bugs that survive here are the quiet ones. Prefer a design that breaks at
build or test time over one that degrades silently at runtime.

- A missing device type should fail a test, not render a generic chip.
- An action that builds no command should be **refused**, not dropped.
- An operation that could not be performed must not be counted as performed. If
  a scene cannot repair a legacy action, it skips it — it does not report it as
  sent.
- Firmware pin collisions get a compile-time guard (`CV_PIN_CLASH` in
  `firmware/camera/camera.ino`) because at runtime they fail silently.

---

## 5. Never commit secrets

A git hook installed by `npm install` blocks this, and `npm run verify:secrets`
runs the same check by hand.

- Real values live in `.env.local` (git-ignored) and in the deployment platform.
- `.env.example` carries **names and shapes only**, never values.
- Keystores, service-account JSON and private keys are never committed.
- If you leak one, say so immediately. Rotating a credential is routine;
  discovering a leak six months later is not.

See [11 — Secrets](./11-secrets.md).

---

## 6. TypeScript

- **No `any`** in new code. If a type is genuinely unknown use `unknown` and
  narrow it.
- **Type the boundary.** Anything crossing a network or a database gets an
  explicit type. Inside a function, inference is fine.
- **Discriminated unions over optional-flag soup.** If two shapes are different
  things, model them as different things.
- `npx tsc --noEmit` must be clean before you push.

---

## 7. React and UI

- **Server Components by default.** Add `"use client"` only when you need state,
  effects or browser APIs. It is a real cost, not a formality.
- **Never fetch in a `useEffect`** when a Server Component can fetch it.
- **Optimistic updates reconcile.** Device control applies the change locally,
  then reconciles against the state the device publishes. The device is the
  authority, not the UI.
- **Accessibility is not optional.** Every interactive element is reachable by
  keyboard and has an accessible name; contrast is ≥ 4.5:1 for body text.
  `npm run audit:contrast` and `tests/token-contrast.test.ts` enforce it.
- **Respect `prefers-reduced-motion`.** Motion may carry meaning, but it must
  never be the *only* carrier. The device tiles encode level as a static ring
  and speed as motion, so switching motion off removes the animation and keeps
  the information.
- **Touch targets ≥ 44×44px** with ≥ 8px between them.

---

## 8. Firmware

- **State keys are a public contract.** Both apps read them. Renaming one is a
  breaking change for every device already in the field.
- **Apply, then publish.** Publish state *after* acting on a command; the UI
  reconciles against it.
- **Assume the network is hostile.** Wi-Fi disappears, routers boot slower than
  devices, brokers restart. Retry forever with backoff; never enter a state that
  needs a human to press a button in a house you cannot visit.
- **The shared library is fleet-wide.** A mistake in
  `firmware/CircuventDevice/` is a mistake on every device, including the ones
  that are now unreachable *because* of it.

---

## 9. Naming

| Thing | Style | Example |
| --- | --- | --- |
| Files (React components) | PascalCase | `DeviceControls.tsx` |
| Files (everything else) | kebab-case | `shop-policy.ts` |
| Tests | alongside, `.test.ts` | `fuzzy.test.ts` |
| Device type ids | lowercase, hyphenated | `smart-plug`, `anpr-cam` |
| MQTT topics | `cv/<deviceId>/<channel>` | `cv/abc123/state` |
| Constants | SCREAMING_SNAKE | `WARRANTY_MONTHS` |

Device type ids are the worst thing to get wrong: the same string appears in
firmware, the API, both apps and the shop. Copy it, do not retype it.

---

## 10. Before you open a pull request

```bash
npx tsc --noEmit                 # types clean
npm test                         # unit tests
npm run lint                     # eslint
cd mobile && npm run typecheck   # only if you touched mobile/
```

And ask yourself the parity question, because no tool asks it for you:

> *Is there another table, screen or app that also needs to know what I just
> added? If yes — is there now a test that fails when they disagree?*
