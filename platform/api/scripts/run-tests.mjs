#!/usr/bin/env node
/**
 * Test runner.
 *
 * Node 20's built-in runner only auto-discovers JavaScript test files, and npm
 * scripts do not glob consistently across cmd.exe and sh — `--test src/**` is
 * silently empty on Windows, which is worse than an error because the suite
 * "passes" without having run anything. This walks the tree itself and passes
 * explicit paths.
 *
 * Exits non-zero when there is nothing to run, so an accidental rename cannot
 * turn the suite into a green no-op.
 */

import { spawnSync } from "node:child_process";
import { readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../src", import.meta.url));

/**
 * The Alexa Lambda, which lives outside this package on purpose.
 *
 * It is the artifact pasted into the AWS console, so it is plain JavaScript
 * and sits beside the deployment notes rather than inside `src` — where
 * `rootDir` would reject it and the Docker build would try to compile it.
 *
 * It is run here anyway. A proxy nobody tests is the piece of this integration
 * that gets exercised for the first time by a customer, and its whole job is
 * deciding what somebody hears when the control plane is unhappy.
 */
const lambdaDir = fileURLToPath(new URL("../../alexa-lambda", import.meta.url));

function findTests(dir, suffix = ".test.ts") {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...findTests(full, suffix));
    else if (entry.endsWith(suffix)) out.push(full);
  }
  return out;
}

const files = findTests(root);
if (existsSync(lambdaDir)) files.push(...findTests(lambdaDir, ".test.mjs"));

if (files.length === 0) {
  console.error("No *.test.ts files found under src/. Refusing to report success.");
  process.exit(1);
}

console.log(`Running ${files.length} test file${files.length === 1 ? "" : "s"}:`);
for (const f of files) console.log(`  ${relative(process.cwd(), f)}`);

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", ...files],
  { stdio: "inherit" },
);

process.exit(result.status ?? 1);
