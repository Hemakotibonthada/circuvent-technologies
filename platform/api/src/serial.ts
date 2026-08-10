/**
 * Device serial numbers.
 *
 * WHY A SERIAL AT ALL, GIVEN DEVICES ALREADY HAVE AN ID
 *
 * `devices.id` is derived from the ESP32 chip id — `smart-plug-a41c9e02`. It is
 * a good database key and a terrible thing to print on a label: it is long,
 * lower-case, mixes letters and digits freely, and a support call that starts
 * "read me the code on the bottom of the unit" turns into spelling out eight
 * hex characters and getting them wrong.
 *
 * A serial is the customer-facing identifier: short, upper-case, grouped, and
 * self-checking, so a digit misheard over the phone is rejected before it
 * reaches a query rather than silently matching nothing.
 *
 * FORMAT
 *
 *   CV-PLG-4K7M-92XH
 *   │  │   └──┴── 8 payload characters from the unambiguous alphabet
 *   │  └───────── 3-letter product code
 *   └──────────── fixed prefix, so a serial is recognisable out of context
 *
 * The last character of the final group is a check character over everything
 * before it.
 */

/**
 * Crockford-style alphabet with the ambiguous characters removed.
 *
 * I, L, O and U are gone: I/1 and O/0 are the classic misreads on a moulded or
 * laser-etched label, and U is dropped because it is easily heard as "you" when
 * a serial is read aloud. 32 characters left, which is also a clean 5 bits.
 */
export const SERIAL_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const ALPHABET_INDEX = new Map<string, number>(
  [...SERIAL_ALPHABET].map((c, i) => [c, i] as const)
);

/**
 * Characters a human is likely to substitute, folded back before validation.
 *
 * Somebody reading a label will type O for 0 and I or L for 1 no matter how
 * carefully the alphabet was chosen — the point of excluding them is that the
 * substitution is then unambiguous and can be corrected rather than guessed.
 */
const FOLD: Record<string, string> = { O: "0", I: "1", L: "1", U: "V" };

export interface SerialParts {
  /** 3-letter product code, e.g. PLG. */
  product: string;
  /** The 7 payload characters, without the check character. */
  body: string;
  check: string;
}

/**
 * Product codes.
 *
 * Explicit rather than derived from the type string, because a derived code
 * would change if a product were ever renamed and every label already printed
 * would stop parsing. `fallbackProductCode` covers types added later so a new
 * device still gets a serial instead of failing to provision.
 */
const PRODUCT_CODES: Record<string, string> = {
  "home-hub": "HUB",
  "smart-plug": "PLG",
  "smart-switch": "SWT",
  "smart-light": "LGT",
  "smart-fan": "FAN",
  "smart-lock": "LCK",
  "touchboard": "TCH",
  "sentinel": "SNL",
  "camera": "CAM",
  "aquaguard": "AQG",
  "watertank": "TNK",
  "guardian": "GRD",
  "motion-sensor": "MOT",
  "energy-monitor": "NRG",
  "agri-starter": "AGR",
  "curtain": "CRT",
  "rfid-gate": "GAT",
  "anpr-cam": "ANP",
  "drone-link": "DRN",
  "drone-x1": "DX1",
  "facedoor": "FCD",
  "generic": "GEN",
};

/** Deterministic three letters for a type we have no explicit code for. */
export function fallbackProductCode(type: string): string {
  const letters = (type || "generic").toUpperCase().replace(/[^A-Z]/g, "");
  if (letters.length >= 3) return letters.slice(0, 3);
  return (letters + "XXX").slice(0, 3);
}

export function productCode(type: string): string {
  return PRODUCT_CODES[type] ?? fallbackProductCode(type);
}

/** The type a product code came from, for reading a serial back. */
export function typeFromProductCode(code: string): string | null {
  const up = code.toUpperCase();
  for (const [type, c] of Object.entries(PRODUCT_CODES)) if (c === up) return type;
  return null;
}

/**
 * Check character over the product code and payload.
 *
 * A weighted sum mod 32 rather than a plain sum: an unweighted checksum cannot
 * see transpositions, and two adjacent characters swapped is the single most
 * common error when copying a code by hand. Weighting by position makes the
 * order matter, so 4K7M and 4K M7 produce different check characters.
 */
export function checkCharacter(product: string, body: string): string {
  const material = (product + body).toUpperCase();
  let sum = 0;
  for (let i = 0; i < material.length; i++) {
    const v = ALPHABET_INDEX.get(material[i]);
    // A character outside the alphabet (a letter from the product code that is
    // not a payload character) still has to contribute, or two different
    // product codes could share a check character.
    const value = v === undefined ? material.charCodeAt(i) % 32 : v;
    sum += value * (i + 2);
  }
  return SERIAL_ALPHABET[sum % 32];
}

function randomPayload(len: number): string {
  let out = "";
  // crypto is not required here: a serial is an identifier, not a secret. It
  // must be unique, which the caller enforces with a UNIQUE constraint and a
  // retry, not unguessable. Guessing a serial grants nothing — the claim key
  // is a separate credential.
  for (let i = 0; i < len; i++) {
    out += SERIAL_ALPHABET[Math.floor(Math.random() * SERIAL_ALPHABET.length)];
  }
  return out;
}

/**
 * Derives payload characters from a hardware id so the same physical board
 * produces the same serial if it is ever re-provisioned.
 *
 * Without this, a factory reset would hand a unit a second serial while the
 * label on its case still shows the first, and the number printed on the
 * device — the whole point of a serial — would stop finding it.
 */
export function payloadFromHwid(hwid: string): string {
  const clean = (hwid || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (!clean) return randomPayload(7);
  let out = "";
  // FNV-1a, walked twice with different offsets, to spread a short hex chip id
  // across the full alphabet instead of leaving it visibly hex.
  for (const offset of [2166136261, 2166136353]) {
    let h = offset >>> 0;
    for (let i = 0; i < clean.length; i++) {
      h ^= clean.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    for (let i = 0; i < 4 && out.length < 7; i++) {
      out += SERIAL_ALPHABET[h % 32];
      h = Math.floor(h / 32);
    }
  }
  return out.slice(0, 7);
}

/**
 * Builds a serial. Pass a hardware id for a stable one, omit it for a random
 * one (bulk labels printed before the boards exist).
 */
export function generateSerial(type: string, hwid?: string): string {
  const product = productCode(type);
  const body = hwid ? payloadFromHwid(hwid) : randomPayload(7);
  return format(product, body);
}

function format(product: string, body: string): string {
  const check = checkCharacter(product, body);
  const full = (body + check).toUpperCase();
  return `CV-${product}-${full.slice(0, 4)}-${full.slice(4, 8)}`;
}

/**
 * Normalises anything a human might type into the canonical form, or null.
 *
 * Deliberately forgiving about everything that carries no meaning — case,
 * spaces, the dashes, a missing CV prefix — and strict about the check
 * character. Somebody reading a label into a support form should not be told
 * "not found" because they typed lower case, but should be told immediately if
 * they misread a character, rather than being sent looking for a device that
 * was never theirs.
 */
export function normalizeSerial(raw: string): string | null {
  if (!raw) return null;
  let s = raw.toUpperCase().replace(/[\s-]+/g, "");
  if (s.startsWith("CV")) s = s.slice(2);
  if (s.length !== 11) return null;

  const product = s.slice(0, 3);
  const rest = [...s.slice(3)].map((c) => FOLD[c] ?? c).join("");
  if (![...rest].every((c) => ALPHABET_INDEX.has(c))) return null;

  const body = rest.slice(0, 7);
  const check = rest.slice(7);
  if (checkCharacter(product, body) !== check) return null;

  return format(product, body);
}

/** True if `raw` is a well-formed serial, check character included. */
export function isSerial(raw: string): boolean {
  return normalizeSerial(raw) !== null;
}

/**
 * The QR payload printed on a device label.
 *
 * Carries the serial and the product type and NOTHING secret. Every unit runs
 * identical firmware with no baked-in credential, so the label cannot contain
 * one — the real trust comes from the encrypted Wi-Fi handoff and the TLS
 * self-provision. A label that looked like it held a secret would invite
 * somebody to treat a photograph of a box as sensitive, or worse, to assume
 * scanning it was sufficient authentication.
 *
 * The format matches what mobile/src/qr.ts already parses.
 */
export function labelQrPayload(serial: string, type: string, ssid?: string): string {
  const params = [`type=${encodeURIComponent(type)}`, `sn=${encodeURIComponent(serial)}`];
  if (ssid) params.push(`ssid=${encodeURIComponent(ssid)}`);
  return `circuvent://setup?${params.join("&")}`;
}
