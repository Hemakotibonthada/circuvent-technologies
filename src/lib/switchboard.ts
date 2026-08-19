/**
 * Commissioning a configurable switchboard.
 *
 * WHAT THIS IS FOR
 *
 * Circuvent switchboards are built to order. An engineer visits the house,
 * looks at the wall box, and makes a board with however many gangs that room
 * needs — three here, six in the hall, one for the porch — with touch pads on
 * some and retrofitted rocker switches on others. Until now that meant a new
 * sketch per shape, which is why `touchboard` and `touchboard-8` are separate
 * files that say the same thing twice.
 *
 * One firmware, told at commissioning what it is wired to, replaces all of
 * that. The price is that the wiring is now *data*, and data can be wrong.
 *
 * THE RISK THIS MODULE EXISTS TO REMOVE
 *
 * A fixed sketch gets its pin map checked by the compiler — `touchboard-8`
 * refuses to build if a pad lands on GPIO12. A configurable one is handed its
 * pin map by a person on a ladder, over an app, and nothing about a bad choice
 * is visible: the board works on the bench, goes into a wall, and dies at the
 * next power cut, in plaster, with nothing in any log.
 *
 * So the same rules move from compile time to three places that all have to
 * agree: this module (so the app refuses it while the engineer is still
 * standing there), the control plane (because a client is not to be trusted),
 * and the firmware itself (because it is the only one that is certainly
 * present). `tests/switchboard-parity.test.ts` holds them together.
 */

export type PinUse = "relay" | "input" | "touch";

export type PinVerdict = {
  /** Whether the commissioning app will let it be saved. */
  ok: boolean;
  severity: "ok" | "warn" | "forbidden";
  reason?: string;
};

/**
 * Wired to the ESP32's own SPI flash. Not a GPIO in any useful sense — using
 * one corrupts the flash the firmware is executing from.
 */
export const FLASH_PINS = [6, 7, 8, 9, 10, 11];

/**
 * Input-only. `pinMode(pin, OUTPUT)` is accepted and does nothing, which is the
 * worst possible failure for a relay: the app switches, the device agrees, and
 * the light never moves. They also have no internal pull-up, so a button on one
 * needs a resistor fitted.
 */
export const INPUT_ONLY_PINS = [34, 35, 36, 37, 38, 39];

/** The serial console. Taking it costs the ability to debug the unit. */
export const SERIAL_PINS = [1, 3];

/**
 * The reset gesture, and the BOOT strap.
 *
 * Every Circuvent board hands GPIO0 to `setResetButton(0)` — hold three
 * seconds to change the Wi-Fi, eight to factory reset. A channel here would
 * fight that, and a *pad* here would factory-reset the board when somebody
 * leaned on it.
 */
export const RESET_PIN = 0;

/**
 * MTDI. Its level at reset picks the flash regulator voltage: held high it
 * selects 1.8V and a 3.3V board does not boot at all.
 *
 * This is the one that produces a unit which works perfectly until the first
 * power cut and then never comes back — inside a wall. A capacitive pad is a
 * plate of copper behind glass, and a resting palm, a wet cloth or damp
 * plaster is enough to hold it up through an outage. Forbidden outright rather
 * than warned about, because the failure is unrecoverable in the field and
 * nobody would connect it to the pad they fitted six months earlier.
 */
export const FLASH_VOLTAGE_STRAP = 12;

/**
 * Strapping pins that are survivable if used carefully.
 *
 * GPIO5 must read HIGH at reset, which an active-low relay satisfies for free
 * because "off" is HIGH — that is exactly why `touchboard-8` puts a relay
 * there deliberately. GPIO2 and GPIO15 are only sampled to choose download
 * mode, which also needs GPIO0 held low, and GPIO0 is the reset button.
 */
export const SOFT_STRAP_PINS = [2, 5, 15];

/** Pins with capacitive touch hardware. T1 (GPIO0) and T5 (GPIO12) are unusable. */
export const TOUCH_PINS = [4, 2, 15, 13, 14, 27, 33, 32];

/**
 * Whether a pin may be used for a given job, and what to tell the engineer.
 *
 * Warnings are deliberately not refusals. An engineer looking at real hardware
 * knows things this cannot — that GPIO5 is the relay the board was designed
 * around, that GPIO2 drives the panel LED on this batch — and a tool that
 * refuses a legal choice gets worked around, usually by someone disabling the
 * checking entirely.
 */
export function checkPin(pin: number, use: PinUse): PinVerdict {
  if (!Number.isInteger(pin) || pin < 0 || pin > 39) {
    return { ok: false, severity: "forbidden", reason: "Not a GPIO on this module." };
  }
  if (FLASH_PINS.includes(pin)) {
    return {
      ok: false,
      severity: "forbidden",
      reason: "Wired to the SPI flash. Using it corrupts the firmware itself.",
    };
  }
  if (pin === FLASH_VOLTAGE_STRAP) {
    return {
      ok: false,
      severity: "forbidden",
      reason:
        "GPIO12 sets the flash voltage at reset. Held high — by a palm on a pad, or damp plaster — the board never boots again.",
    };
  }
  if (pin === RESET_PIN) {
    return {
      ok: false,
      severity: "forbidden",
      reason: "GPIO0 is the reset button: three seconds clears Wi-Fi, eight factory resets.",
    };
  }
  if (use === "relay" && INPUT_ONLY_PINS.includes(pin)) {
    return {
      ok: false,
      severity: "forbidden",
      reason:
        "Input-only. It accepts pinMode(OUTPUT) and does nothing, so the app would switch and the light would not.",
    };
  }
  if (use === "touch" && !TOUCH_PINS.includes(pin)) {
    return { ok: false, severity: "forbidden", reason: "No capacitive touch hardware on this pin." };
  }
  if (SERIAL_PINS.includes(pin)) {
    return {
      ok: true,
      severity: "warn",
      reason: "This is the serial console. The unit can still be flashed, but not watched.",
    };
  }
  if (use === "input" && INPUT_ONLY_PINS.includes(pin)) {
    return {
      ok: true,
      severity: "warn",
      reason: "Input-only pins have no internal pull-up — fit an external resistor.",
    };
  }
  if (SOFT_STRAP_PINS.includes(pin)) {
    return {
      ok: true,
      severity: "warn",
      reason:
        pin === 5
          ? "GPIO5 must be high at reset. Fine for an active-low relay, whose idle level is high."
          : "A boot strap. Safe unless something holds it at reset.",
    };
  }
  return { ok: true, severity: "ok" };
}

/* ------------------------------------------------------------------ */
/* Layouts                                                             */
/* ------------------------------------------------------------------ */

export type InputKind = "touch" | "button" | "none";

/**
 * What a channel does when power comes back.
 *
 * `on` is deliberately not offered. Everything in this codebase that restores
 * an output restores what the owner left — a board that comes back with
 * channels on because a setting said so is the "every light in the house came
 * on by itself at 3am" failure, and it would be commissioned once and blamed
 * on the hardware forever. A load that must always be live does not belong on
 * a switched channel.
 */
export type RestoreMode = "off" | "last";

export type Channel = {
  name: string;
  relayPin: number;
  /** Null for a channel with no local control at all — app and peers only. */
  inputPin: number | null;
  inputKind: InputKind;
  restore: RestoreMode;
  /** What it drives, so the apps pick an icon and the right words. */
  kind: "light" | "fan" | "socket" | "geyser" | "pump" | "other";
};

export type Layout = {
  channels: Channel[];
  /** Backlight brightness for boards that have one, 0 = not fitted. */
  backlight: number;
};

/** Eight is the practical ceiling on a wall box, and what the firmware stores. */
export const MAX_CHANNELS = 8;

export type LayoutProblem = {
  severity: "warn" | "error";
  /** Index into `channels`, or -1 for a whole-layout problem. */
  channel: number;
  message: string;
};

/**
 * Everything wrong with a proposed layout.
 *
 * Returned as a list rather than throwing on the first one, because an
 * engineer on a ladder wants to see all of it at once and fix it in one pass.
 */
export function validateLayout(layout: Layout): LayoutProblem[] {
  const out: LayoutProblem[] = [];
  const channels = layout.channels ?? [];

  if (channels.length === 0) {
    out.push({ severity: "error", channel: -1, message: "A board needs at least one channel." });
  }
  if (channels.length > MAX_CHANNELS) {
    out.push({
      severity: "error",
      channel: -1,
      message: `More than ${MAX_CHANNELS} channels: the firmware stores ${MAX_CHANNELS}, so the extras would be silently dropped.`,
    });
  }

  const seen = new Map<number, string>();
  channels.forEach((ch, i) => {
    if (!ch.name?.trim()) {
      out.push({
        severity: "warn",
        channel: i,
        message: "Unnamed. The householder will see 'Channel " + (i + 1) + "'.",
      });
    }

    const relay = checkPin(ch.relayPin, "relay");
    if (!relay.ok) {
      out.push({ severity: "error", channel: i, message: `Relay pin: ${relay.reason}` });
    } else if (relay.severity === "warn") {
      out.push({ severity: "warn", channel: i, message: `Relay pin: ${relay.reason}` });
    }
    claim(out, seen, ch.relayPin, `relay ${i + 1}`, i);

    if (ch.inputKind !== "none") {
      if (ch.inputPin === null) {
        out.push({
          severity: "error",
          channel: i,
          message: "A pad or button was chosen but no pin was given for it.",
        });
      } else {
        const v = checkPin(ch.inputPin, ch.inputKind === "touch" ? "touch" : "input");
        if (!v.ok) {
          out.push({ severity: "error", channel: i, message: `Input pin: ${v.reason}` });
        } else if (v.severity === "warn") {
          out.push({ severity: "warn", channel: i, message: `Input pin: ${v.reason}` });
        }
        claim(out, seen, ch.inputPin, `input ${i + 1}`, i);
      }
    }
  });

  return out;
}

/** Records a pin as taken, complaining if something else already had it. */
function claim(
  out: LayoutProblem[],
  seen: Map<number, string>,
  pin: number,
  who: string,
  channel: number,
): void {
  const prev = seen.get(pin);
  if (prev) {
    /*
     * Two jobs on one pin is the fault that looks like a haunted house: the
     * pad for the fan also switches the light, or a relay reads its own
     * output as a button press and oscillates.
     */
    out.push({
      severity: "error",
      channel,
      message: `GPIO${pin} is already used by ${prev}.`,
    });
    return;
  }
  seen.set(pin, who);
}

/** True when a layout is safe to write to a board. */
export function layoutIsSafe(layout: Layout): boolean {
  return validateLayout(layout).every((p) => p.severity !== "error");
}

/**
 * Starting points for the rooms that come up over and over.
 *
 * Not a substitute for the engineer's judgement — every one of these is edited
 * on site — but the difference between typing eight pin numbers on a ladder and
 * checking eight that are already right.
 */
export const TEMPLATES: Record<string, { label: string; layout: Layout }> = {
  "1g": {
    label: "1 gang — porch or geyser",
    layout: {
      backlight: 0,
      channels: [ch("Light", 26, 4, "touch", "light")],
    },
  },
  "2g": {
    label: "2 gang — bedroom",
    layout: {
      backlight: 60,
      channels: [ch("Light", 26, 4, "touch", "light"), ch("Fan", 27, 13, "touch", "fan")],
    },
  },
  "3g": {
    label: "3 gang — living room",
    layout: {
      backlight: 60,
      channels: [
        ch("Main light", 26, 4, "touch", "light"),
        ch("Fan", 27, 13, "touch", "fan"),
        ch("Socket", 25, 14, "touch", "socket"),
      ],
    },
  },
  "4g": {
    label: "4 gang — hall",
    layout: {
      backlight: 60,
      channels: [
        ch("Hall light", 26, 4, "touch", "light"),
        ch("Porch light", 27, 13, "touch", "light"),
        ch("Fan", 25, 14, "touch", "fan"),
        ch("Socket", 18, 33, "touch", "socket"),
      ],
    },
  },
  "8g": {
    label: "8 gang — big room",
    layout: {
      backlight: 60,
      channels: [
        ch("Light 1", 5, 4, "touch", "light"),
        ch("Light 2", 16, 2, "touch", "light"),
        ch("Light 3", 17, 15, "touch", "light"),
        ch("Fan 1", 18, 13, "touch", "fan"),
        ch("Fan 2", 19, 14, "touch", "fan"),
        ch("Socket 1", 21, 27, "touch", "socket"),
        ch("Socket 2", 22, 33, "touch", "socket"),
        ch("Geyser", 23, 32, "touch", "geyser"),
      ],
    },
  },
  retrofit: {
    label: "3 gang — existing rocker switches",
    layout: {
      backlight: 0,
      channels: [
        ch("Light", 26, 34, "button", "light"),
        ch("Fan", 27, 35, "button", "fan"),
        ch("Socket", 25, 36, "button", "socket"),
      ],
    },
  },
};

function ch(
  name: string,
  relayPin: number,
  inputPin: number | null,
  inputKind: InputKind,
  kind: Channel["kind"],
): Channel {
  return { name, relayPin, inputPin, inputKind, restore: "last", kind };
}

/** The compact form the device stores and reports. */
export function encodeLayout(layout: Layout): string {
  return layout.channels
    .map(
      (c) =>
        `${c.relayPin}:${c.inputPin ?? -1}:${c.inputKind[0]}:${c.restore[0]}:${c.kind[0]}:${(c.name || "").replace(/[|;:]/g, " ")}`,
    )
    .join(";");
}
