# 07 — Adding a new device type

A complete walk-through, in dependency order. Following it end to end gives you a
device that provisions, appears in both apps with real controls, can be
automated, and can be sold.

Worked example: a **smart geyser controller**, type id `geyser`.

---

## 1. Firmware

Copy the closest existing device and rename.

```bash
cp -r firmware/smart-plug firmware/geyser
cd firmware/geyser && mv smart-plug.ino geyser.ino
```

In `platformio.ini`, keep `lib_extra_dirs = ..` so the shared
`CircuventDevice` library resolves.

In the sketch:

```cpp
#define CV_FW_VERSION "1.0.0"
CircuventDevice cv("geyser");        // ← the type id, must match everywhere

void onCommand(const String &action, JsonObjectConst p) {
  if (action == "set") {
    if (p["power"].is<bool>())  { setRelay(p["power"].as<bool>()); }
    if (p["target"].is<int>())  { target = constrain(p["target"].as<int>(), 30, 75); }
    cv.set("power", relayOn);
    cv.set("target", target);
    cv.publishStateNow();
  }
}

void setup() {
  cv.onCommand(onCommand);
  cv.begin();
  cv.set("power", false);
  cv.set("target", 55);
  cv.publishStateNow();
}
```

Rules worth obeying:

- **State keys are the contract.** Both apps read them; renaming one is a
  breaking change.
- **Publish state after applying**, not before. The UI reconciles against it.
- **Check pin collisions.** If you use `setResetButton`, a status LED or a PIR,
  confirm the pin is not needed by a peripheral. On camera-class boards, copy the
  `CV_PIN_CLASH` compile-time guard from `firmware/camera/camera.ino` — a
  collision there fails silently at runtime.

Verify: `pio run` compiles, and `pio device monitor` shows the device connecting
and publishing state.

---

## 2. Control plane

Usually **nothing to do**. `devices.type` is a free-form `TEXT` column and the
API does not enumerate types. A new type provisions, stores state and accepts
commands with no server change.

You only touch the server if the device needs new behaviour, for example a new
event kind or a bespoke endpoint.

If you add a field to an automation trigger or action, add it to
`triggerSchema` / `actionSchema` in
`platform/api/src/routes/automations.ts` — **Zod strips unknown keys**, so an
undeclared field is dropped on write with no error.

---

## 3. Web console

### 3a. Command map — `src/lib/smarthome-command-map.ts`

Teach the console which command fields exist for the type, so the rule builder
and the switch timers can offer them. Command keys and state keys are allowed to
differ (a camera's `{action:"stream", on}` sets `state.streaming`); this map is
where that is expressed.

Only project fields whose value after the command is **deterministic**. Anything
the firmware stores without echoing, or computes for itself (a fresh sensor
baseline, a timestamp), must yield no patch — otherwise the optimistic pin waits
forever for a confirmation that cannot arrive.

If the type has a sensible "everything on/off", add it to `masterPower` too, or
group and room power buttons will skip it.

### 3b. Device controls — `src/app/smarthome/DeviceControls.tsx`

Two edits:

1. Add a `DEVICE_META` entry — label, icon, accent colour, blurb. Without it the
   device draws a generic chip icon.
2. Add a `case "geyser":` to the switch and write the control component.

**If you skip step 2 the device falls through to `default:` and renders a raw
JSON state dump.** That is exactly what happened when cameras were added.

### 3c. Automation fields — `src/app/smarthome/automation/describe.ts`

`getCommandFields` feeds two things: the rule builder, and — via
`src/lib/smarthome-switches.ts` — the per-channel schedule list. A boolean here
becomes a schedulable "switch", so a field that is a *mode* rather than a load
(armed, auto, locked, away, muted) must also go in `NON_LOAD_FIELDS`, or the
schedule list reads as if the front door were a lamp.

### 3d. Smaller registries

| File | What breaks without it |
| --- | --- |
| `src/app/smarthome/_kit/device.tsx` (`deviceMetric`) | Tiles show no readout |
| `src/app/smarthome/spaces/FloorplanPanel.tsx` | Floorplan pin has no status or glyph |

`GenericCapabilities` covers power/dimmer/fan/thermostat automatically, so a
simple device may need nothing more.

---

## 4. Mobile app

Mirror the console:

1. `mobile/src/theme.ts` — add to `DEVICE_META` (icon, gradient, label, and the
   `toggle` field if it has a primary switch), and to `TYPE_CATEGORY` so the
   tile is tinted.
2. `mobile/src/icons.tsx` — add the glyph named by `DEVICE_META.icon`. Run
   `npm run icons:check`: a wrong name is invisible to TypeScript and renders as
   a blank box at runtime.
3. `mobile/src/screens/Control.tsx` — add the control component and render it,
   and add the type to the `KNOWN` array.

**The `KNOWN` array is the trap.** A type missing from it falls through to the
raw-state card even if you wrote a control component. This is precisely how the
camera shipped showing JSON on the phone.

4. `mobile/src/store.tsx` — if the device has a primary on/off, add it to
   `capabilities()` so tiles and quick actions work.
5. `mobile/src/widgets.ts` — multi-gang hardware only: list its switchable
   fields in `defaultGangs` so each output can be renamed and hidden. Where the
   output count varies by board, read it from published state rather than
   hardcoding it.
6. `mobile/src/voice.ts` — words a person would actually say for it.
7. `mobile/src/screens/enterprise/security/zones.ts` — only if it reports
   security-relevant state (motion, contact, tamper, alarm).

Siri needs **no** Swift change: `mobile/src/siri-sync.ts` derives the field to
toggle from `DEVICE_META.toggle` / `capabilities()`. Add a `kindOf` case only if
the device is a lock, gate, curtain or armable alarm, where "on" and "off" would
be the wrong words.

### 4a. Google Home / Alexa — `platform/api/src/routes/smarthome.ts`

`onOff()` decides what the voice assistants see. A type missing from it is
simply absent from both, with no error.

---

## 5. Shop listing

`src/lib/shop-data.ts` — append to `products`:

```ts
{
  id: "geyser",
  slug: "circuvent-geyser",
  name: "Circuvent Smart Geyser",
  tagline: "…",
  description: "…",
  price: 2499,
  category: "Home Automation",
  image: "/img/product-geyser.svg",
  accent: "#f97316",
  icon: "♨️",
  specs: ["…"],
  stock: 10,
  rating: 4.6,
}
```

`id` and `slug` must be unique. The product page, the sitemap entry and the
catalogue card are all generated from this list.

Write the description from the **firmware**, not from ambition. If the sketch has
no dry-run protection, the listing must not claim it.

### Artwork

```bash
# add an entry to `art` and `LABELS` in scripts/gen-product-art.js, then:
node scripts/gen-product-art.js
node scripts/preview-product-art.js   # renders a contact sheet — look at it
```

Look at the contact sheet. SVG that parses perfectly can still paint nothing: a
straight line stroked with an `objectBoundingBox` gradient has a zero-width
bounding box and renders invisibly.

---

## 6. Hardware (optional)

If there is a board, follow the pattern in `hardware/<device>/`: KiCad project
under `pcb/`, plus `DATASHEET.md`, `MANUAL.md`, `enclosure/` and `listings/`.

> Never stage `hardware/**` casually — several projects there are intentionally
> left dirty.

---

## Checklist

- [ ] `firmware/<type>/` compiles with `pio run`
- [ ] Device connects, publishes `state`, honours `cmd`
- [ ] Every output publishes its state at boot, including the ones that are off
- [ ] Command map entry added (+ `masterPower` if it has an "all")
- [ ] `getCommandFields` added; mode-like booleans also in `NON_LOAD_FIELDS`
- [ ] `DEVICE_META` + `case` in `DeviceControls.tsx`
- [ ] `deviceMetric` + floorplan status
- [ ] `deviceMeta` + `TYPE_CATEGORY` + icon + control + **`KNOWN` array** in mobile
- [ ] `npm run icons:check` passes
- [ ] `capabilities()` updated if it has a primary switch
- [ ] `onOff()` in `smarthome.ts` if it should reach Google/Alexa
- [ ] Product added to `shop-data.ts` with a unique id and slug
- [ ] Artwork generated **and visually checked**
- [ ] `npx tsc --noEmit` clean in both `/` and `mobile/`
- [ ] `npm run build` clean
- [ ] Provisioned a real unit end to end

## The three silent failures

1. **No `case` in `DeviceControls.tsx`** → raw JSON on the web.
2. **Type missing from `KNOWN`** in `mobile/src/screens/Control.tsx` → raw JSON
   on the phone.
3. **New automation field not added to the Zod schema** → silently dropped on
   every save.

None of these produce an error. All three have happened.

## One more, if the board comes in variants

If the same type ships with different output counts, publish the count from the
firmware and read it everywhere instead of hardcoding the larger board. A
two-relay unit that inherits a four-relay assumption shows two dead switches, a
misleading "1/4 on" readout, and an optimistic toggle that hangs waiting for a
relay it does not have.
