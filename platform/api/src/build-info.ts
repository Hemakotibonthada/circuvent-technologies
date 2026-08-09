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
