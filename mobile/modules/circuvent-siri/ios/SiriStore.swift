import Foundation

/**
 * Storage shared between the React Native app and the App Intents.
 *
 * The intents run without booting the JavaScript runtime — Siri expects an
 * answer in a couple of seconds, and starting React Native to service "turn off
 * the porch light" would routinely miss that. So everything an intent needs is
 * written here by the app whenever it changes, and read natively.
 *
 * The bearer token goes in the Keychain, not UserDefaults. UserDefaults is a
 * plist in the app container: readable from a backup, and not protected when
 * the device is unlocked-once. It is the wrong place for a credential that can
 * open someone's front door.
 *
 * Device names and states are not credentials, so they live in UserDefaults
 * where they are cheap to read and easy to inspect while debugging.
 */

struct SiriDevice: Codable {
  let id: String
  let name: String
  let room: String?
  let type: String
  /// State key this device's on/off maps to, e.g. "on" or "relay1". Empty when
  /// the device cannot be switched.
  let toggleField: String
  let isOn: Bool
  /// "switch" | "lock" | "gate" | "curtain" | "sensor"
  let kind: String

  var spokenName: String {
    if let room = room, !room.isEmpty, !name.lowercased().contains(room.lowercased()) {
      return "\(room) \(name)"
    }
    return name
  }
}

enum SiriStore {
  private static let suite = UserDefaults.standard
  private static let devicesKey = "cv.siri.devices"
  private static let apiBaseKey = "cv.siri.apiBase"
  private static let keychainAccount = "cv.siri.token"

  // MARK: - API base

  static var apiBase: String {
    get { suite.string(forKey: apiBaseKey) ?? "https://api.circuvent.com" }
    set { suite.set(newValue, forKey: apiBaseKey) }
  }

  // MARK: - Devices

  static var devices: [SiriDevice] {
    get {
      guard let data = suite.data(forKey: devicesKey) else { return [] }
      return (try? JSONDecoder().decode([SiriDevice].self, from: data)) ?? []
    }
    set {
      suite.set(try? JSONEncoder().encode(newValue), forKey: devicesKey)
    }
  }

  static func device(id: String) -> SiriDevice? {
    devices.first { $0.id == id }
  }

  /// Loose name match, so "porch light" finds "Porch Light" in the Porch room.
  static func devices(matching text: String) -> [SiriDevice] {
    let needle = text.folding(options: .diacriticInsensitive, locale: .current).lowercased()
    guard !needle.isEmpty else { return devices }
    return devices.filter {
      let hay = "\($0.room ?? "") \($0.name)"
        .folding(options: .diacriticInsensitive, locale: .current)
        .lowercased()
      return hay.contains(needle) || needle.contains($0.name.lowercased())
    }
  }

  // MARK: - Token (Keychain)

  static var token: String? {
    get {
      let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrAccount as String: keychainAccount,
        kSecReturnData as String: true,
        kSecMatchLimit as String: kSecMatchLimitOne,
      ]
      var item: CFTypeRef?
      guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
            let data = item as? Data,
            let str = String(data: data, encoding: .utf8),
            !str.isEmpty
      else { return nil }
      return str
    }
    set {
      let base: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrAccount as String: keychainAccount,
      ]
      SecItemDelete(base as CFDictionary)

      guard let newValue = newValue, !newValue.isEmpty,
            let data = newValue.data(using: .utf8) else { return }

      var add = base
      add[kSecValueData as String] = data
      // Available only after the first unlock, and never copied to another
      // device by a backup: an intent needs it in the background, but a restored
      // backup on someone else's phone must not carry the session with it.
      add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
      SecItemAdd(add as CFDictionary, nil)
    }
  }

  static var isSignedIn: Bool { token != nil }

  /// Called on sign-out. Device names are cleared too — leaving them would let
  /// Siri keep offering accessories the user can no longer control.
  static func clear() {
    token = nil
    suite.removeObject(forKey: devicesKey)
  }
}
