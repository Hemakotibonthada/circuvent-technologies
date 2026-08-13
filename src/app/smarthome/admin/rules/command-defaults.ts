/**
 * What a rule's action command should start as, and whether it will do
 * anything.
 *
 * The rule editor takes a raw JSON command, because an operator sometimes
 * needs to send something the form builders cannot express. The cost of that
 * freedom is that nothing was checking the command against the device: the
 * editor validated that the text parsed as JSON and stopped there, and its
 * default — `{"action":"set","power":true}` — is discarded by 18 of the 23
 * device types. A rule for a water tank or a gate saved cleanly, looked right
 * in the list, fired on time and did nothing.
 *
 * Both functions here derive from `projectCommand`, the same map that decides
 * what the device actually receives. Deliberately not a new table of fields:
 * a fourth table is how this bug class started.
 */

import { projectedFields, type CommandPayload } from "@/lib/smarthome-command-map";
import { getCommandFields } from "@/app/smarthome/automation/describe";

/** A starting command the given device type will actually act on. */
export function defaultCommandFor(type: string): string {
  const payload = seedPayload(type);
  return JSON.stringify(payload, null, 2);
}

function seedPayload(type: string): Record<string, unknown> {
  const fields = getCommandFields(type);

  for (const f of fields) {
    // `action` entries are one-shot verbs (open, arm, reboot). Skipping them
    // for the default is deliberate: seeding an editor with "unlock the front
    // door" and letting somebody save it half-read is not a good default.
    if (f.key === "action") continue;

    const candidate: Record<string, unknown> =
      f.kind === "bool"
        ? { action: "set", [f.key]: true }
        : f.kind === "number"
          ? { action: "set", [f.key]: defaultNumber(f.min, f.max) }
          : f.choices?.length
            ? { action: "set", [f.key]: f.choices[0].value }
            : {};

    // Trust the map, not this function: only offer it if it projects.
    if (Object.keys(candidate).length && projectedFields(type, candidate as CommandPayload).length) {
      return candidate;
    }
  }

  // Types whose only control is an action verb (a gate opens, a drone lands).
  const verb = fields.find((f) => f.key === "action" && f.choices?.length);
  if (verb?.choices?.length) {
    const candidate = { action: verb.choices[0].value };
    if (projectedFields(type, candidate as CommandPayload).length) return candidate;
  }

  /*
   * Nothing known. That means either a read-only device (a meter, a sensor) or
   * a type this build has not learned about yet. An empty `set` is the honest
   * starting point — it is obviously incomplete, so the operator edits it,
   * rather than a plausible-looking command that silently does nothing.
   */
  return { action: "set" };
}

function defaultNumber(min?: number, max?: number): number {
  if (typeof min === "number" && typeof max === "number") {
    return Math.round((min + max) / 2);
  }
  return typeof min === "number" ? min : 0;
}

/**
 * `null` when the command is fine, otherwise a message naming what this device
 * does accept.
 *
 * Returning the accepted fields matters. An error that only says "this will
 * not work" moves the dead end from save time to guess time, which is barely
 * an improvement.
 */
export function validateActionCommand(
  type: string,
  command: Record<string, unknown>,
): string | null {
  /*
   * An unrecognised type is not the same as a bad command. Devices can reach
   * the fleet before the console learns about them, and refusing here would
   * block an operator from sending a command that is very likely correct. The
   * map is the authority on types it knows; it is silent on the rest.
   */
  if (!type) return null;
  const fields = getCommandFields(type);
  if (fields.length === 0 && projectedFields(type, command as CommandPayload).length === 0) {
    const known = ["smart-plug", "curtain", "energy-monitor"].includes(type);
    if (!known) return null;
  }

  if (projectedFields(type, command as CommandPayload).length > 0) return null;

  const accepted = fields.filter((f) => f.key !== "action").map((f) => f.key);
  const verbs = fields.find((f) => f.key === "action")?.choices?.map((c) => c.value) ?? [];

  if (accepted.length === 0 && verbs.length === 0) {
    return `${article(type)} ${type} does not accept commands — it only reports readings. Use a notification action instead.`;
  }

  const parts: string[] = [];
  if (accepted.length) parts.push(accepted.join(", "));
  if (verbs.length) parts.push(`or an action of ${verbs.join(" / ")}`);

  return `This command does nothing on ${article(type).toLowerCase()} ${type}. It accepts ${parts.join(" ")}.`;
}

/** Sentence-leading article. Operators read these messages. */
function article(word: string): string {
  return /^[aeiou]/i.test(word) ? "An" : "A";
}
