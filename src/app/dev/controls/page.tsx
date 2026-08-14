"use client";

/**
 * A gallery of the device controls.
 *
 * Every control here replaces a native input with a custom widget, and the way
 * that goes wrong is visual: a slider that renders four pixels tall, a fill
 * that sits outside its track, a dial that collides with the label beside it.
 * A unit test cannot see any of that, so there needs to be somewhere to look.
 *
 * It is also the honest answer to "what should I use for this device?" — the
 * alternative is reading five device panels and guessing which one is current.
 *
 * Unlisted and noindex: an internal reference, not a page for customers.
 */

import { useState } from "react";
import {
  Blinds,
  Camera,
  Droplets,
  Fan,
  Lightbulb,
  Lock,
  Sun,
  Volume2,
  Wind,
  Zap,
} from "lucide-react";
import { LevelSlider, ModeSelector, PowerDial, SlideToConfirm } from "@/app/smarthome/_kit/controls";
import { ControlTile, MetricWidget, WidgetFrame } from "@/app/smarthome/_kit/widgets";
import { Donut, Gauge } from "@/app/smarthome/_kit/charts";

export default function ControlsGallery() {
  const [bright, setBright] = useState(64);
  const [fan, setFan] = useState(66);
  const [blind, setBlind] = useState(30);
  const [vol, setVol] = useState(45);
  const [power, setPower] = useState(true);
  const [mode, setMode] = useState<"eco" | "auto" | "boost">("auto");
  const [locked, setLocked] = useState(true);
  const [tiles, setTiles] = useState({ kitchen: true, porch: false, camera: true });

  return (
    <main className="mx-auto max-w-5xl px-5 py-10 text-white">
      <header className="mb-8">
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--cv-accent)]">Internal</p>
        <h1 className="mt-1 text-3xl font-bold">Device controls</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          A switch is the right control for exactly one kind of device: something with two states
          and nothing in between. Everything below exists because we were using one for devices
          that can do more than that.
        </p>
      </header>

      <Section
        title="Continuous — LevelSlider"
        note="Drag anywhere on the column. Up is more, which matches brightness, volume and how open a blind is without needing a label to explain which end is which. Arrow keys move in coarse steps, shift for fine, Home and End for the ends."
      >
        <div className="flex flex-wrap items-end gap-8">
          <LevelSlider value={bright} onChange={setBright} label="Brightness" icon={Sun} accent="#facc15" />
          <LevelSlider
            value={fan}
            onChange={setFan}
            label="Fan speed"
            icon={Fan}
            accent="#22d3ee"
            valueText={(v) => (v <= 0 ? "Off" : v <= 33 ? "Low" : v <= 66 ? "Medium" : "High")}
          />
          <LevelSlider value={blind} onChange={setBlind} label="Blind" icon={Blinds} accent="#a78bfa" />
          <LevelSlider value={vol} onChange={setVol} label="Volume" icon={Volume2} accent="#34d399" />
          <LevelSlider value={20} onChange={() => {}} label="Offline" icon={Sun} disabled />
        </div>
      </Section>

      <Section
        title="On and off — PowerDial"
        note="The ring carries the level, so a lamp at 5% and the same lamp at full are not the same picture. The word stays, because a ring is not a substitute for a word somebody may be relying on."
      >
        <div className="flex flex-wrap items-center gap-8">
          <PowerDial on={power} onToggle={() => setPower((v) => !v)} level={bright} label="Desk lamp" accent="#facc15" />
          <PowerDial on={false} onToggle={() => {}} level={0} label="Porch light" />
          <PowerDial on onToggle={() => {}} label="Plug, no level" accent="#22d3ee" />
          <PowerDial on={false} onToggle={() => {}} label="Offline" disabled />
        </div>
      </Section>

      <Section
        title="A few named choices — ModeSelector"
        note="Every option readable without opening anything. Better than a switch because the options have names: 'Medium' is what somebody asked for, where 66% is a number they have to translate."
      >
        <ModeSelector
          label="Mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: "eco", label: "Eco" },
            { value: "auto", label: "Auto" },
            { value: "boost", label: "Boost" },
          ]}
        />
      </Section>

      <Section
        title="Things you should not do by accident — SlideToConfirm"
        note="Unlocking a door is not the same class of action as turning on a lamp, and giving them the same control is how a pocket opens a front door. Locking stays one tap: making the safe direction harder helps nobody."
      >
        <div className="max-w-sm">
          {locked ? (
            <SlideToConfirm
              label="Slide to unlock"
              hint="Deliberately harder than a tap"
              accent="#f59e0b"
              onConfirm={() => setLocked(false)}
            />
          ) : (
            <button
              onClick={() => setLocked(true)}
              className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 font-semibold text-white"
            >
              <Lock className="h-4 w-4" /> Lock
            </button>
          )}
        </div>
      </Section>

      <Section
        title="A device at a glance — ControlTile"
        note="The state is a word in the tile, not the position of a control you have to interpret. 'Locked' reads correctly in a screenshot, in sunlight, and to somebody who cannot tell which way a switch is thrown."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ControlTile
            name="Kitchen light"
            state={tiles.kitchen ? "On · 80%" : "Off"}
            icon={Lightbulb}
            active={tiles.kitchen}
            accent="#facc15"
            onPress={() => setTiles((t) => ({ ...t, kitchen: !t.kitchen }))}
          />
          <ControlTile
            name="Porch"
            state={tiles.porch ? "On" : "Off"}
            icon={Lightbulb}
            active={tiles.porch}
            onPress={() => setTiles((t) => ({ ...t, porch: !t.porch }))}
          />
          <ControlTile name="Front door" state="Locked" icon={Lock} detail="Auto-relock 30s" accent="#60a5fa" />
          <ControlTile
            name="Driveway"
            state={tiles.camera ? "Live" : "Idle"}
            icon={Camera}
            active={tiles.camera}
            accent="#a78bfa"
            onPress={() => setTiles((t) => ({ ...t, camera: !t.camera }))}
          />
        </div>
      </Section>

      <Section
        title="A number you read — MetricWidget"
        note="The figure leads and everything else is subordinate to it. A delta is drawn only when there is one worth drawing: a 0.0% badge on every card teaches the eye to skip the badge, which is a problem the day it says 40%."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricWidget
            label="Water consumption"
            value={1841448}
            unit="litres"
            icon={Droplets}
            accent="#38bdf8"
            period="Today"
            deltaPct={-5.08}
            series={[12, 18, 14, 22, 19, 26, 24, 31, 28, 35]}
          />
          <MetricWidget
            label="Energy"
            value={356.18}
            unit="kWh"
            icon={Zap}
            accent="#f59e0b"
            period="Last 7 days"
            deltaPct={3.2}
          />
          <MetricWidget
            label="Air quality"
            value="Good"
            caption="PM2.5 12 µg/m³"
            icon={Wind}
            accent="#34d399"
            period="Now"
          />
        </div>
      </Section>

      <Section
        title="Charts in a frame — WidgetFrame"
        note="One header treatment for every panel. Six panels that each invent their own read as six unrelated things."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <WidgetFrame title="Occupancy" period="This month">
            <div className="flex justify-center">
              <Gauge value={80.68} max={100} unit="%" label="Occupied" />
            </div>
          </WidgetFrame>
          <WidgetFrame title="Energy split" period="Today">
            <div className="flex justify-center">
              <Donut
                centerLabel="Consumption"
                centerValue="34,736"
                data={[
                  { label: "Chiller", value: 10270, color: "#f472b6" },
                  { label: "AHU", value: 4749, color: "#64748b" },
                  { label: "Utility", value: 5042, color: "#67e8f9" },
                  { label: "Pantry", value: 3098, color: "#a78bfa" },
                ]}
              />
            </div>
          </WidgetFrame>
        </div>
      </Section>
    </main>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mb-5 mt-1 max-w-3xl text-xs leading-relaxed text-slate-400">{note}</p>
      {children}
    </section>
  );
}
