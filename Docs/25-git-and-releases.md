# 25 — Git, review and releases

How a change gets from your machine to a customer. Four deployables ship on four
different paths — knowing which one you are on tells you what "done" means.

---

## 1. Branches

| Branch | Deploys to | Purpose |
| --- | --- | --- |
| `main` | `circuvent.com` | Production |
| `develop` | `dev.circuvent.com` | Pre-production |
| `feat/*`, `fix/*`, `chore/*` | Vercel preview URL | Your work |

Branch from `develop` unless told otherwise:

```bash
git checkout develop
git pull
git checkout -b feat/shop-bundle-page
```

Naming: `feat/` new capability, `fix/` a bug, `chore/` tooling and maintenance,
`docs/` documentation only. Keep it short and specific — `feat/anpr-visit-pairing`,
not `feat/updates`.

---

## 2. Remotes

Three are configured. This matters more than it looks:

| Remote | Repository |
| --- | --- |
| `origin` | `Circuvent-Technologies/Company-Portal` |
| `circuvent` | `Circuvent-Technologies/circuvent` |
| `hema` | personal backup |

Check where you are pushing before you push:

```bash
git remote -v
git push origin feat/your-branch
```

---

## 3. Commits

One commit, one idea. A commit that renames a variable *and* fixes a bug *and*
adds a feature cannot be reviewed or reverted.

```
Short imperative summary, under ~72 characters

Why the change was needed, and what would break without it. Describe the
behaviour, not the diff — the diff is already in the commit.

Where relevant, name the other file that had to change with it and why.
```

Write **why**, not what. `git log` is read when something has broken and nobody
remembers the context; "updated file" helps nobody.

### The pre-commit hook

`npm install` installs a hook that **blocks commits containing secrets**. If it
fires, it is almost certainly right — do not bypass it. Move the value into
`.env.local` and reference it by name.

```bash
npm run verify:secrets    # same check, on demand
```

### Only commit your own files

Several people work in this tree at once. `git add -A` will happily sweep up
somebody's half-finished work, and then their broken code is in your pull
request and fails your CI.

```bash
git status                       # look first, every time
git add src/lib/thing.ts src/lib/thing.test.ts
git commit
```

---

## 4. Before you push

```bash
npx tsc --noEmit
npm test
npm run lint
cd mobile && npm run typecheck    # only if you touched mobile/
```

CI runs all of this anyway. Running it locally means you find out in two minutes
rather than twenty.

---

## 5. What CI enforces

`.github/workflows/ci.yml` runs on pull requests to `main` and `master`:

| Step | Blocking |
| --- | --- |
| Type-check (root) | **yes** |
| Lint | no — informational |
| Unit tests (Jest) | **yes** |
| Control-plane type-check | **yes** |
| Control-plane tests | **yes** |
| Database adapter test | **yes** |
| Production build | **yes** |
| End-to-end (Playwright, Chromium) | **yes** |

Lint is non-blocking because the codebase carries pre-existing findings and a
red lint step would mask the gates that matter. **New code is still expected to
be lint-clean** — that exemption is for old code, not yours.

The control plane is a separate package with its own runner, so the root
`npm test` never touched it. It has its own CI steps for that reason; without
them roughly 290 tests could not block a deploy.

---

## 6. Pull requests

A good description answers three questions:

1. **What changes for a user?** Behaviour, not files.
2. **Why?** The bug, the request, the constraint.
3. **How was it verified?** Which tests, which manual check.

Include before/after screenshots for anything visible. Link the issue.

Keep them small. A 200-line pull request gets a real review; a 2,000-line one
gets "looks good".

### As a reviewer

Look for, in order:

1. **Parity.** Does this add a fact that another table also needs? Is there a
   test that fails when they disagree? This finds more real bugs here than
   everything else combined — see [23 — Conventions §1](./23-conventions.md).
2. **Silent failure.** Can this path do nothing without telling anyone?
3. **Contracts.** Does it rename a device state key, an MQTT topic or an API
   field? Those are breaking changes for devices already in the field.
4. **Secrets.** Any real value that should be an environment variable.
5. **Tests.** Bug fix with no regression test.

Style and formatting are not review comments. If it matters, it belongs in a
linter.

---

## 7. Releasing each deployable

### Website — automatic

Merge to `main`. Vercel builds and deploys. `develop` deploys to
`dev.circuvent.com` the same way.

Rollback: promote the previous deployment in the Vercel dashboard, or revert the
commit. See [09 — Deployment](./09-deployment.md).

### Control plane — manual

It runs on one VM under Docker Compose. Deploying means pulling and rebuilding
on the VM. Full steps in [12 — VM runbook](./12-vm-runbook.md).

Verify afterwards, always:

```bash
curl https://api.circuvent.com/health
```

Check the database reports up and the capability list contains what you shipped.
**"The deploy command succeeded" is not verification** — check the artifact.

### Mobile — build, then upload

```bash
cd mobile
npm run typecheck
npm run build:android          # APK
npm run build:android -- --aab # AAB for Play
```

Bump the version in **`app.json`** — `mobile/android/` is generated and
git-ignored, so editing it there is discarded at the next prebuild.
`version:check` asserts `app.json`, `src/version.ts` and the generated Gradle
file all agree.

Then verify what you actually built:

```bash
# the versionCode inside the artifact, not the one you asked for
npx aapt dump badging dist/circuvent-*.apk | Select-String versionCode
```

This is not paranoia. A build script once published the *previous* run's APK
alongside the new AAB, so the artifact reported versionCode 20 under the name
21. The build log said success.

Signing and Play Console details: [19 — Android Play Store](./19-android-play-store.md).

### Firmware — OTA

```bash
cd firmware/<device>
python -m platformio run
```

Devices update over the air. Two things to hold in mind:

- **State keys are a contract.** Renaming one breaks every app screen reading it,
  for every device already installed.
- **The worst-affected devices are the unreachable ones.** If a bug strands a
  device off the network, it cannot receive the fix that repairs it. Firmware
  changes to connectivity deserve more caution than anything else in this
  repository.

---

## 8. When something is wrong in production

1. **Revert first, diagnose after.** Restoring service is the priority.
2. Website: promote the previous Vercel deployment.
3. Control plane: redeploy the previous image, then `curl /health`.
4. Mobile: halt the Play rollout.
5. Write the regression test **before** the re-fix.

[15 — Troubleshooting](./15-troubleshooting.md) covers specific failures.
