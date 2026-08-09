// Fails if mobile/src/avi.ts has drifted from the website's src/lib/avi.ts.
//
// The AVI writer has to exist twice: mobile is its own package with its own
// tsconfig and no path back into the site's src/. Two copies of a byte-layout
// writer is exactly the situation where one gets a fix and the other does not,
// and the symptom would be clips that play from the phone but not the browser,
// or the reverse — which nobody would trace back to a duplicated file.
//
// The offsets are checked against the *firmware's* constants in
// tests/firmware-avi.test.ts. This check is the other half: it makes sure both
// TypeScript copies are the same file, so that test covers them both.
//
// If this fails, copy the website's version over the mobile one:
//   cp ../src/lib/avi.ts src/avi.ts

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
const mine = path.join(root, "src", "avi.ts");
const theirs = path.join(root, "..", "src", "lib", "avi.ts");

if (!fs.existsSync(theirs)) {
  // Mobile is built from its own checkout in CI, where the site may not be
  // present. Absent is not drifted, and failing here would block a build for
  // a file it cannot see.
  console.log("avi:check skipped — website src/lib/avi.ts not present");
  process.exit(0);
}

const norm = (p) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const a = norm(mine);
const b = norm(theirs);

if (a !== b) {
  const sum = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 12);
  const aLines = a.split("\n");
  const bLines = b.split("\n");
  let firstDiff = -1;
  for (let i = 0; i < Math.max(aLines.length, bLines.length); i++) {
    if (aLines[i] !== bLines[i]) {
      firstDiff = i + 1;
      break;
    }
  }
  console.error(
    "avi:check FAILED — mobile/src/avi.ts has drifted from ../src/lib/avi.ts\n" +
      `  mobile  ${sum(a)} (${aLines.length} lines)\n` +
      `  website ${sum(b)} (${bLines.length} lines)\n` +
      `  first difference at line ${firstDiff}\n` +
      "  fix: cp ../src/lib/avi.ts src/avi.ts"
  );
  process.exit(1);
}

console.log("avi:check ok — recorder matches the website");
