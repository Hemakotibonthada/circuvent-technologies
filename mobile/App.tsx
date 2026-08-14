import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "./src/auth";
import { ThemeProvider, useTheme } from "./src/ui";
import { FirstRunPermissions, firstRunNeeded } from "./src/FirstRunPermissions";
import { BiometricGate } from "./src/BiometricGate";
import { DevicesProvider } from "./src/store";
import CommandFailureBanner from "./src/CommandFailureBanner";
import { SiriSync } from "./src/siri-sync";
import { initHaptics } from "./src/haptics";
import Login from "./src/screens/Login";
import Shell from "./src/screens/Shell";
import Onboarding, { hasSeenOnboarding } from "./src/screens/Onboarding";
import { ErrorBoundary } from "./src/overlays";

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
          {/*
            Keyed on the account so signing in as someone else clears a caught
            error, and remounts the shell rather than restoring a tree that
            belonged to the previous session.

            Without this an uncaught render error anywhere in the app unmounted
            everything and left a white screen — on a phone that controls a
            house, with no way back to the lights and no route except force-quit.
          */}
          <ErrorBoundary label="shell" key={account.email}>
            <Shell />
          </ErrorBoundary>
          {/*
            Outside the boundary on purpose. A command that fails while the
            shell is in a caught-error state is exactly when somebody most
            needs to be told why, and putting this inside would take the
            message down with the screen.
          */}
          <CommandFailureBanner />
        </DevicesProvider>
      ) : (
        <Login />
      )}
    </>
  );
}

export default function App() {
  const [firstRun, setFirstRun] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    initHaptics().catch(() => {});
  }, []);

  React.useEffect(() => {
    firstRunNeeded()
      .then(setFirstRun)
      .catch(() => setFirstRun(false));
  }, []);

  /*
   * The permission screen sits outside the providers and above the lock.
   *
   * Outside, because it asks for notifications, and the notification module is
   * what several providers set themselves up against — asking after they have
   * already decided there is no permission means the answer arrives too late to
   * be used until the next launch.
   *
   * Above the lock, because on a first launch there is nothing to protect yet
   * and a fingerprint prompt stacked on top of a permission prompt is two
   * system sheets fighting over the same screen.
   */
  if (firstRun === null) return null;
  if (firstRun)
    return (
      <SafeAreaProvider>
        <ThemeProvider>
          <FirstRunPermissions onDone={() => setFirstRun(false)} />
        </ThemeProvider>
      </SafeAreaProvider>
    );

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <BiometricGate>
          <AuthProvider>
            <Root />
          </AuthProvider>
        </BiometricGate>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
