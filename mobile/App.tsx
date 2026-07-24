import React, { useState } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "./src/auth";
import Login from "./src/screens/Login";
import Devices from "./src/screens/Devices";
import Control from "./src/screens/Control";
import Automations from "./src/screens/Automations";
import { Device } from "./src/api";

function Root() {
  const { account, ready } = useAuth();
  const [selected, setSelected] = useState<Device | null>(null);
  const [showAutomations, setShowAutomations] = useState(false);

  if (!ready) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#06b6d4" size="large" />
      </View>
    );
  }
  if (!account) return <Login />;
  if (showAutomations) return <Automations onBack={() => setShowAutomations(false)} />;
  if (selected) return <Control device={selected} onBack={() => setSelected(null)} />;
  return <Devices onOpen={setSelected} onAutomations={() => setShowAutomations(true)} />;
}

export default function App() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Root />
    </AuthProvider>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: "#0b1020", alignItems: "center", justifyContent: "center" },
});
