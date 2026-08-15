import SwiftUI

/// The per-device control sheet.
///
/// Driven entirely by `DeviceCapabilities`, exactly as the Android sheet is.
/// That is the whole point: twenty-four device types share one screen, so there
/// is one place to get a control right rather than twenty-four places to forget
/// one.
struct DeviceSheet: View {
    @EnvironmentObject var model: HomeModel
    let device: Device

    private var caps: Capabilities { DeviceCapabilities.of(device.type) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    header

                    if !device.online {
                        Text("This device is not answering. Controls are shown but will not " +
                             "reach it until it is back.")
                            .font(.system(size: 13))
                            .foregroundStyle(Palette.amber)
                    }

                    if let power = caps.power {
                        controlRow(power.label) {
                            if model.pending.contains("\(device.id)::\(power.field)") {
                                ProgressView()
                            } else {
                                Toggle("", isOn: Binding(
                                    get: { device.bool(power.field) == true },
                                    set: { v in
                                        Task { await model.toggle(device, field: power.field, value: v) }
                                    }
                                ))
                                .labelsHidden()
                                .tint(Palette.cyan)
                                .disabled(!device.online)
                            }
                        }
                    }

                    if let dimmer = caps.dimmer {
                        LevelControl(
                            label: dimmer.label,
                            value: Int(device.number(dimmer.field) ?? 0),
                            enabled: device.online
                        ) { v in
                            Task { await model.setLevel(device, field: dimmer.field, value: v) }
                        }
                    }

                    if let fan = caps.fan {
                        LevelControl(
                            label: fan.label,
                            value: Int(device.number(fan.field) ?? 0),
                            enabled: device.online
                        ) { v in
                            Task {
                                await model.setLevel(device, field: fan.field, value: v,
                                                     legacyField: fan.legacyField)
                            }
                        }
                    }

                    if let thermo = caps.thermostat {
                        let current = Int(device.number(thermo.field) ?? Double(thermo.min))
                        controlRow("\(thermo.label) · \(current)°") {
                            HStack(spacing: 8) {
                                Button("−") {
                                    Task {
                                        await model.setTarget(device, field: thermo.field,
                                                              value: max(current - 1, thermo.min))
                                    }
                                }
                                Button("+") {
                                    Task {
                                        await model.setTarget(device, field: thermo.field,
                                                              value: min(current + 1, thermo.max))
                                    }
                                }
                            }
                            .buttonStyle(.bordered)
                            .disabled(!device.online)
                        }
                    }

                    if device.type == "touchboard" || device.type == "touchboard-8" {
                        gangs
                    }

                    Divider().overlay(Color.white.opacity(0.08))

                    SectionLabel("Setup")
                    Button("Open its setup hotspot") {
                        Task { await model.openSetupMode(device) }
                    }
                    .buttonStyle(.bordered)
                    .frame(maxWidth: .infinity)
                    .disabled(!device.online)
                    Text("The device raises its own hotspot for ten minutes and then rejoins " +
                         "your Wi-Fi. Nobody has to walk to it.")
                        .font(.system(size: 11)).foregroundStyle(Palette.muted)

                    if !device.state.isEmpty {
                        Divider().overlay(Color.white.opacity(0.08))
                        SectionLabel("Reported state")
                        ForEach(device.state.keys.sorted(), id: \.self) { key in
                            HStack {
                                Text(key).font(.system(size: 12)).foregroundStyle(Palette.muted)
                                Spacer()
                                Text(describe(device.state[key]))
                                    .font(.system(size: 12)).foregroundStyle(.white)
                            }
                        }
                    }
                }
                .padding(20)
            }
            .background(Palette.ink)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { model.openDeviceID = nil }
                }
            }
        }
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(device.label).font(.system(size: 24, weight: .bold)).foregroundStyle(.white)
                Text(subtitle).font(.system(size: 12)).foregroundStyle(Palette.muted)
            }
            Spacer()
            Button(device.favorite ? "★ Starred" : "☆ Star") {
                Task { await model.star(device) }
            }
            .font(.system(size: 13))
        }
    }

    private var subtitle: String {
        var parts = [device.type]
        if !device.online { parts.append("offline") }
        if let fw = device.fwVersion, !fw.isEmpty { parts.append("fw \(fw)") }
        return parts.joined(separator: " · ")
    }

    @ViewBuilder
    private var gangs: some View {
        let present = (1...8).filter { device.state["g\($0)"] != nil }
        SectionLabel("Gangs")
        ForEach(present, id: \.self) { g in
            let field = "g\(g)"
            controlRow("Gang \(g)") {
                if model.pending.contains("\(device.id)::\(field)") {
                    ProgressView()
                } else {
                    Toggle("", isOn: Binding(
                        get: { device.bool(field) == true },
                        set: { v in Task { await model.toggle(device, field: field, value: v) } }
                    ))
                    .labelsHidden()
                    .tint(Palette.cyan)
                    .disabled(!device.online)
                }
            }
        }
        // A whole-board control, which is a real command the sketch reads
        // rather than eight separate ones.
        HStack(spacing: 10) {
            Button("All on") { Task { await model.allGangs(device, value: true) } }
                .frame(maxWidth: .infinity)
            Button("All off") { Task { await model.allGangs(device, value: false) } }
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
        .disabled(!device.online)
    }

    private func controlRow<Control: View>(
        _ label: String,
        @ViewBuilder control: () -> Control
    ) -> some View {
        HStack {
            Text(label).font(.system(size: 15)).foregroundStyle(.white)
            Spacer()
            control()
        }
    }

    private func describe(_ value: JSONValue?) -> String {
        switch value {
        case .string(let v): return v
        case .number(let v): return v == v.rounded() ? String(Int(v)) : String(format: "%.2f", v)
        case .bool(let v): return v ? "true" : "false"
        case .null, .none: return "—"
        default: return "…"
        }
    }
}

/// A 0..100 slider.
///
/// Held locally while dragging and only sent on release. A slider that
/// publishes every intermediate value floods the broker with commands the
/// device cannot keep up with, and the visible result is a control that lags
/// and then jumps.
struct LevelControl: View {
    let label: String
    let value: Int
    let enabled: Bool
    let onChange: (Int) -> Void

    @State private var local: Double = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("\(label) · \(Int(local))%").font(.system(size: 15)).foregroundStyle(.white)
            Slider(
                value: $local,
                in: 0...100,
                onEditingChanged: { editing in
                    if !editing { onChange(Int(local)) }
                }
            )
            .tint(Palette.cyan)
            .disabled(!enabled)
        }
        .onAppear { local = Double(value) }
        .onChange(of: value) { _, new in local = Double(new) }
    }
}
