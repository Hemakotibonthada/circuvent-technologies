/**
 * The broker certificate reaches an operator.
 *
 * WHAT WENT WRONG
 *
 * `GET /admin/health` has reported `brokerCert` — subject, issuer, expiry,
 * `daysRemaining` and an `expiringSoon` flag — since the certificate got a
 * renewal path. Docs/17 states the reason plainly: it is surfaced there "so the
 * date lives somewhere an operator already looks."
 *
 * Nothing looked. `AdminHealth` in src/lib/control-plane.ts declared four
 * fields and not that one, so the value arrived on every poll and was dropped
 * at the type boundary, and neither admin surface rendered it. The server was
 * answering a question no one asked.
 *
 * That is this codebase's usual failure shape — two sides of one contract, no
 * mechanism forcing agreement, and no error when they disagree — with an
 * unusually large blast radius: devices verify this certificate on connect, so
 * when it lapses the entire fleet fails the handshake at once, on a date that
 * was knowable years ahead.
 *
 * WHY THE TEST IS STATIC
 *
 * platform/api and the Next.js app are separate TypeScript projects and cannot
 * import each other, so the interface is necessarily written twice. These are
 * read as text for the same reason tests/tank-link-parity.test.ts parses a C
 * header: the only alternative is trusting that two files stay in step.
 */
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");

const serverCert = read("platform", "api", "src", "broker-cert.ts");
const serverHealthRoute = read("platform", "api", "src", "routes", "admin.ts");
const clientTypes = read("src", "lib", "control-plane.ts");
const overviewPage = read("src", "app", "smarthome", "admin", "page.tsx");
const platformPage = read("src", "app", "smarthome", "admin", "platform", "page.tsx");
const presenter = read("src", "app", "smarthome", "admin", "_lib", "broker-cert.ts");
const appTypes = read("mobile", "src", "api.ts");
const appScreen = read("mobile", "src", "screens", "enterprise", "diagnostics", "SystemHealth.tsx");

/** Field names inside an `export interface <name> { ... }` block. */
function interfaceFields(source: string, name: string): string[] {
  const start = source.indexOf(`export interface ${name}`);
  expect(start).toBeGreaterThan(-1);
  const open = source.indexOf("{", start);
  const close = source.indexOf("\n}", open);
  expect(close).toBeGreaterThan(open);
  const body = source.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  return [...body.matchAll(/^\s*([A-Za-z_$][\w$]*)\??\s*:/gm)].map((m) => m[1]).sort();
}

/**
 * Source with comments removed.
 *
 * The threshold check below is about what the code *computes*, not what the
 * prose is allowed to mention. Naming the server's 60 days in a comment is the
 * documentation working; the first draft of this test failed on exactly that.
 */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/** Every .ts/.tsx file under a directory. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Every screen that reads the MQTT leg of /admin/health for display.
 *
 * Discovered rather than listed. The certificate was added to two surfaces by
 * hand and a third — the console's own device health panel — was missed,
 * because nothing was looking for it. A list would have to be maintained by
 * whoever adds the next surface, which is the assumption that fails.
 */
function adminHealthSurfaces(): string[] {
  const roots = [
    join(ROOT, "src", "app", "smarthome"),
    join(ROOT, "mobile", "src", "screens"),
  ];
  return roots
    .flatMap((r) => walk(r))
    .filter((f) => /(?:adminHealth|health)\??\.mqtt/.test(readFileSync(f, "utf8")));
}

describe("the control plane still reports the certificate", () => {
  it("includes brokerCert in the /admin/health response", () => {
    // If this route stops sending it, every surface below is showing a value
    // that no longer arrives — and "not checked" would look like a broker
    // problem rather than a removed field.
    expect(serverHealthRoute).toMatch(/readBrokerCertificate\(\)/);
    expect(serverHealthRoute).toMatch(/res\.json\(\{[^}]*brokerCert/);
  });
});

describe("the console's copy of BrokerCertInfo matches the server's", () => {
  it("declares exactly the same fields", () => {
    expect(interfaceFields(clientTypes, "BrokerCertInfo")).toEqual(
      interfaceFields(serverCert, "BrokerCertInfo")
    );
  });

  it("keeps brokerCert on AdminHealth", () => {
    const fields = interfaceFields(clientTypes, "AdminHealth");
    expect(fields).toContain("brokerCert");
  });

  it("leaves brokerCert optional rather than defaulting it", () => {
    /*
     * A control plane that cannot reach the broker sends no certificate, and an
     * older one does not know the field. Both must stay distinguishable from a
     * certificate that was read and is fine — a default would report health for
     * a broker nobody managed to contact.
     */
    expect(clientTypes).toMatch(/brokerCert\?\s*:/);
  });
});

describe("both admin surfaces show it", () => {
  it("derives the presentation in one place", () => {
    // Two pages plus a banner reading the same four fields independently is
    // how one surface ends up saying "fine" while another says "renew now".
    expect(presenter).toMatch(/export function describeBrokerCert/);
    for (const page of [overviewPage, platformPage]) {
      expect(page).toMatch(/describeBrokerCert/);
    }
  });

  it("renders a status row on each page", () => {
    for (const page of [overviewPage, platformPage]) {
      expect(page).toMatch(/name="Broker certificate"/);
    }
  });

  it("interrupts on each page when renewal is due", () => {
    // The row alone is not enough: it sits in a panel below the fold on both
    // pages, and the point of the warning is that nobody is looking for it.
    for (const page of [overviewPage, platformPage]) {
      expect(page).toMatch(/cert\.urgent/);
    }
  });
});

describe("the phone knows what the console knows", () => {
  /*
   * The app calls the same /admin/health and has its own AdminHealth. Adding
   * the field to the console alone would leave an operator holding a phone
   * looking at a fleet page that cannot mention the one outage it could have
   * warned them about — which is the drift this repository keeps finding, just
   * with a longer fuse than usual.
   */
  it("declares brokerCert on the app's AdminHealth too", () => {
    expect(interfaceFields(appTypes, "BrokerCertInfo")).toEqual(
      interfaceFields(serverCert, "BrokerCertInfo"),
    );
    expect(interfaceFields(appTypes, "AdminHealth")).toContain("brokerCert");
    expect(appTypes).toMatch(/brokerCert\?\s*:/);
  });

  it("shows it on the system health screen", () => {
    expect(appScreen).toMatch(/describeBrokerCert/);
    expect(appScreen).toMatch(/Broker certificate/);
    // The row alone is passive; an expiry the operator has to notice unaided
    // is one nobody notices.
    expect(appScreen).toMatch(/cert\.urgent/);
  });
});

describe("every surface that reports broker health reports its certificate", () => {
  /*
   * Both directions, per Docs/23 §1. Listing the surfaces by hand is what let
   * the device health panel ship without the certificate while two other
   * screens had it — so the list is derived from the code instead.
   */
  it("finds the surfaces at all", () => {
    // A discovery guard that silently matches nothing is a green no-op.
    expect(adminHealthSurfaces().length).toBeGreaterThanOrEqual(3);
  });

  it("has no surface showing the MQTT leg but not the certificate", () => {
    const missing = adminHealthSurfaces()
      .filter((f) => !/brokerCert|describeBrokerCert/.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(ROOT.length + 1));
    expect(missing).toEqual([]);
  });

  it("covers the console, the fleet admin and the phone", () => {
    const found = adminHealthSurfaces().map((f) => f.slice(ROOT.length + 1).replace(/\\/g, "/"));
    expect(found).toEqual(
      expect.arrayContaining([
        expect.stringContaining("src/app/smarthome/admin/page.tsx"),
        expect.stringContaining("src/app/smarthome/admin/platform/page.tsx"),
        expect.stringContaining("src/app/smarthome/devices/HealthPanel.tsx"),
        expect.stringContaining("mobile/src/screens/enterprise/diagnostics/SystemHealth.tsx"),
      ]),
    );
  });
});

describe("the warning threshold has one owner", () => {
  it("is defined on the server", () => {
    expect(serverCert).toMatch(/export const WARN_WITHIN_DAYS\s*=\s*\d+/);
  });

  it("is not re-derived in the console", () => {
    /*
     * The presenter must read `expiringSoon` off the payload. A second copy of
     * the day count would drift from the one /admin/health actually reports,
     * and the console would start disagreeing with the API about whether a
     * renewal is due. Checked against the code with comments stripped — the
     * doc comment names the threshold on purpose.
     */
    const body = code(presenter);
    expect(body).toMatch(/expiringSoon/);
    expect(body).not.toMatch(/\b60\b/);
    expect(body).not.toMatch(/WARN_WITHIN_DAYS/);
  });
});
