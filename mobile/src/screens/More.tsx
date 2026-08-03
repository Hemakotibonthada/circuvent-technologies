import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View, useWindowDimensions } from "react-native";
import { api, Device } from "../api";
import { Card, Screen, SectionLabel, Title, useTheme, useBackHandler, useSafeArea, SwipeBack } from "../ui";
import { RADIUS, SPACE, TYPE } from "../theme";
import { Icon, type IconName } from "../icons";
import Sensors from "./more/Sensors";
import Analytics from "./more/Analytics";
import DeviceHub from "./more/DeviceHub";
import ActivityLog from "./more/ActivityLog";
import Maintenance from "./more/Maintenance";
import SafetyCenter from "./more/SafetyCenter";
import SecurityDashboard from "./more/SecurityDashboard";
import SystemManagement from "./more/SystemManagement";
import AiHub from "./more/AiHub";
import AiFeaturesHub from "./more/AiFeaturesHub";
import AiModels from "./more/AiModels";
import LifestyleHub from "./more/LifestyleHub";
import SmartSuggestions from "./more/SmartSuggestions";
import DataExport from "./more/DataExport";
import MqttSettings from "./more/MqttSettings";
import AdminConsole from "./more/AdminConsole";
import Schedules from "./more/Schedules";
import Profile from "./more/Profile";
import NotificationSettings from "./more/NotificationSettings";
import SecuritySettings from "./more/SecuritySettings";
import ConnectionSettings from "./more/ConnectionSettings";
import DataBackup from "./more/DataBackup";
import HelpSupport from "./more/HelpSupport";
import About from "./more/About";
import UiKit from "./more/UiKit";
import CustomDashboard from "./more/CustomDashboard";
import ChartsGallery from "./more/ChartsGallery";
import Cameras from "./more/Cameras";
import BillPayment from "./more/BillPayment";
import VoiceAssistant from "./more/VoiceAssistant";
import Weather from "./Weather";
import type { EnterpriseScreen } from "./enterprise/registry";
import { GATE_SCREENS } from "./enterprise/gate";
import { FLEET_SCREENS } from "./enterprise/fleet";
import { ENERGY_SCREENS } from "./enterprise/energy";
import { SECURITY_SCREENS } from "./enterprise/security";
import { DIAG_SCREENS } from "./enterprise/diagnostics";
import { AUTOMATION_SCREENS } from "./enterprise/automation";
import { ZONES_SCREENS } from "./enterprise/zones";
import { ADMIN_SCREENS } from "./enterprise/admin";

/**
 * Enterprise modules are self-registering: each exports an `EnterpriseScreen[]`
 * and this hub groups them by `group`. Adding a module is one import + one entry
 * here — no union type, no if-chain, no four-place edit.
 */
const ENTERPRISE: EnterpriseScreen[] = [
  ...ZONES_SCREENS,
  ...ENERGY_SCREENS,
  ...AUTOMATION_SCREENS,
  ...SECURITY_SCREENS,
  ...GATE_SCREENS,
  ...DIAG_SCREENS,
  ...FLEET_SCREENS,
  ...ADMIN_SCREENS,
];

type Seg = "scenes" | "rooms" | "automations";
type K = "sensors" | "analytics" | "deviceHub" | "activity" | "maintenance" | "safety" | "security" | "system" | "ai" | "aiFeatures" | "aiModels" | "lifestyle" | "suggestions" | "export" | "mqtt" | "admin" | "schedules" | "profile" | "notifications" | "securitySettings" | "connections" | "backup" | "help" | "about" | "uiKit" | "dashboard" | "charts" | "weather" | "cameras" | "billpay" | "voice";
const groups: { title: string; items: { key: K; icon: IconName; label: string; subtitle: string }[] }[] = [
  { title: "Monitoring", items: [{ key: "sensors", icon: "sensors", label: "Sensors", subtitle: "Live readings" }, { key: "analytics", icon: "analytics", label: "Analytics", subtitle: "Usage trends" }, { key: "weather", icon: "weather", label: "Weather", subtitle: "Forecast & AQI" }, { key: "deviceHub", icon: "hub", label: "Device hub", subtitle: "Manage rooms" }, { key: "activity", icon: "history", label: "Activity log", subtitle: "Full timeline" }, { key: "maintenance", icon: "maintenance", label: "Maintenance", subtitle: "Health checks" }] },
  { title: "Tools", items: [{ key: "schedules", icon: "schedules", label: "Switch timers", subtitle: "Schedule one switch" }, { key: "billpay", icon: "bill", label: "Pay bills", subtitle: "Electricity bills" }, { key: "dashboard", icon: "dashboard", label: "Custom dashboard", subtitle: "Pick widgets" }, { key: "charts", icon: "charts", label: "Charts & widgets", subtitle: "Full chart suite" }, { key: "uiKit", icon: "uikit", label: "UI components", subtitle: "Showcase" }] },
  { title: "Intelligence", items: [{ key: "voice", icon: "voice", label: "Assistant", subtitle: "Voice & commands" }, { key: "ai", icon: "ai", label: "AI insights", subtitle: "Real data cards" }, { key: "aiFeatures", icon: "sparkles", label: "AI features", subtitle: "Feature grid" }, { key: "aiModels", icon: "brain", label: "AI models", subtitle: "Engines" }, { key: "lifestyle", icon: "leaf", label: "Lifestyle", subtitle: "Comfort tips" }, { key: "suggestions", icon: "idea", label: "Suggestions", subtitle: "Actionable" }] },
  { title: "Safety & security", items: [{ key: "cameras", icon: "camera", label: "Cameras", subtitle: "Live IP camera feeds" }, { key: "safety", icon: "sos", label: "Safety center", subtitle: "SOS & alerts" }, { key: "security", icon: "security", label: "Security", subtitle: "Arm/disarm" }] },
  { title: "System", items: [{ key: "system", icon: "system", label: "System", subtitle: "Health & API" }, { key: "export", icon: "download", label: "Data export", subtitle: "JSON/CSV" }, { key: "mqtt", icon: "mqtt", label: "MQTT", subtitle: "Connection info" }] },
  { title: "Account & settings", items: [{ key: "profile", icon: "profile", label: "Profile", subtitle: "Account summary" }, { key: "notifications", icon: "bell", label: "Notifications", subtitle: "Alerts & quiet hours" }, { key: "securitySettings", icon: "shieldLock", label: "Security settings", subtitle: "Lock & sessions" }, { key: "connections", icon: "globe", label: "Connections", subtitle: "API, broker, devices" }, { key: "backup", icon: "backup", label: "Backup", subtitle: "Export account data" }, { key: "help", icon: "help", label: "Help & support", subtitle: "FAQ & contact" }, { key: "about", icon: "about", label: "About", subtitle: "Version & credits" }] },
  { title: "Admin", items: [{ key: "admin", icon: "admin", label: "Admin console", subtitle: "Control plane" }] },
];
const PAGE_PAD = SPACE.lg;
const GUTTER = SPACE.md;

type Tile = { key: string; icon: IconName; label: string; subtitle: string };

/**
 * Two-column tile grid.
 *
 * The column width is computed in pixels rather than set to `48%` because a
 * pressable `Card` puts its `style` on an inner animated node, so a percentage
 * would resolve against the Pressable (content-sized) instead of the row. The
 * percentage also overflowed on 320pt screens once the `gap` was added —
 * 48% + 48% + 12 > 100% — silently collapsing the grid to one column.
 */
function TileGrid({ items, onPress }: { items: Tile[]; onPress: (key: string) => void }) {
  const { c } = useTheme();
  const { width: winW } = useWindowDimensions();
  const colW = Math.floor((winW - PAGE_PAD * 2 - GUTTER) / 2);

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: GUTTER, marginBottom: SPACE.xl }}>
      {items.map((it) => (
        <View key={it.key} style={{ width: colW }}>
          <Card onPress={() => onPress(it.key)} style={{ minHeight: 122 }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: RADIUS.control,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: c.accent + "22",
              }}
            >
              <Icon name={it.icon} size={22} color={c.accentHi} />
            </View>
            <Text style={{ color: c.text, ...TYPE.body, fontWeight: "700", marginTop: SPACE.md }} numberOfLines={1}>
              {it.label}
            </Text>
            <Text style={{ color: c.faint, ...TYPE.caption, marginTop: SPACE.xs }} numberOfLines={2}>
              {it.subtitle}
            </Text>
          </Card>
        </View>
      ))}
    </View>
  );
}

function Divider({ label }: { label: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.md, marginTop: SPACE.xs, marginBottom: SPACE.lg }}>
      <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
      <Text style={{ color: c.faint, ...TYPE.label }}>{label}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
    </View>
  );
}

export default function More({ onOpenDevice, onOpenAutomate, onAddDevice, onOpenSettings, onOpenEnergy, onOpenDevices }: { onOpenDevice: (d: Device) => void; onOpenAutomate: (s?: Seg) => void; onAddDevice: () => void; onOpenSettings?: () => void; onOpenEnergy?: () => void; onOpenDevices?: () => void }) {
  const insets = useSafeArea(); const [screen, setScreen] = useState<K | null>(null); const [entKey, setEntKey] = useState<string | null>(null); const [isAdmin, setIsAdmin] = useState(false); const back = () => setScreen(null); const entBack = () => setEntKey(null);
  useEffect(() => { let alive = true; api.adminMe().then((r) => { if (alive && r.ok) setIsAdmin(!!r.data.admin); }).catch(() => undefined); return () => { alive = false; }; }, []);
  useBackHandler(() => { if (entKey) { setEntKey(null); return true; } if (screen) { setScreen(null); return true; } return false; });
  const entGroups = useMemo(() => {
    const visible = ENTERPRISE.filter((s) => !s.admin || isAdmin);
    const order: string[] = []; const byGroup = new Map<string, EnterpriseScreen[]>();
    for (const s of visible) { if (!byGroup.has(s.group)) { byGroup.set(s.group, []); order.push(s.group); } byGroup.get(s.group)!.push(s); }
    return order.map((title) => ({ title, items: byGroup.get(title)! }));
  }, [isAdmin]);
  const ent = entKey ? ENTERPRISE.find((s) => s.key === entKey) : undefined;

  // Every sub-screen goes through one wrapper so the iOS edge swipe reaches
  // them. Shell's swipe only knows about tabs and overlays; this screen keeps
  // its own stack, so without this a swipe from "About" jumped straight to Home
  // instead of back to the More list. Android was already correct because its
  // system back reaches the useBackHandler above.
  const subScreen = (() => {
  if (ent) return ent.render({ onBack: entBack });
  if (screen === "sensors") return <Sensors onBack={back} />; if (screen === "cameras") return <Cameras onBack={back} />; if (screen === "weather") return <Weather onBack={back} />; if (screen === "analytics") return <Analytics onBack={back} />; if (screen === "deviceHub") return <DeviceHub onBack={back} onOpenDevice={onOpenDevice} onAdd={onAddDevice} />; if (screen === "activity") return <ActivityLog onBack={back} />; if (screen === "maintenance") return <Maintenance onBack={back} onOpenDevice={onOpenDevice} />; if (screen === "safety") return <SafetyCenter onBack={back} />; if (screen === "security") return <SecurityDashboard onBack={back} />; if (screen === "system") return <SystemManagement onBack={back} />; if (screen === "ai") return <AiHub onBack={back} onOpenEnergy={() => onOpenEnergy?.()} onOpenAutomate={() => onOpenAutomate("automations")} onOpenDevices={() => onOpenDevices?.()} onOpenSuggestions={() => setScreen("suggestions")} />; if (screen === "aiFeatures") return <AiFeaturesHub onBack={back} onOpenSuggestions={() => setScreen("suggestions")} onOpenAutomate={() => onOpenAutomate("automations")} onOpenSecurity={() => setScreen("security")} onOpenEnergy={() => onOpenEnergy?.()} />; if (screen === "aiModels") return <AiModels onBack={back} />; if (screen === "lifestyle") return <LifestyleHub onBack={back} />; if (screen === "suggestions") return <SmartSuggestions onBack={back} onOpenAutomate={() => onOpenAutomate("automations")} onOpenDevices={() => onOpenDevices?.()} onOpenSettings={() => onOpenSettings?.()} />; if (screen === "export") return <DataExport onBack={back} />; if (screen === "mqtt") return <MqttSettings onBack={back} />; if (screen === "admin") return <AdminConsole onBack={back} />; if (screen === "schedules") return <Schedules onBack={back} />; if (screen === "billpay") return <BillPayment onBack={back} />; if (screen === "voice") return <VoiceAssistant onBack={back} />; if (screen === "profile") return <Profile onBack={back} />; if (screen === "notifications") return <NotificationSettings onBack={back} />; if (screen === "securitySettings") return <SecuritySettings onBack={back} />; if (screen === "connections") return <ConnectionSettings onBack={back} />; if (screen === "backup") return <DataBackup onBack={back} />; if (screen === "help") return <HelpSupport onBack={back} />; if (screen === "about") return <About onBack={back} />; if (screen === "uiKit") return <UiKit onBack={back} />; if (screen === "dashboard") return <CustomDashboard onBack={back} />; if (screen === "charts") return <ChartsGallery onBack={back} />;
    return null;
  })();

  if (subScreen) {
    return <SwipeBack onBack={entKey ? entBack : back}>{subScreen}</SwipeBack>;
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: PAGE_PAD, paddingTop: insets.top + SPACE.md, paddingBottom: 90 }}>
        <Title style={{ marginBottom: SPACE.xl }}>More</Title>
        {groups.map((g) => (
          <View key={g.title}>
            <SectionLabel>{g.title}</SectionLabel>
            <TileGrid items={g.items} onPress={(k) => setScreen(k as K)} />
          </View>
        ))}
        {entGroups.length > 0 && <Divider label="Enterprise suite" />}
        {entGroups.map((g) => (
          <View key={g.title}>
            <SectionLabel>{g.title}</SectionLabel>
            <TileGrid
              items={g.items.map((it) => ({ key: it.key, icon: it.icon, label: it.title, subtitle: it.subtitle }))}
              onPress={setEntKey}
            />
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
