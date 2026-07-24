import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "./src/auth";
import { ThemeProvider, useTheme } from "./src/ui";
import { DevicesProvider } from "./src/store";
import Login from "./src/screens/Login";
import Shell from "./src/screens/Shell";

function Root() {
  const { account, ready } = useAuth();
  const { c, scheme } = useTheme();

  if (!ready) {
    return (
      <View style={[s.center, { backgroundColor: c.bg }]}>
        <ActivityIndicator color={c.accentHi} size="large" />
      </View>
    );
  }
  return (
    <>
      <StatusBar style={scheme === "light" ? "dark" : "light"} />
      {account ? (
        <DevicesProvider>
          <Shell />
        </DevicesProvider>
      ) : (
        <Login />
      )}
    </>
  );
}

export default function App() {
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
