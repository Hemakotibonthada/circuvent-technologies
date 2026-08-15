import {
  readTankLink,
  tankLevelText,
  formatAge,
  tankStaleSeconds,
  tankAbandonSeconds,
  TANK_STALE_S,
  TANK_ABANDON_S,
  TANK_REPORT_INTERVAL_S,
} from "./tank-link";

const paired = (over: Record<string, unknown> = {}) => ({
  sensorPaired: true,
  rfAgeS: 10,
  ohPct: 42,
  rfLinkUp: true,
  tankBattPct: 80,
  rfRssi: -92,
  ...over,
});

describe("a wired tank, or firmware older than the radio", () => {
  it("is not reported as a dead radio link", () => {
    // A controller with a wired sensor publishes none of the radio fields. If
    // absence read as "link down" every existing installation would suddenly
    // claim its sensor was offline.
    const link = readTankLink({ ohPct: 55 });
    expect(link.status).toBe("live");
    expect(link.levelIsCurrent).toBe(true);
    expect(link.blocksAutoFill).toBe(false);
    expect(link.levelPct).toBe(55);
  });

  it("handles no state at all without throwing", () => {
    expect(readTankLink(null).status).toBe("live");
    expect(readTankLink(undefined).levelPct).toBeNull();
  });
});

describe("before a sensor is paired", () => {
  it("says so, and does not invent a level", () => {
    const link = readTankLink({ sensorPaired: false, ohPct: -1 });
    expect(link.status).toBe("unpaired");
    expect(link.levelPct).toBeNull();
    expect(link.blocksAutoFill).toBe(true);
    expect(link.detail).toMatch(/pair the sensor/i);
  });

  it("tells the installer what to do while pairing is open", () => {
    const link = readTankLink({ sensorPaired: false, pairing: true });
    expect(link.label).toMatch(/pairing/i);
    expect(link.detail).toMatch(/press the button/i);
  });

  it("distinguishes paired-but-silent from never-paired", () => {
    // These need different actions: one is "go press a button", the other is
    // "your sensor is broken". Collapsing them sends people up a ladder for
    // no reason, or leaves them waiting for a device that was never paired.
    const never = readTankLink({ sensorPaired: false });
    const silent = readTankLink({ sensorPaired: true, rfAgeS: -1 });
    expect(never.status).toBe("unpaired");
    expect(silent.status).toBe("waiting");
    expect(silent.detail).toContain(String(TANK_REPORT_INTERVAL_S));
  });
});

describe("while the link is healthy", () => {
  it("shows the level as current", () => {
    const link = readTankLink(paired({ rfAgeS: 12 }));
    expect(link.status).toBe("live");
    expect(link.levelIsCurrent).toBe(true);
    expect(link.levelPct).toBe(42);
    expect(link.blocksAutoFill).toBe(false);
  });

  it("tolerates a single missed report", () => {
    // One lost packet is ordinary on any radio. Treating it as a fault would
    // pause auto-fill several times a day.
    const link = readTankLink(paired({ rfAgeS: TANK_REPORT_INTERVAL_S + 5 }));
    expect(link.status).toBe("live");
    expect(link.blocksAutoFill).toBe(false);
  });

  it("reports signal strength when it has one", () => {
    expect(readTankLink(paired({ rfRssi: -104 })).rssi).toBe(-104);
    // Zero is the firmware's "unknown", not a very strong signal.
    expect(readTankLink(paired({ rfRssi: 0 })).rssi).toBeNull();
  });
});

describe("when the link goes quiet", () => {
  it("stops calling the level current the moment it goes stale", () => {
    const link = readTankLink(paired({ rfAgeS: TANK_STALE_S }));
    expect(link.status).toBe("stale");
    expect(link.levelIsCurrent).toBe(false);
    expect(link.blocksAutoFill).toBe(true);
  });

  it("keeps showing the last level while stale, but marked as last known", () => {
    // Still useful — a tank does not empty in three minutes — but it must not
    // be mistaken for a live reading.
    const link = readTankLink(paired({ rfAgeS: TANK_STALE_S + 60, ohPct: 42 }));
    expect(link.levelPct).toBe(42);
    expect(tankLevelText(link)).toBe("42% (last known)");
  });

  it("explains that the pump will not run on an old level", () => {
    const link = readTankLink(paired({ rfAgeS: TANK_STALE_S + 10 }));
    expect(link.detail).toMatch(/auto-fill is paused/i);
    expect(link.detail).toMatch(/will not run on an old level/i);
  });

  it("withdraws the level entirely once it is meaningless", () => {
    // This is the case that causes damage. A day-old "12%" invites someone to
    // start the pump into a tank that may well be full.
    const link = readTankLink(paired({ rfAgeS: TANK_ABANDON_S, ohPct: 12 }));
    expect(link.status).toBe("lost");
    expect(link.levelPct).toBeNull();
    expect(tankLevelText(link)).toBe("—");
    expect(link.detail).toMatch(/battery/i);
  });

  it("never shows a bare percentage for a level that is not current", () => {
    for (const age of [TANK_STALE_S, TANK_STALE_S + 1, TANK_ABANDON_S, TANK_ABANDON_S * 2]) {
      const link = readTankLink(paired({ rfAgeS: age, ohPct: 42 }));
      expect(link.levelIsCurrent).toBe(false);
      expect(tankLevelText(link)).not.toBe("42%");
    }
  });
});

describe("the firmware's -1 sentinel", () => {
  it("is treated as no reading, not as a level", () => {
    // The firmware publishes -1 rather than omitting the key, so a client
    // holding a previous value is actively told to drop it.
    const link = readTankLink(paired({ ohPct: -1 }));
    expect(link.levelPct).toBeNull();
    expect(tankLevelText(link)).toBe("—");
  });

  it("applies to battery too", () => {
    expect(readTankLink(paired({ tankBattPct: -1 })).batteryPct).toBeNull();
    expect(readTankLink(paired({ tankBattPct: 0 })).batteryPct).toBe(0);
  });
});

describe("sensor faults", () => {
  it("withholds the level when the sensor reports nonsense", () => {
    // Arriving on time is not the same as being right. An echo bouncing off
    // the inlet stream reads as a full tank.
    const link = readTankLink(paired({ ohFault: true, rfAgeS: 5 }));
    expect(link.levelPct).toBeNull();
    expect(link.blocksAutoFill).toBe(true);
    expect(link.detail).toMatch(/out of range/i);
  });

  it("surfaces a low battery before it becomes an outage", () => {
    const link = readTankLink(paired({ tankBattLow: true, tankBattPct: 8 }));
    expect(link.batteryLow).toBe(true);
    expect(link.batteryPct).toBe(8);
  });
});

describe("formatAge", () => {
  it("does not claim precision it does not have", () => {
    expect(formatAge(1)).toBe("1 second");
    expect(formatAge(45)).toBe("45 seconds");
    expect(formatAge(300)).toBe("5 minutes");
    expect(formatAge(3600)).toBe("60 minutes");
    expect(formatAge(7200)).toBe("2 hours");
    expect(formatAge(86400 * 3)).toBe("3 days");
  });

  it("never renders a negative age", () => {
    expect(formatAge(-5)).toBe("0 seconds");
  });
});

describe("the thresholds match the firmware", () => {
  it("allows several missed reports before declaring the link down", () => {
    // CvTankLink.h uses interval * CV_TANK_STALE_MISSES. If either side changes
    // alone, the app and the controller disagree about whether the pump may run
    // — the app would show a live level while the firmware refuses to pump, or
    // worse.
    expect(TANK_STALE_S).toBe(TANK_REPORT_INTERVAL_S * 6);
    expect(TANK_ABANDON_S).toBeGreaterThan(TANK_STALE_S);
  });
});

describe("a report interval the owner has changed", () => {
  /*
   * The interval is settable from the app, to trade battery life against how
   * quickly a level change shows up. A fixed stale window turns that setting
   * into a trap: choose a slower cadence to save battery and the link is
   * permanently stale, so the pump never runs and the app reports a dead
   * sensor that is transmitting perfectly.
   */
  const slow = (over: Record<string, unknown> = {}) => ({
    sensorPaired: true,
    sensorIntervalS: 600,
    ohPct: 42,
    ...over,
  });

  it("does not call a slow sensor stale just for being slow", () => {
    // 10 minutes since the last report, on a 10-minute cadence, is one report.
    const link = readTankLink(slow({ rfAgeS: 600 }));
    expect(link.status).toBe("live");
    expect(link.blocksAutoFill).toBe(false);
  });

  it("still calls it stale once it has genuinely missed several", () => {
    const link = readTankLink(slow({ rfAgeS: 600 * 6 + 10 }));
    expect(link.status).toBe("stale");
    expect(link.blocksAutoFill).toBe(true);
  });

  it("scales the abandon window too", () => {
    // The old fixed 30 minutes would have withdrawn the level after three
    // reports on a 10-minute cadence.
    expect(readTankLink(slow({ rfAgeS: 1800 })).levelPct).toBe(42);
    expect(tankStaleSeconds(600)).toBe(3600);
    expect(tankAbandonSeconds(600)).toBe(36000);
  });

  it("floors the abandon window on a fast cadence", () => {
    // At 10 s, six misses is a minute. Blanking the level after a minute of
    // ordinary interference would be worse than useless.
    expect(tankStaleSeconds(10)).toBe(60);
    expect(tankAbandonSeconds(10)).toBe(TANK_ABANDON_S);
    expect(readTankLink({ sensorPaired: true, sensorIntervalS: 10, rfAgeS: 300, ohPct: 42 }).levelPct)
      .toBe(42);
  });

  it("falls back to the default when no interval is reported", () => {
    expect(tankStaleSeconds(undefined)).toBe(TANK_STALE_S);
    expect(tankStaleSeconds(null)).toBe(TANK_STALE_S);
    expect(tankStaleSeconds(0)).toBe(TANK_STALE_S);
  });

  it("tells the user the cadence its own sensor is using", () => {
    expect(readTankLink(slow({ rfAgeS: -1 })).detail).toContain("600");
    expect(readTankLink({ sensorPaired: true, rfAgeS: -1 }).detail).toContain("30");
  });
});

describe("a queued instruction", () => {
  it("is surfaced so the UI can say the request is waiting", () => {
    // The sensor is asleep. "Read now" cannot happen now, and a button that
    // looks like it did nothing is worse than one that says it is waiting.
    expect(readTankLink({ sensorPaired: true, rfAgeS: 5, downlinkPending: true }).downlinkPending)
      .toBe(true);
    expect(readTankLink({ sensorPaired: true, rfAgeS: 5 }).downlinkPending).toBe(false);
  });
});
