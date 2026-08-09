import "./test-env";
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { consoleRouter } from "./routes/console";

/**
 * The operations console.
 *
 * Root used to answer `{"error":"Not found"}` — accurate, and useless. It sent
 * anyone who reached this host looking for a different hostname, while the box
 * running the broker, the scheduler and the database had no way to be asked
 * anything without an SSH session.
 *
 * These tests assert the two properties that actually matter for a page that
 * exists to be used during an outage: it must render with no external
 * dependency of any kind, and its content policy must be real rather than
 * decorative. Everything else about it is visual and is not worth pinning.
 */
async function withServer<T>(fn: (base: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use("/", consoleRouter);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const { port } = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

describe("the operations console", () => {
  test("root serves a page instead of a 404", async () => {
    await withServer(async (base) => {
      const r = await fetch(`${base}/`);
      assert.equal(r.status, 200);
      assert.match(r.headers.get("content-type") ?? "", /text\/html/);
      const html = await r.text();
      assert.match(html, /Control Plane/);
      assert.match(html, /id="loginForm"/);
    });
  });

  test("loads nothing from anywhere else", async () => {
    /*
     * The whole point of this page is that it works when things are broken. A
     * font, a CDN script or a stylesheet from another origin is one more thing
     * that can be the reason the page that diagnoses an outage is itself
     * unavailable — and on a locked-down network it fails silently, leaving a
     * console that renders as unstyled text at the worst possible moment.
     */
    await withServer(async (base) => {
      const html = await fetch(`${base}/`).then((r) => r.text());
      const external = html.match(/(?:src|href)\s*=\s*["'](https?:)?\/\/[^"']+/gi) ?? [];
      const offenders = external.filter((u) => !/circuvent\.com\/developers/.test(u));
      assert.deepEqual(offenders, [], `console must not load remote assets: ${offenders.join(", ")}`);
      assert.equal(/<link\b[^>]*rel=["']?stylesheet/i.test(html), false);
      assert.equal(/@import/i.test(html), false);
    });
  });

  test("its content policy is enforceable, not decorative", async () => {
    await withServer(async (base) => {
      const r = await fetch(`${base}/`);
      const csp = r.headers.get("content-security-policy") ?? "";
      assert.match(csp, /default-src 'none'/);
      assert.match(csp, /frame-ancestors 'none'/);
      // 'unsafe-inline' would make the nonce theatre: any injected script would
      // run regardless of whether it carried one.
      assert.equal(csp.includes("unsafe-inline"), false, "CSP must not allow unsafe-inline");
      assert.equal(csp.includes("unsafe-eval"), false, "CSP must not allow unsafe-eval");

      const html = await r.text();
      const nonce = /script-src 'nonce-([^']+)'/.exec(csp)?.[1];
      assert.ok(nonce, "no script nonce issued");
      // Every inline block must carry the nonce, or the page is broken by its
      // own policy — which is worse than having no policy, because it fails
      // only in browsers that enforce it.
      const blocks = html.match(/<(?:script|style)\b[^>]*>/gi) ?? [];
      assert.ok(blocks.length >= 2);
      for (const tag of blocks) {
        assert.ok(tag.includes(`nonce="${nonce}"`), `inline block without the nonce: ${tag}`);
      }
    });
  });

  test("issues a different nonce every time", async () => {
    // A fixed nonce is the same as no nonce: an injected script could carry it.
    await withServer(async (base) => {
      const a = (await fetch(`${base}/`)).headers.get("content-security-policy") ?? "";
      const b = (await fetch(`${base}/`)).headers.get("content-security-policy") ?? "";
      const na = /nonce-([^']+)/.exec(a)?.[1];
      const nb = /nonce-([^']+)/.exec(b)?.[1];
      assert.ok(na && nb);
      assert.notEqual(na, nb);
    });
  });

  test("is never cached and never indexed", async () => {
    // It is behind a login and reflects live production state; a cached copy
    // in a shared proxy is both stale and a small disclosure.
    await withServer(async (base) => {
      const r = await fetch(`${base}/`);
      assert.match(r.headers.get("cache-control") ?? "", /no-store/);
      const html = await r.text();
      assert.match(html, /name="robots" content="noindex,nofollow"/);
    });
  });

  test("uses no style attributes, which the nonce cannot cover", async () => {
    /*
     * A CSP nonce applies to <style> and <script> *elements*. It does not apply
     * to a style="" attribute — those need 'unsafe-hashes', which loosens the
     * policy for the whole page.
     *
     * The first version of this console had eleven of them. Every header
     * assertion above passed, the page returned 200, and a real browser
     * silently refused to apply any of them: the console rendered as unstyled
     * text while the tests reported success. Checking the response headers is
     * not the same as checking the page works.
     */
    await withServer(async (base) => {
      const html = await fetch(`${base}/`).then((r) => r.text());
      const attrs = html.match(/\sstyle\s*=\s*["'][^"']*["']/gi) ?? [];
      assert.deepEqual(attrs, [], `style attributes are blocked by this CSP: ${attrs.join(" | ")}`);
      // The scripts build rows too, so check the generated markup as well.
      assert.equal(/style=\\{0,2}"/.test(html), false, "a script emits a style attribute");
    });
  });

  test("answers curl with something useful", async () => {
    await withServer(async (base) => {
      const r = await fetch(`${base}/index.json`);
      assert.equal(r.status, 200);
      const body = (await r.json()) as Record<string, unknown>;
      assert.equal(body.service, "circuvent-control-plane");
      assert.ok(Array.isArray(body.capabilities));
      assert.equal(body.health, "/health");
    });
  });

  test("ships no credential and no token", async () => {
    // The page is public. Anything secret in it would be readable by anyone
    // who visits, which is the failure mode of "just embed a service token".
    await withServer(async (base) => {
      const html = await fetch(`${base}/`).then((r) => r.text());
      assert.equal(/eyJ[A-Za-z0-9_-]{10,}\./.test(html), false, "a JWT is embedded in the page");
      assert.equal(/JWT_SECRET|POSTGRES_PASSWORD|MQTT_PASSWORD/.test(html), false);
      // The token must live in a closure, not in storage a later XSS could read.
      assert.equal(/localStorage|sessionStorage/.test(html), false);
    });
  });
});
