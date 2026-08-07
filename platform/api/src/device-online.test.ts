import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DEVICE_STALE_SECONDS, isOnline, onlineColumn, onlineSql } from "./device-online";

test("onlineSql requires both the flag and a recent last_seen", () => {
  const sql = onlineSql();
  assert.match(sql, /online AND/, "the stored flag must still be required");
  assert.match(sql, /last_seen > now\(\) - interval '90 seconds'/);
  assert.equal(onlineSql("d."), `(d.online AND d.last_seen > now() - interval '90 seconds')`);
  assert.match(onlineColumn("d."), /AS online$/, "must alias back so callers see `online`");
});

test("the staleness window sits past the broker's own keepalive", () => {
  // Devices publish every 10s and MQTT keepalive is 45s, so the broker gives
  // up at ~67s. A shorter window would report offline for one dropped publish.
  assert.ok(DEVICE_STALE_SECONDS > 67, "must not undercut the broker's keepalive timeout");
  assert.ok(DEVICE_STALE_SECONDS < 600, "must still be responsive enough to be useful");
});

test("isOnline mirrors the SQL", () => {
  const now = Date.now();
  assert.equal(isOnline({ online: true, last_seen: new Date(now - 5_000) }), true);
  assert.equal(isOnline({ online: true, last_seen: new Date(now - 89_000) }), true);
  assert.equal(isOnline({ online: true, last_seen: new Date(now - 91_000) }), false,
    "a flag two weeks stale is what caused this bug");
  assert.equal(isOnline({ online: false, last_seen: new Date(now) }), false);
  assert.equal(isOnline({ online: true, last_seen: null }), false);
  assert.equal(isOnline({ online: true, last_seen: "not a date" }), false);
  assert.equal(isOnline({}), false);
});

/**
 * The real protection. Ten separate queries read this column; the bug existed
 * because each one independently trusted the flag. Adding an eleventh is easy
 * and forgetting the derivation is easier, so the build refuses it.
 */
test("no SELECT reads devices.online without deriving liveness", () => {
  const root = ["src", join("platform", "api", "src")]
    .map((p) => join(process.cwd(), p))
    .find((p) => existsSync(p));
  assert.ok(root, `could not locate the source tree from ${process.cwd()}`);
  const offenders: string[] = [];
  let scanned = 0;

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!entry.endsWith(".ts") || entry.endsWith(".test.ts")) continue;
      if (entry === "device-online.ts" || entry === "liveness.ts") continue;

      const src = readFileSync(p, "utf8");
      // Split on backticks: odd-indexed segments are inside template literals.
      // An earlier version matched /`[^`]*devices[^`]*`/, which happily matched
      // the *gap between* two literals and reported plain TypeScript as SQL.
      const parts = src.split("`");
      let offset = 0;
      for (let i = 0; i < parts.length; i++) {
        const seg = parts[i];
        if (i % 2 === 1 && /\bdevices\b/.test(seg) && /\bonline\b/.test(seg)) {
          scanned++;
          const writes = /\b(UPDATE|INSERT|CREATE|ALTER)\b/i.test(seg);
          const exempt = /raw-flag:/.test(src.slice(Math.max(0, offset - 400), offset));
          const bare = seg.replace(/\$\{[^}]*\}/g, "");
          if (!writes && !exempt && /\bonline\b/.test(bare)) {
            offenders.push(`${entry}:${src.slice(0, offset).split("\n").length}`);
          }
        }
        offset += seg.length + 1;
      }
    }
  };
  walk(root);

  assert.ok(scanned > 0, "scanned no SQL at all — the matcher is broken, not the code");
  assert.deepEqual(
    offenders, [],
    `these read devices.online directly instead of onlineSql()/onlineColumn():\n  ${offenders.join("\n  ")}`
  );
});
