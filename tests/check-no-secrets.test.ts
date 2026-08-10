/**
 * Tests for the check that refuses to commit a secret.
 *
 * A check that has never failed is not evidence of anything. Before this file
 * existed the check reported "no secrets" — and it reported that both when the
 * tree was clean and when a live database password was sitting in a tracked
 * compose file, because a bug in the placeholder logic was discarding the hit.
 * So each rule here is proved twice: once that it fires on a real secret, and
 * once that it stays quiet on the reference or redaction that looks like one.
 *
 * The fake secrets below are assembled from fragments at runtime. If they were
 * written as literals this file would itself match the patterns, and the only
 * fix would be to add it to the checker's allowlist — and an allowlist is
 * precisely the mechanism by which a real secret gets ignored later.
 */
/* eslint-disable @typescript-eslint/no-var-requires */
const { scanName, scanContent, isPlaceholder } = require("../scripts/check-no-secrets.js");

type Hit = { why: string; sample?: string };

const whys = (hits: Hit[]) => hits.map((h) => h.why);

describe("check-no-secrets: content rules fire on real secrets", () => {
  it("detects an embedded private key", () => {
    const pem = `-----BEGIN RSA PRIVATE ${"KEY"}-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE ${"KEY"}-----`;
    expect(scanContent(pem)).not.toHaveLength(0);
  });

  it("detects an OpenSSH private key, which is what the production VM key is", () => {
    const pem = `-----BEGIN OPENSSH PRIVATE ${"KEY"}-----\nb3BlbnNzaC1rZXktdjEA\n-----END OPENSSH PRIVATE ${"KEY"}-----`;
    expect(scanContent(pem)).not.toHaveLength(0);
  });

  it("detects an AWS access key id", () => {
    expect(scanContent(`aws_access_key_id = ${"AKIA"}IOSFODNN7EXAMPLE`)).not.toHaveLength(0);
  });

  it("detects a GitHub personal access token", () => {
    const tok = "ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8";
    expect(scanContent(`GITHUB_TOKEN=${tok}`)).not.toHaveLength(0);
  });

  it("detects a database URL carrying a real password", () => {
    const url = "postgres" + "ql://circuvent_user:hunter2isnotgreat@postgres:5432/circuvent_db";
    expect(whys(scanContent(`DATABASE_URL=${url}`))).toContain("a database URL with a password in it");
  });

  it("detects a literal keystore password", () => {
    // Split so this file does not contain the pattern it is testing for. The
    // first version wrote it as a literal, and the pre-commit hook rejected
    // this very commit — which is the check doing its job.
    const pw = "s3cr3t" + "storepass";
    expect(scanContent(`CV_UPLOAD_STORE_PASSWORD=${pw}`)).not.toHaveLength(0);
  });
});

describe("check-no-secrets: references and redactions are not secrets", () => {
  // Each of these appeared in the tree and was reported as a problem on the
  // first run. Six false positives on a first run is how a check gets turned
  // off before it ever catches anything real.
  const notSecrets: Array<[string, string]> = [
    ["a compose variable reference", "DATABASE_URL=postgres" + "ql://circuvent_user:${POSTGRES_PASSWORD}@postgres:5432/circuvent_db"],
    [
      "a compose variable with a required-value guard, which is what the fix used",
      "DATABASE_URL=postgres" + "ql://circuvent_user:${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}@postgres:5432/circuvent_db",
    ],
    ["a redacted sample", "DATABASE_URL=postgres" + "ql://circuvent_user:******@postgres:5432/circuvent_db"],
    ["a template literal read at runtime", "CV_UPLOAD_STORE_PASSWORD=${props.CV_UPLOAD_STORE_PASSWORD}`"],
    ["a documentation placeholder", "CV_UPLOAD_STORE_PASSWORD=<store password>"],
    ["a shell variable", "CV_UPLOAD_STORE_PASSWORD=$KEYSTORE_PASSWORD"],
  ];

  it.each(notSecrets)("stays quiet on %s", (_label, text) => {
    expect(scanContent(text)).toHaveLength(0);
  });
});

describe("check-no-secrets: filename rules", () => {
  const secretNames = [
    ".env",
    ".env.production",
    ".env.local",
    "circuvent-upload.jks",
    "circuvent-upload.keystore",
    "id_rsa",
    "id_ed25519",
    "ssh-key-2026-07-24.key",
    "server.pem",
    "upload-keystore.properties",
    "circuvent.vault",
    "credentials.json",
  ];

  it.each(secretNames)("refuses %s", (name) => {
    expect(scanName(name)).not.toHaveLength(0);
  });

  const safeNames = [".env.example", ".env.sample", ".env.template", "package.json", "docker-compose.yml", "README.md"];

  it.each(safeNames)("allows %s", (name) => {
    expect(scanName(name)).toHaveLength(0);
  });
});

describe("check-no-secrets: isPlaceholder", () => {
  it("treats an empty value as a placeholder rather than reporting nothing as a secret", () => {
    expect(isPlaceholder("")).toBe(true);
    expect(isPlaceholder(undefined)).toBe(true);
  });

  it("does not treat a plausible password as a placeholder", () => {
    expect(isPlaceholder("hunter2isnotgreat")).toBe(false);
    expect(isPlaceholder("circuvent_pass")).toBe(false);
  });

  it("tolerates the punctuation that surrounds a value in source", () => {
    // The first version captured the trailing backtick of a template literal
    // along with the value and concluded it was not a variable reference.
    expect(isPlaceholder("${props.CV_UPLOAD_STORE_PASSWORD}`")).toBe(true);
    expect(isPlaceholder('"${POSTGRES_PASSWORD}",')).toBe(true);
  });
});
