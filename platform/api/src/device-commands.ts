/**
 * Making an automation's stored command something the device will act on.
 *
 * WHY THE SERVER REPAIRS THESE
 *
 * Schedules and rules already in the database carry a command shape that no
 * device ever executed. They were written as `{ "power2": true }` — a *state*
 * key with no action — and CircuventDevice::_dispatch() begins:
 *
 *     String action = doc["action"] | "";
 *     if (!action.length()) return;
 *
 * so the payload was discarded before any sketch handler ran. Nothing logged
 * it, nothing rejected it, and the rule kept reporting a correct next-run
 * time. Every switch timer anyone created is in that state.
 *
 * Fixing the clients stops new rules being written that way. It does nothing
 * for the ones that exist, and the alternative — asking every user to delete
 * and recreate every schedule — is not a fix, it is a workaround with a
 * changelog entry. Normalising here means a timer set weeks ago starts working
 * the next time it fires.
 *
 * This duplicates knowledge that also lives in the web app's
 * src/lib/smarthome-command-map.ts. That is deliberate: the control plane is a
 * separate deployable and must not depend on the site. The two are kept honest
 * by testing both against the same firmware behaviour — see
 * device-commands.test.ts here, and smarthome-command-map.test.ts there.
 */

/** Home Hub relay index → the state key its sketch publishes back. */
const HUB_CHANNEL_FIELDS = ["power", "power2", "power3", "power4"];

export type Command = Record<string, unknown>;

function hubChannelIndex(field: string): number {
  return HUB_CHANNEL_FIELDS.indexOf(field);
}

/**
 * Rewrites a stored command into one the firmware reads.
 *
 * Conservative by design. A payload that already names an action is left
 * exactly as authored, because the rule editor can produce actions this module
 * has no knowledge of — rewriting those to fix the broken ones would break
 * working automations. The single exception is a Home Hub channel key, which
 * is never valid as a command whatever action accompanies it.
 *
 * Returns the command unchanged when there is nothing to do, so callers can
 * publish the result unconditionally.
 */
export function normaliseCommand(deviceType: string, cmd: Command | null | undefined): Command | null {
  if (!cmd || typeof cmd !== "object" || Array.isArray(cmd)) return null;
  const keys = Object.keys(cmd);
  if (keys.length === 0) return null;

  const hasAction = typeof cmd.action === "string" && (cmd.action as string).length > 0;

  if (deviceType === "home-hub") {
    // Channels are addressed positionally: { ch, on }. power/power2/power3/
    // power4 are outputs of writeRelay(), never inputs to onCommand().
    const channelKey = keys.find((k) => hubChannelIndex(k) >= 0 && typeof cmd[k] === "boolean");
    if (channelKey) {
      const rest: Command = {};
      for (const k of keys) {
        if (k === channelKey || k === "action") continue;
        rest[k] = cmd[k];
      }
      return { ...rest, action: "set", ch: hubChannelIndex(channelKey), on: cmd[channelKey] as boolean };
    }
  }

  if (deviceType === "smart-lock" || deviceType === "facedoor") {
    if (!hasAction && typeof cmd.locked === "boolean") {
      return { action: cmd.locked ? "lock" : "unlock" };
    }
  }

  if (deviceType === "rfid-gate") {
    // A barrier command authored as a field rather than a verb.
    if (!hasAction && typeof cmd.barrier === "string") {
      const v = cmd.barrier as string;
      if (v === "open" || v === "close") return { action: v };
    }
  }

  if (hasAction) return cmd;

  /*
   * No action at all — the shape every switch timer was saved with. For these
   * sketches the field name really is the command key; only the action was
   * missing, so adding it is the whole repair.
   */
  return { action: "set", ...cmd };
}

/**
 * True when normalising would change what the device receives.
 *
 * Used only for logging: a deployment that silently starts repairing thousands
 * of stored rules should say so once per rule, so the change is visible in the
 * logs rather than inferred from relays suddenly working.
 */
export function needsRepair(deviceType: string, cmd: Command | null | undefined): boolean {
  const fixed = normaliseCommand(deviceType, cmd);
  if (!fixed || !cmd) return false;
  return JSON.stringify(fixed) !== JSON.stringify(cmd);
}
