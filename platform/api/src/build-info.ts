/**
 * What this build is, and what it can do.
 *
 * The capability list is maintained by hand and that is deliberate. Deriving
 * it — probing whether a handler exists, reading a feature flag — would make
 * it possible for the list to be right while the feature is broken, which is
 * the failure it exists to catch. Each entry is a promise that a specific
 * behaviour works in *this* build, added in the same commit as the behaviour.
 *
 * Adding an entry is part of shipping the feature. Removing one is how a
 * rollback tells clients to stop expecting it.
 */
export const CAPABILITIES = [
  /**
   * The WebSocket relays camera frames to sockets that send {type:"watch"}.
   *
   * This is the one that mattered. Builds before it accepted the connection,
   * pushed state and telemetry normally, and silently dropped `watch` — so
   * video never started and nothing anywhere reported an error. A client that
   * cannot find this capability should tell the user the server is out of
   * date rather than blaming the camera.
   */
  "frameRelay",
  /** {type:"watch"} / {type:"unwatch"} are read and refcounted per device. */
  "watchMessages",
  /** Device commands over POST /devices/:id/command. */
  "deviceCommands",
  /** api keys, webhooks and the developer v1 surface. */
  "developerApi",
  /**
   * ANPR: plate reads, the allow/deny/watch list, visits and occupancy.
   *
   * Added late, and that was a mistake worth recording. Both this and the
   * drone entry below were missing from the builds that shipped those
   * features, so a console newer than its server had no way to ask "do you
   * support this?" and had to infer it from a 404 on a route that might
   * equally have 404'd for a dozen other reasons. A live console showed a red
   * "Not found" banner for exactly this reason and it cost an afternoon.
   */
  "anpr",
  /**
   * Drone: the cv/<id>/track binary telemetry topic, the flight log and the
   * command safety gate.
   */
  "droneTelemetry",
  /**
   * FaceDoor: face profiles, samples, enrolment windows and POST /face/match.
   *
   * The door has no camera; a hub posts a descriptor here and this decides.
   * A client that cannot find this should say the hub needs rebuilding rather
   * than presenting an enrolment screen whose every button 404s.
   */
  "faceRecognition",
  /**
   * Households: /home/*, the x-circuvent-home header, and the capability
   * guard on commands.
   *
   * Worth being explicit about what its absence means. Without this build a
   * client that sets the home header is not merely missing a feature — the
   * header is ignored, so every request silently answers for the caller's own
   * home while the screen says it is showing somebody else's. A client should
   * refuse to switch homes at all rather than show one house's data under
   * another's name.
   */
  "householdSharing",
  /**
   * Google Home and Alexa: account linking, fulfilment, and the proactive
   * half — Request Sync, Report State, ChangeReport and AcceptGrant.
   *
   * Its absence means voice control is missing entirely, which is at least
   * honest. What the capability does *not* promise is that the proactive push
   * is configured: that needs a HomeGraph key and Alexa event credentials,
   * which are deployment settings rather than build facts, and the SYNC
   * response reports them per device via `willReportState`.
   */
  "smartHomeVoice",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/**
 * Build identity.
 *
 * COMMIT and BUILT_AT are injected at image build time (see the Dockerfile's
 * ARGs). They fall back to "unknown" rather than to something plausible: a
 * wrong commit hash is worse than an absent one, because it ends an
 * investigation that should have continued.
 */
export const BUILD = {
  version: process.env.npm_package_version || "1.0.0",
  commit: process.env.BUILD_COMMIT || "unknown",
  builtAt: process.env.BUILD_TIME || "unknown",
} as const;
