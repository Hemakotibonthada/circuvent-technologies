#!/usr/bin/env node
/*
 * Which screens fetch data, and what do they show while it is in flight or
 * when it fails?
 *
 * The a11y audit checks whether a control can be seen and pressed. It says
 * nothing about a screen that renders an empty page for two seconds and then
 * an empty page forever when the house's hub is unreachable -- which, in an
 * app whose whole job is talking to hardware over a home network, is the
 * normal case rather than the edge case.
 *
 * A screen is only reported if it actually calls the API. Static screens have
 * nothing to load and are not the point.
 */
const { readFileSync, readdirSync, statSync } = require("fs");
const { join, relative } = require("path");

const ROOT = join(__dirname, "..");
const SCREENS = join(ROOT, "src", "screens");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(name)) out.push(p);
  }
  return out;
}

/** Blank comments so a screen's documentation cannot satisfy its own check. */
function blankComments(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "/" && n === "/") {
      while (i < src.length && src[i] !== "\n") { out += " "; i++; }
      continue;
    }
    if (c === "/" && n === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      for (; i < stop; i++) out += src[i] === "\n" ? "\n" : " ";
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

const rows = [];
for (const file of walk(SCREENS)) {
  const src = blankComments(readFileSync(file, "utf8"));
  const rel = relative(ROOT, file);

  // Does it load anything?
  const fetches = /\bapi\.\w+\(|\bfetch\(|useZones\(|useProbe\(/.test(src);
  if (!fetches) continue;

  /*
   * useAsync tracks all three states by construction, and AsyncView renders
   * each of them, so a screen built on those has nothing to answer for. Without
   * this the audit reports the screens that were just fixed -- it was looking
   * for the words "loading" and "error" in the source, and the whole point of
   * the hook is that a screen no longer has to write them.
   */
  const usesAsyncKit = /from\s+["'][./]*\.\.?\/?async["']|\buseAsync\s*\(/.test(src);
  const hasAsyncView = /<AsyncView\b/.test(src);

  const hasLoading = usesAsyncKit || /\bloading\b|\bbusy\b|ActivityIndicator|Skeleton|ModuleScaffold/.test(src);
  const hasError = usesAsyncKit || /\berror\b|\berr\b|catch\s*\(|Banner|Callout|onRetry/.test(src);
  const hasRetry = usesAsyncKit || /onRetry|retry|reload|refresh/i.test(src);
  const hasEmpty = (hasAsyncView && /isEmpty=/.test(src)) || /EmptyState|No .* yet|isEmpty|length === 0|!.*\.length/.test(src);

  const missing = [];
  if (!hasLoading) missing.push("loading");
  if (!hasError) missing.push("error");
  if (!hasRetry) missing.push("retry");
  if (!hasEmpty) missing.push("empty");
  if (missing.length) rows.push({ rel, missing });
}

rows.sort((a, b) => b.missing.length - a.missing.length || a.rel.localeCompare(b.rel));
console.log(`screens that load data and are missing a state: ${rows.length}\n`);
for (const r of rows) console.log(`  ${r.missing.join(", ").padEnd(30)} ${r.rel}`);

const counts = {};
for (const r of rows) for (const m of r.missing) counts[m] = (counts[m] || 0) + 1;
console.log("\nby kind:");
for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(9)} ${v}`);
