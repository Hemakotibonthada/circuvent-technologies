// Fails if a dialog can never appear, or if an iOS-only API creeps back in.
//
// TWO FAILURES THIS CATCHES, BOTH SILENT
//
// 1. Alert.prompt is iOS-only. The app called it as `Alert.prompt?.(...)`, so
//    on Android the expression evaluated to undefined and did nothing at all —
//    no dialog, no error, no log. Renaming a device and setting the kiosk exit
//    PIN were both dead on Android for as long as they had existed, and the
//    optional call is precisely why: it turned a crash into a silence.
//
// 2. usePrompt/useConfirm return both a function and a node. Forgetting to
//    render the node compiles cleanly, typechecks cleanly, and produces a
//    button that does nothing when tapped — the same symptom, from the other
//    direction. I did this while writing the replacement, in Settings.tsx.
//
// Neither is reachable by tsc or by a unit test that does not mount every
// screen, so it is checked here.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src");

/** Every .tsx/.ts under src, excluding tests. */
function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (fs.statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(p);
  }
  return out;
}

/**
 * Source with comments removed.
 *
 * Both rules below describe the very APIs they forbid, and the files that
 * replaced them explain why at length. Scanning raw text makes a check that
 * fires on its own documentation — which is how the first version of this
 * reported overlays.tsx, Control.tsx and Settings.tsx as offenders on the same
 * run that fixed all three. A check that flags prose gets suppressed, and then
 * it protects nothing.
 *
 * Strings are left intact: a string containing "Alert.prompt" is still worth
 * looking at, and none legitimately do.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const files = walk(SRC);
const errors = [];

for (const file of files) {
  const src = stripComments(fs.readFileSync(file, "utf8"));
  const rel = path.relative(ROOT, file);

  // ---- 1. iOS-only dialog APIs ----
  if (/\bAlert\s*\.\s*prompt\b/.test(src)) {
    errors.push(
      `${rel}: uses Alert.prompt, which exists only on iOS — on Android it is undefined and the dialog never opens. Use usePrompt() from src/overlays.tsx.`
    );
  }

  // ---- 2. a dialog hook whose node is never rendered ----
  for (const [hook, node] of [
    ["usePrompt", "promptNode"],
    ["useConfirm", "confirmNode"],
  ]) {
    if (!new RegExp(`\\b${hook}\\s*\\(`).test(src)) continue;
    // The definition site legitimately mentions the hook without rendering it.
    if (path.basename(file) === "overlays.tsx") continue;
    // Destructuring may rename it; accept any JSX interpolation of the
    // canonical name, which is what every call site here uses.
    const rendered = new RegExp(`\\{\\s*${node}\\s*\\}`).test(src);
    if (!rendered) {
      errors.push(
        `${rel}: calls ${hook}() but never renders {${node}} — the dialog can never appear. Add {${node}} inside the returned tree.`
      );
    }
  }
}

if (errors.length) {
  console.error("dialogs:check FAILED");
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}

console.log(`dialogs:check ok — ${files.length} files, no iOS-only dialogs and every dialog is mounted`);
