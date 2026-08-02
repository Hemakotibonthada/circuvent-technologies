import Foundation
import AppIntents

/**
 * Phrases Siri recognises with no setup from the user.
 *
 * Every phrase must contain `\(.applicationName)` — Apple requires the app name
 * so Siri knows which app is being addressed, which is also why they read as
 * "turn on the porch light with Circuvent" rather than the bare sentence.
 *
 * Apple caps this at ten shortcuts, so the list is the small set people
 * actually say rather than one entry per capability.
 */

@available(iOS 16.0, *)
struct CircuventShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: ControlDeviceIntent(),
      phrases: [
        "Control \(.applicationName)",
        "Set a device with \(.applicationName)",
      ],
      shortTitle: "Control a device",
      systemImageName: "power"
    )

    AppShortcut(
      intent: DeviceStatusIntent(),
      phrases: [
        "Check a device with \(.applicationName)",
        "What's on in \(.applicationName)",
      ],
      shortTitle: "Check a device",
      systemImageName: "questionmark.circle"
    )

    AppShortcut(
      intent: LockDeviceIntent(),
      phrases: [
        "Lock up with \(.applicationName)",
        "Lock a door with \(.applicationName)",
      ],
      shortTitle: "Lock a door",
      systemImageName: "lock"
    )

    AppShortcut(
      intent: UnlockDeviceIntent(),
      phrases: [
        "Unlock a door with \(.applicationName)",
      ],
      shortTitle: "Unlock a door",
      systemImageName: "lock.open"
    )
  }
}
