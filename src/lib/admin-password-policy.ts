// Password policy for staff / admin accounts.
//
// Staff hold the keys to orders, customer records and the device fleet, so they
// are held to a stricter standard than customers: 12 characters with mixed
// classes, no reuse of recent passwords, and a 90-day maximum age.
//
// The checks are deliberately self-contained rather than pulling in zxcvbn.
// zxcvbn is ~800KB of dictionaries, and the attack this defends against is an
// offline scrypt crack, where the wins come from length and class mixing rather
// than from a precise entropy estimate.
//
// Pure — safe to import from both server routes and client components, which is
// what lets the browser show the same failures the server will enforce.

/** Maximum password age. The owner asked for a 3-month rotation. */
export const MAX_PASSWORD_AGE_DAYS = 90;

/** Start warning this many days before expiry. */
export const PASSWORD_WARN_DAYS = 14;

/** How many previous passwords are remembered and rejected on reuse. */
export const PASSWORD_HISTORY_DEPTH = 5;

export const MIN_PASSWORD_LENGTH = 12;

/**
 * Upper bound. scrypt cost is linear in input length, so an unbounded field is
 * a cheap way to tie up the event loop.
 */
export const MAX_PASSWORD_LENGTH = 128;

/**
 * Passwords that show up at the top of every breach corpus, plus the ones this
 * deployment has actually seen. Compared against a normalised form so `P@ssw0rd`
 * and `Password1!` collapse onto `password`.
 */
const COMMON = new Set([
  "password", "passw0rd", "welcome", "admin", "administrator", "letmein",
  "qwerty", "qwertyuiop", "iloveyou", "monkey", "dragon", "sunshine",
  "princess", "football", "baseball", "superman", "trustno", "master",
  "shadow", "michael", "jennifer", "jordan", "harley", "ranger", "hunter",
  "buster", "soccer", "hockey", "killer", "george", "andrew", "charlie",
  "thomas", "robert", "access", "flower", "banana", "secret", "summer",
  "winter", "spring", "autumn", "changeme", "default", "temp", "test",
  "login", "root", "guest", "user", "hello", "freedom", "whatever",
  "abcdef", "abcd", "asdf", "zxcvbn", "qazwsx", "circuvent", "circuventtech",
]);

/** Keyboard rows and ordered runs used to reject predictable sequences. */
const SEQUENCES = [
  "abcdefghijklmnopqrstuvwxyz",
  "0123456789",
  "qwertyuiop",
  "asdfghjkl",
  "zxcvbnm",
  "!@#$%^&*()",
];

/** Leet-speak folding so substitutions do not defeat the dictionary check. */
function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[@4]/g, "a")
    .replace(/[3]/g, "e")
    .replace(/[1!|]/g, "i")
    .replace(/[0]/g, "o")
    .replace(/[5$]/g, "s")
    .replace(/[7]/g, "t")
    .replace(/[8]/g, "b")
    .replace(/[^a-z]/g, "");
}

/** True when the password walks 4+ characters along a keyboard row or alphabet. */
function hasSequence(password: string): boolean {
  const lower = password.toLowerCase();
  for (const seq of SEQUENCES) {
    const reversed = [...seq].reverse().join("");
    for (const source of [seq, reversed]) {
      for (let i = 0; i + 4 <= source.length; i++) {
        if (lower.includes(source.slice(i, i + 4))) return true;
      }
    }
  }
  return false;
}

/** True when any character repeats 3+ times in a row ("aaa", "111"). */
function hasRun(password: string): boolean {
  return /(.)\1{2,}/.test(password);
}

/**
 * Tokens derived from the account's own identity. A password built from the
 * user's name or address survives a class check but dies instantly to a
 * targeted guess.
 */
function identityTokens(identity: PasswordIdentity): string[] {
  const out: string[] = [];
  const local = (identity.email || "").split("@")[0] || "";
  const domain = ((identity.email || "").split("@")[1] || "").split(".")[0] || "";
  for (const raw of [local, domain, identity.name || ""]) {
    for (const part of raw.split(/[^A-Za-z0-9]+/)) {
      const t = normalise(part);
      if (t.length >= 4) out.push(t);
    }
  }
  return out;
}

export interface PasswordIdentity {
  email?: string;
  name?: string;
}

export interface PasswordCheck {
  ok: boolean;
  errors: string[];
  /** 0-4, for a strength meter. Only meaningful once `ok` is true. */
  score: number;
  label: "Too weak" | "Weak" | "Fair" | "Strong" | "Excellent";
}

const LABELS: PasswordCheck["label"][] = ["Too weak", "Weak", "Fair", "Strong", "Excellent"];

/**
 * Validates a candidate password. Returns every failure at once rather than the
 * first, so the form can show a complete checklist instead of making the user
 * resubmit to discover the next rule.
 */
export function checkPassword(password: string, identity: PasswordIdentity = {}): PasswordCheck {
  const errors: string[] = [];
  const pw = password || "";

  if (pw.length < MIN_PASSWORD_LENGTH) {
    errors.push(`Use at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (pw.length > MAX_PASSWORD_LENGTH) {
    errors.push(`Use at most ${MAX_PASSWORD_LENGTH} characters`);
  }
  if (!/[a-z]/.test(pw)) errors.push("Add a lowercase letter");
  if (!/[A-Z]/.test(pw)) errors.push("Add an uppercase letter");
  if (!/[0-9]/.test(pw)) errors.push("Add a number");
  if (!/[^A-Za-z0-9]/.test(pw)) errors.push("Add a symbol");
  if (/\s/.test(pw)) errors.push("Remove spaces");
  if (hasRun(pw)) errors.push("Avoid repeating a character three times");
  if (hasSequence(pw)) errors.push("Avoid keyboard or alphabet sequences");

  const flat = normalise(pw);
  for (const common of COMMON) {
    if (flat.includes(common)) {
      errors.push("Avoid common words like “password” or “admin”");
      break;
    }
  }
  for (const token of identityTokens(identity)) {
    if (flat.includes(token)) {
      errors.push("Do not reuse your name or email address");
      break;
    }
  }

  // Score rewards the two properties that actually slow an offline crack:
  // length and the size of the character set.
  let score = 0;
  if (pw.length >= MIN_PASSWORD_LENGTH) score++;
  if (pw.length >= 16) score++;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (classes >= 3) score++;
  if (classes === 4 && pw.length >= 14) score++;
  if (errors.length) score = Math.min(score, 1);

  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    score,
    label: LABELS[Math.min(score, 4)],
  };
}

export interface PasswordAge {
  /** ISO timestamp of the last change, when known. */
  changedAt: string | null;
  /** ISO timestamp at which the password stops being accepted. */
  expiresAt: string | null;
  daysLeft: number;
  expired: boolean;
  /** Inside the warning window but not yet expired. */
  expiringSoon: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Computes rotation status.
 *
 * A missing `passwordChangedAt` means the account predates this policy. It
 * falls back to `createdAt`, and if that is missing too the password is treated
 * as expired — failing closed, because an unknown age on a staff credential is
 * exactly the case rotation exists to catch.
 */
export function passwordAge(user: {
  passwordChangedAt?: string;
  createdAt?: string;
  mustChangePassword?: boolean;
}): PasswordAge {
  const stamp = user.passwordChangedAt || user.createdAt || null;
  const parsed = stamp ? Date.parse(stamp) : NaN;

  if (!Number.isFinite(parsed)) {
    return { changedAt: null, expiresAt: null, daysLeft: 0, expired: true, expiringSoon: false };
  }

  const expiresMs = parsed + MAX_PASSWORD_AGE_DAYS * DAY_MS;
  const daysLeft = Math.ceil((expiresMs - Date.now()) / DAY_MS);
  const expired = daysLeft <= 0 || !!user.mustChangePassword;

  return {
    changedAt: new Date(parsed).toISOString(),
    expiresAt: new Date(expiresMs).toISOString(),
    daysLeft: Math.max(0, daysLeft),
    expired,
    expiringSoon: !expired && daysLeft <= PASSWORD_WARN_DAYS,
  };
}

/** Cryptographically strong suggestion that satisfies every rule above. */
export function suggestPassword(randomBytes: (n: number) => Uint8Array, length = 20): string {
  const sets = [
    "abcdefghijkmnopqrstuvwxyz",
    "ABCDEFGHJKLMNPQRSTUVWXYZ",
    "23456789",
    "!@#$%^&*-_=+?",
  ];
  const all = sets.join("");
  const pick = (pool: string, byte: number) => pool[byte % pool.length];

  for (let attempt = 0; attempt < 20; attempt++) {
    const bytes = randomBytes(length);
    // Seed one character per class so the class requirements cannot fail.
    const chars = sets.map((pool, i) => pick(pool, bytes[i]));
    for (let i = sets.length; i < length; i++) chars.push(pick(all, bytes[i]));

    // Shuffle so the seeded characters are not always in the first four slots.
    const order = randomBytes(length);
    for (let i = chars.length - 1; i > 0; i--) {
      const j = order[i] % (i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }

    const candidate = chars.join("");
    if (checkPassword(candidate).ok) return candidate;
  }
  // Unreachable in practice; keeps the return type honest.
  return "";
}
