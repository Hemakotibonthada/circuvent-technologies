#!/usr/bin/env node
/*
 * Report which screens still use the swallow-the-failure idiom, and where.
 *
 * The pattern is always the same shape:
 *
 *   const load = useCallback(async () => {
 *     const r = await api.thing();
 *     if (r.ok) setThing(r.data.thing);
 *   }, []);
 *
 * `if (r.ok)` with no else is the whole bug: on failure the screen keeps
 * whatever it was initialised with, which is an empty array, which renders as
 * "you have none of these". This lists every occurrence with its line so the
 * conversions can be done deliberately rather than by a regex that thinks it
 * understands JSX.
 */
const { readFileSync, readdirSync, statSync } = require("fs");
const { join, relative } = require("path");

const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const hits = [];
for (const file of walk(SRC)) {
  const src = readFileSync(file, "utf8");
  if (/from\s+["'][^"']*\/async["']/.test(src)) continue; // already converted
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    // `if (r.ok)` / `if (res.ok)` with no matching else.
    const m = lines[i].match(/if\s*\(\s*(\w+)\.ok\s*\)/);
    if (!m) continue;
    /*
     * The else can be several lines down when the success branch is a block:
     *
     *   if (r.ok) {
     *     setEvents(...);
     *     setError(null);
     *   } else {
     *
     * Looking only at the current and next line reported that as unhandled,
     * which would have had someone "fix" code that was already correct.
     */
    const ahead = lines.slice(i, i + 12).join("\n");
    if (/\belse\b/.test(ahead.split(/\n\s*(?=if\s*\()/)[0] || ahead)) continue;
    hits.push({ file: relative(ROOT, file), line: i + 1, text: lines[i].trim().slice(0, 96) });
  }
}

const byFile = new Map();
for (const h of hits) byFile.set(h.file, (byFile.get(h.file) || 0) + 1);

console.log(`${hits.length} unhandled failures across ${byFile.size} files\n`);
for (const [f, n] of [...byFile.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`${String(n).padStart(3)}  ${f}`);
}

/*
 * A ratchet, not a pass/fail.
 *
 * There were 31 of these. The ones where silence is actively misleading --
 * the security dashboard, the safety centre, notifications, rooms, scenes,
 * energy, the home dashboard -- are fixed. The rest are secondary screens
 * where a swallowed failure costs a count being wrong, and converting all of
 * them in one go would be a large unreviewable diff.
 *
 * So the number is allowed to fall and not to rise. Lower BASELINE when you
 * fix some; the check fails if it ever goes back up.
 */
const BASELINE = 15;
if (hits.length > BASELINE) {
  console.log(`\n✗ ${hits.length} unhandled failures, up from the agreed ${BASELINE}.`);
  console.log(`  A failed request that leaves a screen empty tells someone their house is quiet.`);
  console.log(`  Use useAsync/unwrap from src/async.tsx, or handle the else branch.`);
  process.exitCode = 1;
} else if (hits.length < BASELINE) {
  console.log(`\n✓ ${hits.length} left (was ${BASELINE}) — lower BASELINE in ${require("path").basename(__filename)} to lock it in.`);
} else {
  console.log(`\n✓ ${hits.length} unhandled failures, none new.`);
}

