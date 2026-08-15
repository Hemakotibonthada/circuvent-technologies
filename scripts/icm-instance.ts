/**
 * One simulated lambda instance, for verify-icm-durability.ts.
 *
 * Run as its own process on purpose. Re-importing a module inside one process
 * does not give a second instance — the module cache returns the first, and a
 * check built that way proves nothing about the failure being reproduced. A
 * separate process has genuinely separate module state, which is exactly what
 * a cold lambda has.
 *
 * The Postgres data directory is shared on disk, so each instance talks to the
 * same database while sharing no memory.
 *
 * Usage: tsx scripts/icm-instance.ts <pgDir> <command> [arg]
 */
import { PGlite } from "@electric-sql/pglite";

async function main() {
  const [pgDir, command, arg] = process.argv.slice(2);

  const pg = new PGlite(pgDir);
  const db = await import("../src/lib/db");
  db.__setQueryForTests(async (text, params = []) => {
    const res = await pg.query(text, params as unknown[]);
    return res.rows as Record<string, unknown>[];
  });
  await db.initDb();

  const icm = await import("../src/lib/icm-store");

  /* What the queue looks like to a cold instance that has not loaded the
     authoritative copy yet — the state the console used to render. */
  const beforeHydrate = icm.listIncidents().length;
  await icm.revalidateIcm();

  let result: unknown = null;

  if (command === "file") {
    const inc = icm.fileIncident({
      title: arg || "Untitled",
      description: "Filed by a simulated instance",
      severity: 2,
      owningTeam: "Platform",
      createdBy: "ops@circuvent.com",
      source: "manual",
    });
    await icm.flushIcm();
    result = { id: inc.id, title: inc.title };
  } else if (command === "acknowledge") {
    const { acknowledge } = await import("../src/lib/icm");
    const { incident, error } = icm.updateIncident(arg || "", (i) =>
      acknowledge(i, "asha@circuvent.com", new Date().toISOString())
    );
    await icm.flushIcm();
    result = { error, status: incident?.status, assignedTo: incident?.assignedTo };
  }

  const incidents = icm.listIncidents();
  console.log(
    JSON.stringify({
      beforeHydrate,
      afterHydrate: incidents.length,
      ids: incidents.map((i) => i.id),
      titles: incidents.map((i) => i.title),
      statuses: Object.fromEntries(incidents.map((i) => [i.id, i.status])),
      assigned: Object.fromEntries(incidents.map((i) => [i.id, i.assignedTo])),
      durable: icm.isDurable(),
      result,
    })
  );

  await pg.close();
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
