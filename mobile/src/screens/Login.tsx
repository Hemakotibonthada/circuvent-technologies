import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useAuth } from "../auth";

export default function Login() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const submit = async () => {
    setBusy(true);
    setMsg("");
    const r =
      mode === "login"
        ? await login(email.trim(), password)
        : await register(name.trim(), email.trim(), password);
    if (!r.ok) setMsg(r.message || "");
    setBusy(false);
  };

  return (
    <View style={s.wrap}>
      <Text style={s.logo}>
        Circu<Text style={{ color: "#06b6d4" }}>vent</Text>
      </Text>
      <Text style={s.sub}>Control your smart devices</Text>

      {mode === "register" && (
        <TextInput style={s.input} placeholder="Full name" placeholderTextColor="#64748b" value={name} onChangeText={setName} />
      )}
      <TextInput
        style={s.input}
        placeholder="Email"
        placeholderTextColor="#64748b"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput style={s.input} placeholder="Password" placeholderTextColor="#64748b" secureTextEntry value={password} onChangeText={setPassword} />

      <Pressable style={s.btn} onPress={submit} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnT}>{mode === "login" ? "Sign in" : "Create account"}</Text>}
      </Pressable>

      {!!msg && <Text style={s.msg}>{msg}</Text>}

      <Pressable onPress={() => { setMode(mode === "login" ? "register" : "login"); setMsg(""); }}>
        <Text style={s.link}>{mode === "login" ? "New here? Create an account" : "Have an account? Sign in"}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#0b1020", padding: 24, justifyContent: "center" },
  logo: { color: "#fff", fontSize: 34, fontWeight: "800", textAlign: "center" },
  sub: { color: "#94a3b8", textAlign: "center", marginBottom: 28 },
  input: { backgroundColor: "#111827", borderColor: "#334155", borderWidth: 1, borderRadius: 12, color: "#e5e7eb", padding: 14, marginBottom: 12 },
  btn: { backgroundColor: "#06b6d4", borderRadius: 12, padding: 15, alignItems: "center", marginTop: 4 },
  btnT: { color: "#fff", fontWeight: "700", fontSize: 16 },
  msg: { color: "#f59e0b", textAlign: "center", marginTop: 14 },
  link: { color: "#8b5cf6", textAlign: "center", marginTop: 20 },
});
