# 16 — The AI assistant

Circuvent's assistant is a **grounded assistant layer**, not a trained model. It
is worth being precise about that, because the distinction determines what it
can and cannot be trusted to say.

No foundation model was trained here. What was built is the part that actually
decides whether an answer is true: a deterministic analysis engine, a tool layer
that fetches facts with the caller's own permissions, and a persona system that
decides what a given user is allowed to ask about. A hosted language model is
used only to phrase what those components already established, and the whole
thing keeps working — with plainer wording — when no model is configured at all.

---

## 1. The governing principle

> **`analysis.ts` decides what is true. The model decides how to say it.**

A smart-home assistant that hallucinates *"your front door is locked"* is
dangerous in a way a hallucinating chatbot is not. So every factual claim the
assistant can make about a home is arithmetic over live readings, computed in
`src/lib/ai/analysis.ts`, which has no network access, no model call, and 40
unit tests.

Three consequences of that principle show up throughout the code:

- **Anomaly detection uses median + MAD, not mean + standard deviation.** One
  huge spike inflates a standard deviation past its own value, which hides the
  very outlier being searched for. `analysis.test.ts` contains a test for
  exactly this case.
- **The engine refuses rather than guesses.** Fewer than 20 telemetry points and
  it returns nothing. A zero-spread series returns nothing rather than dividing
  by zero. No metered device means "no energy data", never an estimate.
- **A boolean is not a number.** On a smart plug, `power` is the on/off switch.
  `deviceWatts()` deliberately skips boolean `power` values, because reporting
  1 W for every switched-on plug would be inventing a reading out of a switch
  position. The same bug was found and fixed in the admin console's
  `sumStateMetric()` — see §9.

---

## 2. File map

| File | Responsibility |
| --- | --- |
| `src/lib/ai/analysis.ts` | Deterministic per-home analysis. **No model, no network.** |
| `src/lib/ai/analysis.test.ts` | 40 tests covering every finding and every refusal |
| `src/lib/ai/fleet.ts` | Deterministic fleet-wide *correlation* (admin) |
| `src/lib/ai/fleet.test.ts` | 34 tests, including the "don't blame one group when everything is down" case |
| `src/lib/ai/console-identity.ts` | Derives persona for control-plane-authenticated callers (mobile) |
| `src/lib/ai/console-identity.test.ts` | 7 tests pinning the privilege rules |
| `src/lib/ai/types.ts` | `Persona`, `ChatMessage`, `AssistantContext`, tool types |
| `src/lib/ai/provider.ts` | OpenAI-compatible client over plain `fetch`. No SDK dependency. |
| `src/lib/ai/tools.ts` | The tool registry — **the trust boundary** |
| `src/lib/ai/prompts.ts` | Per-persona system prompts |
| `src/lib/ai/assistant.ts` | The tool loop, and the degraded fallback |
| `src/lib/ai/useHomeAnalysis.ts` | Shared client hook so the two web surfaces can't diverge |
| `src/app/api/ai/chat/route.ts` | One conversational turn |
| `src/app/api/ai/analyze/route.ts` | Analysis only — never calls a model |
| `src/components/ai/Assistant.tsx` | Floating chat panel (shop + console) |
| `src/components/ai/InsightsPanel.tsx` | Compact findings widget |
| `src/app/smarthome/insights/AnalysisPanel.tsx` | Full console "Analysis" tab |
| `src/app/smarthome/admin/intelligence/page.tsx` | Admin "Fleet Intelligence" page |
| `mobile/src/assistant.ts` | Mobile client for both endpoints |
| `mobile/src/screens/more/AiHub.tsx` | Mobile insights, server-computed |
| `mobile/src/screens/more/VoiceAssistant.tsx` | Local command parser, AI fallback |

---

## 3. Personas and the trust boundary

Three personas exist: `guest`, `customer`, `admin`.

**The persona is always derived server-side.** A request body containing
`"persona": "admin"` is ignored — this is verified by test and by a live probe
(`POST /api/ai/chat` with a forged persona returns `persona: "guest"`).

Persona is resolved in `src/app/api/ai/chat/route.ts` in this order:

1. Website account cookie/token → `customer` (blocked and deleted accounts do
   not count).
2. Website admin session → `admin`.
3. **Console token** → see below.

### Why step 3 exists

The mobile app has no website cookie. It authenticates against the *control
plane* and holds a console token. Without step 3 every mobile user was a
`guest`, was never offered `list_devices` or `home_analysis`, and could not ask
a single question about their own home despite being fully signed in.

`console-identity.ts` resolves this with one request to `GET /admin/me`, whose
status codes happen to distinguish all three cases cleanly:

| Status | Meaning | Persona |
| --- | --- | --- |
| `200` | Valid token, user is an administrator | `admin` |
| `403` | Valid token, ordinary customer | `customer` |
| `401` | Token invalid or expired | `guest` |
| anything else / timeout | Cannot tell | `guest` (fails closed) |

A token is never trusted because it is *present*, only because the control plane
accepted it. `mergePersona()` never lowers an already-established persona, so a
control-plane outage cannot demote a signed-in website user.

### What each persona can reach

| Tool | guest | customer | admin |
| --- | :-: | :-: | :-: |
| `search_products` | ✅ | ✅ | ✅ |
| `list_devices` | | ✅ | ✅ |
| `home_analysis` | | ✅ | ✅ |
| `energy_report` | | ✅ | ✅ |
| `device_history` | | ✅ | ✅ |
| `list_orders` | | ✅ | ✅ |
| `fleet_overview` | | | ✅ |

Permission is enforced **twice**: `toolsFor()` decides what the model is even
told exists, and every handler re-checks `ctx.persona` before returning data.
Being told about a tool is not permission to use it.

### Other hardening

- **Only `user` and `assistant` roles are accepted from clients.** A
  client-supplied `system` message would be a direct instruction-injection
  channel, so it is dropped.
- **Control-plane reads use the user's own token**, never a service credential,
  so the API's ownership checks still apply. The assistant cannot see a device
  its user could not already see.
- **Nothing in `tools.ts` actuates a device.** Turning something on is a
  confirmed user action, never a side effect of a sentence. On mobile this is
  enforced structurally: only the local `parseCommand()` can move a relay.
- **Rate limited** per IP, and more tightly per identity for signed-in users.
- **Malformed JSON returns 400, not 500** — a client error should not be
  reported as a server fault.

---

## 4. What the analysis actually computes

### Per home (`analyseHome`)

| Finding | Fires when |
| --- | --- |
| Offline devices | Device reports offline |
| Stale devices | Marked online but silent for > 30 min |
| Standby drain | Device draws power while nominally off |
| Anomalies | Reading deviates from median by a robust (MAD-based) margin |
| Schedule conflicts | Two rules act on the same device at the same time **on overlapping days** |
| Recurring events | The same alert repeats enough to be a pattern |
| Energy | Current watts, projected kWh/day and /month, top consumers by share |

Schedule-conflict detection keys on `deviceId@time#days`, so two rules on
disjoint days correctly do **not** collide.

### Across the fleet (`analyseFleet`, admin only)

The admin console already *counts* devices by type, room, firmware and owner.
Counting is not the hard part — deciding what a count means is. `fleet.ts`
correlates instead:

| Finding | Why it matters |
| --- | --- |
| **Site outage** — every device of one owner offline | That site's internet or power, not N device failures. Stops support dispatching hardware for a router problem. |
| **Concentrated failure by firmware** | A release failing far above baseline is a bad release. Roll it back. |
| **Concentrated failure by device type** | Points at a hardware revision or a shared gateway. |
| **Stale sessions** | Devices flagged online but silent — the console is offering controls that cannot reach them. Usually a last-will delivery problem. |
| **Never seen** | Registered but never reported: provisioning that stopped after registration. |
| **Fleet degradation** | A large share offline at once is usually broker, DNS or TLS — not devices. |
| **Firmware fragmentation** | Every extra version in the field is another combination to support. |

Two design details worth keeping if this code is edited:

- Subgroups are compared against **the rest of the fleet**, not the whole fleet.
  Including a suspect group in its own baseline dilutes exactly the signal being
  tested for, and gets worse the bigger the problem is.
- Thresholds (`MIN_GROUP = 4`, `GROUP_FAIL_RATE = 0.5`,
  `GROUP_FAIL_MULTIPLE = 2`) exist so the page does not cry wolf. Two devices
  that both happen to be offline is not evidence of a systemic fault. When the
  *whole* fleet is down, no individual group is blamed — the fleet-wide finding
  fires instead. There is a test for this.

---

## 5. Surfaces

| Surface | Path | Uses a model? |
| --- | --- | --- |
| Shop + console chat | floating panel | Yes (falls back if absent) |
| Console → Insights → **Analysis** | `/smarthome/insights` | **No** |
| Admin → **Fleet Intelligence** | `/smarthome/admin/intelligence` | **No** |
| Mobile → More → **AI insights** | `AiHub` | **No** |
| Mobile → More → **Assistant** | `VoiceAssistant` | Only for unrecognised input |

Both console findings surfaces show the **evidence** each finding fired on, so
an operator can check the arithmetic instead of taking a sentence on faith.

### The mobile assistant split

`VoiceAssistant` keeps its local `parseCommand()` for anything that names a real
device. That path is instant, works without a round trip, and is the *only* code
that can actuate hardware. When the parser matches no device at all, the input is
a question rather than a command, and it goes to `/api/ai/chat` instead of
answering "I couldn't find a matching device" to something like *"how do I save
electricity?"*.

---

## 6. Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `AI_API_KEY` or `OPENAI_API_KEY` | — | Provider key |
| `AI_BASE_URL` | `https://api.openai.com/v1` | Any OpenAI-compatible endpoint |
| `AI_MODEL` or `OPENAI_MODEL` | `gpt-4o-mini` | Model name |
| `AI_TIMEOUT_MS` | `45000` | Per-request timeout |
| `CONTROL_PLANE_URL` | `https://api.circuvent.com` | Used by tools and identity resolution |

The provider is considered configured when **either** a key is present **or**
`AI_BASE_URL` is set — the second case covers a local or self-hosted endpoint
that needs no key. When neither is set the assistant runs degraded.

Because these are scoped to production in Vercel, **local development runs in
degraded mode by default**, which is useful: it is the path that must never
break.

### Degraded mode

With no key configured, `/api/ai/chat` still returns `200` with
`degraded: true`. `degradedReply()` answers home questions directly from
`analysis.ts` with no model involved, and otherwise points the user at `/shop`
or the console. `/api/ai/analyze` is unaffected — it never used a model.

---

## 7. Adding a tool

1. Add a definition to `DEFS` in `src/lib/ai/tools.ts`. The description is read
   by the model, so say plainly when it must be used.
2. Add it to the right persona list in `toolsFor()`.
3. Write the handler in `HANDLERS`. It must:
   - re-check `ctx.persona` if the tool is privileged;
   - fetch through `controlPlane()` so the user's own token is used;
   - **return facts or refuse.** Never return a plausible-looking placeholder —
     the model cannot tell the difference and will repeat it as fact.
4. If it introduces a new judgement, put the judgement in `analysis.ts` or
   `fleet.ts` with tests, and have the tool return the computed result.

---

## 8. Verifying a change

```bash
npx tsc --noEmit
npx jest src/lib/ai                       # 81 tests
npx jest                                  # full suite, 371 tests
npm run build
cd mobile && npx tsc --noEmit
```

The security matrix is worth re-running by hand after touching the route.
**Write the JSON body to a file first** — PowerShell passes backslash escapes
through literally, so an inline `-d '{\"a\":1}'` sends malformed JSON and the
route (correctly) answers 400. That artefact cost real debugging time once
already.

```powershell
@{ messages = @(@{ role="user"; content="hi" }) } | ConvertTo-Json -Depth 5 |
  Set-Content body.json -Encoding ascii
curl.exe -s -X POST http://localhost:3111/api/ai/chat `
  -H "content-type: application/json" --data-binary "@body.json"
```

Expected results:

| Case | Expected |
| --- | --- |
| Normal message | `200`, `persona: "guest"` |
| Malformed JSON | `400` |
| Body claims `persona: "admin"` | `200`, `persona: "guest"` |
| Client sends a `system` message | `200`, message dropped |
| Forged bearer token | `200`, still `guest` |
| Bogus `consoleToken` | `200`, still `guest`, no hang |
| Rapid repeats | `429` |

---

## 9. A bug this work found

`sumStateMetric()` in `src/app/smarthome/admin/_lib/api.ts` used
`Number(state[k])` and accepted anything finite. That silently:

- turned `power: true` into **1 W** for every switched-on plug, and
- treated `watts: null` (`Number(null) === 0`) as a device *reporting* 0 W.

So the admin overview's live-power figure was partly fabricated, in a file whose
own header comment promises it never fabricates anything. It now accepts only
genuine numbers and numeric strings, and `api.test.ts` pins the distinction
between "reported zero" and "reported nothing".

---

## 10. Honest limitations

- **The full tool loop has never run against a live model.** `OPENAI_API_KEY` is
  production-scoped in Vercel, so only the degraded path has been exercised
  end-to-end locally. The provider client, tool loop and prompts are covered by
  types and review, not by a live conversation.
- **No conversation is persisted.** History lives in the client only; there is no
  server-side transcript, and therefore no cross-session memory.
- **`analysis.ts` reads the current snapshot**, not long-range history. Trends
  over weeks are not modelled.
- **Fleet correlation is not causal.** It says "these failed together", which is
  a strong hint, not a proof.
- **Rate limiting is per process.** Like the automation scheduler documented in
  [14 — Scaling](./14-scaling.md), it does not coordinate across replicas.
