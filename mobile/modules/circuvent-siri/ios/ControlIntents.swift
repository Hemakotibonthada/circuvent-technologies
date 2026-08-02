import Foundation
import AppIntents

/**
 * The things Siri can actually do.
 *
 * Kept to a small set on purpose. Every intent here is one a person would
 * plausibly say out loud, and each maps to a command the control plane already
 * accepts — nothing is invented for the sake of a longer feature list.
 *
 * `openAppWhenRun` is false throughout: being thrown into the app to watch a
 * light turn on defeats the point of asking Siri.
 */

@available(iOS 16.0, *)
enum PowerAction: String, AppEnum {
  case on
  case off
  case toggle

  static var typeDisplayRepresentation: TypeDisplayRepresentation {
    TypeDisplayRepresentation(name: "Action")
  }

  static var caseDisplayRepresentations: [PowerAction: DisplayRepresentation] = [
    .on: "Turn on",
    .off: "Turn off",
    .toggle: "Toggle",
  ]
}

// MARK: - Control a device

@available(iOS 16.0, *)
struct ControlDeviceIntent: AppIntent {
  static var title: LocalizedStringResource = "Control a Circuvent device"
  static var description = IntentDescription("Turn a Circuvent device on or off.")
  static var openAppWhenRun = false

  @Parameter(title: "Device")
  var device: DeviceEntity

  @Parameter(title: "Action", default: .on)
  var action: PowerAction

  static var parameterSummary: some ParameterSummary {
    Summary("\(\.$action) \(\.$device)")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    guard SiriStore.isSignedIn else {
      return .result(dialog: IntentDialog(stringLiteral: SiriApiError.notSignedIn.errorDescription ?? ""))
    }

    let d = device.asSiriDevice
    // The stored `isOn` is only as fresh as the last sync, so a toggle can be
    // wrong if something changed the device since. Saying which way it went
    // means the user hears the mistake rather than discovering it later.
    let target: Bool
    switch action {
    case .on: target = true
    case .off: target = false
    case .toggle: target = !d.isOn
    }

    do {
      switch d.kind {
      case "lock":     try await SiriApi.setLocked(device: d, locked: !target)
      case "gate":     try await SiriApi.setGate(device: d, open: target)
      case "curtain":  try await SiriApi.setCurtain(device: d, open: target)
      case "security": try await SiriApi.setArmed(device: d, armed: target)
      case "sensor":
        return .result(dialog: "\(d.name) is a sensor, so there's nothing to switch.")
      default:         try await SiriApi.setPower(device: d, on: target)
      }
    } catch let e as SiriApiError {
      return .result(dialog: IntentDialog(stringLiteral: e.errorDescription ?? "That didn't work."))
    }

    return .result(dialog: "\(d.name) \(verb(for: d.kind, on: target)).")
  }

  private func verb(for kind: String, on: Bool) -> String {
    switch kind {
    case "lock":     return on ? "unlocked" : "locked"
    case "gate":     return on ? "opening" : "closing"
    case "curtain":  return on ? "opening" : "closing"
    case "security": return on ? "is armed" : "is disarmed"
    default:         return on ? "is on" : "is off"
    }
  }
}

// MARK: - Locks

@available(iOS 16.0, *)
struct LockDeviceIntent: AppIntent {
  static var title: LocalizedStringResource = "Lock a Circuvent door"
  static var description = IntentDescription("Lock a Circuvent smart lock or door.")
  static var openAppWhenRun = false

  @Parameter(title: "Door")
  var device: DeviceEntity

  static var parameterSummary: some ParameterSummary {
    Summary("Lock \(\.$device)")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    guard SiriStore.isSignedIn else {
      return .result(dialog: IntentDialog(stringLiteral: SiriApiError.notSignedIn.errorDescription ?? ""))
    }
    do {
      try await SiriApi.setLocked(device: device.asSiriDevice, locked: true)
    } catch let e as SiriApiError {
      return .result(dialog: IntentDialog(stringLiteral: e.errorDescription ?? "That didn't work."))
    }
    return .result(dialog: "\(device.name) locked.")
  }
}

/**
 * Unlocking is separated from locking and marked as requiring authentication.
 *
 * Locking a door you are standing next to is harmless. Unlocking one is not,
 * and Siri will answer to a voice through a window. `isDiscoverable` stays
 * true so it can be used deliberately, but the device must be unlocked first.
 */
@available(iOS 16.0, *)
struct UnlockDeviceIntent: AppIntent {
  static var title: LocalizedStringResource = "Unlock a Circuvent door"
  static var description = IntentDescription(
    "Unlock a Circuvent smart lock or door.",
    categoryName: "Security"
  )
  static var openAppWhenRun = false
  /// Requires the phone to be unlocked — a door is not something a voice
  /// through a window should be able to open.
  static var authenticationPolicy: IntentAuthenticationPolicy = .requiresAuthentication

  @Parameter(title: "Door")
  var device: DeviceEntity

  static var parameterSummary: some ParameterSummary {
    Summary("Unlock \(\.$device)")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    guard SiriStore.isSignedIn else {
      return .result(dialog: IntentDialog(stringLiteral: SiriApiError.notSignedIn.errorDescription ?? ""))
    }
    do {
      try await SiriApi.setLocked(device: device.asSiriDevice, locked: false)
    } catch let e as SiriApiError {
      return .result(dialog: IntentDialog(stringLiteral: e.errorDescription ?? "That didn't work."))
    }
    return .result(dialog: "\(device.name) unlocked.")
  }
}

// MARK: - Status

@available(iOS 16.0, *)
struct DeviceStatusIntent: AppIntent {
  static var title: LocalizedStringResource = "Check a Circuvent device"
  static var description = IntentDescription("Ask whether a Circuvent device is on or off.")
  static var openAppWhenRun = false

  @Parameter(title: "Device")
  var device: DeviceEntity

  static var parameterSummary: some ParameterSummary {
    Summary("Check \(\.$device)")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog & ReturnsValue<Bool> {
    guard SiriStore.isSignedIn else {
      return .result(value: false, dialog: IntentDialog(stringLiteral: SiriApiError.notSignedIn.errorDescription ?? ""))
    }
    // Answers from the last synced state rather than fetching. It is what the
    // app itself last saw, and a status question that takes four seconds to
    // answer is worse than one that is a minute stale.
    let d = SiriStore.device(id: device.id) ?? device.asSiriDevice
    let phrase: String
    switch d.kind {
    case "lock":     phrase = d.isOn ? "\(d.name) is unlocked." : "\(d.name) is locked."
    case "gate":     phrase = d.isOn ? "\(d.name) is open." : "\(d.name) is closed."
    case "curtain":  phrase = d.isOn ? "\(d.name) is open." : "\(d.name) is closed."
    case "security": phrase = d.isOn ? "\(d.name) is armed." : "\(d.name) is disarmed."
    default:         phrase = d.isOn ? "\(d.name) is on." : "\(d.name) is off."
    }
    return .result(value: d.isOn, dialog: IntentDialog(stringLiteral: phrase))
  }
}
