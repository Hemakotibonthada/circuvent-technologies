# Circuvent Developer API

The public REST API and webhook system that lets a third party integrate Circuvent
devices into their own dashboard.

Published documentation: <https://circuvent.com/developers>
OpenAPI 3.1 document: `WebSite/public/openapi.json`, served at `/openapi.json`.

This file is the implementation reference — what exists, where it lives, and why it
was built the way it was. The published page is the user-facing version.

---

## Why this exists separately from the console API

Before this, the only credential the platform issued was a login JWT. That is the
wrong instrument for a third party:

- it expires in `JWT_EXPIRES_IN` (30 days), so every integration breaks on a schedule;
- it is minted from an email + password, so a developer would have to store the
  account password to keep it alive;
- "sign out everywhere" bumps `token_epoch`, which would silently kill an unrelated
  production integration;
- it carries every permission the account has, with no way to narrow it.

And the routes under `/devices`, `/scenes` and the rest exist to serve our own console
and app. They change whenever those change. That is fine while we ship both sides
together; it stops being fine the moment somebody else's production dashboard depends
on the response shape.

So `/v1` is a deliberate, narrow projection with its own response shapes, and API keys
are a separate credential type.

---

## Files

| Path | Purpose |
| --- | --- |
| `src/api-keys.ts` | Key mint / hash / verify, scopes, origin policy, verification cache |
| `src/api-auth.ts` | `requireApiAccess(scope)` middleware and `developerCors` |
| `src/routes/v1.ts` | The public versioned surface |
| `src/routes/developer.ts` | Key + webhook management (session-authenticated only) |
| `src/webhooks.ts` | Signing, SSRF guard, dispatch, failure back-off |
| `src/api-keys.test.ts` | 43 tests covering all of the above |
| `src/db.ts` | `api_keys` and `webhooks` tables |

Console UI: `WebSite/src/app/smarthome/settings/ApiKeysPanel.tsx`
Client methods: `WebSite/src/lib/control-plane.ts`

---

## Credential model

```
cvk_live_<43 chars base64url>     32 bytes of CSPRNG output = 256 bits
cvk_test_<43 chars base64url>     same strength; the marker is a label, not a sandbox
```

Stored as **SHA-256**, not bcrypt. Passwords and device claim keys use bcrypt because
they are low-entropy and the per-row salt is what makes a stolen table useless. An API
key is 256 bits of randomness — there is no dictionary to attack, so the salt buys
nothing, and it would cost the lookup: bcrypt's per-row salt means you cannot
`SELECT ... WHERE token_hash = $1`, so authenticating would become a full table scan
plus a bcrypt compare per row. `refresh_tokens` documents the same trade-off.

`prefix` (first 17 chars) is stored in the clear so keys can be told apart in a list.
It is not long enough to authenticate — there is a test asserting exactly that.

### The privilege boundary

Everything in `routes/developer.ts` uses `requireAuth`, **never** `requireApiAccess`.
If a key could reach those endpoints the scope system would be decorative: a leaked
`devices:read` key would simply issue itself a `devices:control` one.

Also JWT-only, for the same reason: device provisioning/claim/unclaim, account and
session endpoints, and everything under `/admin`.

### Revocation

`revoked_at` is set rather than the row deleted, so `last_used_at` and `request_count`
survive — after revoking a key because something looked wrong, the first question is
always what it had been doing.

Verified keys are memoised for `KEY_CACHE_TTL_MS` (5 s), so **every revocation path
must call `invalidateKeyCache(hash)`**. The cache is process-local; scaling past one
replica means moving it to Redis or dropping the TTL to zero. This is the same caveat
`ownership.ts` and `sessions.ts` carry.

An account's `blocked` flag is joined into verification, so disabling somebody stops
their keys too.

---

## Scopes

Defined once in `API_SCOPES`; `SCOPE_DESCRIPTIONS` is exported so the console, the
`/v1` index and the docs render the same text the server enforces.

```
devices:read       devices:control    devices:write
telemetry:read     rooms:read
scenes:read        scenes:run
automations:read   automations:write
events:read
```

Scopes do **not** imply one another. `devices:read` does not confer
`devices:control` — asserted by test.

---

## Browser keys and what the origin allowlist really does

`allowed_origins` empty → any request carrying an `Origin` header is refused. Failing
closed here is deliberate: pasting a server key into front-end code should break
loudly rather than quietly publish the credential.

With origins registered, the key works from those origins and CORS echoes them.

**Be honest about the guarantee.** `Origin` is set by the browser and cannot be forged
by page JavaScript, so this genuinely stops somebody embedding a scraped key into a
page on their own domain. It is *not* a defence against a server-side caller — curl
can send any origin. A key shipped to a browser is public; grant it `devices:read` and
nothing more. The published docs say this in the same words.

`developerCors` answers preflights permissively and checks the origin on the real
request. That ordering is forced: an `OPTIONS` preflight carries no `Authorization`
header, so there is no key to check it against. It is safe because passing a preflight
only earns the browser the right to send the real request, which must then present a
key whose `allowed_origins` include it.

---

## Rate limiting

`/v1` is excluded from the global per-IP limiter and gets its own bucket of **600/min
keyed by a hash of the API key**. An integration runs from one server, so per-IP
counting would make one busy customer throttle themselves while telling us nothing
about who was spending the budget. The bucket key is hashed because rate-limiter state
is held in memory and shows up in dumps.

---

## Webhooks

`device.state` · `device.telemetry` · `device.online` · `device.offline`

Signature: `X-Circuvent-Signature: t=<unix>,v1=<hex hmac>` over `"<t>.<raw body>"`.
The timestamp is inside the signed material, not merely alongside it, so a captured
delivery cannot be replayed later with a fresh timestamp.

The `secret` column is plaintext, unusually and on purpose: unlike an API key it is
not a credential that authenticates anyone *to us*. We are the party that must compute
the HMAC on every delivery, so a one-way hash would make it useless.

### SSRF

A webhook URL is attacker-chosen by definition — any signed-up account can set one —
and the server fetches it. `isPublicUrl()` requires https, resolves the hostname, and
rejects any resolved address that is loopback, private, link-local (including the
`169.254.169.254` cloud metadata endpoint), CGNAT or multicast. DNS is resolved and
the **addresses** are checked, not just the hostname, because a hostname an attacker
controls can have an A record pointing at 127.0.0.1. `redirect: "error"` stops a 302
from defeating the check.

A DNS-rebinding window remains between check and fetch. Closing it fully means pinning
the connection to the validated address, which Node's `fetch` does not expose. The
practical mitigations: deliveries are POST-only with a signed body, and the response
is never shown to the user — only the status code is stored — so a rebind yields a
blind request rather than a read primitive.

### Failure handling

5 s timeout. 20 consecutive failures disables the webhook: a dead endpoint would
otherwise burn a socket and five seconds per device message, forever. Re-enabling via
`PATCH { enabled: true }` resets the counter.

Delivery never blocks the MQTT hot path, and the in-flight queue is capped at 500 —
dropping is the right failure for a best-effort notification of a state that
`/v1/devices` can always re-read.

Two caches keep the dispatcher off Postgres: `hookOwners` (accounts that have any
enabled webhook, refreshed every 30 s) and `ownerCache` (device → owner). Without the
first, every state publish from every device in the fleet would run a `SELECT` to
discover, almost always, that there is nothing to deliver. Call
`refreshWebhookOwners()` after any webhook mutation.

---

## Response conventions

- Errors carry a human `error` and a **stable** `code`. Clients branch on the code.
- `POST /v1/devices/{id}/commands` returns **202**, not 200 — the broker has accepted
  the command, the relay has not necessarily closed.
- Command bodies are forwarded to the device unvalidated. What a board accepts is
  defined by its firmware, which ships independently of this API; a whitelist here
  would silently block every new capability until somebody updated it.
- A resource owned by another account returns **404, not 403** — a 403 would confirm
  the id exists.
- `deviceShape()` is the single place that decides what a device looks like on the
  wire. Do not build it inline in a handler, or the list and detail endpoints drift.

### Routes must never hang

Every `/v1` route is registered through the local `route.{get,post,patch}` helper,
which wraps the handler in `safe()`. **Do not call `v1Router.get(...)` directly.**

Express 4 does not catch rejections from async handlers: the promise rejects, no
response is written, and the caller waits until its own timeout. That is the worst
failure we could hand a developer — an integration that stops responding rather than
returning something it can retry or alert on.

It is reachable in ordinary operation. `publishCommand` throws `MQTT not connected`
whenever the broker is restarting, which `index.ts` explicitly plans for ("the API
stays up even if the broker is briefly unavailable"). Without the wrapper that plan
produces a hung POST instead of a 503. The terminal error handler translates that
specific message into `503 broker_unavailable`, because "retry shortly" is actionable
in a way a generic 500 is not. There is a test asserting the 503 rather than a hang.

The same defect existed in the console routes and is fixed the same way, in
`routes/devices.ts` (`POST /devices/:id/command`) and `routes/scenes.ts`
(`POST /scenes/:id/activate`) — a broker restart used to leave the app's toggle
spinning until its own timeout. Scene activation reports how many commands did go out
before it failed rather than claiming the whole scene ran.

### Compatibility promise

Stated publicly, so it is a promise to developers and not just a note to ourselves:

- fields are added, never removed or retyped within a version;
- unknown fields in a request body are ignored, not rejected;
- a breaking change means `/v2`, with `/v1` kept working.

---

## Adding an endpoint

1. Add it to `routes/v1.ts` with `requireApiAccess(<scope>)`.
2. If it needs a new scope, add it to `API_SCOPES` **and** `SCOPE_DESCRIPTIONS` —
   the type will not compile otherwise, which is the point.
3. Add it to the `endpoints` array in the `GET /v1` index.
4. Add it to `public/openapi.json`.
5. Add it to the `ENDPOINTS` table in `src/app/developers/page.tsx`.
6. Add a test.

Steps 3–5 are three copies of the same list, which is a known wart. They are small and
rarely change; a generator would be more machinery than the problem deserves today.
If it starts drifting, generate all three from `API_SCOPES` and a route manifest.

---

## Testing

```bash
cd platform/api && npm test
```

`src/api-keys.test.ts` covers key format and entropy, prefix non-authentication,
scope isolation, revoked/expired/blocked refusal, cache invalidation on revoke,
fail-closed on database error, origin policy (including exact scheme/host/port
matching and the suffix-confusion case), webhook signature verification against the
recipe published in the docs, replay resistance, and the SSRF address table.

`src/v1.test.ts` boots the real router over a socket and speaks HTTP to it, because
unit-testing the middleware does not prove the router is wired up — a mount typo or a
response shape that drifts from the OpenAPI document would pass unit tests and fail
the first real request. It pins the `Device` field names, asserts 202 (not 200) on
commands and that the payload reaches `cv/<id>/cmd` unchanged, 404 (not 403) for
another account's device, and 503 (not a hang) when the broker is down.

Note the `after` hook calls `server.closeAllConnections()`. Node's `fetch` keeps
sockets alive in a pool, so `server.close()` alone waits on idle connections and the
test process never exits.
