// Postinstall patch: Hermes' replace_hermes_version.js runs `tar -xf <path>` without
// quoting. Paths containing spaces (e.g. "Office Suit") split at the space and tar
// fails with "No such file or directory". Idempotent.
const fs = require("fs");
const path = require("path");

const file = path.join(
  __dirname,
  "..",
  "node_modules",
  "react-native",
  "sdks",
  "hermes-engine",
  "utils",
  "replace_hermes_version.js"
);

const bad = "execSync(`tar -xf ${tarballURLPath} -C ${finalLocation}`);";
const good = 'execSync(`tar -xf "${tarballURLPath}" -C "${finalLocation}"`);';

try {
  let src = fs.readFileSync(file, "utf8");
  if (src.includes(bad)) {
    fs.writeFileSync(file, src.replace(bad, good));
    console.log("[patch-hermes-path-spaces] quoted tarball paths for tar");
  } else if (src.includes(good)) {
    console.log("[patch-hermes-path-spaces] already patched — skipping");
  } else {
    console.log("[patch-hermes-path-spaces] upstream changed — skipping");
  }
} catch (e) {
  console.warn("[patch-hermes-path-spaces] skipped:", e.message);
}
