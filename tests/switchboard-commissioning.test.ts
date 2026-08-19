/**
 * Commissioning safety, tested as the failures it prevents.
 *
 * A fixed sketch has its pin map checked by the compiler. A configurable one is
 * handed its pin map by a person on a ladder, and every bad choice below
 * produces hardware that works on the bench, goes into a wall, and fails later
 * — in plaster, with nothing in any log.
 */
import {
  FLASH_PINS,
  FLASH_VOLTAGE_STRAP,
  INPUT_ONLY_PINS,
  MAX_CHANNELS,
  RESET_PIN,
  TEMPLATES,
  TOUCH_PINS,
  checkPin,
  encodeLayout,
  layoutIsSafe,
  validateLayout,
  type Channel,
  type Layout,
} from "@/lib/switchboard";

function ch(over: Partial<Channel> = {}): Channel {
  return {
    name: "Light",
    relayPin: 26,
    inputPin: 4,
    inputKind: "touch",
    restore: "last",
    kind: "light",
    ...over,
  };
}

const layout = (channels: Channel[]): Layout => ({ channels, backlight: 0 });

describe("pins that must never be offered", () => {
  it("refuses the SPI flash pins for anything", () => {
    // Using one corrupts the flash the firmware is executing from.
    for (const p of FLASH_PINS) {
      expect(checkPin(p, "relay").ok).toBe(false);
      expect(checkPin(p, "input").ok).toBe(false);
    }
  });

  it("refuses GPIO12 outright", () => {
    /*
     * The one that produces a board which works until the first power cut and
     * then never boots again — inside a wall. Its level at reset picks the
     * flash regulator voltage, and a capacitive pad is exactly the thing a
     * resting palm or damp plaster can hold high through an outage.
     */
    const v = checkPin(FLASH_VOLTAGE_STRAP, "touch");
    expect(v.ok).toBe(false);
    expect(v.severity).toBe("forbidden");
    expect(v.reason).toMatch(/flash voltage/i);
    expect(checkPin(FLASH_VOLTAGE_STRAP, "relay").ok).toBe(false);
  });

  it("refuses the reset pin", () => {
    // A pad here would factory-reset the board when somebody leaned on it.
    expect(checkPin(RESET_PIN, "touch").ok).toBe(false);
    expect(checkPin(RESET_PIN, "relay").ok).toBe(false);
  });

  it("refuses an input-only pin for a relay", () => {
    /*
     * The worst failure mode available: pinMode(OUTPUT) is accepted and does
     * nothing, so the app switches, the device agrees, and the light does not
     * move. Nothing reports an error at any layer.
     */
    for (const p of INPUT_ONLY_PINS) {
      const v = checkPin(p, "relay");
      expect(v.ok).toBe(false);
      expect(v.reason).toMatch(/input-only/i);
    }
  });

  it("allows an input-only pin as a button, with a warning about the pull-up", () => {
    const v = checkPin(34, "input");
    expect(v.ok).toBe(true);
    expect(v.severity).toBe("warn");
    expect(v.reason).toMatch(/pull-up/i);
  });

  it("refuses a touch pad on a pin with no touch hardware", () => {
    expect(checkPin(26, "touch").ok).toBe(false);
    for (const p of TOUCH_PINS) expect(checkPin(p, "touch").ok).toBe(true);
  });

  it("rejects nonsense pin numbers", () => {
    expect(checkPin(40, "relay").ok).toBe(false);
    expect(checkPin(-1, "relay").ok).toBe(false);
    expect(checkPin(1.5, "relay").ok).toBe(false);
  });
});

describe("pins that are allowed but worth a word", () => {
  it("warns rather than refuses on GPIO5", () => {
    /*
     * Refusing a legal choice is how a tool gets worked around. GPIO5 must
     * read high at reset, which an active-low relay satisfies for free —
     * touchboard-8 puts a relay there on purpose.
     */
    const v = checkPin(5, "relay");
    expect(v.ok).toBe(true);
    expect(v.severity).toBe("warn");
    expect(v.reason).toMatch(/high at reset/i);
  });

  it("warns about taking the serial console", () => {
    expect(checkPin(1, "relay")).toMatchObject({ ok: true, severity: "warn" });
    expect(checkPin(3, "relay")).toMatchObject({ ok: true, severity: "warn" });
  });

  it("passes an ordinary pin without comment", () => {
    expect(checkPin(26, "relay")).toEqual({ ok: true, severity: "ok" });
  });
});

describe("validateLayout", () => {
  it("accepts a plain board", () => {
    expect(validateLayout(layout([ch()]))).toEqual([]);
  });

  it("refuses a board with no channels", () => {
    expect(validateLayout(layout([])).some((p) => p.severity === "error")).toBe(true);
  });

  it("refuses more channels than the firmware stores", () => {
    /*
     * Nine channels on a board that keeps eight is the quiet kind of wrong:
     * the app shows nine, the wall has nine, and one of them does nothing.
     */
    const many = Array.from({ length: MAX_CHANNELS + 1 }, (_, i) =>
      ch({ relayPin: 20 + i, inputPin: null, inputKind: "none" }),
    );
    const problems = validateLayout(layout(many));
    expect(problems.some((p) => p.severity === "error" && /silently dropped/.test(p.message))).toBe(true);
  });

  it("catches two channels sharing a relay", () => {
    const problems = validateLayout(layout([
      ch({ relayPin: 26, inputPin: 4 }),
      ch({ relayPin: 26, inputPin: 13 }),
    ]));
    expect(problems.some((p) => p.severity === "error" && /already used by/.test(p.message))).toBe(true);
  });

  it("catches a pad sharing a pin with a relay", () => {
    /*
     * The haunted-house fault: a relay that reads its own output as a button
     * press, or a pad that switches two things at once.
     */
    const problems = validateLayout(layout([
      ch({ relayPin: 26, inputPin: 4 }),
      ch({ relayPin: 27, inputPin: 26 as number, inputKind: "button" }),
    ]));
    expect(problems.some((p) => /already used by/.test(p.message))).toBe(true);
  });

  it("catches a pad chosen with no pin for it", () => {
    const problems = validateLayout(layout([ch({ inputPin: null, inputKind: "touch" })]));
    expect(problems.some((p) => p.severity === "error" && /no pin/.test(p.message))).toBe(true);
  });

  it("allows a channel with no local control at all", () => {
    // App and peers only — a relay in a ceiling void with no switch near it.
    expect(validateLayout(layout([ch({ inputPin: null, inputKind: "none" })]))).toEqual([]);
  });

  it("warns about an unnamed channel without blocking it", () => {
    const problems = validateLayout(layout([ch({ name: "  " })]));
    expect(problems).toHaveLength(1);
    expect(problems[0].severity).toBe("warn");
    expect(layoutIsSafe(layout([ch({ name: "  " })]))).toBe(true);
  });

  it("reports every problem at once", () => {
    // Somebody on a ladder wants to fix it all in one pass.
    const problems = validateLayout(layout([
      ch({ relayPin: 6 }),
      ch({ relayPin: 12, inputPin: 0, inputKind: "touch" }),
    ]));
    expect(problems.filter((p) => p.severity === "error").length).toBeGreaterThanOrEqual(3);
  });

  it("names the channel each problem belongs to", () => {
    const problems = validateLayout(layout([ch(), ch({ relayPin: 6, inputPin: 13 })]));
    expect(problems.find((p) => p.severity === "error")?.channel).toBe(1);
  });
});

describe("every shipped template is safe", () => {
  /*
   * These are what an engineer starts from on site. One with a pin clash would
   * be commissioned repeatedly before anybody worked out why.
   */
  for (const [key, t] of Object.entries(TEMPLATES)) {
    it(`${key} passes validation`, () => {
      const problems = validateLayout(t.layout).filter((p) => p.severity === "error");
      expect(problems).toEqual([]);
    });

    it(`${key} fits the firmware`, () => {
      expect(t.layout.channels.length).toBeLessThanOrEqual(MAX_CHANNELS);
    });
  }

  it("offers the retrofit case, which is not touch", () => {
    // Existing rocker switches in an old box; pads would mean replacing them.
    expect(TEMPLATES.retrofit.layout.channels.every((c) => c.inputKind === "button")).toBe(true);
  });
});

describe("no channel can be commissioned to come back on", () => {
  it("offers only off and last", () => {
    /*
     * "Every light in the house came on by itself at 3am" is the failure the
     * whole power-restore guard exists for. A commissioning tool that could
     * configure it would be blamed on the hardware forever.
     */
    const restores = Object.values(TEMPLATES).flatMap((t) =>
      t.layout.channels.map((c) => c.restore),
    );
    for (const r of restores) expect(["off", "last"]).toContain(r);
  });
});

describe("encodeLayout", () => {
  it("round-trips the parts the device needs", () => {
    const s = encodeLayout(layout([ch({ name: "Main light" })]));
    expect(s).toBe("26:4:t:l:l:Main light");
  });

  it("writes -1 for a channel with no input", () => {
    expect(encodeLayout(layout([ch({ inputPin: null, inputKind: "none" })]))).toMatch(/^26:-1:n:/);
  });

  it("strips the separators out of a name", () => {
    // A name containing ';' would otherwise split into a second channel.
    const s = encodeLayout(layout([ch({ name: "Hall; Porch: main|" })]));
    expect(s.split(";")).toHaveLength(1);
  });
});
