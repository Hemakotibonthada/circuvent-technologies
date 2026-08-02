import ExpoModulesCore
import AppIntents

/**
 * The React Native side of Siri support.
 *
 * The app calls `sync` whenever the device list, their states, or the session
 * changes. Everything Siri needs is then already on disk, so an intent answers
 * without starting the JavaScript runtime.
 *
 * Deliberately dumb: it stores what it is given. Which state field a device
 * toggles is worked out in TypeScript, where the device-type tables already
 * live, so adding a device type never means editing Swift.
 */
public class CircuventSiriModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CircuventSiri")

    Constants([
      // App Intents need iOS 16. Below that the app should not offer Siri
      // settings that cannot work.
      "isSupported": {
        if #available(iOS 16.0, *) { return true } else { return false }
      }()
    ])

    /// Replaces the cached device list and session.
    ///
    /// `token` nil means signed out, which also clears the device list —
    /// leaving it would let Siri keep offering accessories that can no longer
    /// be controlled.
    Function("sync") { (apiBase: String, token: String?, devicesJson: String) -> Bool in
      SiriStore.apiBase = apiBase

      guard let token = token, !token.isEmpty else {
        SiriStore.clear()
        Self.refreshShortcuts()
        return true
      }

      SiriStore.token = token

      guard let data = devicesJson.data(using: .utf8),
            let decoded = try? JSONDecoder().decode([SiriDevice].self, from: data)
      else {
        return false
      }

      SiriStore.devices = decoded
      Self.refreshShortcuts()
      return true
    }

    /// Clears everything on sign-out.
    Function("clear") { () -> Void in
      SiriStore.clear()
      Self.refreshShortcuts()
    }

    /// Exposed for the settings screen, so it can show what Siri currently knows.
    Function("cachedDeviceCount") { () -> Int in
      SiriStore.devices.count
    }
  }

  /// Tells the system the entity list changed, so the Shortcuts app and Siri
  /// stop suggesting devices that have been renamed or removed.
  private static func refreshShortcuts() {
    if #available(iOS 16.0, *) {
      CircuventShortcuts.updateAppShortcutParameters()
    }
  }
}
