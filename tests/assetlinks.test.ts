/**
 * Android App Links.
 *
 * Two files have to agree or deep links silently stop working: the fingerprint
 * Google publishes for the app signing key, and the one this site serves at
 * /.well-known/assetlinks.json. When they disagree there is no error anywhere —
 * Android simply declines to verify the domain and every https://circuvent.com
 * link opens in a browser instead of the app, which looks like a link that was
 * never set up rather than one that broke.
 *
 * play-upload-key.json is the record of what Play says, so it is the thing to
 * check against.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const ASSETLINKS = join(ROOT, "public", ".well-known", "assetlinks.json");
const PLAY_KEY = join(ROOT, "mobile", "play-upload-key.json");

describe("assetlinks.json", () => {
  it("exists — it returned 404 on both domains before this", () => {
    expect(existsSync(ASSETLINKS)).toBe(true);
  });

  it("is valid JSON in the shape Android expects", () => {
    const doc = JSON.parse(readFileSync(ASSETLINKS, "utf8"));
    expect(Array.isArray(doc)).toBe(true);
    expect(doc[0].relation).toContain("delegate_permission/common.handle_all_urls");
    expect(doc[0].target.namespace).toBe("android_app");
  });

  it("names the package Play has permanently reserved", () => {
    const doc = JSON.parse(readFileSync(ASSETLINKS, "utf8"));
    expect(doc[0].target.package_name).toBe("com.circuvent.app");
  });

  it("carries the APP SIGNING fingerprint, not the upload one", () => {
    // The distinction that breaks this: Play App Signing re-signs every
    // release, so the certificate on a user's device is Google's app signing
    // key, never the upload key we build with. Publishing the upload
    // fingerprint here would look right and verify nothing.
    const doc = JSON.parse(readFileSync(ASSETLINKS, "utf8"));
    const play = JSON.parse(readFileSync(PLAY_KEY, "utf8"));
    const served: string[] = doc[0].target.sha256_cert_fingerprints;

    expect(served).toContain(play.appSigningKey.sha256);
    expect(served).not.toContain(play.uploadCertificate.sha256);
  });

  it("uses the colon-separated uppercase hex Android matches on", () => {
    const doc = JSON.parse(readFileSync(ASSETLINKS, "utf8"));
    for (const fp of doc[0].target.sha256_cert_fingerprints as string[]) {
      expect(fp).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    }
  });
});
