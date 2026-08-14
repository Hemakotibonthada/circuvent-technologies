# 11 — Secrets

Every credential, where it lives, what it protects, and how to rotate it.

**No secret values appear in this document, or anywhere in the repository.**
`.env.local`, `platform/.env` and `.vercel/` are gitignored. Keep it that way.

## Where secrets live

| Store | Holds |
| --- | --- |
| Vercel project environment variables | Everything the website needs |
| `platform/.env` on the VM | Everything the control plane needs |
| Neon | Database credentials, embedded in `DATABASE_URL` |
| The signing keystore | `mobile/credentials/circuvent-upload.jks` |

Vercel will not return an encrypted value to anyone — not the dashboard, not the
CLI. `vercel env pull` returns **empty strings** for encrypted variables. If you
lose a secret, you rotate it; you do not recover it.

## Website secrets (Vercel)

Scoped per environment. Production values must never be scoped to Preview.

### Signing secrets

| Variable | Protects | Notes |
| --- | --- | --- |
| `ACCOUNT_SECRET` | Customer session tokens | **Required in production.** `src/lib/secrets.ts` enforces a 32-character minimum and throws below it |
| `ADMIN_SECRET` | Staff sessions | Optional; falls back to `ACCOUNT_SECRET` |
| `JWT_SECRET` | Legacy/API tokens | Separate value per environment |
| `SESSION_SECRET` | Session state | Separate value per environment |
| `CRON_SECRET` | Vercel Cron endpoints | Sent as a bearer token by Vercel |

> A short secret surfaces as an opaque **400 "Invalid request"**, not a clear
> error, because `next start` sets `NODE_ENV=production` and `secrets.ts` throws.
> If a route starts failing with an unhelpful 400 after a config change, check
> secret length first.

Generate one:

```bash
openssl rand -base64 48
```

### Data and payments

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Neon. **Production-only.** Dev has its own |
| `PROD_DATA_HOSTS` | Not a secret — hosts only production may use. Set on every target |
| `PROD_IDENTITY_HOSTS` | Not a secret — control-plane hosts only production may authenticate against. Set on every target. **Until this is set, a preview deployment can sign in real customers against the live fleet** — see [05 — Databases](./05-databases.md#the-identity-isolation-guard) |
| `CONTROL_PLANE_URL` | Which fleet this deployment is paired with. Defaults to production, which is why the guard above matters off production |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Live keys are production-only; dev needs **test-mode** keys |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | As above |
| `MONGODB_URI` | Production-only |

### Communications

`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`,
`EMAIL_USER`, `EMAIL_PASSWORD`, `EMAIL_FROM`, `EMAIL_REPLY_TO`,
`RESEND_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
`TWILIO_PHONE_NUMBER`, `TWILIO_VERIFY_SERVICE_SID`.

Credentials (`*_PASS`, `*_SECRET`, `*_TOKEN`, `*_KEY`, `SMTP_USER`,
`EMAIL_USER`) are **production-only**. Dev must not be able to email or text real
customers. Host and port are harmless to share.

### Other

`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`,
`GITHUB_TOKEN`, `OPENAI_API_KEY`, the `NEXT_PUBLIC_CV365_FIREBASE_*` values.

`NEXT_PUBLIC_*` variables are **inlined into the client bundle** and are public
by definition. Never put a secret behind that prefix.

## Control-plane secrets (`platform/.env`)

| Variable | Protects |
| --- | --- |
| `POSTGRES_PASSWORD` | The database; also embedded in the API's `DATABASE_URL` |
| `MQTT_CONTROL_PLANE_PASSWORD` | The broker account with `cv/#` access |
| `JWT_SECRET` | User and provisioning tokens. Minimum 16 characters, validated at boot |
| `SMARTHOME_CLIENT_SECRET` | Alexa / Google account linking |
| `SMTP_*` / `RESEND_API_KEY` | OTP delivery |
| `FEDERATION_SECRET` | The shop ↔ console SSO bridge |

Generate:

```bash
openssl rand -base64 24
```

The API validates its configuration with Zod at boot and **exits** on failure, so
a bad value produces a container that will not start rather than one that half
works.

## The federation secret

`FEDERATION_SECRET` must be set to the **same value** in Vercel and in
`platform/.env`.

It authenticates a server-to-server call: the shop signs `<timestamp>.<email>`
with HMAC-SHA256 and the control plane verifies it in constant time, rejecting
anything outside a five-minute window.

**Anyone holding this secret can mint a session for any email address.** It must
never reach a browser. It is read only in `src/lib/sso.ts` (server-only) and in
`platform/api/src/routes/auth.ts`. An empty value disables `/auth/federated`
entirely, so a deployment that has not configured federation cannot be talked
into issuing sessions.

## Device secrets

Each device has a key, generated at provisioning. The **hash** is stored in
`devices.key_hash` (bcrypt, cost 10); the plaintext is returned exactly once and
registered with the broker via Dynamic Security.

There is no way to recover a device key. If it is lost, delete the device and
re-provision.

## The Android signing key

`mobile/credentials/circuvent-upload.jks` — subject
`CN=Circuvent Technologies, OU=Mobile, O=Circuvent, L=Hyderabad, ST=Telangana, C=IN`.

**If this file is lost, you cannot ship an update to an existing install.** Back
it up somewhere other than this repository. Verify every release was signed with
it:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\build-tools\30.0.3\apksigner.bat" `
  verify --print-certs <apk> | Select-String "certificate DN"
```

## Rotation

### Website signing secret

1. Generate a new value; set it in Vercel for the target environment only.
2. Redeploy — environment changes take effect on the **next build**, not
   immediately.
3. Every existing session is invalidated. Users sign in again.

### Control-plane `JWT_SECRET`

Same, plus: every app and console session drops, and every 15-minute provisioning
token in flight becomes invalid. Rotate when nobody is mid-setup.

### `POSTGRES_PASSWORD`

Changing it in `.env` alone will **not** change the password inside an existing
`pgdata` volume. Change it in Postgres first:

```bash
docker compose exec postgres psql -U circuvent -c "ALTER USER circuvent PASSWORD 'new';"
# then update .env and
docker compose up -d
```

### Payment and messaging keys

Rotate in the provider's dashboard, then update Vercel and redeploy. Update the
webhook secret at the same time, or webhooks will start failing signature checks.

## Incident checklist

If a secret leaks:

1. Rotate it immediately — do not wait to assess.
2. Payment keys: rotate in the provider dashboard **first**, so the old key stops
   working before you update the config.
3. `FEDERATION_SECRET`: rotate on **both** sides together; the bridge is down in
   between, which is the safe failure.
4. Device keys: delete and re-provision affected devices.
5. Signing keystore: this cannot be rotated. Existing installs are permanently
   tied to it. Contact Google Play support about key upgrade.
