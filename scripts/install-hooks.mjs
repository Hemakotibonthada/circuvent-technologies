#!/usr/bin/env node
/*
 * Install the git hooks.
 *
 * Hooks live in .git/hooks, which is not tracked, so a hook that exists on one
 * machine does not exist on the next clone. This runs from `npm run prepare`
 * so the hook follows the repository instead of one laptop.
 *
 * The hook is deliberately a single node call. An earlier guard in this repo
 * was written in bash and never ran once, because `bash` on the Windows box
 * that does the builds is WSL with no distribution installed — it failed
 * silently and the build carried on with the wrong signing key. Git for
 * Windows runs hooks with its own bundled sh, so a one-line sh hook that
 * shells out to node works everywhere node already works.
 */
import { writeFileSync, mkdirSync, existsSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

let gitDir;
try {
  gitDir = execSync("git rev-parse --git-dir", { cwd: root, encoding: "utf8" }).trim();
} catch {
  console.log("install-hooks: not a git checkout, nothing to install");
  process.exit(0);
}
if (!gitDir) process.exit(0);
const hooksDir = join(root, gitDir, "hooks");

const HOOKS = {
  "pre-commit": `#!/bin/sh
# Installed by scripts/install-hooks.mjs — edit that, not this.
node "$(git rev-parse --show-toplevel)/scripts/check-no-secrets.js" --staged || exit 1
`,
};

try {
  mkdirSync(hooksDir, { recursive: true });
} catch {
  /* already there */
}

for (const [name, body] of Object.entries(HOOKS)) {
  const path = join(hooksDir, name);
  if (existsSync(path)) {
    const current = (await import("node:fs")).readFileSync(path, "utf8");
    if (!current.includes("install-hooks.mjs")) {
      console.log(`install-hooks: ${name} already exists and was not written by this script — leaving it alone`);
      continue;
    }
  }
  writeFileSync(path, body, { mode: 0o755 });
  try {
    chmodSync(path, 0o755);
  } catch {
    /* windows */
  }
  console.log(`install-hooks: ${name} installed`);
}
