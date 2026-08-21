/**
 * No .vercelignore rule may exclude anything under `src/`.
 *
 * THE OUTAGE THIS EXISTS FOR
 *
 * `.vercelignore` is gitignore syntax, so `platform/` matches a directory of
 * that name at *any* depth — not just the sibling monorepo at the repository
 * root it was written for. Three real routes were missing from production for
 * exactly this reason:
 *
 *   src/app/smarthome/admin/platform   the platform admin page
 *   src/app/smarthome/firmware         the firmware console
 *   src/app/api/devices/firmware       the OTA manifest endpoint
 *
 * The last one is the one that hurt. It is what `checkOTA()` calls, so every
 * device in the fleet asking "is there a newer build for me?" received a 404
 * and concluded there was not. Updates appeared to work only because we had
 * been pushing them by hand over MQTT, which never touches this route.
 *
 * WHY A TEST AND NOT CARE
 *
 * Nothing anywhere reports it. The build succeeds, the deploy succeeds, `next
 * build` lists the route locally, and the page 404s in production with no error
 * in any log — the files were simply never uploaded. It is invisible until
 * somebody clicks the exact link, and it stayed broken long enough that manual
 * OTA pushes became the normal way of working.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.join(__dirname, "..");

/** The directory patterns from .vercelignore, ignoring comments and blanks. */
function patterns(): string[] {
  const file = path.join(root, ".vercelignore");
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("!"));
}

/** Every directory under src/, relative and slash-separated. */
function srcDirs(dir = path.join(root, "src"), acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const full = path.join(dir, e.name);
    acc.push(path.relative(root, full).split(path.sep).join("/"));
    srcDirs(full, acc);
  }
  return acc;
}

/**
 * Whether a gitignore-style pattern would exclude this path.
 *
 * Only the cases that actually appear in this file are modelled: a bare
 * `name/`, an anchored `/name/`, and a `**\/name` form. That is deliberate —
 * a general gitignore engine would be more code than the rule it is checking,
 * and a wrong one would give false confidence.
 */
function excludes(pattern: string, dirPath: string): boolean {
  const p = pattern.replace(/\/+$/, "");
  const segments = dirPath.split("/");

  if (p.startsWith("**/")) {
    return segments.includes(p.slice(3));
  }
  if (p.startsWith("/")) {
    // Anchored: only ever matches from the repository root.
    return dirPath === p.slice(1) || dirPath.startsWith(`${p.slice(1)}/`);
  }
  // Unanchored: gitignore matches this at any depth. This is the bug.
  return segments.includes(p);
}

describe(".vercelignore", () => {
  const dirs = srcDirs();

  it("finds the source tree at all", () => {
    // A glob that matched nothing would make the assertion below vacuously
    // true, which is the failure mode of this whole style of test.
    expect(dirs.length).toBeGreaterThan(50);
  });

  it("excludes nothing under src/", () => {
    const offenders: string[] = [];
    for (const pattern of patterns()) {
      for (const dir of dirs) {
        if (excludes(pattern, dir)) offenders.push(`${pattern}  ->  ${dir}`);
      }
    }

    expect({
      hint: "anchor the pattern to the repository root with a leading slash",
      offenders,
    }).toEqual({
      hint: "anchor the pattern to the repository root with a leading slash",
      offenders: [],
    });
  });

  it("still excludes the sibling projects it is meant to", () => {
    // The rules exist for a reason — a fix that stopped excluding the 6 GB of
    // sibling dependencies would trade a silent 404 for a failed deploy.
    const ps = patterns();
    for (const sibling of ["platform", "mobile", "firmware", "hardware", "circuvent-platform"]) {
      expect(ps.some((p) => excludes(p, sibling))).toBe(true);
    }
  });
});
