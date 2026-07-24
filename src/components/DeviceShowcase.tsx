"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ============================================================================
// ANIMATED TYPING TERMINAL WITH MULTIPLE SESSIONS
// ============================================================================

interface TerminalSession {
  id: string;
  name: string;
  icon: string;
  commands: Array<{
    prompt: string;
    input: string;
    output: string[];
    delay?: number;
    isError?: boolean;
  }>;
}

interface MultiTerminalProps {
  sessions: TerminalSession[];
  className?: string;
  autoPlay?: boolean;
}

export function MultiTerminal({
  sessions,
  className = "",
  autoPlay = true,
}: MultiTerminalProps) {
  const [activeSession, setActiveSession] = useState(0);
  const [executedLines, setExecutedLines] = useState<Map<string, number>>(new Map());
  const [currentTyping, setCurrentTyping] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const session = sessions[activeSession];
  const executedCount = executedLines.get(session?.id || "") || 0;

  useEffect(() => {
    if (!autoPlay || !session) return;
    if (executedCount >= session.commands.length) return;

    const cmd = session.commands[executedCount];
    const delay = cmd.delay || 800;

    const timeout = setTimeout(() => {
      setIsTyping(true);
      let charIdx = 0;
      const input = cmd.input;

      const typeInterval = setInterval(() => {
        if (charIdx < input.length) {
          setCurrentTyping(input.slice(0, charIdx + 1));
          charIdx++;
        } else {
          clearInterval(typeInterval);
          setIsTyping(false);
          setCurrentTyping("");
          setExecutedLines((prev) => {
            const next = new Map(prev);
            next.set(session.id, (next.get(session.id) || 0) + 1);
            return next;
          });
        }
      }, 25);

      return () => clearInterval(typeInterval);
    }, delay);

    return () => clearTimeout(timeout);
  }, [autoPlay, session, executedCount, sessions]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [executedCount, currentTyping]);

  const resetSession = (sessionId: string) => {
    setExecutedLines((prev) => {
      const next = new Map(prev);
      next.set(sessionId, 0);
      return next;
    });
  };

  return (
    <div className={`overflow-hidden rounded-2xl ${className}`} style={{
      background: "#1e1e2e",
      border: "1px solid rgba(255,255,255,0.06)",
      boxShadow: "0 25px 50px rgba(0,0,0,0.4)",
    }}>
      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-2.5" style={{
        background: "rgba(0,0,0,0.3)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
            <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
          </div>
        </div>
        <div className="flex gap-1">
          {sessions.map((s, i) => (
            <motion.button
              key={s.id}
              onClick={() => setActiveSession(i)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-mono transition-colors ${
                activeSession === i ? "bg-white/10 text-white/90" : "text-white/40 hover:text-white/60 hover:bg-white/5"
              }`}
              whileTap={{ scale: 0.95 }}
            >
              <span>{s.icon}</span>
              {s.name}
            </motion.button>
          ))}
        </div>
        <motion.button
          onClick={() => session && resetSession(session.id)}
          className="text-[10px] text-white/30 hover:text-white/60 px-2 py-0.5 rounded hover:bg-white/5"
          whileTap={{ scale: 0.9 }}
        >
          ↻ Reset
        </motion.button>
      </div>

      {/* Terminal body */}
      <div ref={scrollRef} className="p-4 font-mono text-sm overflow-y-auto max-h-[400px]" style={{ lineHeight: 1.8 }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={session?.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {session?.commands.slice(0, executedCount).map((cmd, i) => (
              <div key={i}>
                <div className="flex gap-2">
                  <span className="text-emerald-400">{cmd.prompt}</span>
                  <span className="text-[#cdd6f4]">{cmd.input}</span>
                </div>
                {cmd.output.map((line, li) => (
                  <motion.div
                    key={li}
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: li * 0.03 }}
                    className={`pl-2 ${cmd.isError ? "text-red-400" : "text-[#a6adc8]"}`}
                  >
                    {line}
                  </motion.div>
                ))}
              </div>
            ))}

            {/* Currently typing */}
            {(isTyping || currentTyping) && session && executedCount < session.commands.length && (
              <div className="flex gap-2">
                <span className="text-emerald-400">{session.commands[executedCount].prompt}</span>
                <span className="text-[#cdd6f4]">{currentTyping}</span>
                <motion.span className="text-[#528bff]" animate={{ opacity: [1, 0] }} transition={{ duration: 0.8, repeat: Infinity }}>▎</motion.span>
              </div>
            )}

            {/* Idle cursor */}
            {!isTyping && !currentTyping && session && executedCount >= session.commands.length && (
              <div className="flex gap-2">
                <span className="text-emerald-400">{session.commands[0]?.prompt || "$"}</span>
                <motion.span className="text-[#528bff]" animate={{ opacity: [1, 0] }} transition={{ duration: 0.8, repeat: Infinity }}>▎</motion.span>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ============================================================================
// INTERACTIVE FILE TREE
// ============================================================================

interface FileTreeNode {
  name: string;
  type: "file" | "folder";
  icon?: string;
  language?: string;
  size?: string;
  children?: FileTreeNode[];
  highlighted?: boolean;
  badge?: string;
}

interface FileTreeProps {
  tree: FileTreeNode[];
  className?: string;
  title?: string;
  onFileClick?: (path: string) => void;
}

function FileTreeItem({
  node,
  depth = 0,
  path = "",
  onFileClick,
}: {
  node: FileTreeNode;
  depth?: number;
  path?: string;
  onFileClick?: (path: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(depth < 2);
  const fullPath = path ? `${path}/${node.name}` : node.name;

  const langColors: Record<string, string> = {
    tsx: "#3178c6", ts: "#3178c6", py: "#3776ab", cpp: "#00599c",
    dart: "#0175c2", yaml: "#cb171e", json: "#fbbf24", md: "#ffffff",
    css: "#264de4", html: "#e34c26", sql: "#336791", sh: "#4eaa25",
  };

  const ext = node.name.split(".").pop() || "";
  const langColor = langColors[ext] || "var(--text-muted)";

  const fileIcons: Record<string, string> = {
    tsx: "⚛️", ts: "🔷", py: "🐍", cpp: "⚡", dart: "🎯",
    yaml: "📋", json: "📦", md: "📝", css: "🎨", html: "🌐",
    sql: "🗄️", sh: "💻", Dockerfile: "🐳",
  };

  const getIcon = () => {
    if (node.icon) return node.icon;
    if (node.type === "folder") return isOpen ? "📂" : "📁";
    return fileIcons[ext] || fileIcons[node.name] || "📄";
  };

  return (
    <div>
      <motion.div
        className="flex items-center gap-1.5 py-0.5 px-2 rounded-md cursor-pointer group"
        style={{
          paddingLeft: `${depth * 16 + 8}px`,
          background: node.highlighted ? "rgba(6,182,212,0.06)" : "transparent",
        }}
        onClick={() => {
          if (node.type === "folder") setIsOpen(!isOpen);
          else onFileClick?.(fullPath);
        }}
        whileHover={{ backgroundColor: "rgba(255,255,255,0.03)" }}
      >
        {/* Expand icon for folders */}
        {node.type === "folder" && (
          <motion.span
            className="text-[10px] w-3 text-center"
            style={{ color: "var(--text-muted)" }}
            animate={{ rotate: isOpen ? 90 : 0 }}
          >
            ▶
          </motion.span>
        )}
        {node.type === "file" && <span className="w-3" />}

        {/* Icon */}
        <span className="text-sm">{getIcon()}</span>

        {/* Name */}
        <span
          className="text-xs flex-1 truncate"
          style={{
            color: node.type === "folder" ? "var(--text-primary)" : langColor,
            fontWeight: node.type === "folder" ? 600 : 400,
          }}
        >
          {node.name}
        </span>

        {/* Badge */}
        {node.badge && (
          <span className="text-[8px] px-1 py-0.5 rounded bg-cyan-500/10 text-cyan-500 font-medium">
            {node.badge}
          </span>
        )}

        {/* Size */}
        {node.size && (
          <span className="text-[9px] opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--text-muted)" }}>
            {node.size}
          </span>
        )}
      </motion.div>

      {/* Children */}
      <AnimatePresence>
        {isOpen && node.children && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {node.children.map((child) => (
              <FileTreeItem
                key={child.name}
                node={child}
                depth={depth + 1}
                path={fullPath}
                onFileClick={onFileClick}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function InteractiveFileTree({
  tree,
  className = "",
  title = "Project Structure",
  onFileClick,
}: FileTreeProps) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  // Count files and folders
  const counts = useMemo(() => {
    let files = 0;
    let folders = 0;
    const countNode = (node: FileTreeNode) => {
      if (node.type === "folder") {
        folders++;
        node.children?.forEach(countNode);
      } else {
        files++;
      }
    };
    tree.forEach(countNode);
    return { files, folders };
  }, [tree]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={isVisible ? { opacity: 1, y: 0 } : {}}
      className={`rounded-2xl overflow-hidden ${className}`}
      style={{
        background: "#1e1e2e",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5" style={{
        background: "rgba(0,0,0,0.3)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div className="flex items-center gap-2">
          <span className="text-sm">📂</span>
          <span className="text-xs font-mono text-white/70">{title}</span>
        </div>
        <div className="flex items-center gap-3 text-[9px] text-white/30">
          <span>📁 {counts.folders} folders</span>
          <span>📄 {counts.files} files</span>
        </div>
      </div>

      {/* Tree */}
      <div className="py-2 max-h-[500px] overflow-y-auto">
        {tree.map((node) => (
          <FileTreeItem key={node.name} node={node} onFileClick={onFileClick} />
        ))}
      </div>
    </motion.div>
  );
}

// ============================================================================
// INTERACTIVE BROWSER MOCKUP
// ============================================================================

interface BrowserMockupProps {
  url?: string;
  title?: string;
  children: React.ReactNode;
  className?: string;
  showAddressBar?: boolean;
  showTabs?: boolean;
  tabs?: string[];
  activeTab?: number;
  variant?: "chrome" | "safari" | "firefox";
}

export function BrowserMockup({
  url = "https://circuvent.com",
  title = "Circuvent Technologies",
  children,
  className = "",
  showAddressBar = true,
  showTabs = false,
  tabs = [],
  activeTab = 0,
  variant = "chrome",
}: BrowserMockupProps) {
  return (
    <div className={`rounded-2xl overflow-hidden ${className}`} style={{
      background: variant === "safari" ? "#1c1c1e" : "#202124",
      border: "1px solid rgba(255,255,255,0.08)",
      boxShadow: "0 25px 50px rgba(0,0,0,0.4)",
    }}>
      {/* Title bar */}
      <div className="flex items-center gap-3 px-4 py-2.5" style={{
        background: variant === "safari" ? "#2c2c2e" : "rgba(0,0,0,0.3)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
          <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
          <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
        </div>

        {/* Tabs */}
        {showTabs && tabs.length > 0 && (
          <div className="flex gap-0.5 ml-4">
            {tabs.map((tab, i) => (
              <div
                key={tab}
                className={`px-3 py-1 rounded-t-lg text-[10px] ${
                  i === activeTab ? "bg-white/10 text-white/80" : "text-white/30"
                }`}
              >
                {tab}
              </div>
            ))}
          </div>
        )}

        {/* Address bar */}
        {showAddressBar && (
          <div className="flex-1 flex items-center gap-2 mx-4">
            <div className="flex-1 flex items-center gap-2 px-3 py-1 rounded-lg" style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}>
              <span className="text-[10px]">🔒</span>
              <span className="text-[10px] text-white/40 font-mono truncate">{url}</span>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="relative">
        {children}
      </div>
    </div>
  );
}

// ============================================================================
// ANIMATED PHONE MOCKUP
// ============================================================================

interface PhoneMockupProps {
  children: React.ReactNode;
  className?: string;
  variant?: "iphone" | "android";
  notchStyle?: "dynamic-island" | "notch" | "punch-hole";
  statusBar?: boolean;
}

export function PhoneMockup({
  children,
  className = "",
  variant = "iphone",
  notchStyle = "dynamic-island",
  statusBar = true,
}: PhoneMockupProps) {
  return (
    <div className={`relative inline-block ${className}`}>
      {/* Phone frame */}
      <div
        className="relative rounded-[40px] overflow-hidden"
        style={{
          width: 280,
          height: 580,
          background: "#000",
          border: "3px solid #333",
          boxShadow: "0 25px 50px rgba(0,0,0,0.5), inset 0 0 0 2px rgba(255,255,255,0.1)",
        }}
      >
        {/* Status bar */}
        {statusBar && (
          <div className="flex items-center justify-between px-6 py-1.5 w-full" style={{ height: 44 }}>
            <span className="text-[10px] text-white/60 font-medium">9:41</span>

            {/* Dynamic Island / Notch */}
            {notchStyle === "dynamic-island" && (
              <motion.div
                className="absolute top-2 left-1/2 -translate-x-1/2 bg-black rounded-full"
                style={{ width: 90, height: 28 }}
                whileHover={{ width: 120, height: 32 }}
                transition={{ type: "spring", stiffness: 300 }}
              />
            )}
            {notchStyle === "notch" && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-black rounded-b-2xl" style={{ width: 130, height: 28 }} />
            )}
            {notchStyle === "punch-hole" && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black rounded-full" style={{ width: 10, height: 10 }} />
            )}

            <div className="flex items-center gap-1">
              <span className="text-[9px] text-white/60">📶</span>
              <span className="text-[9px] text-white/60">📡</span>
              <span className="text-[9px] text-white/60">🔋</span>
            </div>
          </div>
        )}

        {/* Screen content */}
        <div className="w-full overflow-hidden" style={{ height: statusBar ? 536 : 580 }}>
          {children}
        </div>

        {/* Home indicator */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1.5 rounded-full bg-white/30" />
      </div>
    </div>
  );
}

// ============================================================================
// ANIMATED TABLET MOCKUP
// ============================================================================

interface TabletMockupProps {
  children: React.ReactNode;
  className?: string;
  orientation?: "portrait" | "landscape";
}

export function TabletMockup({
  children,
  className = "",
  orientation = "landscape",
}: TabletMockupProps) {
  const isLandscape = orientation === "landscape";

  return (
    <div className={`relative inline-block ${className}`}>
      <div
        className="relative overflow-hidden"
        style={{
          width: isLandscape ? 640 : 440,
          height: isLandscape ? 440 : 640,
          borderRadius: 24,
          background: "#000",
          border: "3px solid #333",
          boxShadow: "0 25px 50px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.1)",
        }}
      >
        {/* Camera */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-zinc-800 ring-1 ring-zinc-700" />

        {/* Screen */}
        <div className="absolute inset-3 rounded-lg overflow-hidden bg-zinc-900">
          {children}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// DEVICE SHOWCASE - Show app across devices
// ============================================================================

interface DeviceShowcaseProps {
  desktopContent: React.ReactNode;
  tabletContent: React.ReactNode;
  mobileContent: React.ReactNode;
  className?: string;
}

export function DeviceShowcase({
  desktopContent,
  tabletContent,
  mobileContent,
  className = "",
}: DeviceShowcaseProps) {
  const [activeDevice, setActiveDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const devices = [
    { id: "desktop" as const, label: "Desktop", icon: "🖥️" },
    { id: "tablet" as const, label: "Tablet", icon: "📱" },
    { id: "mobile" as const, label: "Mobile", icon: "📲" },
  ];

  return (
    <div ref={ref} className={className}>
      {/* Device switcher */}
      <div className="flex justify-center gap-2 mb-8">
        {devices.map((device) => (
          <motion.button
            key={device.id}
            onClick={() => setActiveDevice(device.id)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
            style={{
              background: activeDevice === device.id ? "var(--accent-cyan-muted)" : "var(--bg-surface)",
              color: activeDevice === device.id ? "var(--accent-cyan)" : "var(--text-muted)",
              border: `1px solid ${activeDevice === device.id ? "var(--accent-cyan)" : "var(--border-primary)"}`,
            }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <span>{device.icon}</span>
            {device.label}
          </motion.button>
        ))}
      </div>

      {/* Device display */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeDevice}
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={isVisible ? { opacity: 1, y: 0, scale: 1 } : {}}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ duration: 0.3 }}
          className="flex justify-center"
        >
          {activeDevice === "desktop" && (
            <BrowserMockup url="https://circuvent.com" className="w-full max-w-3xl">
              {desktopContent}
            </BrowserMockup>
          )}
          {activeDevice === "tablet" && (
            <TabletMockup orientation="landscape">
              {tabletContent}
            </TabletMockup>
          )}
          {activeDevice === "mobile" && (
            <PhoneMockup variant="iphone" notchStyle="dynamic-island">
              {mobileContent}
            </PhoneMockup>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// ANIMATED CODE DIFF VIEWER
// ============================================================================

interface DiffLine {
  type: "added" | "removed" | "unchanged" | "header";
  content: string;
  lineNumber?: number;
}

interface CodeDiffProps {
  title?: string;
  fileName?: string;
  lines: DiffLine[];
  className?: string;
}

export function AnimatedCodeDiff({
  title = "Changes",
  fileName = "component.tsx",
  lines,
  className = "",
}: CodeDiffProps) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const stats = useMemo(() => {
    const added = lines.filter((l) => l.type === "added").length;
    const removed = lines.filter((l) => l.type === "removed").length;
    return { added, removed };
  }, [lines]);

  const lineColors = {
    added: { bg: "rgba(16, 185, 129, 0.08)", border: "rgba(16, 185, 129, 0.2)", marker: "#10b981", prefix: "+" },
    removed: { bg: "rgba(239, 68, 68, 0.08)", border: "rgba(239, 68, 68, 0.2)", marker: "#ef4444", prefix: "-" },
    unchanged: { bg: "transparent", border: "transparent", marker: "transparent", prefix: " " },
    header: { bg: "rgba(59, 130, 246, 0.05)", border: "rgba(59, 130, 246, 0.1)", marker: "#3b82f6", prefix: "@" },
  };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={isVisible ? { opacity: 1, y: 0 } : {}}
      className={`rounded-2xl overflow-hidden ${className}`}
      style={{
        background: "#1e1e2e",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5" style={{
        background: "rgba(0,0,0,0.3)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div className="flex items-center gap-2">
          <span className="text-sm">📝</span>
          <span className="text-xs font-mono text-white/70">{fileName}</span>
          <span className="text-[9px] text-white/30">{title}</span>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-emerald-400">+{stats.added}</span>
          <span className="text-red-400">-{stats.removed}</span>
        </div>
      </div>

      {/* Diff content */}
      <div className="overflow-auto max-h-[400px] font-mono text-xs" style={{ lineHeight: 1.7 }}>
        {lines.map((line, i) => {
          const colors = lineColors[line.type];
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: line.type === "added" ? 10 : line.type === "removed" ? -10 : 0 }}
              animate={isVisible ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: i * 0.02 }}
              className="flex"
              style={{
                background: colors.bg,
                borderLeft: `3px solid ${colors.border}`,
              }}
            >
              {/* Line number */}
              <div className="w-12 text-right pr-3 select-none shrink-0" style={{ color: "rgba(255,255,255,0.15)" }}>
                {line.lineNumber || ""}
              </div>

              {/* Prefix */}
              <div className="w-5 text-center shrink-0" style={{ color: colors.marker }}>
                {colors.prefix}
              </div>

              {/* Content */}
              <div className="flex-1 pr-4" style={{
                color: line.type === "header" ? "#3b82f6" : line.type === "removed" ? "#fca5a5" : line.type === "added" ? "#86efac" : "#a6adc8",
              }}>
                {line.content}
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ============================================================================
// ANIMATED STATS COUNTER WITH ODOMETER EFFECT
// ============================================================================

interface OdometerProps {
  value: number;
  className?: string;
  duration?: number;
  fontSize?: number;
}

export function Odometer({
  value,
  className = "",
  duration = 1500,
  fontSize = 48,
}: OdometerProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    const start = Date.now();
    const animate = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      setDisplayValue(Math.round(value * eased));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [isVisible, value, duration]);

  const digits = displayValue.toString().split("");

  return (
    <div ref={ref} className={`flex items-center ${className}`}>
      {digits.map((digit, i) => (
        <motion.div
          key={`${i}-${digit}`}
          className="relative overflow-hidden tabular-nums font-bold"
          style={{ fontSize, lineHeight: 1, width: fontSize * 0.65, height: fontSize }}
          initial={{ y: -fontSize }}
          animate={{ y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <motion.span
            className="absolute inset-0 flex items-center justify-center"
            key={digit}
            initial={{ y: fontSize }}
            animate={{ y: 0 }}
            exit={{ y: -fontSize }}
            transition={{ duration: 0.2 }}
            style={{ color: "var(--text-primary)" }}
          >
            {digit}
          </motion.span>
        </motion.div>
      ))}
    </div>
  );
}

export default MultiTerminal;
