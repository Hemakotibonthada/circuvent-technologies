/**
 * Proves the reported ICM failure and its fix, end to end.
 *
 * The bug was never in the UI. Incidents were written to a JSON file that the
 * serverless host cannot write, so `createFileStore` caught the failure and
 * kept them in one lambda instance's memory. The next request — a cold start,
 * or simply one routed elsewhere — began from an empty seed and rendered an
 * empty queue. Incidents filed weeks ago were not hidden; they were gone.
 *
 * Each "instance" below is a **separate process** sharing one on-disk
 * Postgres. That matters: re-importing a module inside one process returns the
 * cached copy, so a check written that way shares memory and would pass even
 * with the bug present.
 *
 * Run: npx tsx scripts/verify-icm-durability.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log("  ✓", msg);
  else {
    console.error("  ✗", msg);
    failures++;
  }
}

const root = path.join(__dirname, "..");
const pgDir = fs.mkdtempSync(path.join(os.tmpdir(), "cv-icm-pg-"));
const dataDirs: string[] = [];

/**
 * Starts a fresh process — a cold instance — and returns what it saw.
 *
 * Each gets its **own** empty DATA_DIR, because on the serverless host the
 * JSON file this store would otherwise read never exists. Sharing one would
 * let the next instance read the previous one's file and quietly hide whether
 * the database is doing any work at all.
 */
function instance(command: string, arg = ""): InstanceResult {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cv-icm-data-"));
  dataDirs.push(dataDir);
  /*
   * Node is invoked directly with tsx's own entry point rather than through
   * `npx`. Node 22 refuses to spawn a `.cmd` without a shell, and putting a
   * shell back in re-parses the argument list — which silently truncates an
   * incident title at its first space.
   */
  const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
  const out = execFileSync(
    process.execPath,
    [tsxCli, path.join("scripts", "icm-instance.ts"), pgDir, command, arg],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, DATA_DIR: dataDir, DATABASE_URL: "postgres://verify/local" },
    }
  );
  const line = out.trim().split("\n").filter(Boolean).pop() as string;
  return JSON.parse(line) as InstanceResult;
}

interface InstanceResult {
  beforeHydrate: number;
  afterHydrate: number;
  ids: string[];
  titles: string[];
  statuses: Record<string, string>;
  assigned: Record<string, string>;
  durable: boolean;
  result: { id?: string; error?: string; status?: string; assignedTo?: string } | null;
}

/** Starts a fresh process — a cold instance — and returns what it saw. */
/** Starts a fresh process — a cold instance — and returns what it saw. */
function main() {
  console.log(
    "Note: each instance deliberately reads the queue before hydrating, to show the cold\n" +
      "state. That read seeds an empty document, and the store's guard refuses to save it —\n" +
      "the '[data-file] refusing to save' lines below are that guard working, not a fault.\n"
  );
  console.log("instance A files an incident…");
  const a = instance("file", "Gateway timeouts on checkout");
  assert(a.beforeHydrate === 0, "a cold instance starts with an empty queue — this was the bug");
  assert(a.durable === true, "the store reports itself durable");
  assert(a.result?.id === "INC-0001", `filed as ${a.result?.id}`);

  console.log("\ninstance B — a different process — files another…");
  const b = instance("file", "Hub offline in Living Room");
  assert(b.beforeHydrate === 0, "it too starts empty, sharing no memory with A");
  assert(b.afterHydrate === 2, "after loading, it sees its own and A's incident");
  assert(b.ids.includes("INC-0001"), "A's incident survived the process that filed it");
  assert(
    b.result?.id === "INC-0002",
    `the id counter continued at ${b.result?.id} rather than restarting at INC-0001`
  );

  console.log("\ninstance C acknowledges A's incident…");
  const c = instance("acknowledge", "INC-0001");
  assert(!c.result?.error, "a later process can act on an incident it did not file");
  assert(c.result?.status === "acknowledged", "the transition applied");

  console.log("\ninstance D reads the queue afresh…");
  const d = instance("read");
  assert(d.afterHydrate === 2, "both incidents are still there");
  assert(d.statuses["INC-0001"] === "acknowledged", "the acknowledgement survived");
  assert(d.assigned["INC-0001"] === "asha@circuvent.com", "and so did who took ownership");
  assert(
    d.titles.includes("Gateway timeouts on checkout") && d.titles.includes("Hub offline in Living Room"),
    `the content of both incidents is intact (saw: ${d.titles.join(" | ")})`
  );

  fs.rmSync(pgDir, { recursive: true, force: true });
  for (const dir of dataDirs) fs.rmSync(dir, { recursive: true, force: true });

  console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
