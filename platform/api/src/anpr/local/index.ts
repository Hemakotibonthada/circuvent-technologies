import { config } from "../../config";
import { logger } from "../../logger";
import type { PlateRecogniser, RawCandidate, RecogniseResult } from "../recognizer";
import { analysePlate } from "../plate";
import { binariseForOcr, crop, decodeGray, resize, toPgm, type Gray } from "./image";
import { findPlates } from "./locate";
import { ocr, type OcrWord } from "./tesseract";

/**
 * The local plate recogniser: our own, running on our own hardware.
 *
 *   JPEG ──▶ greyscale ──▶ find plate-shaped edge-dense regions
 *                                    │
 *                    ┌───────────────┴───────────────┐
 *                    ▼                               ▼
 *          crop, upscale, binarise            (nothing found)
 *                    ▼                               ▼
 *            tesseract --psm 7            whole frame, --psm 11
 *                    └───────────────┬───────────────┘
 *                                    ▼
 *                        candidate strings + confidence
 *                                    ▼
 *                    plate.ts — decides what is actually true
 *
 * WHY IT EXISTS
 *
 * Every hosted ANPR service bills per read, and a gate camera reads
 * continuously for as long as it is mounted. A metered recogniser turns a
 * camera somebody bought into a subscription they did not agree to, and it
 * means the feature stops the day a card expires. This runs on the VM that is
 * already paid for, and nothing leaves it — which also means the photographs
 * are not being posted to a third party, and §6's whole argument about
 * retention is not quietly undone by shipping every frame off the box.
 *
 * WHAT IT PROPOSES, AND WHAT DECIDES
 *
 * The governing rule from `Docs/16-ai-assistant.md` applies exactly as it does
 * to the paid providers: **this only ever proposes strings.** `plate.ts` fits
 * them to a real registration shape, corrects per position, rejects unknown
 * state codes, and requires frames to agree. That division is what makes a
 * general-purpose OCR engine safe to put behind a barrier — a misread has to
 * survive shape validation *and* be produced by more than one frame before it
 * can be believed.
 *
 * HONEST LIMITS
 *
 * It is worse than a purpose-built ANPR model, and the console and
 * `Docs/20-anpr.md` say so. It wants a plate that is roughly square-on, roughly
 * in focus and lit; it reads a stopped vehicle at a barrier far better than one
 * driving through; and a heavily angled or dirty plate will defeat it. The
 * answer to that is a better camera position, not a better sentence here.
 */

/**
 * Target height of the strip handed to the classifier.
 *
 * Tesseract's LSTM is trained around a 30-40 px x-height and degrades sharply
 * below it — a plate 20 px tall in the frame is not "low quality" to it, it is
 * unreadable. Upscaling does not add information, but it does put the strokes
 * on enough of a grid for the classifier to see them, and it is the single
 * change that most improves a distant plate. 96 px leaves headroom for the
 * two-row plates that get split into taller crops.
 */
const TARGET_STRIP_HEIGHT = 96;

/** Beyond this the strip is only getting blurrier; the plate was too small. */
const MAX_UPSCALE = 6;

/**
 * Padding around a detected box, as a fraction of its height.
 *
 * Generous horizontally, and that is the fix for a specific failure. The
 * detector finds the region where vertical edges are *dense*, which is the
 * characters — not the plate. The first and last character sit at the edge of
 * that region, so a tight crop shaves a stroke off each end and the classifier
 * returns a registration one character short at both ends. A short plate then
 * fits no known shape and is thrown away, so the whole read is lost to a few
 * pixels of margin.
 *
 * Vertically the padding is smaller: the row above and below a plate is
 * bodywork or bumper, and including too much of it gives the illumination
 * normalisation a large dark region to fight.
 */
const PAD_X = 0.35;
const PAD_Y = 0.22;

/**
 * Whole-frame fallback size.
 *
 * Big enough that a plate occupying a tenth of the width still has legible
 * characters, small enough that the engine is not scanning two megapixels of
 * driveway on a shared vCPU.
 */
const FALLBACK_WIDTH = 1280;

/**
 * Joins the words of one line into a candidate registration.
 *
 * A plate is one token to a person and frequently three to a layout engine —
 * `KA 01 AB 1234` is spaced on the plate itself, and a two-row plate is two
 * lines. Concatenating and letting `plate.ts` normalise is right: it strips
 * separators anyway, and refusing to join would mean a correctly-read spaced
 * plate never matched a rule.
 */
function joinWords(words: OcrWord[]): RawCandidate | null {
  const usable = words.filter((w) => /[A-Z0-9]/.test(w.text));
  if (!usable.length) return null;

  const raw = usable.map((w) => w.text.replace(/[^A-Z0-9]/g, "")).join("");
  if (raw.length < 4) return null;

  /*
   * The lowest word confidence, not the mean.
   *
   * A plate is only as good as its worst character: `KA01AB1234` with nine
   * certain characters and one guessed is a different registration from the
   * one on the car. Averaging hides exactly the case that matters, and the
   * whole point of carrying a confidence into the burst vote is to let a
   * shaky read lose to a clean one.
   */
  const confidence = Math.max(0, Math.min(100, Math.min(...usable.map((w) => w.confidence))));
  return { raw, confidence };
}

/** Crops one detected box, upscales it and binarises it for the classifier. */
function prepareStrip(full: Gray, box: { x: number; y: number; w: number; h: number }): Gray | null {
  const padX = box.h * PAD_X;
  const padY = box.h * PAD_Y;
  const region = crop(full, box.x - padX, box.y - padY, box.w + padX * 2, box.h + padY * 2);
  if (region.width < 16 || region.height < 6) return null;

  const scale = Math.min(MAX_UPSCALE, Math.max(1, TARGET_STRIP_HEIGHT / region.height));
  const scaled = scale > 1.02 ? resize(region, region.width * scale, region.height * scale) : region;
  return binariseForOcr(scaled);
}

async function readStrip(strip: Gray): Promise<RawCandidate | null> {
  const words = await ocr(toPgm(strip), 7);
  return joinWords(words);
}

/**
 * The whole-frame pass.
 *
 * Reached when localisation found nothing plausible, which happens on a plate
 * that is unusually large in frame (the edge-density blob fails the aspect
 * test), one against a busy high-contrast background, or a two-row plate that
 * merged with the vehicle's trim. Sparse-text mode finds islands of characters
 * without trying to impose a page layout, and each line becomes its own
 * candidate for `plate.ts` to accept or reject.
 *
 * It is a fallback rather than the primary path because it reads *everything* —
 * the house number, the van's livery, the road sign — so it produces several
 * candidates of which at most one is a registration. That is fine as a second
 * chance and would be poor as a first choice.
 */
async function readWholeFrame(full: Gray): Promise<RawCandidate[]> {
  const scale = Math.min(1, FALLBACK_WIDTH / full.width);
  const scaled = scale < 1 ? resize(full, full.width * scale, full.height * scale) : full;
  const words = await ocr(toPgm(binariseForOcr(scaled)), 11);

  const out: RawCandidate[] = [];
  for (const w of words) {
    const raw = w.text.replace(/[^A-Z0-9]/g, "");
    if (raw.length >= 6) out.push({ raw, confidence: Math.max(0, Math.min(100, w.confidence)) });
  }
  /*
   * Adjacent words are also joined pairwise, because sparse mode reliably
   * splits `KA01 AB1234` into two tokens and neither half is a registration on
   * its own. The parts are kept as well: `plate.ts` scores every candidate and
   * discards the ones that are not plates, so offering both costs nothing.
   */
  for (let i = 0; i + 1 < words.length; i++) {
    const joined = (words[i].text + words[i + 1].text).replace(/[^A-Z0-9]/g, "");
    if (joined.length >= 8 && joined.length <= 12) {
      out.push({ raw: joined, confidence: Math.min(words[i].confidence, words[i + 1].confidence) });
    }
  }
  return out;
}

export function localRecogniser(): PlateRecogniser {
  return {
    name: "local",
    async recognise(jpegBuf: Buffer): Promise<RecogniseResult> {
      const started = Date.now();

      const gray = decodeGray(jpegBuf);
      if (!gray) {
        // Not "no plate": the bytes were not a picture. A camera publishing
        // something that will not decode is a fault worth telling apart from a
        // vehicle that could not be read.
        return { candidates: [], reason: "provider_error", ms: Date.now() - started };
      }

      const candidates: RawCandidate[] = [];
      try {
        /*
         * Regions are tried in rank order and the search stops at the first one
         * that is actually a registration.
         *
         * Each region is a subprocess costing 1-3 seconds on a shared vCPU, and
         * a frame typically offers three: the plate, a sign, and a piece of
         * livery. Trying all of them triples the cost of every successful read
         * to gather candidates that `plate.ts` is going to discard anyway — and
         * three frames of a burst multiply it again, so a vehicle at a barrier
         * waits twenty seconds instead of six.
         *
         * `analysePlate` is the authority the pipeline already uses, so the
         * early exit and the final decision agree by construction. A region
         * that reads as something plate-shaped but invalid is still kept and
         * still offered — it just does not stop the search.
         */
        for (const box of findPlates(gray, config.ANPR_LOCAL_MAX_REGIONS)) {
          const strip = prepareStrip(gray, box);
          if (!strip) continue;
          const found = await readStrip(strip);
          if (!found) continue;
          candidates.push(found);
          if (analysePlate(found.raw).valid) break;
        }

        if (!candidates.length) {
          candidates.push(...(await readWholeFrame(gray)));
        }
      } catch (err) {
        const code = (err as NodeJS.ErrnoException)?.code;
        if (code === "ENOENT") {
          // Already logged once by the wrapper. Reported as a provider error so
          // the console shows a configuration fault rather than implying the
          // camera saw an unreadable vehicle.
          return { candidates: [], reason: "provider_error", ms: Date.now() - started };
        }
        if (code === "ETIMEDOUT" || (err as Error)?.message?.includes("timed out")) {
          return { candidates: [], reason: "timeout", ms: Date.now() - started };
        }
        logger.error({ err }, "local plate recogniser failed");
        return { candidates: [], reason: "provider_error", ms: Date.now() - started };
      }

      return {
        candidates,
        // Never a silent empty array — the pipeline distinguishes "nothing was
        // read" from "nothing was attempted", and the console shows the reason.
        reason: candidates.length ? undefined : "no_plate",
        ms: Date.now() - started,
      };
    },
  };
}
