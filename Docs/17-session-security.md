# 17 — Session security

How a session is established, how long it lasts, and — the part that did not
exist until recently — how one is ended early.

---

## 1. The problem this solves

Sessions are JWTs. A JWT is a signed claim, not a server-side record, so the
API can verify one without touching the database. That is fast, and it is why
the design was chosen. It also means that on its own **nothing can withdraw a
token before it expires**.

On a platform that opens doors and gates, that produced four concrete failures:

| Situation | What actually happened |
| --- | --- |
| Phone lost or stolen | Whoever held it kept full control of the owner's devices for the remaining token lifetime — up to 30 days. |
| Admin disables an account | Nothing. There was no disable, and the token kept working. |
| Admin deletes an account | The token still authenticated. `DELETE /admin/users/:id` worked around this for device commands only — its own comment says so — leaving the deleted account able to read events and mint gate passes. |
| User wants to sign out other devices | No such capability existed. |

Rotating `JWT_SECRET` was the only lever, and it signs out **every user on the
platform** — a blast radius so large it is not usable for a single lost phone.

---

## 2. How revocation works

Each account carries a counter:

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_epoch BIGINT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked     BOOLEAN NOT NULL DEFAULT false;
```

Every token is stamped with the account's epoch at the moment it is minted (the
`te` claim). `requireAuth` compares the claim against the current value:

```
token te <  users.token_epoch   ->  401  session ended
users.blocked                   ->  403  account disabled
no such user                    ->  401  unauthorized
otherwise                       ->  allowed
```

Bumping `token_epoch` therefore invalidates **every token that account has ever
been issued**, immediately, with no server-side session store to maintain.

### Deploying it did not sign anyone out

Tokens minted before this existed carry no `te` claim. `verifyUserToken` reads a
missing claim as `0`, and the column defaults to `0`, so they stay valid — and
become revocable from the first bump onward. This is deliberate and tested
(`auth.test.ts`, "admits a legacy token…" / "refuses a legacy token once the
account has revoked").

### Minting is async on purpose

`signUserToken` reads the current epoch itself rather than accepting one as an
argument. It could have stayed synchronous, but then every future caller would
have to remember to pass the epoch, and one that forgot would mint a token that
silently ignores revocation forever. Making it impossible to get wrong is worth
an `await`.

---

## 3. The three ways to end a session

| Who | Endpoint | Effect |
| --- | --- | --- |
| The user | `POST /auth/sign-out-all` | Ends their own sessions. Returns a **fresh token** so the device making the request stays signed in — what people mean by "sign out my other devices". |
| An admin | `POST /admin/users/:id/revoke-sessions` | Ends someone else's sessions. The account stays active and can sign in again — the right action for a lost phone. |
| An admin | `PATCH /admin/users/:id` with `{"blocked": true}` | Disables the account **and** revokes its sessions. They cannot sign in again until re-enabled. |

Blocking is enforced in two places, deliberately:

- `requireAuth` rejects existing tokens with **403**, not 401 — a 401 invites
  the client to sign in again, which a disabled account cannot usefully do.
- `POST /auth/login` refuses after verifying the password, so a wrong password
  on a disabled account still reads as "invalid credentials" and does not reveal
  that the account exists.

All three are available in the console under **Admin → Access & Users**.

---

## 3a. Passwords

Revocation and passwords only work as a pair. Each alone is close to useless:

- Ending sessions while someone else knows the password just means they sign
  back in.
- Changing the password while their session stays alive means they never had to.

So every password path revokes sessions as part of the same operation.

| Endpoint | Auth | Behaviour |
| --- | --- | --- |
| `POST /auth/change-password` | Yes | Verifies the current password, stores the new one, revokes **all** sessions, returns a replacement token so the caller stays signed in. |
| `POST /auth/forgot-password` | No | Emails a 6-digit code. **Always answers identically**, whether or not the address has an account. |
| `POST /auth/reset-password` | No | Redeems the code, sets the password, revokes all sessions, signs in. |

Details worth preserving if this is edited:

- **`forgot-password` is not an account oracle.** Unknown address, disabled
  account, malformed input and internal error all return the same body and
  status. A different answer for any of them would let anyone enumerate
  customers, and the endpoint needs no authentication to reach.
- **Disabled accounts cannot self-recover.** No reset code is issued, and a code
  issued before the account was disabled is refused at redemption.
- **Codes are stored only as bcrypt hashes**, in their own `password_resets`
  table. It is separate from `pending_registrations` on purpose: one holds an
  account that does not exist yet, the other proves control of an address for
  an account that does, and sharing the table would let a reset overwrite a
  sign-up in progress.
- **Codes are bounded and single-use** — six attempts, hard expiry at
  `OTP_TTL_MIN`, and the row is destroyed on success so a code cannot be
  replayed.
- The reset email is **worded differently from the sign-up code**, so someone
  who receives one they did not request recognises what it is rather than
  reading a generic "verification code" and assuming it is routine.

In the apps: **Settings → Account → Password** for a signed-in change and
"sign out all other devices"; **Forgot your password?** on the console sign-in
screen for the reset flow.

---

## 4. Performance, and the caching caveat

`requireAuth` runs on every authenticated request and used to be pure signature
verification. An unconditional database read would be new latency on the hot
path, so session state is memoised for **5 seconds** — the same approach, and
the same interval, as `ownership.ts`.

Consequences worth knowing:

- A revocation takes effect **immediately in the process that performed it**
  (every mutating path calls `invalidateUser`), and within 5 seconds elsewhere.
- The cache is **process-local**. If the API is ever scaled past one replica,
  this must move to Redis or the TTL must drop to zero — invalidation does not
  cross process boundaries. This is the same constraint already documented for
  `ownershipCache` and for the automation scheduler in
  [14 — Scaling](./14-scaling.md).
- A deleted account is **never** cached as valid, so it cannot be served from a
  stale entry.

### Failing closed

If the database is unreachable, `requireAuth` returns **401**. Letting requests
through during an outage would quietly re-enable every revoked and blocked token
for its duration. There is a test named for exactly this, because it is the kind
of behaviour someone later "fixes" for availability without realising what it
costs.

---

## 5. Token lifetime

`JWT_EXPIRES_IN` defaults to **30 days**.

That is long, and it stays long on purpose: with revocation available, the
expiry is now a ceiling on an *undetected* compromise rather than the only
control. Shortening it to hours would sign people out of their home constantly
and buys little that `sign-out-all` does not already buy. Shorten it if the
threat model changes — a fleet of shared or kiosk devices, say.

The genuinely missing piece is **refresh-token rotation**: short access tokens
plus a rotating refresh token would detect replay, which epochs do not. That is
a larger change and has not been made.

---

## 6. Running the tests

The control-plane API had no tests at all before this work. It now uses Node's
built-in runner via `tsx` — no new dependencies:

```bash
cd platform/api
npm test          # 52 tests
npm run typecheck
```

`scripts/run-tests.mjs` walks `src/` for `*.test.ts` and passes explicit paths,
because Node 20 only auto-discovers JavaScript test files and npm scripts do not
glob consistently across cmd.exe and sh. It **exits non-zero when it finds
nothing**, so a rename cannot turn the suite into a green no-op.

Tests set their environment through `src/test-env.ts`, imported first for its
side effect: `config.ts` validates the environment at import time and calls
`process.exit(1)` when it is incomplete, which would otherwise kill the runner
before a single assertion ran. No database is involved — `pg` opens no
connection until a query is issued, and every test replaces `pool.query`.

---

## 7. What else this review changed

Found while reading the deployment rather than the application code:

- **`FEDERATION_SECRET` could never be set.** `config.ts` reads it and
  `POST /auth/federated` returns 501 without it, but it was missing from the
  `environment:` block in `docker-compose.yml` **and** from `.env.example`.
  Compose only passes variables it lists, so shop → console single sign-on was
  unfixable by configuration — putting it in `.env` did nothing. Both are fixed.
- **Container logs were unbounded.** Docker's default `json-file` driver grows
  without limit; on a small VM that eventually fills the disk, at which point
  Postgres stops accepting writes and the broker stops persisting. Now capped
  and rotated (10 MB × 5) for every service.
- **No healthchecks** on the broker or the API, so a hung process was left
  accepting TCP while serving nothing. Both now have one.
- **No broker connection ceiling.** A firmware bug that reconnects in a tight
  loop could exhaust file descriptors and take the broker down for the whole
  fleet. `max_connections 2000` and a 256 KB `message_size_limit` now bound it,
  and connection logging makes flapping devices and credential probes visible
  after the fact.
- **`CORS_ORIGIN` shipped as `*`** in the template. The API authenticates with
  bearer tokens rather than cookies, so this was not by itself credential theft
  — a page cannot read another origin's localStorage — but there is no reason to
  publish the surface. The template now names an origin.

---

## 8. Known gaps

- **No refresh-token rotation** (see §5).
- **Rate limiting is per process**, like the session cache.
- **Devices authenticate with username/password over TLS, not mutual TLS**
  (`require_certificate false`). Reasonable for ESP32-class hardware, and the
  Dynamic Security plugin scopes each device to its own `cv/<deviceId>/#`
  topics, but it is worth knowing that a leaked device credential is not
  bound to a certificate.
- **The broker CA is embedded in firmware.** Rolling it over needs an OTA
  pushed *before* the old CA expires — the longest-lead-time risk in the system.
