/**
 * Typo tolerance for shop search.
 *
 * Optimal String Alignment (a.k.a. restricted Damerau-Levenshtein) rather than
 * plain Levenshtein, because the single most common retail typo is a
 * transposition — "plgu" for "plug", "recieve" for "receive". Plain Levenshtein
 * scores a transposition as two edits (one delete + one insert), which pushes it
 * past a 1-edit budget and makes exactly the typos people actually make
 * unmatchable. OSA scores it as one.
 *
 * OSA rather than true Damerau: true Damerau allows editing a substring between
 * two transposed characters, needs an alphabet-sized table, and the extra recall
 * is irrelevant for product names of one or two words.
 */

/** Longest term we will fuzzy-match. Beyond this the DP table stops being cheap. */
const MAX_LEN = 32;

/**
 * Shortest term allowed to match a token's *prefix*.
 *
 * Higher than the 4 characters the whole-token arm needs, because prefix
 * matching throws away the rest of the token and so decides on less evidence.
 * At four characters it is far too loose: "plug" is one edit from "plum" and
 * would drag in "plumbing".
 */
const MIN_PREFIX_LEN = 5;

/**
 * Edit distance between `a` and `b`, giving up as soon as it provably exceeds
 * `max`. Returns `max + 1` to signal "further than you care about" so callers
 * can treat the result as a plain number without a sentinel check.
 */
export function osaDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  const over = max + 1;

  // Length delta alone is a lower bound on the distance, so this rejects most
  // candidate pairs before allocating anything.
  if (Math.abs(a.length - b.length) > max) return over;
  if (a.length > MAX_LEN || b.length > MAX_LEN) return over;
  if (!a.length) return b.length <= max ? b.length : over;
  if (!b.length) return a.length <= max ? a.length : over;

  // Two rolling rows plus the row before them (needed for the swap case).
  let prev2: number[] = [];
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr: number[] = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowBest = curr[0];

    for (let j = 1; j <= b.length; j++) {
      const sub = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(
        curr[j - 1] + 1, // insertion
        prev[j] + 1, // deletion
        prev[j - 1] + sub // substitution
      );

      // Transposition: the two characters are each other's neighbours swapped.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d = Math.min(d, prev2[j - 2] + 1);
      }

      curr[j] = d;
      if (d < rowBest) rowBest = d;
    }

    // Every remaining row can only add to the best value on this one, so once
    // the whole row is over budget the final cell must be too.
    if (rowBest > max) return over;

    prev2 = prev;
    prev = curr;
    curr = new Array(b.length + 1);
  }

  const dist = prev[b.length];
  return dist > max ? over : dist;
}

/**
 * Edit budget for a search term.
 *
 * Nothing under 4 characters gets any tolerance: at 3 characters a single edit
 * reaches a large share of the dictionary ("pro" -> "pri"/"pre"/"par"), so
 * tolerance there produces noise rather than recall.
 */
export function editBudget(term: string): number {
  if (term.length < 4) return 0;
  if (term.length < 8) return 1;
  return 2;
}

/** Split text into comparable lowercase word tokens.
 *
 * Hyphenated and dotted words are indexed both split and squashed, so the
 * catalogue's "Wi-Fi" answers a search for "wifi" — which is how people
 * actually type it — as well as for "wi".
 */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const word of text.toLowerCase().split(/\s+/)) {
    const parts = word.split(/[^a-z0-9]+/i).filter(Boolean);
    if (!parts.length) continue;
    out.push(...parts);
    if (parts.length > 1) out.push(parts.join(""));
  }
  return out;
}

/**
 * Lowercase text with punctuation removed from inside each word, for substring
 * matching. Words stay separated so a query can never match across two
 * unrelated words.
 */
export function squash(text: string): string {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]+/gi, ""))
    .filter(Boolean)
    .join(" ");
}

/**
 * Does `term` match any token in `tokens`, allowing a typo?
 *
 * A term also matches when it is a prefix of a token, so search stays useful
 * while the shopper is still typing ("swi" -> "switch").
 */
export function fuzzyMatchesToken(term: string, tokens: string[]): boolean {
  const budget = editBudget(term);
  for (const tok of tokens) {
    if (tok.startsWith(term)) return true;
    if (budget > 0 && distanceToToken(term, tok, budget) <= budget) return true;
  }
  return false;
}

/**
 * Distance from `term` to `tok`, treating `term` as either the whole token or a
 * mistyped prefix of it.
 *
 * The prefix arm matters for a catalogue full of inflected words: "swich"
 * against "switching" is 4 apart as whole strings and would be rejected on
 * length alone, but it is 1 away from that token's opening — and a shopper
 * typing "swich" plainly wants switching products. Only the term's own opening
 * is compared, so the shared leading characters still anchor the match and a
 * short term cannot drift onto an unrelated long word.
 */
function distanceToToken(term: string, tok: string, budget: number): number {
  const whole = osaDistance(term, tok, budget);
  if (whole <= budget || tok.length <= term.length) return whole;
  if (term.length < MIN_PREFIX_LEN) return whole;

  let best = whole;
  // Never compare against a prefix shorter than the term itself: trimming the
  // term's own tail is not a typo, it is a different word. A typo can only
  // stretch the boundary outwards, by at most `budget` characters.
  const to = Math.min(tok.length, term.length + budget);
  for (let len = term.length; len <= to; len++) {
    const d = osaDistance(term, tok.slice(0, len), budget);
    if (d < best) best = d;
    if (best === 0) break;
  }
  return best;
}

/**
 * Closest token to `term`, or `null` when nothing is within budget. Used to
 * build the "Showing results for ..." correction.
 */
export function nearestToken(term: string, tokens: string[]): string | null {
  const budget = editBudget(term);
  if (budget === 0) return null;

  let best: string | null = null;
  let bestDist = budget + 1;

  for (const tok of tokens) {
    const d = distanceToToken(term, tok, budget);
    // Ties go to the more common token, which is whichever we saw first, since
    // callers build the vocabulary in catalogue order.
    if (d < bestDist) {
      bestDist = d;
      best = tok;
      if (d === 1) break; // cannot do better within budget
    }
  }

  return best;
}
