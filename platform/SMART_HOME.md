# Circuvent × Google Home & Alexa — Production (multi-tenant) integration

**This is NOT per-device and NOT per-customer setup.** You (Circuvent) build and
**publish ONE Google Home Action and ONE Alexa Smart Home skill**. After that,
**any** of your customers just opens their Google Home / Alexa app, searches for
**“Circuvent”**, taps *Link account*, signs in with **their own** Circuvent
account, and their devices appear. You never touch a console again per user.

```
                    ┌─────────────────────────────────────────┐
   Millions of      │  ONE published Google Action             │
   end users  ─────▶│  ONE published Alexa skill               │
   (each links      │            │  OAuth2 account linking      │
    their own       │            ▼                              │
    account)        │  api.circuvent.com/oauth/authorize|token  │
                    │            │                              │
                    │            ▼  Bearer = that user's identity│
                    │  /smarthome/google  &  /smarthome/alexa    │
                    │            │  → only that user's devices   │
                    └────────────┼──────────────────────────────┘
                                 ▼
                         MQTT broker → each user's ESP32 devices
```

Why it already works for everyone: the fulfillment endpoints resolve the
**OAuth access token → a specific Circuvent user id** and return/act on only
**that** user's devices (see `routes/smarthome.ts` → `ownerDevices(uid)`). The
same published integration therefore serves every customer, each scoped to
their own account. Nothing is hard-coded to one device or one person.

---

## 0. One-time server facts (already live)

| Purpose | Value |
| --- | --- |
| Authorization URL | `https://api.circuvent.com/oauth/authorize` |
| Token URL | `https://api.circuvent.com/oauth/token` |
| Google fulfillment | `https://api.circuvent.com/smarthome/google` |
| Alexa fulfillment | Lambda → `https://api.circuvent.com/smarthome/alexa` |
| OAuth Client ID | `circuvent-smarthome` |
| OAuth Client Secret | `SMARTHOME_CLIENT_SECRET` in the VM `~/circuvent-platform/.env` |
| Privacy policy (required to publish) | `https://circuvent.com/privacy` |

Read the secret: `ssh ubuntu@140.245.238.154 "grep SMARTHOME_CLIENT ~/circuvent-platform/.env"`

Prerequisites to publish (both platforms require these):
- A **public privacy policy URL** and **terms** (host at circuvent.com/privacy).
- **Brand assets**: app name “Circuvent”, a square logo (≥ 512px), short/long
  description, support email.
- **Reviewer test account**: create a Circuvent account with one or two
  provisioned (or simulated) devices and give the credentials to the reviewer.

---

## 1. Google Home — publish the Action (any user can then link)

1. <https://console.actions.google.com> → your **Circuvent** Smart Home project.
2. **Develop → Account linking** (OAuth / Authorization code): Client ID
   `circuvent-smarthome`, the secret, the Authorization + Token URLs above,
   scope `control`.
3. **Develop → Actions**: Fulfillment URL `https://api.circuvent.com/smarthome/google`.
4. **Deploy → Directory information**: fill display name, descriptions, logos,
   privacy policy, support email, and the **test account** credentials.
5. **Deploy → Release**: submit for **Production** review. Google verifies
   account-linking + brand. Once approved, **every** user sees *Works with
   Google → Circuvent* and links their own account. (Before approval, add
   testers under **Test** to trial it.)

Google calls your HTTPS fulfillment directly — **no AWS needed** for Google.

---

## 2. Alexa — certify & publish the Smart Home skill

Alexa **requires an AWS Lambda** as the skill endpoint (it does not call a raw
HTTPS URL). The Lambda is a ~15-line pass-through to our fulfillment.

1. **Lambda** (Node 20, region us-east-1 for EN-US, eu-west-1 for EU/IN):
   ```js
   // index.mjs — Alexa Smart Home → Circuvent proxy
   export const handler = async (event) => {
     const r = await fetch("https://api.circuvent.com/smarthome/alexa", {
       method: "POST",
       headers: { "content-type": "application/json" },
       body: JSON.stringify(event),
     });
     return await r.json();
   };
   ```
   Add an **Alexa Smart Home** trigger with your Skill ID; copy the Lambda ARN.
2. <https://developer.amazon.com/alexa/console/ask> → **Circuvent** (Smart Home).
   - **Smart Home → Default endpoint** = the Lambda ARN.
   - **Account Linking**: Auth URI + Access Token URI above, Client ID
     `circuvent-smarthome`, the secret, scope `control` (HTTP Basic or body creds
     — our `/oauth/token` accepts both).
3. **Distribution**: publishing name “Circuvent”, descriptions, icons (108 & 512),
   category *Smart Home*, privacy policy, testing instructions + the reviewer
   **test account**.
4. **Certification → Submit**. After Amazon certifies, the **Circuvent** skill is
   public — any user enables it and links their own account.

---

## 3. What each customer does (zero console work)

1. Buy + set up a Circuvent device in the Circuvent app (creates their account).
2. Google Home app → **+ → Works with Google → Circuvent** → sign in → done.
   Alexa app → **Skills → Circuvent → Enable → Link account → Discover devices**.
3. “Hey Google/Alexa, turn on the Living Room Plug.”

Their token maps to their account, so they only ever see and control their own
devices. Adding a new device later just needs a re-*Discover* (Alexa) / auto-sync
(Google via Request Sync — optional enhancement).

---

## 4. Scaling / hardening notes

- **Request Sync (Google)** and **ProactiveState / ChangeReport (Alexa)** are
  optional next steps to push device-state changes to the assistants in real
  time (we already have the live MQTT→state pipeline to feed them).
- Rotate `SMARTHOME_CLIENT_SECRET` in the VM `.env` + both consoles together.
- The fulfillment is stateless and horizontal-scalable; OAuth tokens are JWTs
  (no server session), so multiple API replicas work without sticky sessions.
- Rate limiting + helmet are already enabled on the control plane.
