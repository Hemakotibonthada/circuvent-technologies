"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ============================================================================
// INTERACTIVE GRADIENT BUILDER
// ============================================================================

interface GradientStop {
  color: string;
  position: number;
}

interface GradientBuilderProps {
  className?: string;
  onGradientChange?: (css: string) => void;
}

export function GradientBuilder({ className = "", onGradientChange }: GradientBuilderProps) {
  const [stops, setStops] = useState<GradientStop[]>([
    { color: "#06b6d4", position: 0 },
    { color: "#8b5cf6", position: 50 },
    { color: "#ec4899", position: 100 },
  ]);
  const [angle, setAngle] = useState(135);
  const [gradientType, setGradientType] = useState<"linear" | "radial" | "conic">("linear");
  const [copied, setCopied] = useState(false);
  const [activeStop, setActiveStop] = useState<number | null>(null);
  const [previewSize, setPreviewSize] = useState<"sm" | "md" | "lg">("md");

  const gradientCSS = useMemo(() => {
    const sortedStops = [...stops].sort((a, b) => a.position - b.position);
    const stopsStr = sortedStops.map((s) => `${s.color} ${s.position}%`).join(", ");
    switch (gradientType) {
      case "linear":
        return `linear-gradient(${angle}deg, ${stopsStr})`;
      case "radial":
        return `radial-gradient(circle, ${stopsStr})`;
      case "conic":
        return `conic-gradient(from ${angle}deg, ${stopsStr})`;
    }
  }, [stops, angle, gradientType]);

  useEffect(() => {
    onGradientChange?.(gradientCSS);
  }, [gradientCSS, onGradientChange]);

  const addStop = () => {
    if (stops.length >= 6) return;
    const newPos = 50;
    setStops([...stops, { color: "#ffffff", position: newPos }]);
  };

  const removeStop = (index: number) => {
    if (stops.length <= 2) return;
    setStops(stops.filter((_, i) => i !== index));
  };

  const updateStop = (index: number, updates: Partial<GradientStop>) => {
    setStops(stops.map((s, i) => (i === index ? { ...s, ...updates } : s)));
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(`background: ${gradientCSS};`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const presets = useMemo(
    () => [
      { name: "Ocean", stops: [{ color: "#06b6d4", position: 0 }, { color: "#3b82f6", position: 50 }, { color: "#6366f1", position: 100 }] },
      { name: "Sunset", stops: [{ color: "#f59e0b", position: 0 }, { color: "#ef4444", position: 50 }, { color: "#ec4899", position: 100 }] },
      { name: "Forest", stops: [{ color: "#10b981", position: 0 }, { color: "#059669", position: 50 }, { color: "#047857", position: 100 }] },
      { name: "Aurora", stops: [{ color: "#06b6d4", position: 0 }, { color: "#8b5cf6", position: 33 }, { color: "#ec4899", position: 66 }, { color: "#f59e0b", position: 100 }] },
      { name: "Midnight", stops: [{ color: "#0f172a", position: 0 }, { color: "#1e293b", position: 50 }, { color: "#334155", position: 100 }] },
      { name: "Neon", stops: [{ color: "#00ff87", position: 0 }, { color: "#60efff", position: 50 }, { color: "#ff00e5", position: 100 }] },
    ],
    []
  );

  const previewSizes = { sm: "h-32", md: "h-48", lg: "h-64" };

  return (
    <div className={`rounded-2xl overflow-hidden ${className}`} style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--border-primary)" }}>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ background: gradientCSS }} />
          <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Gradient Builder</h3>
        </div>
        <motion.button
          onClick={handleCopy}
          className="px-3 py-1 rounded-lg text-xs font-medium transition-colors"
          style={{ background: copied ? "rgba(16,185,129,0.15)" : "var(--bg-surface)", border: "1px solid var(--border-primary)", color: copied ? "#10b981" : "var(--text-secondary)" }}
          whileTap={{ scale: 0.95 }}
        >
          {copied ? "✓ Copied!" : "Copy CSS"}
        </motion.button>
      </div>

      {/* Preview */}
      <div className="p-5">
        <div className={`w-full rounded-xl ${previewSizes[previewSize]} transition-all duration-300`} style={{ background: gradientCSS }} />
      </div>

      {/* Controls */}
      <div className="px-5 pb-5 space-y-4">
        {/* Type selector */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider mb-2 block" style={{ color: "var(--text-muted)" }}>Type</label>
          <div className="flex gap-2">
            {(["linear", "radial", "conic"] as const).map((type) => (
              <motion.button
                key={type}
                onClick={() => setGradientType(type)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium capitalize"
                style={{
                  background: gradientType === type ? "var(--accent-cyan-muted)" : "var(--bg-surface)",
                  color: gradientType === type ? "var(--accent-cyan)" : "var(--text-muted)",
                  border: `1px solid ${gradientType === type ? "var(--accent-cyan)" : "var(--border-primary)"}`,
                }}
                whileTap={{ scale: 0.95 }}
              >
                {type}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Angle */}
        {gradientType !== "radial" && (
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider mb-2 flex justify-between" style={{ color: "var(--text-muted)" }}>
              <span>Angle</span>
              <span className="font-mono">{angle}°</span>
            </label>
            <input
              type="range"
              min="0"
              max="360"
              value={angle}
              onChange={(e) => setAngle(Number(e.target.value))}
              className="w-full accent-cyan-500"
            />
          </div>
        )}

        {/* Color stops */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Color Stops</label>
            <motion.button
              onClick={addStop}
              disabled={stops.length >= 6}
              className="text-[10px] px-2 py-0.5 rounded-md font-medium disabled:opacity-30"
              style={{ background: "var(--accent-cyan-muted)", color: "var(--accent-cyan)" }}
              whileTap={{ scale: 0.95 }}
            >
              + Add
            </motion.button>
          </div>
          <div className="space-y-2">
            {stops.map((stop, i) => (
              <motion.div
                key={i}
                layout
                className="flex items-center gap-3 p-2 rounded-lg"
                style={{
                  background: activeStop === i ? "var(--bg-surface-hover)" : "var(--bg-surface)",
                  border: `1px solid ${activeStop === i ? "var(--border-hover)" : "var(--border-primary)"}`,
                }}
                onClick={() => setActiveStop(i)}
              >
                <input
                  type="color"
                  value={stop.color}
                  onChange={(e) => updateStop(i, { color: e.target.value })}
                  className="w-8 h-8 rounded-md cursor-pointer border-0"
                  style={{ background: "none" }}
                />
                <div className="flex-1">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={stop.position}
                    onChange={(e) => updateStop(i, { position: Number(e.target.value) })}
                    className="w-full accent-cyan-500"
                  />
                </div>
                <span className="text-[10px] font-mono w-8 text-right" style={{ color: "var(--text-muted)" }}>
                  {stop.position}%
                </span>
                {stops.length > 2 && (
                  <motion.button
                    onClick={(e) => { e.stopPropagation(); removeStop(i); }}
                    className="text-xs p-1 rounded hover:bg-red-500/10 text-red-400/50 hover:text-red-400"
                    whileTap={{ scale: 0.9 }}
                  >
                    ✕
                  </motion.button>
                )}
              </motion.div>
            ))}
          </div>
        </div>

        {/* Presets */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider mb-2 block" style={{ color: "var(--text-muted)" }}>Presets</label>
          <div className="grid grid-cols-3 gap-2">
            {presets.map((preset) => (
              <motion.button
                key={preset.name}
                onClick={() => setStops(preset.stops)}
                className="relative h-10 rounded-lg overflow-hidden group"
                style={{
                  background: `linear-gradient(90deg, ${preset.stops.map((s) => `${s.color} ${s.position}%`).join(", ")})`,
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-[10px] font-medium text-white">{preset.name}</span>
                </div>
              </motion.button>
            ))}
          </div>
        </div>

        {/* CSS Output */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider mb-2 block" style={{ color: "var(--text-muted)" }}>CSS Output</label>
          <div className="p-3 rounded-lg font-mono text-[10px] break-all" style={{ background: "#1e1e2e", color: "#a6adc8", border: "1px solid rgba(255,255,255,0.06)" }}>
            <span style={{ color: "#c678dd" }}>background</span>
            <span style={{ color: "#6c7086" }}>: </span>
            <span style={{ color: "#98c379" }}>{gradientCSS}</span>
            <span style={{ color: "#6c7086" }}>;</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// INTERACTIVE SHADOW BUILDER
// ============================================================================

interface ShadowLayer {
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
  opacity: number;
  inset: boolean;
}

interface ShadowBuilderProps {
  className?: string;
}

export function ShadowBuilder({ className = "" }: ShadowBuilderProps) {
  const [layers, setLayers] = useState<ShadowLayer[]>([
    { x: 0, y: 4, blur: 6, spread: -1, color: "#000000", opacity: 0.1, inset: false },
    { x: 0, y: 10, blur: 15, spread: -3, color: "#000000", opacity: 0.1, inset: false },
  ]);
  const [activeLayer, setActiveLayer] = useState(0);
  const [bgColor, setBgColor] = useState("var(--bg-surface)");
  const [boxColor, setBoxColor] = useState("var(--bg-elevated)");
  const [borderRadius, setBorderRadius] = useState(16);
  const [copied, setCopied] = useState(false);

  const shadowCSS = useMemo(() => {
    return layers
      .map((l) => {
        const rgba = `rgba(${parseInt(l.color.slice(1, 3), 16)}, ${parseInt(l.color.slice(3, 5), 16)}, ${parseInt(l.color.slice(5, 7), 16)}, ${l.opacity})`;
        return `${l.inset ? "inset " : ""}${l.x}px ${l.y}px ${l.blur}px ${l.spread}px ${rgba}`;
      })
      .join(", ");
  }, [layers]);

  const addLayer = () => {
    if (layers.length >= 5) return;
    setLayers([...layers, { x: 0, y: 8, blur: 16, spread: 0, color: "#000000", opacity: 0.15, inset: false }]);
    setActiveLayer(layers.length);
  };

  const removeLayer = (index: number) => {
    if (layers.length <= 1) return;
    setLayers(layers.filter((_, i) => i !== index));
    setActiveLayer(Math.max(0, activeLayer - 1));
  };

  const updateLayer = (index: number, updates: Partial<ShadowLayer>) => {
    setLayers(layers.map((l, i) => (i === index ? { ...l, ...updates } : l)));
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(`box-shadow: ${shadowCSS};`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const presets = [
    { name: "Subtle", layers: [{ x: 0, y: 1, blur: 3, spread: 0, color: "#000000", opacity: 0.1, inset: false }] },
    { name: "Medium", layers: [{ x: 0, y: 4, blur: 6, spread: -1, color: "#000000", opacity: 0.1, inset: false }, { x: 0, y: 10, blur: 15, spread: -3, color: "#000000", opacity: 0.1, inset: false }] },
    { name: "Large", layers: [{ x: 0, y: 10, blur: 25, spread: -5, color: "#000000", opacity: 0.15, inset: false }, { x: 0, y: 20, blur: 50, spread: -10, color: "#000000", opacity: 0.1, inset: false }] },
    { name: "Glow", layers: [{ x: 0, y: 0, blur: 30, spread: 0, color: "#06b6d4", opacity: 0.3, inset: false }] },
    { name: "Neon", layers: [{ x: 0, y: 0, blur: 15, spread: 0, color: "#06b6d4", opacity: 0.5, inset: false }, { x: 0, y: 0, blur: 45, spread: 0, color: "#06b6d4", opacity: 0.2, inset: false }] },
    { name: "Inner", layers: [{ x: 0, y: 2, blur: 4, spread: 0, color: "#000000", opacity: 0.1, inset: true }] },
  ];

  const currentLayer = layers[activeLayer];

  return (
    <div className={`rounded-2xl overflow-hidden ${className}`} style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
      <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--border-primary)" }}>
        <div className="flex items-center gap-2">
          <span className="text-sm">🎨</span>
          <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Shadow Builder</h3>
        </div>
        <motion.button onClick={handleCopy} className="px-3 py-1 rounded-lg text-xs font-medium" style={{ background: copied ? "rgba(16,185,129,0.15)" : "var(--bg-surface)", border: "1px solid var(--border-primary)", color: copied ? "#10b981" : "var(--text-secondary)" }} whileTap={{ scale: 0.95 }}>
          {copied ? "✓ Copied!" : "Copy CSS"}
        </motion.button>
      </div>

      {/* Preview */}
      <div className="p-8 flex items-center justify-center" style={{ background: bgColor, minHeight: 200 }}>
        <motion.div
          className="w-40 h-28 rounded-2xl"
          style={{
            background: boxColor,
            boxShadow: shadowCSS,
            borderRadius: `${borderRadius}px`,
          }}
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <div className="px-5 pb-5 space-y-4">
        {/* Layer tabs */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Layers ({layers.length})</label>
            <motion.button onClick={addLayer} disabled={layers.length >= 5} className="text-[10px] px-2 py-0.5 rounded-md font-medium disabled:opacity-30" style={{ background: "var(--accent-cyan-muted)", color: "var(--accent-cyan)" }} whileTap={{ scale: 0.95 }}>
              + Add Layer
            </motion.button>
          </div>
          <div className="flex gap-1.5">
            {layers.map((_, i) => (
              <motion.button
                key={i}
                onClick={() => setActiveLayer(i)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium"
                style={{
                  background: activeLayer === i ? "var(--accent-cyan-muted)" : "var(--bg-surface)",
                  color: activeLayer === i ? "var(--accent-cyan)" : "var(--text-muted)",
                  border: `1px solid ${activeLayer === i ? "var(--accent-cyan)" : "var(--border-primary)"}`,
                }}
                whileTap={{ scale: 0.95 }}
              >
                Layer {i + 1}
                {layers.length > 1 && (
                  <span onClick={(e) => { e.stopPropagation(); removeLayer(i); }} className="hover:text-red-400 ml-1">✕</span>
                )}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Active layer controls */}
        {currentLayer && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-medium flex justify-between" style={{ color: "var(--text-muted)" }}>
                  <span>X Offset</span><span className="font-mono">{currentLayer.x}px</span>
                </label>
                <input type="range" min="-50" max="50" value={currentLayer.x} onChange={(e) => updateLayer(activeLayer, { x: Number(e.target.value) })} className="w-full accent-cyan-500" />
              </div>
              <div>
                <label className="text-[10px] font-medium flex justify-between" style={{ color: "var(--text-muted)" }}>
                  <span>Y Offset</span><span className="font-mono">{currentLayer.y}px</span>
                </label>
                <input type="range" min="-50" max="50" value={currentLayer.y} onChange={(e) => updateLayer(activeLayer, { y: Number(e.target.value) })} className="w-full accent-cyan-500" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-medium flex justify-between" style={{ color: "var(--text-muted)" }}>
                  <span>Blur</span><span className="font-mono">{currentLayer.blur}px</span>
                </label>
                <input type="range" min="0" max="100" value={currentLayer.blur} onChange={(e) => updateLayer(activeLayer, { blur: Number(e.target.value) })} className="w-full accent-cyan-500" />
              </div>
              <div>
                <label className="text-[10px] font-medium flex justify-between" style={{ color: "var(--text-muted)" }}>
                  <span>Spread</span><span className="font-mono">{currentLayer.spread}px</span>
                </label>
                <input type="range" min="-30" max="30" value={currentLayer.spread} onChange={(e) => updateLayer(activeLayer, { spread: Number(e.target.value) })} className="w-full accent-cyan-500" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-medium flex justify-between" style={{ color: "var(--text-muted)" }}>
                  <span>Opacity</span><span className="font-mono">{(currentLayer.opacity * 100).toFixed(0)}%</span>
                </label>
                <input type="range" min="0" max="100" value={currentLayer.opacity * 100} onChange={(e) => updateLayer(activeLayer, { opacity: Number(e.target.value) / 100 })} className="w-full accent-cyan-500" />
              </div>
              <div className="flex items-center gap-3 pt-4">
                <input type="color" value={currentLayer.color} onChange={(e) => updateLayer(activeLayer, { color: e.target.value })} className="w-8 h-8 rounded cursor-pointer" />
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={currentLayer.inset} onChange={(e) => updateLayer(activeLayer, { inset: e.target.checked })} className="accent-cyan-500" />
                  <span className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>Inset</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Border radius */}
        <div>
          <label className="text-[10px] font-medium flex justify-between" style={{ color: "var(--text-muted)" }}>
            <span>Border Radius</span><span className="font-mono">{borderRadius}px</span>
          </label>
          <input type="range" min="0" max="50" value={borderRadius} onChange={(e) => setBorderRadius(Number(e.target.value))} className="w-full accent-cyan-500" />
        </div>

        {/* Presets */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider mb-2 block" style={{ color: "var(--text-muted)" }}>Presets</label>
          <div className="grid grid-cols-3 gap-2">
            {presets.map((preset) => (
              <motion.button
                key={preset.name}
                onClick={() => { setLayers(preset.layers); setActiveLayer(0); }}
                className="px-3 py-2 rounded-lg text-[10px] font-medium transition-colors hover:bg-white/5"
                style={{ background: "var(--bg-surface)", border: "1px solid var(--border-primary)", color: "var(--text-secondary)" }}
                whileTap={{ scale: 0.95 }}
              >
                {preset.name}
              </motion.button>
            ))}
          </div>
        </div>

        {/* CSS */}
        <div className="p-3 rounded-lg font-mono text-[10px] break-all" style={{ background: "#1e1e2e", color: "#a6adc8", border: "1px solid rgba(255,255,255,0.06)" }}>
          <span style={{ color: "#c678dd" }}>box-shadow</span>
          <span style={{ color: "#6c7086" }}>: </span>
          <span style={{ color: "#98c379" }}>{shadowCSS}</span>
          <span style={{ color: "#6c7086" }}>;</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// INTERACTIVE ANIMATION PLAYGROUND
// ============================================================================

interface AnimationPlaygroundProps {
  className?: string;
}

export function AnimationPlayground({ className = "" }: AnimationPlaygroundProps) {
  const [animationType, setAnimationType] = useState<"bounce" | "fade" | "slide" | "scale" | "rotate" | "flip" | "shake" | "pulse" | "swing" | "wobble">("bounce");
  const [duration, setDuration] = useState(0.5);
  const [delay, setDelay] = useState(0);
  const [ease, setEase] = useState<string>("easeOut");
  const [repeat, setRepeat] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [key, setKey] = useState(0);
  const [copied, setCopied] = useState(false);

  const animations: Record<string, { initial: Record<string, number | string>; animate: Record<string, number | string | number[]> }> = {
    bounce: { initial: { y: -40, opacity: 0 }, animate: { y: 0, opacity: 1 } },
    fade: { initial: { opacity: 0 }, animate: { opacity: 1 } },
    slide: { initial: { x: -60, opacity: 0 }, animate: { x: 0, opacity: 1 } },
    scale: { initial: { scale: 0, opacity: 0 }, animate: { scale: 1, opacity: 1 } },
    rotate: { initial: { rotate: -180, opacity: 0 }, animate: { rotate: 0, opacity: 1 } },
    flip: { initial: { rotateY: 90, opacity: 0 }, animate: { rotateY: 0, opacity: 1 } },
    shake: { initial: { x: 0 }, animate: { x: [0, -10, 10, -10, 10, -5, 5, 0] } },
    pulse: { initial: { scale: 1 }, animate: { scale: [1, 1.1, 1, 1.1, 1] } },
    swing: { initial: { rotate: 0 }, animate: { rotate: [0, 15, -10, 5, -5, 0] } },
    wobble: { initial: { x: 0, rotate: 0 }, animate: { x: [0, -25, 20, -15, 10, -5, 0], rotate: [0, -5, 3, -3, 2, -1, 0] } },
  };

  const easeOptions = ["linear", "easeIn", "easeOut", "easeInOut", "circIn", "circOut", "backIn", "backOut", "anticipate"] as const;
  type EaseOption = typeof easeOptions[number];

  const play = () => {
    setIsPlaying(true);
    setKey((prev) => prev + 1);
    setTimeout(() => setIsPlaying(false), (duration + delay) * 1000 + 200);
  };

  const currentAnim = animations[animationType];

  const codeSnippet = `<motion.div
  initial={${JSON.stringify(currentAnim.initial)}}
  animate={${JSON.stringify(currentAnim.animate)}}
  transition={{
    duration: ${duration},
    delay: ${delay},
    ease: "${ease}",${repeat > 0 ? `\n    repeat: ${repeat === -1 ? "Infinity" : repeat},` : ""}
  }}
/>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(codeSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`rounded-2xl overflow-hidden ${className}`} style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
      <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--border-primary)" }}>
        <div className="flex items-center gap-2">
          <span className="text-sm">🎬</span>
          <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Animation Playground</h3>
        </div>
        <div className="flex gap-2">
          <motion.button onClick={play} className="px-3 py-1 rounded-lg text-xs font-medium" style={{ background: "var(--accent-cyan-muted)", color: "var(--accent-cyan)", border: "1px solid var(--accent-cyan)" }} whileTap={{ scale: 0.95 }}>
            ▶ Play
          </motion.button>
          <motion.button onClick={handleCopy} className="px-3 py-1 rounded-lg text-xs font-medium" style={{ background: copied ? "rgba(16,185,129,0.15)" : "var(--bg-surface)", border: "1px solid var(--border-primary)", color: copied ? "#10b981" : "var(--text-secondary)" }} whileTap={{ scale: 0.95 }}>
            {copied ? "✓ Copied!" : "Copy"}
          </motion.button>
        </div>
      </div>

      {/* Preview area */}
      <div className="p-8 flex items-center justify-center" style={{ minHeight: 200, background: "var(--bg-secondary)" }}>
        <motion.div
          key={key}
          className="w-24 h-24 rounded-2xl flex items-center justify-center text-2xl"
          style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)", boxShadow: "0 10px 30px rgba(6,182,212,0.3)" }}
          initial={currentAnim.initial}
          animate={currentAnim.animate}
          transition={{
            duration,
            delay,
            ease: ease as EaseOption,
            repeat: repeat === -1 ? Infinity : repeat,
            type: animationType === "bounce" ? "spring" : "tween",
          }}
        >
          ✦
        </motion.div>
      </div>

      <div className="px-5 pb-5 space-y-4">
        {/* Animation type */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider mb-2 block" style={{ color: "var(--text-muted)" }}>Animation</label>
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(animations).map((type) => (
              <motion.button
                key={type}
                onClick={() => { setAnimationType(type as typeof animationType); play(); }}
                className="px-2.5 py-1 rounded-lg text-[10px] font-medium capitalize"
                style={{
                  background: animationType === type ? "var(--accent-cyan-muted)" : "var(--bg-surface)",
                  color: animationType === type ? "var(--accent-cyan)" : "var(--text-muted)",
                  border: `1px solid ${animationType === type ? "var(--accent-cyan)" : "var(--border-primary)"}`,
                }}
                whileTap={{ scale: 0.95 }}
              >
                {type}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-medium flex justify-between" style={{ color: "var(--text-muted)" }}>
              <span>Duration</span><span className="font-mono">{duration}s</span>
            </label>
            <input type="range" min="0.1" max="3" step="0.1" value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-full accent-cyan-500" />
          </div>
          <div>
            <label className="text-[10px] font-medium flex justify-between" style={{ color: "var(--text-muted)" }}>
              <span>Delay</span><span className="font-mono">{delay}s</span>
            </label>
            <input type="range" min="0" max="2" step="0.1" value={delay} onChange={(e) => setDelay(Number(e.target.value))} className="w-full accent-cyan-500" />
          </div>
        </div>

        {/* Easing */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider mb-2 block" style={{ color: "var(--text-muted)" }}>Easing</label>
          <div className="flex flex-wrap gap-1.5">
            {easeOptions.map((e) => (
              <motion.button
                key={e}
                onClick={() => setEase(e)}
                className="px-2.5 py-1 rounded-lg text-[10px] font-medium"
                style={{
                  background: ease === e ? "var(--accent-violet-muted)" : "var(--bg-surface)",
                  color: ease === e ? "var(--accent-violet)" : "var(--text-muted)",
                  border: `1px solid ${ease === e ? "var(--accent-violet)" : "var(--border-primary)"}`,
                }}
                whileTap={{ scale: 0.95 }}
              >
                {e}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Repeat */}
        <div>
          <label className="text-[10px] font-medium flex justify-between" style={{ color: "var(--text-muted)" }}>
            <span>Repeat</span><span className="font-mono">{repeat === -1 ? "∞" : repeat}</span>
          </label>
          <div className="flex gap-2">
            {[0, 1, 2, 3, 5, -1].map((r) => (
              <motion.button
                key={r}
                onClick={() => setRepeat(r)}
                className="px-2 py-1 rounded-md text-[10px] font-mono"
                style={{
                  background: repeat === r ? "var(--accent-cyan-muted)" : "var(--bg-surface)",
                  color: repeat === r ? "var(--accent-cyan)" : "var(--text-muted)",
                  border: `1px solid ${repeat === r ? "var(--accent-cyan)" : "var(--border-primary)"}`,
                }}
                whileTap={{ scale: 0.95 }}
              >
                {r === -1 ? "∞" : r}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Code */}
        <div className="p-3 rounded-lg font-mono text-[10px] overflow-auto max-h-40" style={{ background: "#1e1e2e", color: "#a6adc8", border: "1px solid rgba(255,255,255,0.06)", lineHeight: 1.6, whiteSpace: "pre" }}>
          {codeSnippet}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// INTERACTIVE COLOR PALETTE GENERATOR
// ============================================================================

interface ColorPaletteGeneratorProps {
  className?: string;
}

function hexToHSL(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function ColorPaletteGenerator({ className = "" }: ColorPaletteGeneratorProps) {
  const [baseColor, setBaseColor] = useState("#06b6d4");
  const [harmony, setHarmony] = useState<"complementary" | "analogous" | "triadic" | "tetradic" | "split-complementary" | "monochromatic">("analogous");
  const [copiedColor, setCopiedColor] = useState<string | null>(null);

  const palette = useMemo(() => {
    const hsl = hexToHSL(baseColor);
    const colors: Array<{ hex: string; name: string; hsl: { h: number; s: number; l: number } }> = [];
    colors.push({ hex: baseColor, name: "Base", hsl });

    switch (harmony) {
      case "complementary":
        colors.push({ hex: hslToHex((hsl.h + 180) % 360, hsl.s, hsl.l), name: "Complement", hsl: { h: (hsl.h + 180) % 360, s: hsl.s, l: hsl.l } });
        colors.push({ hex: hslToHex(hsl.h, hsl.s, Math.min(hsl.l + 15, 95)), name: "Light", hsl: { h: hsl.h, s: hsl.s, l: Math.min(hsl.l + 15, 95) } });
        colors.push({ hex: hslToHex(hsl.h, hsl.s, Math.max(hsl.l - 15, 5)), name: "Dark", hsl: { h: hsl.h, s: hsl.s, l: Math.max(hsl.l - 15, 5) } });
        colors.push({ hex: hslToHex((hsl.h + 180) % 360, hsl.s, Math.min(hsl.l + 15, 95)), name: "Comp Light", hsl: { h: (hsl.h + 180) % 360, s: hsl.s, l: Math.min(hsl.l + 15, 95) } });
        break;
      case "analogous":
        colors.push({ hex: hslToHex((hsl.h + 30) % 360, hsl.s, hsl.l), name: "Analogous 1", hsl: { h: (hsl.h + 30) % 360, s: hsl.s, l: hsl.l } });
        colors.push({ hex: hslToHex((hsl.h + 60) % 360, hsl.s, hsl.l), name: "Analogous 2", hsl: { h: (hsl.h + 60) % 360, s: hsl.s, l: hsl.l } });
        colors.push({ hex: hslToHex((hsl.h - 30 + 360) % 360, hsl.s, hsl.l), name: "Analogous 3", hsl: { h: (hsl.h - 30 + 360) % 360, s: hsl.s, l: hsl.l } });
        colors.push({ hex: hslToHex((hsl.h - 60 + 360) % 360, hsl.s, hsl.l), name: "Analogous 4", hsl: { h: (hsl.h - 60 + 360) % 360, s: hsl.s, l: hsl.l } });
        break;
      case "triadic":
        colors.push({ hex: hslToHex((hsl.h + 120) % 360, hsl.s, hsl.l), name: "Triadic 1", hsl: { h: (hsl.h + 120) % 360, s: hsl.s, l: hsl.l } });
        colors.push({ hex: hslToHex((hsl.h + 240) % 360, hsl.s, hsl.l), name: "Triadic 2", hsl: { h: (hsl.h + 240) % 360, s: hsl.s, l: hsl.l } });
        colors.push({ hex: hslToHex(hsl.h, Math.max(hsl.s - 20, 0), hsl.l), name: "Muted", hsl: { h: hsl.h, s: Math.max(hsl.s - 20, 0), l: hsl.l } });
        colors.push({ hex: hslToHex(hsl.h, hsl.s, Math.min(hsl.l + 20, 95)), name: "Light", hsl: { h: hsl.h, s: hsl.s, l: Math.min(hsl.l + 20, 95) } });
        break;
      case "tetradic":
        colors.push({ hex: hslToHex((hsl.h + 90) % 360, hsl.s, hsl.l), name: "Tetradic 1", hsl: { h: (hsl.h + 90) % 360, s: hsl.s, l: hsl.l } });
        colors.push({ hex: hslToHex((hsl.h + 180) % 360, hsl.s, hsl.l), name: "Tetradic 2", hsl: { h: (hsl.h + 180) % 360, s: hsl.s, l: hsl.l } });
        colors.push({ hex: hslToHex((hsl.h + 270) % 360, hsl.s, hsl.l), name: "Tetradic 3", hsl: { h: (hsl.h + 270) % 360, s: hsl.s, l: hsl.l } });
        colors.push({ hex: hslToHex(hsl.h, hsl.s, Math.max(hsl.l - 20, 5)), name: "Dark", hsl: { h: hsl.h, s: hsl.s, l: Math.max(hsl.l - 20, 5) } });
        break;
      case "split-complementary":
        colors.push({ hex: hslToHex((hsl.h + 150) % 360, hsl.s, hsl.l), name: "Split 1", hsl: { h: (hsl.h + 150) % 360, s: hsl.s, l: hsl.l } });
        colors.push({ hex: hslToHex((hsl.h + 210) % 360, hsl.s, hsl.l), name: "Split 2", hsl: { h: (hsl.h + 210) % 360, s: hsl.s, l: hsl.l } });
        colors.push({ hex: hslToHex(hsl.h, hsl.s, Math.min(hsl.l + 15, 95)), name: "Light", hsl: { h: hsl.h, s: hsl.s, l: Math.min(hsl.l + 15, 95) } });
        colors.push({ hex: hslToHex(hsl.h, hsl.s, Math.max(hsl.l - 15, 5)), name: "Dark", hsl: { h: hsl.h, s: hsl.s, l: Math.max(hsl.l - 15, 5) } });
        break;
      case "monochromatic":
        for (let i = 1; i <= 4; i++) {
          const l = Math.max(5, Math.min(95, hsl.l - 30 + i * 15));
          colors.push({ hex: hslToHex(hsl.h, hsl.s, l), name: `Shade ${i}`, hsl: { h: hsl.h, s: hsl.s, l } });
        }
        break;
    }
    return colors;
  }, [baseColor, harmony]);

  const copyColor = (hex: string) => {
    navigator.clipboard.writeText(hex);
    setCopiedColor(hex);
    setTimeout(() => setCopiedColor(null), 1500);
  };

  const randomize = () => {
    const h = Math.floor(Math.random() * 360);
    const s = 50 + Math.floor(Math.random() * 40);
    const l = 35 + Math.floor(Math.random() * 30);
    setBaseColor(hslToHex(h, s, l));
  };

  return (
    <div className={`rounded-2xl overflow-hidden ${className}`} style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
      <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--border-primary)" }}>
        <div className="flex items-center gap-2">
          <span className="text-sm">🎨</span>
          <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Color Palette</h3>
        </div>
        <motion.button onClick={randomize} className="px-3 py-1 rounded-lg text-xs font-medium" style={{ background: "var(--accent-cyan-muted)", color: "var(--accent-cyan)", border: "1px solid var(--accent-cyan)" }} whileTap={{ scale: 0.95 }}>
          🎲 Random
        </motion.button>
      </div>

      {/* Palette display */}
      <div className="flex h-32">
        {palette.map((color, i) => (
          <motion.div
            key={`${color.hex}-${i}`}
            className="flex-1 cursor-pointer relative group"
            style={{ background: color.hex }}
            onClick={() => copyColor(color.hex)}
            whileHover={{ flex: 1.5 }}
            transition={{ duration: 0.2 }}
          >
            <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
              <span className="text-white text-[10px] font-bold">{copiedColor === color.hex ? "Copied!" : color.hex}</span>
              <span className="text-white/60 text-[8px] mt-0.5">{color.name}</span>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="px-5 pb-5 pt-4 space-y-4">
        {/* Base color */}
        <div className="flex items-center gap-3">
          <input type="color" value={baseColor} onChange={(e) => setBaseColor(e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer" />
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Base Color</label>
            <p className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>{baseColor}</p>
          </div>
        </div>

        {/* Harmony type */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider mb-2 block" style={{ color: "var(--text-muted)" }}>Harmony</label>
          <div className="flex flex-wrap gap-1.5">
            {(["complementary", "analogous", "triadic", "tetradic", "split-complementary", "monochromatic"] as const).map((h) => (
              <motion.button
                key={h}
                onClick={() => setHarmony(h)}
                className="px-2.5 py-1 rounded-lg text-[10px] font-medium capitalize"
                style={{
                  background: harmony === h ? "var(--accent-cyan-muted)" : "var(--bg-surface)",
                  color: harmony === h ? "var(--accent-cyan)" : "var(--text-muted)",
                  border: `1px solid ${harmony === h ? "var(--accent-cyan)" : "var(--border-primary)"}`,
                }}
                whileTap={{ scale: 0.95 }}
              >
                {h.replace("-", " ")}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Color details */}
        <div className="grid grid-cols-5 gap-2">
          {palette.map((color, i) => (
            <motion.div
              key={`${color.hex}-detail-${i}`}
              className="text-center cursor-pointer group"
              onClick={() => copyColor(color.hex)}
              whileHover={{ scale: 1.05 }}
            >
              <div className="w-full h-12 rounded-lg mb-1.5" style={{ background: color.hex, border: "1px solid var(--border-primary)" }} />
              <p className="text-[8px] font-mono truncate" style={{ color: "var(--text-muted)" }}>{color.hex}</p>
              <p className="text-[7px] truncate" style={{ color: "var(--text-muted)" }}>{color.name}</p>
            </motion.div>
          ))}
        </div>

        {/* CSS Variables */}
        <div className="p-3 rounded-lg font-mono text-[10px] overflow-auto max-h-32" style={{ background: "#1e1e2e", color: "#a6adc8", border: "1px solid rgba(255,255,255,0.06)", lineHeight: 1.8 }}>
          {palette.map((color, i) => (
            <div key={i}>
              <span style={{ color: "#c678dd" }}>--color-{i}</span>
              <span style={{ color: "#6c7086" }}>: </span>
              <span style={{ color: "#98c379" }}>{color.hex}</span>
              <span style={{ color: "#6c7086" }}>;</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// INTERACTIVE SPACING/LAYOUT VISUALIZER
// ============================================================================

interface SpacingVisualizerProps {
  className?: string;
}

export function SpacingVisualizer({ className = "" }: SpacingVisualizerProps) {
  const [padding, setPadding] = useState({ top: 16, right: 24, bottom: 16, left: 24 });
  const [margin, setMargin] = useState({ top: 0, right: 0, bottom: 0, left: 0 });
  const [gap, setGap] = useState(16);
  const [layout, setLayout] = useState<"flex" | "grid">("flex");
  const [flexDirection, setFlexDirection] = useState<"row" | "column">("row");
  const [alignItems, setAlignItems] = useState<"start" | "center" | "end" | "stretch">("center");
  const [justifyContent, setJustifyContent] = useState<"start" | "center" | "end" | "between" | "around">("center");
  const [gridCols, setGridCols] = useState(3);
  const [itemCount, setItemCount] = useState(6);
  const [copied, setCopied] = useState(false);

  const containerStyle = useMemo(() => {
    const base: Record<string, string | number> = {
      padding: `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px`,
      gap: `${gap}px`,
    };
    if (layout === "flex") {
      base.display = "flex";
      base.flexDirection = flexDirection;
      base.alignItems = alignItems;
      base.justifyContent = justifyContent === "between" ? "space-between" : justifyContent === "around" ? "space-around" : `flex-${justifyContent}`;
      base.flexWrap = "wrap";
    } else {
      base.display = "grid";
      base.gridTemplateColumns = `repeat(${gridCols}, 1fr)`;
    }
    return base;
  }, [padding, gap, layout, flexDirection, alignItems, justifyContent, gridCols]);

  const cssOutput = useMemo(() => {
    const lines: string[] = [];
    lines.push(`display: ${layout};`);
    if (layout === "flex") {
      lines.push(`flex-direction: ${flexDirection};`);
      lines.push(`align-items: ${alignItems};`);
      lines.push(`justify-content: ${justifyContent === "between" ? "space-between" : justifyContent === "around" ? "space-around" : `flex-${justifyContent}`};`);
      lines.push(`flex-wrap: wrap;`);
    } else {
      lines.push(`grid-template-columns: repeat(${gridCols}, 1fr);`);
    }
    lines.push(`gap: ${gap}px;`);
    lines.push(`padding: ${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px;`);
    return lines.join("\n");
  }, [layout, flexDirection, alignItems, justifyContent, gridCols, gap, padding]);

  const handleCopy = () => {
    navigator.clipboard.writeText(cssOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`rounded-2xl overflow-hidden ${className}`} style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
      <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--border-primary)" }}>
        <div className="flex items-center gap-2">
          <span className="text-sm">📐</span>
          <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Layout Builder</h3>
        </div>
        <motion.button onClick={handleCopy} className="px-3 py-1 rounded-lg text-xs font-medium" style={{ background: copied ? "rgba(16,185,129,0.15)" : "var(--bg-surface)", border: "1px solid var(--border-primary)", color: copied ? "#10b981" : "var(--text-secondary)" }} whileTap={{ scale: 0.95 }}>
          {copied ? "✓ Copied!" : "Copy CSS"}
        </motion.button>
      </div>

      {/* Preview */}
      <div className="p-4">
        <div className="rounded-xl overflow-hidden" style={{ background: "rgba(6,182,212,0.05)", border: "2px dashed rgba(6,182,212,0.2)", minHeight: 200 }}>
          {/* Margin indicator */}
          <div style={{ padding: `${margin.top}px ${margin.right}px ${margin.bottom}px ${margin.left}px` }}>
            {/* Container with padding */}
            <div className="rounded-lg relative" style={{ ...containerStyle, background: "rgba(139,92,246,0.05)", border: "1px dashed rgba(139,92,246,0.3)" }}>
              {Array.from({ length: itemCount }).map((_, i) => (
                <motion.div
                  key={i}
                  className="rounded-md flex items-center justify-center text-xs font-mono"
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-primary)",
                    minWidth: 60,
                    minHeight: 40,
                    color: "var(--text-muted)",
                  }}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                  whileHover={{ scale: 1.05, borderColor: "var(--accent-cyan)" }}
                >
                  {i + 1}
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 pb-5 space-y-4">
        {/* Layout type */}
        <div className="flex gap-2">
          {(["flex", "grid"] as const).map((l) => (
            <motion.button
              key={l}
              onClick={() => setLayout(l)}
              className="flex-1 py-1.5 rounded-lg text-xs font-medium capitalize"
              style={{
                background: layout === l ? "var(--accent-cyan-muted)" : "var(--bg-surface)",
                color: layout === l ? "var(--accent-cyan)" : "var(--text-muted)",
                border: `1px solid ${layout === l ? "var(--accent-cyan)" : "var(--border-primary)"}`,
              }}
              whileTap={{ scale: 0.95 }}
            >
              {l}
            </motion.button>
          ))}
        </div>

        {/* Flex/Grid specific controls */}
        {layout === "flex" ? (
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-medium mb-1 block" style={{ color: "var(--text-muted)" }}>Direction</label>
              <div className="flex gap-1.5">
                {(["row", "column"] as const).map((d) => (
                  <motion.button key={d} onClick={() => setFlexDirection(d)} className="px-3 py-1 rounded-md text-[10px] font-medium capitalize" style={{ background: flexDirection === d ? "var(--accent-cyan-muted)" : "var(--bg-surface)", color: flexDirection === d ? "var(--accent-cyan)" : "var(--text-muted)", border: `1px solid ${flexDirection === d ? "var(--accent-cyan)" : "var(--border-primary)"}` }} whileTap={{ scale: 0.95 }}>{d}</motion.button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] font-medium mb-1 block" style={{ color: "var(--text-muted)" }}>Align Items</label>
              <div className="flex gap-1.5">
                {(["start", "center", "end", "stretch"] as const).map((a) => (
                  <motion.button key={a} onClick={() => setAlignItems(a)} className="px-2 py-1 rounded-md text-[10px] font-medium capitalize" style={{ background: alignItems === a ? "var(--accent-violet-muted)" : "var(--bg-surface)", color: alignItems === a ? "var(--accent-violet)" : "var(--text-muted)", border: `1px solid ${alignItems === a ? "var(--accent-violet)" : "var(--border-primary)"}` }} whileTap={{ scale: 0.95 }}>{a}</motion.button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] font-medium mb-1 block" style={{ color: "var(--text-muted)" }}>Justify Content</label>
              <div className="flex gap-1.5">
                {(["start", "center", "end", "between", "around"] as const).map((j) => (
                  <motion.button key={j} onClick={() => setJustifyContent(j)} className="px-2 py-1 rounded-md text-[10px] font-medium capitalize" style={{ background: justifyContent === j ? "var(--accent-pink)" : "var(--bg-surface)", color: justifyContent === j ? "white" : "var(--text-muted)", border: `1px solid ${justifyContent === j ? "var(--accent-pink)" : "var(--border-primary)"}` }} whileTap={{ scale: 0.95 }}>{j}</motion.button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div>
            <label className="text-[10px] font-medium flex justify-between" style={{ color: "var(--text-muted)" }}>
              <span>Grid Columns</span><span className="font-mono">{gridCols}</span>
            </label>
            <input type="range" min="1" max="6" value={gridCols} onChange={(e) => setGridCols(Number(e.target.value))} className="w-full accent-cyan-500" />
          </div>
        )}

        {/* Common controls */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-medium flex justify-between" style={{ color: "var(--text-muted)" }}>
              <span>Gap</span><span className="font-mono">{gap}px</span>
            </label>
            <input type="range" min="0" max="40" value={gap} onChange={(e) => setGap(Number(e.target.value))} className="w-full accent-cyan-500" />
          </div>
          <div>
            <label className="text-[10px] font-medium flex justify-between" style={{ color: "var(--text-muted)" }}>
              <span>Items</span><span className="font-mono">{itemCount}</span>
            </label>
            <input type="range" min="1" max="12" value={itemCount} onChange={(e) => setItemCount(Number(e.target.value))} className="w-full accent-cyan-500" />
          </div>
        </div>

        {/* Padding */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider mb-2 block" style={{ color: "var(--text-muted)" }}>Padding (px)</label>
          <div className="grid grid-cols-4 gap-2">
            {(["top", "right", "bottom", "left"] as const).map((side) => (
              <div key={side}>
                <label className="text-[8px] capitalize block text-center" style={{ color: "var(--text-muted)" }}>{side}</label>
                <input
                  type="number"
                  min="0"
                  max="64"
                  value={padding[side]}
                  onChange={(e) => setPadding({ ...padding, [side]: Number(e.target.value) })}
                  className="w-full px-2 py-1 rounded text-center text-[10px] font-mono"
                  style={{ background: "var(--bg-surface)", border: "1px solid var(--border-primary)", color: "var(--text-primary)" }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* CSS */}
        <div className="p-3 rounded-lg font-mono text-[10px] overflow-auto max-h-32" style={{ background: "#1e1e2e", color: "#a6adc8", border: "1px solid rgba(255,255,255,0.06)", lineHeight: 1.8, whiteSpace: "pre" }}>
          {cssOutput}
        </div>
      </div>
    </div>
  );
}

export default GradientBuilder;
