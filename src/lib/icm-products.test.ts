import {
  ICM_PRODUCTS,
  productById,
  productLabels,
  productTeams,
  teamForProducts,
} from "./icm-products";

/**
 * Product → team routing.
 *
 * This mapping decides who is woken up. The rules worth pinning are the ones
 * about *refusing* to route: a catalogue that guesses when it cannot know sends
 * half of a class of incidents to the wrong rota, and nothing about that is
 * visible until somebody does not get paged.
 */

describe("the catalogue", () => {
  it("has a unique id per product", () => {
    const ids = ICM_PRODUCTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every product a team and a hint", () => {
    for (const p of ICM_PRODUCTS) {
      expect(p.team.trim().length).toBeGreaterThan(0);
      expect(p.label.trim().length).toBeGreaterThan(0);
      // The hint is what makes a twelve-item list scannable at 2am.
      expect(p.hint.trim().length).toBeGreaterThan(0);
    }
  });

  it("stays short enough to read under pressure", () => {
    /*
     * A taxonomy nobody can hold in their head gets the first option picked
     * every time, which is worse than free text because it looks deliberate.
     */
    expect(ICM_PRODUCTS.length).toBeLessThanOrEqual(15);
  });

  it("resolves an id, and admits when it cannot", () => {
    expect(productById("firmware")?.team).toBe("Firmware");
    expect(productById("nope")).toBeUndefined();
  });
});

describe("teamForProducts", () => {
  it("routes a single product to its team", () => {
    expect(teamForProducts(["firmware"])).toBe("Firmware");
    expect(teamForProducts(["mobile"])).toBe("Mobile");
  });

  it("routes several products owned by one team", () => {
    // CV-365, HRMS, ATS and Mail are all Workspace — filing against three of
    // them is still one rota.
    expect(teamForProducts(["cv365", "hrms", "ats"])).toBe("Workspace");
  });

  it("refuses to choose when two teams own the selection", () => {
    /*
     * A checkout failure caused by the broker genuinely spans Web and
     * Platform. Picking the first would route half of those to the wrong
     * rota silently; returning null hands the decision back to the person
     * filing, who is the only one who knows.
     */
    expect(teamForProducts(["website", "broker"])).toBeNull();
  });

  it("routes nothing when nothing is selected", () => {
    expect(teamForProducts([])).toBeNull();
  });

  it("ignores ids it does not recognise rather than inventing a team", () => {
    expect(teamForProducts(["nope"])).toBeNull();
    // A stale id alongside a real one must not change where the real one goes.
    expect(teamForProducts(["firmware", "nope"])).toBe("Firmware");
  });
});

describe("productLabels", () => {
  it("turns stored ids into what a person reads", () => {
    expect(productLabels(["control-plane", "mobile"])).toEqual(["Control plane", "Mobile app"]);
  });

  it("passes through an unknown id rather than dropping it", () => {
    /*
     * An incident filed against a product that was later removed from the
     * catalogue still happened. Showing the raw id is honest; showing nothing
     * would make the incident look like it affected no product at all.
     */
    expect(productLabels(["retired-thing"])).toEqual(["retired-thing"]);
  });
});

describe("productTeams", () => {
  it("lists each team once, sorted", () => {
    const teams = productTeams();
    expect(new Set(teams).size).toBe(teams.length);
    expect([...teams].sort()).toEqual(teams);
  });

  it("covers every team the catalogue names", () => {
    // The declare dialog merges this into its dropdown, so a team that owns a
    // product but is missing here would be unselectable for that product.
    for (const p of ICM_PRODUCTS) {
      expect(productTeams()).toContain(p.team);
    }
  });
});
