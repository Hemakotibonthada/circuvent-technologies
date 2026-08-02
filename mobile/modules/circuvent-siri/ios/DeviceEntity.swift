import Foundation
import AppIntents

/**
 * A Circuvent device, as Siri and the Shortcuts app see it.
 *
 * The query resolves against the list the app last synced, so "turn on the
 * porch light" is matched locally with no network round-trip. That matters:
 * Siri is unforgiving about latency, and a lookup over the internet before the
 * command even starts is the difference between feeling instant and feeling
 * broken.
 */

@available(iOS 16.0, *)
struct DeviceEntity: AppEntity, Identifiable {
  let id: String
  let name: String
  let room: String?
  let type: String
  let toggleField: String
  let isOn: Bool
  let kind: String

  init(_ d: SiriDevice) {
    self.id = d.id
    self.name = d.name
    self.room = d.room
    self.type = d.type
    self.toggleField = d.toggleField
    self.isOn = d.isOn
    self.kind = d.kind
  }

  var asSiriDevice: SiriDevice {
    SiriDevice(id: id, name: name, room: room, type: type,
               toggleField: toggleField, isOn: isOn, kind: kind)
  }

  static var typeDisplayRepresentation: TypeDisplayRepresentation {
    TypeDisplayRepresentation(name: "Device")
  }

  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(
      title: "\(name)",
      subtitle: room.map { "\($0)" }
    )
  }

  static var defaultQuery = DeviceQuery()
}

@available(iOS 16.0, *)
struct DeviceQuery: EntityStringQuery {
  /// Used when Shortcuts restores a saved shortcut referencing specific devices.
  func entities(for identifiers: [String]) async throws -> [DeviceEntity] {
    SiriStore.devices.filter { identifiers.contains($0.id) }.map(DeviceEntity.init)
  }

  /// Used when the user speaks or types a name.
  func entities(matching string: String) async throws -> [DeviceEntity] {
    SiriStore.devices(matching: string).map(DeviceEntity.init)
  }

  /// The picker list in the Shortcuts app.
  func suggestedEntities() async throws -> [DeviceEntity] {
    // Sensors cannot be commanded, so offering them here would only produce
    // shortcuts that fail when run.
    SiriStore.devices.filter { $0.kind != "sensor" }.map(DeviceEntity.init)
  }
}
