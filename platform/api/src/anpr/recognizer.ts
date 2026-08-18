import { config } from "../config";
import { logger } from "../logger";
import { localRecogniser } from "./local";

/**
 * The OCR boundary.
 *
 * Nothing in here decides anything. A recogniser proposes strings; `plate.ts`
 * decides what they mean and `index.ts` decides what to do about it. That
 * split is what lets the provider be swapped, or be absent, without any of the
 * behaviour that a gate depends on changing.
 *
 * WHY THIS IS OPTIONAL
 *
 * With `ANPR_PROVIDER=none` — the default — the pipeline still runs end to
 * end: captures arrive, arrivals are recorded, thumbnails are kept, the
 * timeline fills in and automations on `vehicle` events fire. Reads are simply
 * stored as `unrecognised` with the reason `no_recogniser`.
 *
 * The alternative, refusing captures without OCR, would hand a customer who
 * has not enabled it a camera that looks broken. This is the same bargain the
 * assistant makes in Docs/16-ai-assistant.md: the deterministic part always
 * works and the model only ever adds to it.
 */

export interface RawCandidate {
  /** The string the provider read, uncorrected. */
  raw: string;
  /** The provider's own confidence, normalised to 0-100. */
  confidence: number;
}

export interface RecogniseResult {
  candidates: RawCandidate[];
  /** Present when nothing could be attempted. Never a silent empty array. */
  reason?: "no_recogniser" | "provider_error" | "timeout" | "no_plate";
  /** Wall-clock cost, for the latency panel. */
  ms: number;
}

export interface PlateRecogniser {
  readonly name: string;
  recognise(jpeg: Buffer): Promise<RecogniseResult>;
}

/** Shared timeout. A hung provider must not wedge the MQTT message handler. */
async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
      redirect: "error",
    });
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

/** The default. Honest about doing nothing rather than returning an empty list. */
const noneRecogniser: PlateRecogniser = {
  name: "none",
  async recognise(): Promise<RecogniseResult> {
    return { candidates: [], reason: "no_recogniser", ms: 0 };
  },
};

/**
 * Plate Recognizer (platerecognizer.com) — a purpose-built ANPR service.
 *
 * Sends multipart rather than JSON because that is the only body its
 * `/v1/plate-reader/` endpoint accepts.
 */
function platerecognizerRecogniser(): PlateRecogniser {
  const url = config.ANPR_BASE_URL || "https://api.platerecognizer.com/v1/plate-reader/";
  return {
    name: "platerecognizer",
    async recognise(jpeg: Buffer): Promise<RecogniseResult> {
      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.ANPR_TIMEOUT_MS);
      try {
        const form = new FormData();
        form.append("upload", new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }), "capture.jpg");
        if (config.ANPR_REGION) form.append("regions", config.ANPR_REGION);
        const r = await fetch(url, {
          method: "POST",
          headers: { Authorization: `Token ${config.ANPR_API_KEY}` },
          body: form,
          signal: controller.signal,
          redirect: "error",
        });
        if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
        const doc = (await r.json()) as { results?: Array<{ plate?: string; score?: number }> };
        const candidates: RawCandidate[] = (doc.results ?? [])
          .filter((x) => typeof x.plate === "string" && x.plate.length > 0)
          .map((x) => ({ raw: x.plate as string, confidence: Math.round((x.score ?? 0) * 100) }));
        return {
          candidates,
          reason: candidates.length ? undefined : "no_plate",
          ms: Date.now() - started,
        };
      } catch (err) {
        const aborted = err instanceof Error && err.name === "AbortError";
        logger.warn({ err }, "anpr platerecognizer failed");
        return { candidates: [], reason: aborted ? "timeout" : "provider_error", ms: Date.now() - started };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * Any OpenAI-compatible vision model.
 *
 * Included because it needs no ANPR vendor and runs against a self-hosted
 * endpoint, which matters for a deployment that will not send images off-box.
 * It is meaningfully worse than a purpose-built ANPR model at this job and is
 * documented that way rather than presented as equivalent: a general vision
 * model will cheerfully return a plausible plate for a blurred rectangle.
 *
 * That failure mode is survivable *here specifically* because `plate.ts`
 * refuses anything that is not a real registration and requires frames of the
 * burst to agree, so a hallucinated plate needs to be hallucinated identically
 * two or three times before it can be believed.
 */
function openaiRecogniser(): PlateRecogniser {
  const base = config.ANPR_BASE_URL || "https://api.openai.com/v1";
  return {
    name: "openai",
    async recognise(jpeg: Buffer): Promise<RecogniseResult> {
      const started = Date.now();
      try {
        const doc = (await postJson(
          `${base.replace(/\/$/, "")}/chat/completions`,
          {
            model: config.ANPR_MODEL,
            temperature: 0,
            max_tokens: 60,
            messages: [
              {
                role: "system",
                content:
                  "You read vehicle number plates from images. Reply with ONLY compact JSON: " +
                  '{"plate":"<characters>","confidence":<0-100>}. ' +
                  'If no plate is legible reply {"plate":"","confidence":0}. ' +
                  "Never guess missing characters and never invent a plate.",
              },
              {
                role: "user",
                content: [
                  { type: "text", text: "Read the number plate." },
                  {
                    type: "image_url",
                    image_url: { url: `data:image/jpeg;base64,${jpeg.toString("base64")}` },
                  },
                ],
              },
            ],
          },
          config.ANPR_API_KEY ? { authorization: `Bearer ${config.ANPR_API_KEY}` } : {},
          config.ANPR_TIMEOUT_MS
        )) as { choices?: Array<{ message?: { content?: string } }> };

        const text = doc.choices?.[0]?.message?.content ?? "";
        // Models wrap JSON in prose and fences no matter how the prompt is
        // worded, so the object is extracted rather than parsed directly.
        const m = /\{[\s\S]*\}/.exec(text);
        if (!m) return { candidates: [], reason: "no_plate", ms: Date.now() - started };
        const parsed = JSON.parse(m[0]) as { plate?: unknown; confidence?: unknown };
        const raw = typeof parsed.plate === "string" ? parsed.plate : "";
        if (!raw) return { candidates: [], reason: "no_plate", ms: Date.now() - started };
        const conf = Number(parsed.confidence);
        return {
          candidates: [{ raw, confidence: Number.isFinite(conf) ? Math.max(0, Math.min(100, conf)) : 50 }],
          ms: Date.now() - started,
        };
      } catch (err) {
        const aborted = err instanceof Error && err.name === "AbortError";
        logger.warn({ err }, "anpr openai recogniser failed");
        return { candidates: [], reason: aborted ? "timeout" : "provider_error", ms: Date.now() - started };
      }
    },
  };
}

/**
 * A plain HTTP endpoint, for a self-hosted model behind our own wrapper.
 *
 * Accepts both response shapes anyone actually writes — `{plate, confidence}`
 * and `{results:[{plate, score}]}` — because requiring one of them is a
 * pointless integration cost for something whose whole purpose is to be
 * swappable.
 */
function httpRecogniser(): PlateRecogniser {
  return {
    name: "http",
    async recognise(jpeg: Buffer): Promise<RecogniseResult> {
      const started = Date.now();
      try {
        const doc = (await postJson(
          config.ANPR_BASE_URL,
          { image: jpeg.toString("base64"), region: config.ANPR_REGION },
          config.ANPR_API_KEY ? { authorization: `Bearer ${config.ANPR_API_KEY}` } : {},
          config.ANPR_TIMEOUT_MS
        )) as {
          plate?: string;
          confidence?: number;
          results?: Array<{ plate?: string; score?: number; confidence?: number }>;
        };

        const candidates: RawCandidate[] = [];
        if (typeof doc.plate === "string" && doc.plate) {
          candidates.push({ raw: doc.plate, confidence: normaliseScore(doc.confidence) });
        }
        for (const r of doc.results ?? []) {
          if (typeof r.plate === "string" && r.plate) {
            candidates.push({ raw: r.plate, confidence: normaliseScore(r.score ?? r.confidence) });
          }
        }
        return { candidates, reason: candidates.length ? undefined : "no_plate", ms: Date.now() - started };
      } catch (err) {
        const aborted = err instanceof Error && err.name === "AbortError";
        logger.warn({ err }, "anpr http recogniser failed");
        return { candidates: [], reason: aborted ? "timeout" : "provider_error", ms: Date.now() - started };
      }
    },
  };
}

/** Providers disagree on whether a score is 0-1 or 0-100. Accept both. */
function normaliseScore(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 50;
  const scaled = n > 0 && n <= 1 ? n * 100 : n;
  return Math.max(0, Math.min(100, Math.round(scaled)));
}

let active: PlateRecogniser | null = null;

export function getRecogniser(): PlateRecogniser {
  if (active) return active;
  switch (config.ANPR_PROVIDER) {
    case "local":
      /*
       * Ours, on our own hardware. Statically imported: the back edge from
       * `local/` to this file is `import type` only, so it is erased at compile
       * time and there is no runtime cycle to break.
       */
      active = localRecogniser();
      break;
    case "platerecognizer":
      active = platerecognizerRecogniser();
      break;
    case "openai":
      active = openaiRecogniser();
      break;
    case "http":
      // A provider that was selected but not given somewhere to send to would
      // fail on every capture with a network error. Failing over to `none` at
      // least reports the real problem in the read's reason field.
      active = config.ANPR_BASE_URL ? httpRecogniser() : noneRecogniser;
      break;
    default:
      active = noneRecogniser;
  }
  return active;
}

/** Test seam. Refuses outside NODE_ENV=test, like `__setMqttClientForTests`. */
export function __setRecogniserForTests(r: PlateRecogniser | null): void {
  if (config.NODE_ENV !== "test") throw new Error("test-only");
  active = r;
}
