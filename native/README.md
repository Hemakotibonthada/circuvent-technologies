# Native clients

Kotlin/Compose for Android and Swift/SwiftUI for iOS, alongside the Expo app
rather than instead of it.

| | Path | Builds here | Status |
| --- | --- | --- | --- |
| Android | `native/android` | yes — `gradlew :app:assembleDebug` | vertical slice |
| iOS | `native/ios` | **no — needs a Mac** | vertical slice, uncompiled |
| Expo (shipping) | `mobile/` | yes | untouched |

## The Expo app is still the product

`mobile/` is what is on the Play Store and it has not been modified. These are a
replacement in progress, and a half-migrated phone client that had replaced the
working one would leave the product with nothing to ship.

Both native builds use the application id `com.circuvent.app.nativeclient`
rather than the published `com.circuvent.app`, so they install **beside** the
real app. That is deliberate twice over: the first thing anybody needs while
replacing an app is to run both on one phone and compare them, and it removes
any chance of a debug build replacing somebody's provisioned installation.

## What is actually implemented

Both platforms, feature-for-feature with each other:

- sign in, with the token in the platform's secure store (EncryptedSharedPreferences / Keychain)
- single-flight token refresh
- a five-tab shell: Home, Devices, Rooms, Scenes, More
- Home: on-now / online / scene counts, scene shortcuts, favourites
- Devices: full list, room filter, live status
- a device sheet driven by a **capability table** — power, brightness, fan
  speed with its legacy field, thermostat target, per-gang touch board controls
  with a whole-board `all`, star, remote setup hotspot, and the raw reported state
- Rooms, with per-room device and on counts
- Scenes: run one, and a read-only list of automations
- the live WebSocket feed, with an optimistic pin released by the device's own echo
- a slow poll behind the socket

### Why there is a capability table rather than a screen per device

There are twenty-four device types. A screen each would be twenty-four places
to forget something, and what gets forgotten is never the whole screen — it is
one field, on one type, which then renders as a control that moves and changes
nothing. The Expo app reached the same conclusion; this mirrors its
`capabilities()` so no two clients disagree about what a device offers.

The half that matters more is the types that must offer **no** switch. A
camera's boolean is `streaming`, which is what the live view is already doing.
A drone's is an aircraft's permission to fly. A hub's `power` is one relay of
four, so a whole-device switch turns on a quarter of it and reports success. All
three are asserted, on both platforms.

## What is not implemented

The Expo app has 119 screens. This is not all of them and does not pretend to
be. What exists is finished and verified; nothing here is a screen that renders
and does nothing, which is the failure this codebase spends most of its guards
on.

Still to do, roughly in the order it is worth doing:

| Area | Screens |
| --- | --- |
| Setup | Add device, onboarding, the Wi-Fi hotspot flow (the remote setup command is done; joining the device's AP is not) |
| Automation | The rule and schedule editors — the lists are read-only today |
| Energy | Energy dashboard, tariffs, per-device breakdown |
| Devices | Camera live view, sensors, face enrolment |
| Account | Household sharing, notifications, activity log, profile editing |
| Lifestyle | Weather, vehicles, bill payment |
| AI | Assistant, suggestions, models |
| Enterprise | The whole `enterprise/` tree — 58 screens: fleet, gate passes, security, diagnostics, zones, org admin |


## The Swift is not compiled by anything

There is no Mac in this pipeline. The Swift sources have never been through a
compiler, and saying so is more useful than implying otherwise.

What stands in for it is `tests/native-client-parity.test.ts`, which runs on
every `npm test`. It reads the Kotlin, the Swift and the Expo config and fails
when they disagree about:

- the control-plane and socket addresses, and that neither can reach a
  plaintext host
- the spelling of every endpoint
- which devices have a primary switch and which field it is
- that a hub is addressed positionally rather than by its state key
- that `setup` is an action rather than a field
- which device types expose which capability, and — more importantly — which
  ones must expose no switch at all
- that the fan's legacy field survives on both, so older hardware still moves
- that both platforms carry the same test cases, and the same number of them

That is not as good as compiling it. It is much better than nothing, and it
catches the class of mistake that actually happens here — two files that were
supposed to say the same thing and do not. The guard was checked by breaking
the Swift map on purpose and watching it fail.

## Building

```bash
# Android — produces app/build/outputs/apk/debug/app-debug.apk
cd native/android
./gradlew :app:assembleDebug :app:testDebugUnitTest

# iOS — on a Mac
brew install xcodegen
cd native/ios && xcodegen generate && open Circuvent.xcodeproj
```

`native/android/local.properties` is generated per machine and gitignored, like
every other Android SDK pointer in this repository.

The Xcode project is **generated from `project.yml`**, not committed. A
`.xcodeproj` is a directory of XML that conflicts on every parallel change and
cannot be reviewed; twenty readable lines can be.

## Why the command map is duplicated four times

There is now one protocol and four implementations of it: the web console, the
Expo app, Kotlin and Swift. Duplication is the cost of native clients; drift is
the bug.

The specific hazard is that a command key and a state key are the same word for
most devices and different words for several. A Home Hub *reports* `power2` and
*is commanded with* `{ch: 1, on: true}`. A touch board reports `g1` and reads
`g1`, but its whole-board switch is `all`, which it reports as nothing at all.

Send the state key to a device that wanted the command key and nothing errors:
the control plane accepts it, the broker delivers it, the sketch reads a field
it does not have, and the relay never moves. The switch slides under the finger,
snaps back, and it reads as broken hardware.

That bug has already shipped twice — once on the web and once in the Expo app.
These are the third and fourth chances to make it, which is why the map is
asserted rather than reviewed.
