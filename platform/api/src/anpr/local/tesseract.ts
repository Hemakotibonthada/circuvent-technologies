import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "../../config";
import { logger } from "../../logger";

/**
 * The character classifier: Tesseract, as a subprocess.
 *
 * WHY A SUBPROCESS AND NOT `tesseract.js`
 *
 * The WASM build holds its worker, its model and its scratch buffers resident
 * for as long as the process lives — comfortably 150-250 MB. The control plane
 * runs on a VM with 956 MB total and about 400 MB free once Postgres, Mosquitto
 * and Caddy have taken theirs (Docs/12-vm-runbook.md). A resident worker of
 * that size is not a performance question, it is whether the API gets OOM-
 * killed at 3 a.m.
 *
 * The native binary is the same engine with the opposite memory profile: it
 * starts, reads one small image, prints, and exits, and the kernel takes every
 * byte back. It costs ~150 ms of process startup per call, which is nothing
 * against a gate that sees a few dozen vehicles a day and everything against
 * running out of memory.
 *
 * WHY THIS IS OURS AND NOT A SERVICE
 *
 * Every hosted ANPR API bills per read. A gate camera generates reads
 * continuously and for as long as it is mounted, so a metered recogniser turns
 * a product somebody bought into a subscription they did not. Tesseract is
 * Apache-2.0 and runs on hardware already paid for.
 *
 * WHAT IT IS NOT
 *
 * Tesseract is a general text recogniser, not a purpose-built plate model. It
 * is meaningfully worse than one on a moving vehicle, a sharply angled plate or
 * a dirty one, and `Docs/20-anpr.md` says so rather than implying parity. It is
 * survivable here for the same reason the `openai` provider is: `plate.ts`
 * refuses anything that is not a real registration, and frames have to agree
 * before a read is believed.
 */

/**
 * Every character an Indian registration can contain.
 *
 * Constraining the alphabet is the single highest-value setting available. With
 * the full set the engine will happily return `KAO1AB!234` — an O for a zero, a
 * `!` for a 1 — because those are valid English text and it is scoring against
 * a language model built for prose. Restricted to this, the errors that remain
 * are confusions *within* the alphabet, which is exactly what the positional
 * correction in `plate.ts` is built to undo.
 */
const WHITELIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export interface OcrWord {
  text: string;
  /** Tesseract's own confidence, 0-100. */
  confidence: number;
}

/**
 * Page segmentation modes, and why each is used.
 *
 * 7 — "a single text line". The right mode for a cropped plate: it stops the
 *     engine trying to find a page layout in a 400x90 strip and reading the
 *     border as a column.
 * 11 — "sparse text, no order". The fallback for a whole frame, where the plate
 *     is one island of text among several and there is no layout to find.
 */
export type Psm = 7 | 11;

let missingBinaryLogged = false;

/**
 * Runs the engine over one image and returns the words it read.
 *
 * TSV output rather than plain text, because plain text discards the
 * confidence — and confidence is a quarter of the burst vote in `plate.ts`.
 * Reading it back also lets a line be reassembled from its words, which matters
 * for a two-row plate.
 */
export async function ocr(image: Buffer, psm: Psm): Promise<OcrWord[]> {
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), "cv-anpr-"));
    const input = join(dir, "in.pgm");
    await writeFile(input, image);

    const args = [
      input,
      "stdout",
      "--psm",
      String(psm),
      "-l",
      config.ANPR_LOCAL_LANG,
      /*
       * The LSTM engine only. Tesseract's legacy engine is still present and
       * still selectable, and on a short all-caps string with no dictionary
       * behind it the legacy classifier is markedly worse. Left to "default"
       * the choice depends on which models the base image happens to ship.
       */
      "--oem",
      "1",
      "-c",
      `tessedit_char_whitelist=${WHITELIST}`,
      /*
       * A registration is not a word in any language. Left on, the dictionary
       * pulls a correct read toward a real English word — `HR26DK8337` losing
       * its way toward something the model has seen before.
       */
      "-c",
      "load_system_dawg=0",
      "-c",
      "load_freq_dawg=0",
      "tsv",
    ];

    const stdout = await run(args);
    return parseTsv(stdout);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e?.code === "ENOENT") {
      // The binary is missing from the image. Logged once, because the ANPR
      // path would otherwise repeat it for every frame of every burst forever.
      if (!missingBinaryLogged) {
        missingBinaryLogged = true;
        logger.error(
          { binary: config.ANPR_LOCAL_BINARY },
          "local plate recogniser: tesseract is not installed — reads will be unrecognised"
        );
      }
      throw err;
    }
    throw err;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function run(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      config.ANPR_LOCAL_BINARY,
      args,
      {
        timeout: config.ANPR_LOCAL_TIMEOUT_MS,
        // Bounded because the output is a handful of TSV rows; anything larger
        // means the engine is describing a page and something is very wrong.
        maxBuffer: 4 * 1024 * 1024,
        env: {
          ...process.env,
          /*
           * One thread.
           *
           * OpenMP defaults to one thread per core and the two here are shared
           * with Postgres, the MQTT bridge and every HTTP request. Recognition
           * is a background job nobody is waiting on; letting it take both
           * cores makes the console stall while a gate reads a plate, which is
           * a worse trade than the read taking twice as long.
           */
          OMP_THREAD_LIMIT: "1",
        },
      },
      (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout);
      }
    );
    child.on("error", reject);
  });
}

/**
 * Parses Tesseract's TSV.
 *
 * Columns: level, page, block, para, line, word, left, top, width, height,
 * conf, text. Only the last two are wanted, but they are addressed by index
 * from the *header* rather than by a fixed position, so a future version adding
 * a column does not silently shift the text one place and start returning
 * confidences as plate strings.
 */
function parseTsv(stdout: string): OcrWord[] {
  const lines = stdout.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const header = lines[0].split("\t");
  const confIndex = header.indexOf("conf");
  const textIndex = header.indexOf("text");
  if (confIndex < 0 || textIndex < 0) return [];

  const words: OcrWord[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split("\t");
    if (cells.length <= textIndex) continue;
    const text = (cells[textIndex] ?? "").trim();
    if (!text) continue;
    const confidence = Number(cells[confIndex]);
    // -1 is Tesseract's marker for a structural row rather than a word.
    if (!Number.isFinite(confidence) || confidence < 0) continue;
    words.push({ text, confidence });
  }
  return words;
}

/** Test seam: lets a suite re-assert the "binary missing" log. */
export function __resetOcrWarningForTests(): void {
  missingBinaryLogged = false;
}
