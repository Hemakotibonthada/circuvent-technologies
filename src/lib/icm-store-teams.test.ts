/**
 * @jest-environment node
 */

/**
 * Team distribution lists.
 *
 * A team was only ever a name on an incident. These give the name an address,
 * from two sources: an environment variable so a deployment can be routed
 * before anybody opens the console, and a stored map so it can be corrected
 * without a redeploy. Which of the two wins matters — if the environment won,
 * editing an address in the UI would appear to work and then be silently
 * overridden on every read by a value nobody can see.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "cv-icm-teams-"));
delete process.env.ICM_TEAM_EMAILS;

import { envTeamContacts, listTeamContacts, listTeams, setTeamContact } from "./icm-store";

describe("reading the environment", () => {
  it("parses one team", () => {
    expect(envTeamContacts("Platform=platform@circuvent.com")).toEqual({
      Platform: ["platform@circuvent.com"],
    });
  });

  it("parses several teams and several addresses each", () => {
    expect(envTeamContacts("Platform=a@x.com,b@x.com;Firmware=fw@x.com")).toEqual({
      Platform: ["a@x.com", "b@x.com"],
      Firmware: ["fw@x.com"],
    });
  });

  it("tolerates the spacing a person actually types", () => {
    expect(envTeamContacts(" Control Plane = cp@x.com , cp2@x.com ; Web = web@x.com ")).toEqual({
      "Control Plane": ["cp@x.com", "cp2@x.com"],
      Web: ["web@x.com"],
    });
  });

  it("ignores nonsense rather than inventing a team", () => {
    expect(envTeamContacts("")).toEqual({});
    expect(envTeamContacts("no equals sign")).toEqual({});
    expect(envTeamContacts("Platform=")).toEqual({});
    expect(envTeamContacts("=nobody@x.com")).toEqual({});
  });

  it("keeps an address containing an equals sign intact", () => {
    // Splitting on every "=" would truncate one of these.
    expect(envTeamContacts("Platform=a+tag=1@x.com")).toEqual({ Platform: ["a+tag=1@x.com"] });
  });
});

describe("storing a team's list", () => {
  it("saves and reads back", () => {
    setTeamContact("Platform", ["platform@circuvent.com"]);
    expect(listTeamContacts().Platform).toEqual(["platform@circuvent.com"]);
  });

  it("replaces the list wholesale, so removing an address removes it", () => {
    setTeamContact("Platform", ["a@x.com", "b@x.com"]);
    setTeamContact("Platform", ["a@x.com"]);
    expect(listTeamContacts().Platform).toEqual(["a@x.com"]);
  });

  it("drops blank entries rather than mailing an empty address", () => {
    setTeamContact("Firmware", [" fw@x.com ", "", "   "]);
    expect(listTeamContacts().Firmware).toEqual(["fw@x.com"]);
  });

  it("adds a team to the routing list when it is given an address", () => {
    setTeamContact("Robotics", ["robotics@x.com"]);
    expect(listTeams()).toContain("Robotics");
  });

  it("ignores a nameless team", () => {
    const before = listTeamContacts();
    setTeamContact("   ", ["nobody@x.com"]);
    expect(listTeamContacts()).toEqual(before);
  });
});

describe("the stored list wins over the environment", () => {
  const original = process.env.ICM_TEAM_EMAILS;
  afterEach(() => {
    if (original === undefined) delete process.env.ICM_TEAM_EMAILS;
    else process.env.ICM_TEAM_EMAILS = original;
  });

  it("uses the environment for a team nobody has edited", () => {
    process.env.ICM_TEAM_EMAILS = "Networking=net@x.com";
    expect(listTeamContacts().Networking).toEqual(["net@x.com"]);
  });

  it("prefers what was stored, so an edit in the console is not silently undone", () => {
    process.env.ICM_TEAM_EMAILS = "Data=old@x.com";
    setTeamContact("Data", ["corrected@x.com"]);
    expect(listTeamContacts().Data).toEqual(["corrected@x.com"]);
  });

  it("falls back to the environment again once the stored list is cleared", () => {
    /* Clearing should mean "use however the deployment was configured", not
       "reach nobody" — which is what storing an empty list would mean. */
    process.env.ICM_TEAM_EMAILS = "Support=support@x.com";
    setTeamContact("Support", ["temporary@x.com"]);
    expect(listTeamContacts().Support).toEqual(["temporary@x.com"]);

    setTeamContact("Support", []);
    expect(listTeamContacts().Support).toEqual(["support@x.com"]);
  });
});
