import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Device } from "../api";
import { Card, Screen, SectionLabel, Title, useTheme, useBackHandler, useSafeArea } from "../ui";
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

type Seg = "scenes" | "rooms" | "automations";
type K = "sensors" | "analytics" | "deviceHub" | "activity" | "maintenance" | "safety" | "security" | "system" | "ai" | "aiFeatures" | "aiModels" | "lifestyle" | "suggestions" | "export" | "mqtt" | "admin" | "schedules" | "profile" | "notifications" | "securitySettings" | "connections" | "backup" | "help" | "about" | "uiKit" | "dashboard" | "charts" | "weather" | "cameras" | "billpay" | "voice";
const groups: { title: string; items: { key: K; icon: IconName; label: string; subtitle: string }[] }[] = [
  { title: "Monitoring", items: [{ key: "sensors", icon: "sensors", label: "Sensors", subtitle: "Live readings" }, { key: "analytics", icon: "analytics", label: "Analytics", subtitle: "Usage trends" }, { key: "weather", icon: "weather", label: "Weather", subtitle: "Forecast & AQI" }, { key: "deviceHub", icon: "hub", label: "Device Hub", subtitle: "Manage rooms" }, { key: "activity", icon: "history", label: "Activity Log", subtitle: "Full timeline" }, { key: "maintenance", icon: "maintenance", label: "Maintenance", subtitle: "Health checks" }] },
  { title: "Tools", items: [{ key: "schedules", icon: "schedules", label: "Schedules", subtitle: "Timers & routines" }, { key: "billpay", icon: "bill", label: "Pay Bills", subtitle: "Electricity bills" }, { key: "dashboard", icon: "dashboard", label: "Custom Dashboard", subtitle: "Pick widgets" }, { key: "charts", icon: "charts", label: "Charts & Widgets", subtitle: "Full chart suite" }, { key: "uiKit", icon: "uikit", label: "UI Components", subtitle: "Showcase" }] },
  { title: "Intelligence", items: [{ key: "voice", icon: "voice", label: "Assistant", subtitle: "Voice & commands" }, { key: "ai", icon: "ai", label: "AI Insights", subtitle: "Real data cards" }, { key: "aiFeatures", icon: "sparkles", label: "AI Features", subtitle: "Feature grid" }, { key: "aiModels", icon: "brain", label: "AI Models", subtitle: "Engines" }, { key: "lifestyle", icon: "leaf", label: "Lifestyle", subtitle: "Comfort tips" }, { key: "suggestions", icon: "idea", label: "Suggestions", subtitle: "Actionable" }] },
  { title: "Safety & Security", items: [{ key: "cameras", icon: "camera", label: "Cameras", subtitle: "Live IP camera feeds" }, { key: "safety", icon: "sos", label: "Safety Center", subtitle: "SOS & alerts" }, { key: "security", icon: "security", label: "Security", subtitle: "Arm/disarm" }] },
  { title: "System", items: [{ key: "system", icon: "system", label: "System", subtitle: "Health & API" }, { key: "export", icon: "download", label: "Data Export", subtitle: "JSON/CSV" }, { key: "mqtt", icon: "mqtt", label: "MQTT", subtitle: "Connection info" }] },
  { title: "Account & Settings", items: [{ key: "profile", icon: "profile", label: "Profile", subtitle: "Account summary" }, { key: "notifications", icon: "bell", label: "Notifications", subtitle: "Alerts & quiet hours" }, { key: "securitySettings", icon: "shieldLock", label: "Security Settings", subtitle: "Lock & sessions" }, { key: "connections", icon: "globe", label: "Connections", subtitle: "API, broker, devices" }, { key: "backup", icon: "backup", label: "Backup", subtitle: "Export account data" }, { key: "help", icon: "help", label: "Help & Support", subtitle: "FAQ & contact" }, { key: "about", icon: "about", label: "About", subtitle: "Version & credits" }] },
  { title: "Admin", items: [{ key: "admin", icon: "admin", label: "Admin Console", subtitle: "Control plane" }] },
];
export default function More({ onOpenDevice, onOpenAutomate, onAddDevice, onOpenSettings, onOpenEnergy, onOpenDevices }: { onOpenDevice: (d: Device) => void; onOpenAutomate: (s?: Seg) => void; onAddDevice: () => void; onOpenSettings?: () => void; onOpenEnergy?: () => void; onOpenDevices?: () => void }) {
  const { c } = useTheme(); const insets = useSafeArea(); const [screen, setScreen] = useState<K | null>(null); const back = () => setScreen(null); useBackHandler(() => { if (screen) { setScreen(null); return true; } return false; });
  if (screen === "sensors") return <Sensors onBack={back} />; if (screen === "cameras") return <Cameras onBack={back} />; if (screen === "weather") return <Weather onBack={back} />; if (screen === "analytics") return <Analytics onBack={back} />; if (screen === "deviceHub") return <DeviceHub onBack={back} onOpenDevice={onOpenDevice} onAdd={onAddDevice} />; if (screen === "activity") return <ActivityLog onBack={back} />; if (screen === "maintenance") return <Maintenance onBack={back} onOpenDevice={onOpenDevice} />; if (screen === "safety") return <SafetyCenter onBack={back} />; if (screen === "security") return <SecurityDashboard onBack={back} />; if (screen === "system") return <SystemManagement onBack={back} />; if (screen === "ai") return <AiHub onBack={back} onOpenEnergy={() => onOpenEnergy?.()} onOpenAutomate={() => onOpenAutomate("automations")} onOpenDevices={() => onOpenDevices?.()} onOpenSuggestions={() => setScreen("suggestions")} />; if (screen === "aiFeatures") return <AiFeaturesHub onBack={back} onOpenSuggestions={() => setScreen("suggestions")} onOpenAutomate={() => onOpenAutomate("automations")} onOpenSecurity={() => setScreen("security")} onOpenEnergy={() => onOpenEnergy?.()} />; if (screen === "aiModels") return <AiModels onBack={back} />; if (screen === "lifestyle") return <LifestyleHub onBack={back} />; if (screen === "suggestions") return <SmartSuggestions onBack={back} onOpenAutomate={() => onOpenAutomate("automations")} onOpenDevices={() => onOpenDevices?.()} onOpenSettings={() => onOpenSettings?.()} />; if (screen === "export") return <DataExport onBack={back} />; if (screen === "mqtt") return <MqttSettings onBack={back} />; if (screen === "admin") return <AdminConsole onBack={back} />; if (screen === "schedules") return <Schedules onBack={back} />; if (screen === "billpay") return <BillPayment onBack={back} />; if (screen === "voice") return <VoiceAssistant onBack={back} />; if (screen === "profile") return <Profile onBack={back} />; if (screen === "notifications") return <NotificationSettings onBack={back} />; if (screen === "securitySettings") return <SecuritySettings onBack={back} />; if (screen === "connections") return <ConnectionSettings onBack={back} />; if (screen === "backup") return <DataBackup onBack={back} />; if (screen === "help") return <HelpSupport onBack={back} />; if (screen === "about") return <About onBack={back} />; if (screen === "uiKit") return <UiKit onBack={back} />; if (screen === "dashboard") return <CustomDashboard onBack={back} />; if (screen === "charts") return <ChartsGallery onBack={back} />;
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, paddingBottom: 90 }}>
        <Title style={{ marginBottom: 16 }}>More</Title>
        {groups.map((g) => (
          <View key={g.title}>
            <SectionLabel>{g.title.toUpperCase()}</SectionLabel>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
              {g.items.map((it) => (
                <Card
                  key={it.key}
                  onPress={() => setScreen(it.key)}
                  style={{ width: "48%", minHeight: 118 }}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: c.accent + "22" }}>
                    <Icon name={it.icon} size={22} color={c.accentHi} />
                  </View>
                  <Text style={{ color: c.text, fontWeight: "900", marginTop: 10 }} numberOfLines={1}>{it.label}</Text>
                  <Text style={{ color: c.faint, marginTop: 4, fontSize: 12 }} numberOfLines={2}>{it.subtitle}</Text>
                </Card>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
