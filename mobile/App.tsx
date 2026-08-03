import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "./src/auth";
import { ThemeProvider, useTheme } from "./src/ui";
import { DevicesProvider } from "./src/store";
import { SiriSync } from "./src/siri-sync";
import { initHaptics } from "./src/haptics";
import Login from "./src/screens/Login";
import Shell from "./src/screens/Shell";
import Onboarding, { hasSeenOnboarding } from "./src/screens/Onboarding";

function Root() {
  const { account, ready } = useAuth();
  const { c, scheme } = useTheme();
  // null = still asking storage. Rendering anything before the answer arrives
  // would flash the intro at someone who has already been through it.
  const [onboarded, setOnboarded] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    let alive = true;
    hasSeenOnboarding().then((v) => { if (alive) setOnboarded(v); });
    return () => { alive = false; };
  }, []);

  if (!ready || onboarded === null) {
    return (
      <View style={[s.center, { backgroundColor: c.bg }]}>
        <ActivityIndicator color={c.accentHi} size="large" />
      </View>
    );
  }

  // Shown before sign-in: it explains what the app is for, which is exactly
  // what someone deciding whether to create an account wants to know. It is
  // also the only point where a returning user is guaranteed not to see it.
  if (!onboarded && !account) {
    return (
      <>
        <StatusBar style={scheme === "light" ? "dark" : "light"} />
        <Onboarding onDone={() => setOnboarded(true)} />
      </>
    );
  }

  return (
    <>
      <StatusBar style={scheme === "light" ? "dark" : "light"} />
      {account ? (
        <DevicesProvider>
          <SiriSync />
          <Shell />
        </DevicesProvider>
      ) : (
        <Login />
      )}
    </>
  );
}

export default function App() {
  React.useEffect(() => {
    initHaptics().catch(() => {});
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </ThemeProvider>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
