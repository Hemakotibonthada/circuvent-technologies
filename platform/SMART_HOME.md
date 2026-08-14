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
| Scope | `control` |
| Privacy policy (required to publish) | `https://circuvent.com/privacy` |

Read the secret: `ssh ubuntu@api.circuvent.com "grep SMARTHOME_CLIENT_SECRET ~/circuvent-platform/.env"`

Confirm the server is ready before touching a console — `capabilities` must
contain `smartHomeVoice`:

```
curl -s https://api.circuvent.com/health
```

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

## 4. Proactive updates — what they are and why they matter

Everything above works without this section: a customer can say "turn on the
lamp" and ask an assistant for its state. What is missing without it is the
*proactive* half, and it is what people notice.

| Without | With |
| --- | --- |
| A device bought today is invisible to the assistant until the customer says "sync my devices" (Google) or runs Discover by hand (Alexa) — neither of which they have any reason to know they must do. | It appears within seconds of being claimed. |
| Pressing a wall switch, or a schedule firing, leaves the assistant showing a stale value. Routines keyed on state run against it. | The assistant is told, and stays in step. |

Both are optional settings on the control plane. Unset, the server does not
claim to support them — `willReportState` and `proactivelyReported` are
reported as `false`, because claiming them while nothing reports leaves the
assistant waiting for updates that never arrive and showing the device as
unresponsive, which is a worse thing for a customer to see than a limitation.

### Google — HomeGraph service account

1. In the Google Cloud project behind your Action, enable the **HomeGraph API**.
2. Create a **service account**, give it the *HomeGraph API Service Agent* role,
   and download a **JSON key**.
3. Put it in the VM `.env` as one line. Base64 is the practical shape, because
   a PEM private key pasted into an env file loses its newlines:

```bash
base64 -w0 homegraph-key.json          # copy the output
# in ~/circuvent-platform/.env
GOOGLE_HOMEGRAPH_KEY=eyJ0eXBlIjoic2Vydmlj...
```

The server accepts raw JSON too, if you can keep the newlines intact.

### Alexa — Login with Amazon credentials for events

These are **not** the account-linking client id and secret above. They come
from the skill's **Permissions** page, where you also switch on *Send Alexa
Events*. Using one pair for the other is the mistake worth avoiding.

```bash
# in ~/circuvent-platform/.env
ALEXA_CLIENT_ID=amzn1.application-oa2-client....
ALEXA_CLIENT_SECRET=....
# Regional gateway. Sending to the wrong one fails in a way that looks
# exactly like a bad token.
#   NA  https://api.amazonalexa.com/v3/events        (default)
#   EU/IN https://api.eu.amazonalexa.com/v3/events
#   FE  https://api.fe.amazonalexa.com/v3/events
ALEXA_EVENT_GATEWAY=https://api.eu.amazonalexa.com/v3/events
```

Then `./scripts/deploy.sh`. Check it took:

```bash
curl -s https://api.circuvent.com/health   # capabilities should list smartHomeVoice
```

---

## 5. What a customer can control by voice

Deliberately not everything. A type absent from this list does not exist to
either assistant, and that is the security boundary for voice — locks, gates,
cameras, ANPR and drones are all left out, because their only boolean is a
*mode* (locked, armed, cleared to fly) rather than a load. "Unlock the front
door" must not be reachable by anything that can hear through a window.

| Device | On/off | Other |
| --- | --- | --- |
| Smart plug, switch | ✓ | |
| Smart light | ✓ | Brightness |
| Smart fan | ✓ | Speed as a percentage, and "low/medium/high" |
| Home Hub | ✓ (channel 1) | |
| Sentinel | ✓ (relay 1) | |
| AquaGuard, agri-starter | ✓ | Categorised as a **valve**, not a switch |

The categories matter as much as the list. Assistants sweep by category, so a
pump typed as a switch would join "turn everything off" and every goodnight
routine — going to bed would cut the water supply and stop an irrigation cycle
halfway.

---

## 6. Unlinking

A customer who removes Circuvent in the Google Home app, or disables the skill,
has said plainly that they want it to stop. Both now revoke the grant rather
than only forgetting the link, through the same kill switch as "sign out
everywhere".

They can also do it from Circuvent: **Settings → Account → Voice assistants**,
which lists what is linked and when. That page exists because "what can open my
house?" previously had no answer — account linking is a stateless token
exchange, so an Echo in a house somebody had moved out of held a working grant
with nothing recording it.

---

## 7. Scaling / hardening notes

- Rotate `SMARTHOME_CLIENT_SECRET` in the VM `.env` + both consoles together.
- The fulfillment is stateless and horizontally scalable; OAuth tokens are JWTs
  (no server session), so multiple API replicas work without sticky sessions.
  The only stored state is `assistant_links`, which is a small table keyed by
  user and assistant.
- Rate limiting + helmet are already enabled on the control plane.
- Alexa has no reliable removal event for skills, so a device deleted from a
  Circuvent account lingers in the Alexa app until the customer runs Discover.
  Worth knowing when somebody reports it as a bug.

