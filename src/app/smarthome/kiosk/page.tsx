"use client";

import { useEffect, useState } from "react";
import { KeyRound, Lock, ShieldAlert, Unlock } from "lucide-react";
import {
  KIOSK_CANDIDATE_ROUTES,
  hasPin,
  setPin,
  clearPin,
  verifyPin,
  getProtectedRoutes,
  setProtectedRoutes,
  isSessionUnlocked,
  unlockSession,
  lockSession,
} from "@/lib/smarthome-kiosk-pin";
import { Card } from "../ui";

export default function KioskPage() {
  const [pinSet, setPinSet] = useState(false);
  const [routes, setRoutes] = useState<string[]>([]);
  const [unlocked, setUnlocked] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [testPin, setTestPin] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setPinSet(hasPin());
    setRoutes(getProtectedRoutes());
    setUnlocked(isSessionUnlocked());
  }, []);

  const save = async () => {
    if (newPin.length < 4) {
      setMessage("PIN must be at least 4 digits.");
      return;
    }
    await setPin(newPin);
    setPinSet(true);
    setNewPin("");
    setMessage("PIN saved.");
  };

  const remove = () => {
    clearPin();
    setPinSet(false);
    setMessage("PIN removed — routes are now unrestricted.");
  };

  const toggleRoute = (route: string) => {
    const next = routes.includes(route) ? routes.filter((r) => r !== route) : [...routes, route];
    setProtectedRoutes(next);
    setRoutes(next);
  };

  const test = async () => {
    const ok = await verifyPin(testPin);
    setMessage(ok ? "Correct — session unlocked for 15 minutes." : "Incorrect PIN.");
    if (ok) {
      unlockSession(15);
      setUnlocked(true);
    }
    setTestPin("");
  };

  const relock = () => {
    lockSession();
    setUnlocked(false);
    setMessage("Session locked.");
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-white flex items-center gap-2"><ShieldAlert className="h-6 w-6" /> Kiosk / guest PIN lock</h1>
        <p className="text-sm text-slate-400 mt-1">A lightweight deterrent for shared household tablets — not a real security boundary, just a quick PIN gate.</p>
      </div>

      <Card className="p-5 mb-4">
        <h2 className="font-bold text-white mb-3 flex items-center gap-2"><KeyRound className="h-4 w-4" /> {pinSet ? "Change PIN" : "Set a PIN"}</h2>
        <div className="flex gap-2">
          <input value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="4-6 digit PIN" inputMode="numeric" className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none tracking-widest" />
          <button onClick={save} className="rounded-xl px-4 py-2.5 font-semibold text-white" style={{ background: "var(--cv-gradient)" }}>Save</button>
        </div>
        {pinSet && <button onClick={remove} className="mt-3 text-xs text-red-400">Remove PIN</button>}
      </Card>

      <Card className="p-5 mb-4">
        <h2 className="font-bold text-white mb-3">Protected routes</h2>
        <div className="space-y-1.5">
          {KIOSK_CANDIDATE_ROUTES.map((route) => (
            <label key={route} className="flex items-center gap-2 text-sm text-slate-200">
              <input type="checkbox" checked={routes.includes(route)} onChange={() => toggleRoute(route)} /> {route}
            </label>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="font-bold text-white mb-3 flex items-center gap-2">{unlocked ? <Unlock className="h-4 w-4 text-emerald-400" /> : <Lock className="h-4 w-4" />} Test the PIN</h2>
        <div className="flex gap-2">
          <input value={testPin} onChange={(e) => setTestPin(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Enter PIN" inputMode="numeric" className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none tracking-widest" />
          <button onClick={test} className="rounded-xl px-4 py-2.5 font-semibold text-slate-200 bg-white/5 border border-white/10">Unlock</button>
          {unlocked && <button onClick={relock} className="rounded-xl px-4 py-2.5 font-semibold text-red-300 bg-red-500/10">Lock now</button>}
        </div>
        {message && <p className="text-sm text-cyan-300 mt-3">{message}</p>}
      </Card>
    </div>
  );
}
