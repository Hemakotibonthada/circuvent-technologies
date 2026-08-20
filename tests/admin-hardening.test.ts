/**
 * Two admin defects that were exploitable, and one that moved money.
 *
 * Each of these is the kind that leaves no trace when it goes wrong: a token
 * arrives somewhere it should not, a secret is in a response nobody reads, a
 * refund happens because a dialog was dismissed. Tests are the only thing that
 * will notice them again.
 */

import { isSafeJobEndpoint } from "@/lib/job-endpoint";
import { toCsv } from "@/lib/admin-bulk";

/*
 * "Run now" sends the operator's live x-admin-token to whatever the job's
 * endpoint says. That token is a full superadmin session — it can create staff
 * and delete accounts — so an endpoint pointing off-origin is a credential
 * handed to whoever answers, with no XSS needed.
 */
describe("job endpoints may only be first-party", () => {
  it("accepts an internal API path", () => {
    expect(isSafeJobEndpoint("/api/admin/reports")).toBe(true);
    expect(isSafeJobEndpoint("  /api/cron/sweep  ")).toBe(true);
  });

  it("refuses an absolute URL to another host", () => {
    expect(isSafeJobEndpoint("https://attacker.example/collect")).toBe(false);
    expect(isSafeJobEndpoint("http://169.254.169.254/latest/meta-data")).toBe(false);
  });

  /*
   * The two that look like paths and are not. `//host/x` is protocol-relative,
   * and a backslash is folded to a forward slash by some URL parsers, so
   * `/\evil` escapes the origin exactly the way `//evil` does.
   */
  it("refuses the forms that look relative but are not", () => {
    expect(isSafeJobEndpoint("//attacker.example/collect")).toBe(false);
    expect(isSafeJobEndpoint("/\\attacker.example/collect")).toBe(false);
    expect(isSafeJobEndpoint("/api/\\attacker.example")).toBe(false);
  });

  it("refuses paths outside the API surface", () => {
    expect(isSafeJobEndpoint("/admin")).toBe(false);
    expect(isSafeJobEndpoint("")).toBe(false);
    expect(isSafeJobEndpoint(null)).toBe(false);
    expect(isSafeJobEndpoint(undefined)).toBe(false);
    expect(isSafeJobEndpoint(42)).toBe(false);
  });
});

/*
 * The customer-name field is exported verbatim, and a spreadsheet treats a cell
 * beginning `=`, `+`, `-` or `@` as a formula. Planting one needs no admin
 * access at all: a customer only has to rename themselves and wait for someone
 * to open the export.
 */
describe("CSV export neutralises spreadsheet formulas", () => {
  const cell = (v: string) => toCsv([{ name: v }]).split("\n")[1];
  /** The value a spreadsheet actually sees, after CSV quoting is undone. */
  const parsed = (v: string) => {
    const c = cell(v);
    return c.startsWith('"') ? c.slice(1, -1).replace(/""/g, '"') : c;
  };

  it("defuses every formula-leading character", () => {
    for (const lead of ["=", "+", "-", "@"]) {
      expect(parsed(`${lead}HYPERLINK("http://evil/","x")`).startsWith("'")).toBe(true);
    }
  });

  it("defuses the whitespace leaders too", () => {
    expect(cell("\tcmd").startsWith("'")).toBe(true);
    expect(cell("\rcmd").startsWith("'")).toBe(true);
  });

  it("leaves ordinary values alone", () => {
    expect(cell("Ada Lovelace")).toBe("Ada Lovelace");
    expect(cell("ada@circuvent.com")).toBe("ada@circuvent.com");
  });

  it("still quotes and escapes as before", () => {
    expect(cell('He said "hi"')).toBe('"He said ""hi"""');
    expect(cell("a,b")).toBe('"a,b"');
  });

  /*
   * A negative number is a legitimate value in a numeric column — a refund, a
   * stock adjustment — and a leading apostrophe would make a spreadsheet read
   * it as text. It is quoted anyway because `-` is a formula lead, so this
   * records the trade-off deliberately rather than leaving it to be discovered.
   */
  it("treats a negative number as text, which is the safe direction", () => {
    expect(cell("-500")).toBe("'-500");
  });

  it("returns empty for no rows rather than a stray header", () => {
    expect(toCsv([])).toBe("");
  });
});
