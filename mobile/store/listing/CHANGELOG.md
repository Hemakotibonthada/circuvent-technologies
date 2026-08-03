# Circuvent — release notes

The text under `whats-new/` is what gets pasted into Play Console's "What's new
in this version" box. One file per version, named after the version, so each
release keeps its own note and nothing is lost when the next one is written.

Play shows only the note for the version being installed, so each file is
written to stand on its own rather than continuing a sentence from the previous
one.

Written for the person holding the phone, not for the person who wrote the code:
what changed for them, in their words. "Screens no longer say nothing here while
they are still loading" rather than "gate ListEmptyComponent on the loading
flag".

---

## 1.10.0 — versionCode 12

**Added**
- Sentinel safety panel: combustible gas and smoke detection with a latching
  alarm, temperature and humidity, four relays with capacitive touch pads, and a
  safety interlock that cuts nominated appliances and drives an exhaust fan on
  detection. Registered across the app — control panel, tile metric, floorplan
  status, automations, schedules, voice words and security zones.
- Sentinel supports an MCP23017 expander for 16 relays (32 with a second chip),
  with optional momentary override buttons.
- Edge-swipe back on iOS. Navigation is hand-rolled state rather than a
  navigator, so Android's hardware back was being caught while iOS had no
  equivalent and every sub-screen was a dead end.

**Fixed**
- iPhone builds crashed on launch with "No bundle URL present" once away from
  the development Mac. Device builds were Debug, which streams the JavaScript
  from Metro instead of embedding it. Device and simulator builds are now
  Release, and the build asserts the bundle really is inside the app.
- Devices, Energy and Notifications rendered their empty state during the first
  fetch, so a cold start told users they had no devices and invited them to add
  one.
- Back and header buttons were roughly 20pt targets against a 44pt guideline,
  and screen readers announced the chevron glyph rather than "Back".

**Internal**
- Release Android builds are signed with a real upload key rather than React
  Native's published debug key, and the build verifies the signer.
- Both platforms now assert the JavaScript bundle is embedded before declaring
  success.

---

## Earlier versions

Release notes were not tracked in the repository before 1.10.0, so there are no
entries here for 1.0 through 1.9. Rather than reconstruct them from memory and
risk putting something inaccurate in front of users, this file starts where the
record starts.
