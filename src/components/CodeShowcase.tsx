"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useInView } from "framer-motion";

interface CodeLine {
  indent: number;
  content: string;
  type: "keyword" | "string" | "comment" | "function" | "variable" | "operator" | "type" | "plain" | "decorator" | "number";
}

interface CodeShowcaseProps {
  className?: string;
  title?: string;
  language?: string;
  typingSpeed?: number;
}

const codeExamples: { title: string; language: string; lines: CodeLine[] }[] = [
  {
    title: "nexus_orchestrator.py",
    language: "Python",
    lines: [
      { indent: 0, content: "from agents import OrchestratorAgent", type: "keyword" },
      { indent: 0, content: "from memory import ChromaDBStore", type: "keyword" },
      { indent: 0, content: "from ipc import AgentIPCBus", type: "keyword" },
      { indent: 0, content: "", type: "plain" },
      { indent: 0, content: "@agent(model=\"llama3.1:70b\")", type: "decorator" },
      { indent: 0, content: "class NexusOrchestrator:", type: "keyword" },
      { indent: 1, content: "\"\"\"13-agent AI orchestrator\"\"\"", type: "string" },
      { indent: 1, content: "", type: "plain" },
      { indent: 1, content: "def __init__(self):", type: "function" },
      { indent: 2, content: "self.agents = AgentRegistry()", type: "variable" },
      { indent: 2, content: "self.memory = ChromaDBStore()", type: "variable" },
      { indent: 2, content: "self.ipc = AgentIPCBus()", type: "variable" },
      { indent: 1, content: "", type: "plain" },
      { indent: 1, content: "async def process(self, query: str):", type: "function" },
      { indent: 2, content: "# Classify intent", type: "comment" },
      { indent: 2, content: "intent = await self.classify(query)", type: "variable" },
      { indent: 2, content: "agent = self.agents.get(intent.id)", type: "variable" },
      { indent: 2, content: "", type: "plain" },
      { indent: 2, content: "# Retrieve context", type: "comment" },
      { indent: 2, content: "context = await self.memory.search(", type: "function" },
      { indent: 3, content: "query, n_results=5", type: "number" },
      { indent: 2, content: ")", type: "plain" },
      { indent: 2, content: "", type: "plain" },
      { indent: 2, content: "# Execute with streaming", type: "comment" },
      { indent: 2, content: "return await agent.stream(", type: "keyword" },
      { indent: 3, content: "query=query,", type: "string" },
      { indent: 3, content: "context=context,", type: "string" },
      { indent: 3, content: "temperature=0.7", type: "number" },
      { indent: 2, content: ")", type: "plain" },
    ],
  },
  {
    title: "SmartHome.dart",
    language: "Flutter",
    lines: [
      { indent: 0, content: "import 'package:riverpod/riverpod.dart';", type: "keyword" },
      { indent: 0, content: "import 'package:mqtt_client/mqtt.dart';", type: "keyword" },
      { indent: 0, content: "", type: "plain" },
      { indent: 0, content: "@riverpod", type: "decorator" },
      { indent: 0, content: "class DeviceController extends _$DeviceController {", type: "keyword" },
      { indent: 1, content: "late MqttClient _mqtt;", type: "type" },
      { indent: 1, content: "", type: "plain" },
      { indent: 1, content: "@override", type: "decorator" },
      { indent: 1, content: "Future<List<Device>> build() async {", type: "function" },
      { indent: 2, content: "// Connect to MQTT broker", type: "comment" },
      { indent: 2, content: "_mqtt = await ref.watch(", type: "variable" },
      { indent: 3, content: "mqttClientProvider.future", type: "variable" },
      { indent: 2, content: ");", type: "plain" },
      { indent: 2, content: "", type: "plain" },
      { indent: 2, content: "// Subscribe to device status", type: "comment" },
      { indent: 2, content: "_mqtt.subscribe(", type: "function" },
      { indent: 3, content: "'home/+/+/status',", type: "string" },
      { indent: 3, content: "MqttQos.atLeastOnce", type: "type" },
      { indent: 2, content: ");", type: "plain" },
      { indent: 2, content: "", type: "plain" },
      { indent: 2, content: "return _loadDevices();", type: "keyword" },
      { indent: 1, content: "}", type: "plain" },
      { indent: 1, content: "", type: "plain" },
      { indent: 1, content: "Future<void> toggleDevice(", type: "function" },
      { indent: 2, content: "String id, int relay", type: "type" },
      { indent: 1, content: ") async {", type: "plain" },
      { indent: 2, content: "_mqtt.publish('home/\\$id/toggle',", type: "function" },
      { indent: 3, content: "relay.toString());", type: "string" },
      { indent: 1, content: "}", type: "plain" },
      { indent: 0, content: "}", type: "plain" },
    ],
  },
  {
    title: "esp32_firmware.cpp",
    language: "C++",
    lines: [
      { indent: 0, content: "#include <WiFi.h>", type: "keyword" },
      { indent: 0, content: "#include <PubSubClient.h>", type: "keyword" },
      { indent: 0, content: "#include <ArduinoJson.h>", type: "keyword" },
      { indent: 0, content: "", type: "plain" },
      { indent: 0, content: "#define DEVICE_ID \"esp32_main\"", type: "variable" },
      { indent: 0, content: "#define MQTT_BROKER \"mqtt.local\"", type: "variable" },
      { indent: 0, content: "#define NUM_RELAYS 4", type: "number" },
      { indent: 0, content: "", type: "plain" },
      { indent: 0, content: "const int RELAY_PINS[] = {25,26,27,14};", type: "type" },
      { indent: 0, content: "bool relayStates[NUM_RELAYS] = {0};", type: "type" },
      { indent: 0, content: "", type: "plain" },
      { indent: 0, content: "void mqttCallback(char* topic,", type: "function" },
      { indent: 1, content: "byte* payload, unsigned int len) {", type: "plain" },
      { indent: 1, content: "// Parse MQTT command", type: "comment" },
      { indent: 1, content: "StaticJsonDocument<128> doc;", type: "type" },
      { indent: 1, content: "deserializeJson(doc, payload);", type: "function" },
      { indent: 1, content: "", type: "plain" },
      { indent: 1, content: "int relay = doc[\"relay\"];", type: "variable" },
      { indent: 1, content: "bool state = doc[\"state\"];", type: "variable" },
      { indent: 1, content: "", type: "plain" },
      { indent: 1, content: "if (relay >= 0 && relay < NUM_RELAYS) {", type: "keyword" },
      { indent: 2, content: "relayStates[relay] = state;", type: "variable" },
      { indent: 2, content: "digitalWrite(RELAY_PINS[relay],", type: "function" },
      { indent: 3, content: "state ? HIGH : LOW);", type: "keyword" },
      { indent: 2, content: "publishStatus();", type: "function" },
      { indent: 1, content: "}", type: "plain" },
      { indent: 0, content: "}", type: "plain" },
      { indent: 0, content: "", type: "plain" },
      { indent: 0, content: "void setup() {", type: "function" },
      { indent: 1, content: "Serial.begin(115200);", type: "function" },
      { indent: 1, content: "connectWiFi();", type: "function" },
      { indent: 1, content: "connectMQTT();", type: "function" },
      { indent: 1, content: "setupOTA();", type: "function" },
      { indent: 0, content: "}", type: "plain" },
    ],
  },
];

const typeColors: Record<string, string> = {
  keyword: "#c792ea",
  string: "#c3e88d",
  comment: "#546e7a",
  function: "#82aaff",
  variable: "#f78c6c",
  operator: "#89ddff",
  type: "#ffcb6b",
  plain: "#a6accd",
  decorator: "#ff5370",
  number: "#f78c6c",
};

export default function CodeShowcase({ className, typingSpeed = 40 }: CodeShowcaseProps) {
  const [activeExample, setActiveExample] = useState(0);
  const [visibleLines, setVisibleLines] = useState(0);
  const [isTyping, setIsTyping] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentExample = codeExamples[activeExample];

  // Typing animation
  useEffect(() => {
    if (!isInView) return;

    setVisibleLines(0);
    setIsTyping(true);

    let lineIndex = 0;
    const typeNextLine = () => {
      if (lineIndex >= currentExample.lines.length) {
        setIsTyping(false);
        // Auto-switch after 3s
        timerRef.current = setTimeout(() => {
          setActiveExample((prev) => (prev + 1) % codeExamples.length);
        }, 3000);
        return;
      }

      lineIndex++;
      setVisibleLines(lineIndex);

      const delay = currentExample.lines[lineIndex - 1]?.content === ""
        ? typingSpeed / 2
        : typingSpeed;
      timerRef.current = setTimeout(typeNextLine, delay);
    };

    timerRef.current = setTimeout(typeNextLine, 500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [activeExample, isInView, currentExample.lines.length, typingSpeed, currentExample.lines]);

  return (
    <div ref={ref} className={`relative ${className || ""}`}>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-2xl"
        style={{
          background: "#1e1e2e",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 25px 50px rgba(0,0,0,0.4)",
        }}
      >
        {/* Window chrome */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ background: "rgba(0,0,0,0.3)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
              <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
              <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
            </div>
          </div>

          {/* File tabs */}
          <div className="flex items-center gap-1 overflow-x-auto">
            {codeExamples.map((ex, i) => (
              <button
                key={ex.title}
                onClick={() => setActiveExample(i)}
                className={`px-2 sm:px-3 py-1 text-xs font-mono rounded-md transition-all cursor-pointer whitespace-nowrap ${
                  i === activeExample
                    ? "bg-[#2d2d3f] text-[#cdd6f4]"
                    : "text-[#6c7086] hover:text-[#a6adc8]"
                }`}
              >
                {ex.title}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-[#6c7086]">{currentExample.language}</span>
            {isTyping && (
              <motion.div
                className="w-2 h-2 rounded-full bg-emerald-500"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
            )}
          </div>
        </div>

        {/* Code content */}
        <div className="p-3 sm:p-5 font-mono text-xs sm:text-sm leading-relaxed overflow-x-auto min-h-[250px] sm:min-h-[350px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeExample}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {currentExample.lines.map((line, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={i < visibleLines ? { opacity: 1, x: 0 } : { opacity: 0, x: -10 }}
                  transition={{ duration: 0.15 }}
                  className="flex"
                >
                  {/* Line number */}
                  <span className="w-8 text-right text-[#45475a] text-xs select-none shrink-0 mr-4 mt-[2px]">
                    {i + 1}
                  </span>
                  {/* Content */}
                  <span style={{ paddingLeft: `${line.indent * 20}px`, color: typeColors[line.type] }}>
                    {line.content || "\u00A0"}
                  </span>
                </motion.div>
              ))}

              {/* Cursor */}
              {isTyping && (
                <motion.span
                  className="inline-block w-[2px] h-[18px] bg-[#cdd6f4] ml-8"
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ duration: 0.6, repeat: Infinity }}
                  style={{ marginLeft: `${32 + (currentExample.lines[visibleLines]?.indent || 0) * 20}px` }}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Status bar */}
        <div
          className="flex items-center justify-between px-4 py-1.5 text-[10px] font-mono"
          style={{ background: "rgba(0,0,0,0.2)", borderTop: "1px solid rgba(255,255,255,0.06)", color: "#6c7086" }}
        >
          <div className="flex items-center gap-4">
            <span>Circuvent Technologies</span>
            <span>{currentExample.language}</span>
          </div>
          <div className="flex items-center gap-4">
            <span>Ln {visibleLines}, Col 1</span>
            <span>UTF-8</span>
            <span>Spaces: 4</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
