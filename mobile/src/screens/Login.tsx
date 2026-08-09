import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Image, KeyboardAvoidingView, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../auth";
import { C, GRAD, TAP_SLOP } from "../theme";

export default function Login() {
  const { login, register, verifyOtp, resendOtp } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [step, setStep] = useState<"form" | "otp">("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const submit = async () => {
    setBusy(true);
    setMsg("");
    if (mode === "login") {
      const r = await login(email.trim(), password);
      if (!r.ok) setMsg(r.message || "Something went wrong");
    } else {
      const r = await register(name.trim(), email.trim(), password);
      if (r.ok && r.pending) {
        setStep("otp");
        setMsg(r.otpSent ? "" : "Code generated. If you don't receive an email, contact support.");
      } else if (!r.ok) {
        setMsg(r.message || "Something went wrong");
      }
    }
    setBusy(false);
  };

  const submitOtp = async () => {
    setBusy(true);
    setMsg("");
    const r = await verifyOtp(email.trim(), otp.trim());
    if (!r.ok) setMsg(r.message || "Verification failed");
    setBusy(false);
  };

  const resend = async () => {
    setMsg("");
    const r = await resendOtp(email.trim());
    setMsg(r.ok ? "A new code has been sent." : r.message || "Could not resend code.");
  };

  return (
    <LinearGradient colors={GRAD.screen} style={s.wrap}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.flex}>
        <View style={s.center}>
          <LinearGradient colors={GRAD.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.logoPill}>
            <Image source={require("../../assets/icon.png")} style={s.logoImg} resizeMode="contain" />
          </LinearGradient>
          <Text style={s.logo}>
            Circu<Text style={{ color: C.cyanHi }}>vent</Text>
          </Text>
          <Text style={s.sub}>{step === "otp" ? `Enter the code sent to ${email}` : mode === "login" ? "Welcome back — control your world." : "Create your account."}</Text>

          {step === "otp" ? (
            <View style={s.card}>
              <Field icon="🔑">
                <TextInput style={s.input} placeholder="6-digit code" placeholderTextColor={C.faint} keyboardType="number-pad" maxLength={6} value={otp} onChangeText={setOtp} />
              </Field>
              {!!msg && <Text style={s.msg}>{msg}</Text>}
              <Pressable onPress={submitOtp} disabled={busy} style={{ marginTop: 6 }}>
                <LinearGradient colors={GRAD.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.btn}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnT}>Verify &amp; continue</Text>}
                </LinearGradient>
              </Pressable>
              <Pressable onPress={resend} hitSlop={8} style={{ marginTop: 14 }}>
                <Text style={[s.link, { marginTop: 0 }]}>Didn't get it? <Text style={{ color: C.cyanHi, fontWeight: "700" }}>Resend code</Text></Text>
              </Pressable>
            </View>
          ) : (
            <View style={s.card}>
              {mode === "register" && (
                <Field icon="👤">
                  <TextInput style={s.input} placeholder="Full name" placeholderTextColor={C.faint} value={name} onChangeText={setName} />
                </Field>
              )}
              <Field icon="✉️">
                <TextInput
                  style={s.input}
                  placeholder="Email"
                  placeholderTextColor={C.faint}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />
              </Field>
              <Field icon="🔒">
                <TextInput style={s.input} placeholder="Password" placeholderTextColor={C.faint} secureTextEntry value={password} onChangeText={setPassword} />
              </Field>

              {!!msg && <Text style={s.msg}>{msg}</Text>}

              <Pressable onPress={submit} disabled={busy} style={{ marginTop: 6 }}>
                <LinearGradient colors={GRAD.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.btn}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnT}>{mode === "login" ? "Sign in" : "Create account"}</Text>}
                </LinearGradient>
              </Pressable>
            </View>
          )}

          {step === "form" ? (
            <Pressable onPress={() => { setMode(mode === "login" ? "register" : "login"); setMsg(""); }} hitSlop={8}>
              <Text style={s.link}>
                {mode === "login" ? "New to Circuvent? " : "Already have an account? "}
                <Text style={{ color: C.cyanHi, fontWeight: "700" }}>{mode === "login" ? "Create an account" : "Sign in"}</Text>
              </Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => { setStep("form"); setOtp(""); setMsg(""); }} hitSlop={8}>
              <Text style={s.link}>‹ Back to sign up</Text>
            </Pressable>
          )}
        </View>
        <Text style={s.footer}>Self-hosted control plane · end-to-end encrypted</Text>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

function Field({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <View style={s.field}>
      <Text style={s.fieldIcon}>{icon}</Text>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1, padding: 24, justifyContent: "center" },
  logoPill: { width: 76, height: 76, borderRadius: 22, alignSelf: "center", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  logoImg: { width: 46, height: 46 },
  logo: { color: "#fff", fontSize: 32, fontWeight: "800", textAlign: "center", letterSpacing: 0.3 },
  sub: { color: C.textDim, textAlign: "center", marginTop: 6, marginBottom: 26 },
  card: { backgroundColor: "rgba(255,255,255,0.03)", borderColor: C.border, borderWidth: 1, borderRadius: 20, padding: 18 },
  field: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.card, borderColor: C.border, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, marginBottom: 12 },
  fieldIcon: { fontSize: 15 },
  input: { flex: 1, color: C.text, paddingVertical: 14, fontSize: 15 },
  btn: { borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  btnT: { color: "#fff", fontWeight: "800", fontSize: 16 },
  msg: { color: C.amber, textAlign: "center", marginBottom: 10 },
  link: { color: C.textDim, textAlign: "center", marginTop: 22 },
  footer: { color: C.faint, textAlign: "center", fontSize: 12, paddingBottom: 24 },
});
