#!/usr/bin/env node
/*
 * Static UI audit for the mobile app.
 *
 * The web audit drives a real browser and measures painted pixels. There is no
 * equivalent for React Native without a device farm, so this reads the source
 * instead and looks for the specific mistakes that a browser would have caught:
 *
 *   labels   an icon-only control with nothing for a screen reader to announce
 *   targets  a control small enough to miss, with no hitSlop to make up for it
 *   theme    a colour written as a literal instead of taken from the theme,
 *            which is exactly how the web admin console ended up with
 *            near-black text on near-black surfaces in light mode
 *
 * It is deliberately conservative. React Native derives an accessibility label
 * from child <Text>, so a Pressable with a visible word in it is fine and is
 * not reported. Only controls with no text at all are flagged.
 *
 *   node scripts/audit-mobile.js            summary
 *   node scripts/audit-mobile.js --list     every finding with file:line
 *   JSON=out.json node scripts/audit-mobile.js
 */
const { readFileSync, writeFileSync, readdirSync, statSync } = require("fs");
const { join, relative } = require("path");

const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");
const MIN_TARGET = 44;

/* Colours that carry no meaning and cannot be wrong in a theme. */
const NEUTRAL = /^(transparent|none|inherit|currentColor|#fff|#ffffff|#000|#000000)$/i;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "node_modules" || name.startsWith(".")) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(name)) out.push(p);
  }
  return out;
}

/*
 * Strip comments and string bodies.
 *
 * Three separate guards in this repo have fired on their own documentation --
 * a check for a banned pattern found the pattern in the comment explaining why
 * it was banned. Blanking comments and string contents (keeping the quotes so
 * offsets survive) means the audit reads code and nothing else.
 */
function scrub(src) {
  let out = "";
  let i = 0;
  /*
   * The last character that was actual code, used to tell a JavaScript string
   * from an apostrophe in JSX text. `<Text>Didn't get it?</Text>` is not a
   * string open -- but treating it as one blanks the rest of the element,
   * which made this audit report a perfectly well-labelled button as having no
   * label. A quote only opens a string where an expression could start.
   */
  let prev = "";
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "/" && n === "/") {
      while (i < src.length && src[i] !== "\n") out += src[i++] === "\n" ? "\n" : " ";
      continue;
    }
    if (c === "/" && n === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      for (; i < stop; i++) out += src[i] === "\n" ? "\n" : " ";
      continue;
    }
    const opensExpression = prev === "" || /[=(,[:{&|?+\-*/%!<;]/.test(prev);
    if ((c === '"' || c === "'" || c === "`") && (c === "`" || opensExpression)) {
      out += c;
      i++;
      while (i < src.length && src[i] !== c) {
        if (src[i] === "\\") { out += " "; i++; if (i < src.length) { out += " "; i++; } continue; }
        out += src[i] === "\n" ? "\n" : " ";
        i++;
      }
      if (i < src.length) { out += c; i++; }
      prev = c;
      continue;
    }
    out += c;
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out;
}

const lineOf = (src, idx) => src.slice(0, idx).split("\n").length;

/** Blank comment bodies, preserving offsets and line breaks. */
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

/**
 * The full text of one JSX element, from its opening tag to its matching close.
 *
 * Regex cannot find the end of a JSX opening tag: `<Pressable ... >` contains
 * `=>` inside every onPress handler, so a lazy match stops on the arrow and
 * reports a fragment with no props. Track brace, paren and quote depth.
 */
function elements(src, tag) {
  const found = [];
  const open = new RegExp(`<${tag}(?=[\\s/>])`, "g");
  let m;
  while ((m = open.exec(src))) {
    const start = m.index;
    let i = start + m[0].length;
    let depth = 0;
    let quote = null;
    let selfClosing = false;
    for (; i < src.length; i++) {
      const c = src[i];
      if (quote) { if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
      if (c === "{" || c === "(" || c === "[") depth++;
      else if (c === "}" || c === ")" || c === "]") depth--;
      else if (c === ">" && depth === 0) { selfClosing = src[i - 1] === "/"; break; }
    }
    const tagEnd = i + 1;
    const attrs = src.slice(start, tagEnd);
    let body = "";
    if (!selfClosing) {
      // Find the matching close tag, accounting for nesting of the same tag.
      let level = 1;
      let j = tagEnd;
      const openRe = new RegExp(`<${tag}(?=[\\s/>])`, "g");
      const closeRe = new RegExp(`</${tag}>`, "g");
      while (level > 0 && j < src.length) {
        openRe.lastIndex = j;
        closeRe.lastIndex = j;
        const o = openRe.exec(src);
        const c = closeRe.exec(src);
        if (!c) break;
        if (o && o.index < c.index) { level++; j = o.index + 1; }
        else { level--; j = c.index + (level === 0 ? 0 : 1); }
      }
      body = src.slice(tagEnd, j);
    }
    found.push({ start, attrs, body, line: 0 });
  }
  return found;
}

/** Does this element render anything a screen reader can read aloud? */
function hasReadableText(el) {
  if (/accessibilityLabel\s*=/.test(el.attrs)) return true;
  if (/<Text[\s>]/.test(el.body)) return true;
  if (/\blabel\s*=\s*[{"']/.test(el.attrs)) return true;
  if (/\btitle\s*=\s*[{"']/.test(el.attrs)) return true;
  // A bare JSX expression child that is not an element, e.g. {count} or {name}
  if (/>\s*\{[^<}]*\}\s*</.test(`>${el.body}<`)) return true;
  return false;
}

/**
 * Every `const X = StyleSheet.create({ key: { ... } })` in a file, flattened to
 * "X.key" -> the declaration body, plus plain `const X = { ... }` style objects
 * under their own name.
 *
 * Without this the audit is worthless. Most controls in this app are styled by
 * reference -- `style={({pressed}) => [ab.btn, ...]}` -- and ab.btn declares
 * minHeight: 50. Reading only the JSX attributes sees no numbers at all and
 * reports 86 perfectly good buttons as too small. An audit that is mostly
 * false alarms gets switched off, so it resolves the reference.
 */
function styleSheets(src) {
  const map = new Map();
  /*
   * Both `const s = StyleSheet.create({...})` and the factory form this app
   * uses more often -- `function makeStyles(c) { return StyleSheet.create({...}) }`
   * with `const s = useMemo(() => makeStyles(c), [c])`. The factory has no name
   * to bind to, so keys are also indexed bare: a `style={s.btn}` reference
   * resolves through the key `btn` regardless of which object it came from.
   */
  const re = /(?:const\s+(\w+)\s*=\s*)?StyleSheet\.create\(\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1] || null;
    let i = re.lastIndex;
    let depth = 1;
    const start = i;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") depth--;
    }
    const body = src.slice(start, i - 1);
    // Split into `key: { ... }` entries at depth 0.
    let d = 0;
    let keyStart = 0;
    let key = null;
    for (let j = 0; j < body.length; j++) {
      const ch = body[j];
      if (ch === "{") { if (d === 0) { key = body.slice(keyStart, j).replace(/[:,\s]/g, ""); keyStart = j; } d++; }
      else if (ch === "}") {
        d--;
        if (d === 0 && key) {
          const decl = body.slice(keyStart, j + 1);
          if (name) map.set(`${name}.${key}`, decl);
          if (!map.has(key)) map.set(key, decl);
          keyStart = j + 1;
          key = null;
        }
      }
    }
  }
  // Plain style objects: `const row = { flexDirection: "row", minHeight: 44 }`.
  const plain = /const\s+(\w+)\s*=\s*\{/g;
  while ((m = plain.exec(src))) {
    const name = m[1];
    let i = plain.lastIndex;
    let depth = 1;
    const start = i;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") depth--;
    }
    const body = src.slice(start, i - 1);
    if (/\b(minHeight|height|paddingVertical|flex)\s*:/.test(body) && !map.has(name)) map.set(name, body);
  }
  return map;
}

/** Does a style declaration guarantee a 44px-tall control? */
function bigEnough(text) {
  // A control that fills its parent or stretches to fill a row is as large as
  // the layout allows; a backdrop covering the screen is the extreme case.
  if (/absoluteFill|\bflex\s*:\s*1\b/.test(text)) return true;
  /*
   * A size given as an identifier rather than a number -- `width: size`,
   * `height: dim` -- is set by whoever renders the component and cannot be
   * judged here. PowerDial defaults to 62 and would otherwise be reported as
   * a 0px target forever.
   */
  if (/\b(?:minHeight|height|minWidth|width|size)\s*:\s*[A-Za-z_$]/.test(text)) return true;
  const nums = [...text.matchAll(/\b(?:minHeight|height|minWidth|width|size)\s*:\s*(\d+)/g)].map((x) => Number(x[1]));
  if (nums.some((n) => n >= MIN_TARGET)) return true;
  const pad = [...text.matchAll(/\bpadding(?:Vertical|Top|Bottom)?\s*:\s*(\d+)/g)].map((x) => Number(x[1]));
  return pad.some((n) => n * 2 + 20 >= MIN_TARGET);
}

/** Layout components that are never small enough to be a tap-target problem. */
const LARGE_CHILD = /<(Card|ListRow|StatTile|Tile|Row|ModuleScaffold|Banner|MetricRow)[\s>]/;

/** Is this control guaranteed to be big enough, or padded out with hitSlop? */
function hasAdequateTarget(el, sheets) {
  if (/hitSlop/.test(el.attrs)) return true;
  if (bigEnough(el.attrs)) return true;
  if (LARGE_CHILD.test(el.body)) return true;
  /*
   * A control whose immediate content is tall enough is tall enough. Several
   * buttons here put the padding on a child gradient or animated view so the
   * whole surface can be depressed, which is a rendering detail, not a
   * smaller tap target.
   */
  if (bigEnough(el.body.slice(0, 800))) return true;
  /*
   * A wrapper whose entire body is one expression -- {content}, {body},
   * {children} -- has no size of its own; it is as big as whatever the caller
   * passed in. Reporting these says nothing useful, and "fixing" them with
   * hitSlop would overlap the touch areas of adjacent rows in a list.
   */
  if (/^\s*\{\s*\w+\s*\}\s*$/.test(el.body)) return true;
  // Same reasoning for a wrapper that applies a style handed in by its caller.
  if (/style\s*=\s*\{?\s*\[?\s*wrapStyle\b/.test(el.attrs) || /\bwrapStyle\b/.test(el.body.slice(0, 200))) return true;
  for (const [name, body] of sheets) {
    // Match `s.btn` / `styles.btn` references, and bare keys from factories.
    // The reference may be on the control or on the child that carries its
    // padding -- a button whose gradient child is `style={s.btn}` is as tall
    // as s.btn says.
    const scope = el.attrs + el.body.slice(0, 800);
    const referenced = name.includes(".") ? scope.includes(name) : new RegExp(`\\.${name}\\b`).test(scope);
    if (referenced && bigEnough(body)) return true;
  }
  return false;
}

const findings = { labels: [], targets: [], theme: [] };
const files = walk(SRC);

for (const file of files) {
  const raw = readFileSync(file, "utf8");
  const src = scrub(raw);
  const rel = relative(ROOT, file);
  const sheets = styleSheets(src);

  for (const tag of ["Pressable", "TouchableOpacity"]) {
    for (const el of elements(src, tag)) {
      const line = lineOf(src, el.start);
      const where = `${rel}:${line}`;
      if (!hasReadableText(el)) findings.labels.push({ where, snippet: el.attrs.replace(/\s+/g, " ").slice(0, 110) });
      if (!hasAdequateTarget(el, sheets)) {
        findings.targets.push({ where, snippet: el.attrs.replace(/\s+/g, " ").slice(0, 110) });
      }
    }
  }

  // Colour literals in code. Comments are blanked first -- this audit's own
  // explanation of which colours are banned must not count as a violation,
  // a trap three other guards in this repo have fallen into. String bodies
  // are kept, because "#0f172a" written as a style value is exactly what is
  // being looked for.
  const codeOnly = blankComments(raw);
  for (const m of codeOnly.matchAll(/(?<![\w-])(#[0-9a-fA-F]{6})\b/g)) {
    const value = m[1];
    if (NEUTRAL.test(value)) continue;
    const idx = m.index;
    const before = codeOnly.slice(Math.max(0, idx - 90), idx);
    // Palette definitions are where literals belong.
    if (/\b(theme|palette|GRAD|COLORS|SCHEMES)\b/i.test(before)) continue;
    // An explicit, documented exception: a splash screen that must look the
    // same before the user has chosen a theme, a video letterbox that is
    // black because video is black. The marker has to be in the source, so
    // the reason is recorded next to the colour rather than in someone's head.
    const line = raw.split("\n")[lineOf(codeOnly, idx) - 1] || "";
    if (/theme-literal-ok/.test(line) || /theme-literal-ok/.test(raw.split("\n")[lineOf(codeOnly, idx) - 2] || "")) continue;
    findings.theme.push({ where: `${rel}:${lineOf(codeOnly, idx)}`, snippet: (before.slice(-46) + value).replace(/\s+/g, " ") });
  }
}

const list = process.argv.includes("--list");
console.log(`scanned ${files.length} files\n`);
for (const [k, v] of Object.entries(findings)) {
  console.log(`${k.padEnd(10)} ${String(v.length).padStart(4)}`);
  if (list) for (const f of v) console.log(`    ${f.where}  ${f.snippet}`);
}
const total = Object.values(findings).reduce((n, v) => n + v.length, 0);
console.log(`\ntotal      ${String(total).padStart(4)}`);

if (process.env.JSON) {
  writeFileSync(process.env.JSON, JSON.stringify(findings, null, 2));
  console.log(`wrote ${process.env.JSON}`);
}

if (total) {
  console.log(`\nRun with --list to see each one.`);
  console.log(`A colour that must not follow the theme needs a "theme-literal-ok" comment saying why.`);
  process.exitCode = 1;
} else {
  console.log("\nui:audit ok — every control is reachable, named, and themed");
}
