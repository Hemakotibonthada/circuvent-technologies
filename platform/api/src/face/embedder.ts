/**
 * The face-embedding boundary.
 *
 * Turns a photograph into a descriptor. Nothing in here decides anything —
 * `match.ts` decides what a descriptor means and `routes.ts` decides what to
 * do about it. That split is what lets the model be swapped, or be absent,
 * without changing any of the behaviour a door depends on. It is the same
 * shape as `anpr/recognizer.ts`, for the same reasons.
 *
 * WHY THE PHONE DOES NOT DO THIS
 *
 * Two descriptors are only comparable when they come from the same model. A
 * 128-d embedding from one network and a 128-d embedding from another are the
 * same shape and mean entirely different things — `distance()` would return a
 * plausible number that is meaningless, and enrolment from a phone would
 * silently never match the door. Computing the embedding in one place, with
 * the model the recogniser uses, is what makes "enrol from anywhere" true
 * rather than merely implemented.
 *
 * WHY IT IS OPTIONAL
 *
 * With `FACE_EMBEDDER=none` — the default — everything except image enrolment
 * still works: profiles, samples posted as descriptors by a hub that has its
 * own model, matching, access windows, the attempt log. Refusing to start
 * without a model would hand somebody a lock that looks broken because they
 * have not configured a feature they may not want.
 */
import { config } from "../config";
import { logger } from "../logger";

export interface EmbedResult {
  descriptor: number[] | null;
  /** Present when nothing could be produced. Never a silent null. */
  reason?: "no_embedder" | "no_face" | "many_faces" | "provider_error" | "timeout";
  /** Wall-clock cost, so a slow model is visible rather than merely felt. */
  ms: number;
}

export interface FaceEmbedder {
  readonly name: string;
  embed(image: Buffer, mime: string): Promise<EmbedResult>;
}

/**
 * The default. Produces nothing, and says so.
 *
 * Deliberately not an error: a caller that gets `no_embedder` can tell the
 * person to enrol at the door instead, which is a real alternative. An
 * exception would look like a fault in a lock that is working correctly.
 */
const noEmbedder: FaceEmbedder = {
  name: "none",
  async embed(): Promise<EmbedResult> {
    return { descriptor: null, reason: "no_embedder", ms: 0 };
  },
};

/**
 * An HTTP embedder — typically the hub's own AI node.
 *
 * Posts the image and expects `{ descriptor: number[] }`, or a `faces` count
 * when it found none or several. The hub already runs the recogniser, so
 * asking it to embed is asking the model that will do the matching, which is
 * the only arrangement where the numbers are comparable.
 */
function httpEmbedder(): FaceEmbedder {
  return {
    name: "http",
    async embed(image: Buffer, mime: string): Promise<EmbedResult> {
      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.FACE_TIMEOUT_MS);

      try {
        const res = await fetch(`${config.FACE_BASE_URL.replace(/\/$/, "")}/embed`, {
          method: "POST",
          headers: {
            "content-type": mime || "image/jpeg",
            ...(config.FACE_API_KEY ? { authorization: `Bearer ${config.FACE_API_KEY}` } : {}),
          },
          body: new Uint8Array(image),
          signal: controller.signal,
        });

        if (!res.ok) {
          logger.warn({ status: res.status }, "face embedder returned an error");
          return { descriptor: null, reason: "provider_error", ms: Date.now() - started };
        }

        const body = (await res.json()) as { descriptor?: unknown; faces?: number };

        /*
         * Zero faces and several faces are different problems with different
         * advice — "no face found, move into the light" versus "more than one
         * person in shot" — so they are not collapsed into one failure.
         */
        if (typeof body.faces === "number") {
          if (body.faces === 0) return { descriptor: null, reason: "no_face", ms: Date.now() - started };
          if (body.faces > 1) return { descriptor: null, reason: "many_faces", ms: Date.now() - started };
        }

        if (!Array.isArray(body.descriptor)) {
          return { descriptor: null, reason: "provider_error", ms: Date.now() - started };
        }

        return { descriptor: body.descriptor as number[], ms: Date.now() - started };
      } catch (e) {
        const aborted = e instanceof Error && e.name === "AbortError";
        if (!aborted) logger.warn({ err: String(e) }, "face embedder failed");
        return {
          descriptor: null,
          reason: aborted ? "timeout" : "provider_error",
          ms: Date.now() - started,
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

let cached: FaceEmbedder | null = null;

export function getEmbedder(): FaceEmbedder {
  if (cached) return cached;
  cached = config.FACE_EMBEDDER === "http" && config.FACE_BASE_URL ? httpEmbedder() : noEmbedder;
  if (cached.name === "none") {
    logger.info("face embedding is not configured; enrol at the door or post descriptors directly");
  }
  return cached;
}

/**
 * Test seam. Pass null to fall back to the configured embedder.
 *
 * The same shape as `__setRecogniserForTests` in the ANPR pipeline, and for
 * the same reason: the door driver has to be exercised through its real frame
 * handling, and the only part of that which cannot run in a test is the model.
 */
export function __setEmbedderForTests(e: FaceEmbedder | null): void {
  cached = e;
}

/** Human wording for a failure, used verbatim by the app. */
export function embedFailureMessage(reason: EmbedResult["reason"]): string {
  switch (reason) {
    case "no_embedder":
      return "This home is not set up to enrol faces from a photo. Enrol at the door instead.";
    case "no_face":
      return "No face was found in that photo. Move into better light and fill the frame.";
    case "many_faces":
      return "More than one person is in that photo. Capture one face at a time.";
    case "timeout":
      return "The recogniser did not answer in time. Try again.";
    default:
      return "That photo could not be processed. Try again.";
  }
}
