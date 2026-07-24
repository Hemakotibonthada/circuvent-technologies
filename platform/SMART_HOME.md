# Circuvent — Alexa & Google Home Integration Runbook

Your control plane now speaks both **Google Home** and **Amazon Alexa** Smart Home
protocols. This document is the step‑by‑step setup for the Amazon and Google
developer consoles. Nothing here needs a code change — it is pure console config.

---

## 0. What is already live on the server

| Purpose | URL |
| --- | --- |
| OAuth login / account‑linking page | `https://api.circuvent.com/oauth/authorize` |
| OAuth token endpoint | `https://api.circuvent.com/oauth/token` |
| Google Home fulfillment | `https://api.circuvent.com/smarthome/google` |
| Alexa fulfillment (behind a Lambda, see §2) | `https://api.circuvent.com/smarthome/alexa` |

**OAuth client credentials** (set in the VM `.env`, injected into the API container):

```
Client ID     : circuvent-smarthome
Client Secret : <value of SMARTHOME_CLIENT_SECRET in ~/circuvent-platform/.env>
```

> Read the secret any time with:
> `ssh ubuntu@140.245.238.154 "grep SMARTHOME_CLIENT ~/circuvent-platform/.env"`

Scopes: leave empty / `control`. Grant type: **authorization_code** (+ refresh).
Tokens: access token = 1 h, refresh token = 10 y. The same Circuvent app
email + password logs the user in on the linking page.

Which devices show up: any device whose `type` is switchable —
`smart-plug`, `smart-switch`, `agri-starter`, `aquaguard`, `home-hub`.
Others are intentionally not exposed as On/Off endpoints.

---

## 1. Google Home (direct HTTPS — no Lambda needed)

1. Go to <https://console.actions.google.com> → **New project** (e.g. `Circuvent`).
2. Choose **Smart Home** → **Smart Home**.
3. **Develop → Actions → Build your Action → Smart home** — set the
   **Fulfillment URL** to:
   `https://api.circuvent.com/smarthome/google`
4. **Develop → Account linking**:
   - Account creation: **No, I only want to allow account creation on my website**
   - Linking type: **OAuth → Authorization code**
   - Client ID: `circuvent-smarthome`
   - Client secret: *(the secret above)*
   - Authorization URL: `https://api.circuvent.com/oauth/authorize`
   - Token URL: `https://api.circuvent.com/oauth/token`
   - Scopes: `control` (or leave one placeholder scope)
5. **Test** (top bar) to push a draft to your Google account.
6. In the **Google Home app** on your phone → **+ Add → Works with Google** →
   search for **[test] Circuvent** → sign in with your Circuvent account →
   devices sync. Say *“Hey Google, turn on Living Room Plug.”*

Google calls SYNC/QUERY/EXECUTE directly against the HTTPS fulfillment URL —
no AWS account required.

---

## 2. Amazon Alexa (needs a tiny Lambda proxy)

Alexa Smart Home **requires an AWS Lambda ARN** as the skill endpoint (it does
not call a raw HTTPS URL like Google does). The Lambda is a 15‑line pass‑through
that forwards the directive JSON to `https://api.circuvent.com/smarthome/alexa`
and returns the response verbatim.

### 2a. Create the skill
1. <https://developer.amazon.com/alexa/console/ask> → **Create Skill**.
2. Name `Circuvent`, model **Smart Home**, hosting **Provision your own**.
3. Note the **Skill ID** (`amzn1.ask.skill.…`) — you need it for the Lambda trigger.

### 2b. Create the Lambda (Node.js 20, region **us‑east‑1** for English/US, **eu‑west‑1** for EU/IN)
Create a function, add an **Alexa Smart Home** trigger with the Skill ID above,
and paste:

```js
// index.mjs  — Alexa Smart Home -> Circuvent proxy
export const handler = async (event) => {
  const r = await fetch("https://api.circuvent.com/smarthome/alexa", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
  });
  return await r.json();
};
```

Copy the Lambda **ARN** (`arn:aws:lambda:…:function:…`).

### 2c. Point the skill at the Lambda
Back in the Alexa skill → **Smart Home → Default endpoint** = the Lambda ARN.

### 2d. Account linking (Alexa skill → Account Linking)
- Auth URI: `https://api.circuvent.com/oauth/authorize`
- Access Token URI: `https://api.circuvent.com/oauth/token`
- Client ID: `circuvent-smarthome`
- Client Secret: *(the secret above)*
- Scheme: **HTTP Basic** (Alexa sends client creds in the Authorization header —
  our token endpoint accepts both Basic and body params) or **Credentials in
  request body**; either works.
- Scope: `control`

### 2e. Test
Alexa app → **More → Skills & Games → Your Skills → Dev** → **Circuvent** →
**Enable → Link Account** → sign in with your Circuvent account → **Discover
Devices**. Say *“Alexa, turn on Living Room Plug.”*

---

## 3. How a voice command flows

```
"Alexa/Hey Google, turn on Living Room Plug"
      |
      v
Google  --HTTPS-->  /smarthome/google    \
Alexa   --Lambda->  /smarthome/alexa     /   verify OAuth Bearer -> find device
                                         |    -> publishCommand(id,{action:set,power:true})
                                         v
                             MQTT broker (mqtt.circuvent.com:8883, TLS)
                                         |
                                         v
                                   ESP32 device toggles relay
```

Latency: assistant → cloud → MQTT publish is typically **200–500 ms**; the relay
click follows within one broker round‑trip of the device.

---

## 4. Troubleshooting

| Symptom | Cause / Fix |
| --- | --- |
| Linking page shows “Invalid client_id” | The console `client_id` ≠ `circuvent-smarthome`. |
| Token exchange returns `invalid_client` | `SMARTHOME_CLIENT_SECRET` in the console ≠ the VM `.env` value, or the secret is empty on the server. |
| SYNC/Discovery returns no devices | The account owns no **switchable** device, or the device `type` is not in the exposed list (§0). |
| Command says success but relay doesn’t move | Device offline (check `online` in the app / `mqtt.ts` logs); the command still publishes and the device applies it on reconnect if retained. |
| Alexa “I couldn’t find a device” | Re‑run **Discover Devices** after adding the device in the Circuvent app. |

---

## 5. Rotating the client secret

```bash
ssh ubuntu@140.245.238.154
cd ~/circuvent-platform
sed -i "s/^SMARTHOME_CLIENT_SECRET=.*/SMARTHOME_CLIENT_SECRET=$(openssl rand -hex 32)/" .env
docker compose up -d api        # restart with the new secret
grep SMARTHOME_CLIENT_SECRET .env   # copy into both consoles
```

After rotating, update the secret in **both** the Google Account‑linking and the
Alexa Account‑linking screens, then re‑link the account in each app.
