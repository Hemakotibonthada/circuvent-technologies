"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from "framer-motion";
import {
  Command, Search, ArrowRight, Copy, Check, Terminal, FileCode,
  Folder, GitBranch, Settings, Moon, Sun, Palette, Layout,
  Monitor, Smartphone, Globe, Database, Cloud, Wifi, Shield,
  Zap, Brain, Cpu, Eye, Lock, Layers, TrendingUp, Heart,
  Code2, Box, Rocket, Sparkles, X, ChevronDown, ChevronRight as ChevronRightIcon,
  Play, Square, RotateCcw, Download, Upload, Share2, Bookmark,
  Bell, Mail, MessageSquare, Users, Calendar, Clock, Hash,
  Star, Filter, SortAsc, MoreHorizontal, ExternalLink,
  Maximize2, Minimize2, RefreshCw, Trash2, Edit3, Plus,
  AlertCircle, CheckCircle, Info, AlertTriangle,
} from "lucide-react";

// ============================================================================
// INTERACTIVE CODE EDITOR - Fake IDE with tabs, line numbers, syntax highlight
// ============================================================================

interface CodeTab {
  name: string;
  language: string;
  code: string;
  icon?: React.ReactNode;
}

interface InteractiveCodeEditorProps {
  tabs: CodeTab[];
  title?: string;
  showLineNumbers?: boolean;
  showMinimap?: boolean;
  className?: string;
  typingEffect?: boolean;
  typingSpeed?: number;
}

// Simple syntax highlighting
function highlightCode(code: string, language: string): string {
  const keywords: Record<string, string[]> = {
    typescript: ["import", "export", "from", "const", "let", "var", "function", "return", "if", "else", "for", "while", "class", "interface", "type", "extends", "implements", "new", "this", "async", "await", "try", "catch", "throw", "typeof", "instanceof", "default", "switch", "case", "break", "continue", "enum", "abstract", "private", "public", "protected", "static", "readonly", "as", "is", "keyof", "in", "of", "yield", "void", "null", "undefined", "true", "false"],
    python: ["import", "from", "def", "class", "return", "if", "elif", "else", "for", "while", "try", "except", "finally", "with", "as", "yield", "lambda", "pass", "break", "continue", "and", "or", "not", "in", "is", "True", "False", "None", "self", "async", "await", "raise", "del", "global", "nonlocal", "assert"],
    rust: ["fn", "let", "mut", "const", "struct", "enum", "impl", "trait", "pub", "mod", "use", "self", "super", "crate", "where", "match", "if", "else", "for", "while", "loop", "break", "continue", "return", "async", "await", "move", "ref", "type", "as", "in", "unsafe", "extern", "true", "false", "Some", "None", "Ok", "Err"],
    go: ["package", "import", "func", "return", "if", "else", "for", "range", "switch", "case", "default", "break", "continue", "go", "defer", "select", "chan", "map", "struct", "interface", "type", "var", "const", "nil", "true", "false", "make", "new", "append", "len", "cap"],
  };

  const types: Record<string, string[]> = {
    typescript: ["string", "number", "boolean", "any", "never", "unknown", "Promise", "Array", "Map", "Set", "Record", "Partial", "Required", "Pick", "Omit", "React", "JSX"],
    python: ["str", "int", "float", "bool", "list", "dict", "tuple", "set", "Optional", "List", "Dict", "Tuple", "Set", "Any", "Union"],
    rust: ["String", "Vec", "HashMap", "Option", "Result", "Box", "Rc", "Arc", "i32", "u32", "i64", "u64", "f32", "f64", "bool", "usize", "isize"],
    go: ["string", "int", "int32", "int64", "float32", "float64", "bool", "byte", "rune", "error", "context"],
  };

  const langKw = keywords[language] || keywords.typescript;
  const langTypes = types[language] || types.typescript;

  let result = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Strings (double & single quotes, template literals)
  result = result.replace(/(["'`])(?:(?!\1|\\).|\\.)*\1/g, '<span class="code-string">$&</span>');

  // Comments
  result = result.replace(/(\/\/.*$)/gm, '<span class="code-comment">$&</span>');
  result = result.replace(/(#.*$)/gm, '<span class="code-comment">$&</span>');

  // Numbers
  result = result.replace(/\b(\d+\.?\d*)\b/g, '<span class="code-number">$&</span>');

  // Types
  for (const t of langTypes) {
    const regex = new RegExp(`\\b(${t})\\b`, "g");
    result = result.replace(regex, '<span class="code-type">$&</span>');
  }

  // Keywords
  for (const kw of langKw) {
    const regex = new RegExp(`\\b(${kw})\\b`, "g");
    result = result.replace(regex, '<span class="code-keyword">$&</span>');
  }

  // Function calls
  result = result.replace(/\b([a-zA-Z_]\w*)\s*\(/g, '<span class="code-function">$1</span>(');

  // Decorators / attributes
  result = result.replace(/(@\w+)/g, '<span class="code-decorator">$&</span>');

  return result;
}

export function InteractiveCodeEditor({
  tabs,
  title = "code-editor",
  showLineNumbers = true,
  showMinimap = false,
  className = "",
  typingEffect = false,
  typingSpeed = 20,
}: InteractiveCodeEditorProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [copied, setCopied] = useState(false);
  const [displayedCode, setDisplayedCode] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const currentTab = tabs[activeTab];
  const code = currentTab?.code || "";

  // Typing effect
  useEffect(() => {
    if (!typingEffect) {
      setDisplayedCode(code);
      return;
    }

    setIsTyping(true);
    setDisplayedCode("");
    let index = 0;
    const interval = setInterval(() => {
      if (index < code.length) {
        setDisplayedCode(code.slice(0, index + 1));
        index++;
      } else {
        clearInterval(interval);
        setIsTyping(false);
      }
    }, typingSpeed);

    return () => clearInterval(interval);
  }, [code, typingEffect, typingSpeed]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  const lines = (typingEffect ? displayedCode : code).split("\n");

  const langIcons: Record<string, string> = {
    typescript: "🔷",
    python: "🐍",
    rust: "🦀",
    go: "💙",
    javascript: "💛",
    cpp: "⚡",
    dart: "🎯",
    sql: "🗄️",
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
          <span className="text-xs font-mono text-[#6c7086]">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            onClick={handleCopy}
            className="p-1.5 rounded-md hover:bg-white/5 transition-colors"
            whileTap={{ scale: 0.9 }}
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-[#6c7086]" />
            )}
          </motion.button>
        </div>
      </div>

      {/* Tabs */}
      {tabs.length > 1 && (
        <div className="flex overflow-x-auto" style={{
          background: "rgba(0,0,0,0.15)",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
        }}>
          {tabs.map((tab, i) => (
            <motion.button
              key={tab.name}
              onClick={() => setActiveTab(i)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-mono transition-colors border-b-2 whitespace-nowrap ${
                activeTab === i
                  ? "text-white/90 border-cyan-400 bg-white/5"
                  : "text-[#6c7086] border-transparent hover:text-white/60 hover:bg-white/3"
              }`}
              whileHover={{ backgroundColor: "rgba(255,255,255,0.05)" }}
            >
              <span>{langIcons[tab.language] || "📄"}</span>
              {tab.name}
            </motion.button>
          ))}
        </div>
      )}

      {/* Code area */}
      <div className="flex overflow-auto max-h-[500px]" style={{ fontFamily: "var(--font-geist-mono), monospace" }}>
        {/* Line numbers */}
        {showLineNumbers && (
          <div className="select-none text-right pr-4 pl-4 py-4 text-[#6c7086]" style={{
            background: "rgba(0,0,0,0.1)",
            borderRight: "1px solid rgba(255,255,255,0.04)",
            fontSize: "13px",
            lineHeight: "1.7",
          }}>
            {lines.map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
        )}

        {/* Code */}
        <div className="flex-1 overflow-x-auto">
          <pre className="p-4" style={{ fontSize: "13px", lineHeight: "1.7", margin: 0 }}>
            <code
              dangerouslySetInnerHTML={{
                __html: highlightCode(typingEffect ? displayedCode : code, currentTab?.language || "typescript") +
                  (isTyping ? '<span class="code-cursor">|</span>' : ""),
              }}
            />
          </pre>
        </div>

        {/* Minimap */}
        {showMinimap && (
          <div className="w-16 py-4 px-1 opacity-30" style={{
            background: "rgba(0,0,0,0.1)",
            borderLeft: "1px solid rgba(255,255,255,0.04)",
          }}>
            {lines.map((line, i) => (
              <div
                key={i}
                className="h-[3px] mb-[1px] rounded-full"
                style={{
                  width: `${Math.min(line.length * 0.8, 100)}%`,
                  background: line.trim() ? "rgba(255,255,255,0.15)" : "transparent",
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-1.5 text-[10px] text-[#6c7086]" style={{
        background: "rgba(0,0,0,0.2)",
        borderTop: "1px solid rgba(255,255,255,0.04)",
      }}>
        <div className="flex items-center gap-3">
          <span>{currentTab?.language || "plaintext"}</span>
          <span>UTF-8</span>
          <span>LF</span>
        </div>
        <div className="flex items-center gap-3">
          <span>Ln {lines.length}, Col {lines[lines.length - 1]?.length || 0}</span>
          <span>{isTyping ? "Typing..." : "Ready"}</span>
        </div>
      </div>

      {/* Styles */}
      <style jsx global>{`
        .code-keyword { color: #c678dd; }
        .code-string { color: #98c379; }
        .code-number { color: #d19a66; }
        .code-comment { color: #5c6370; font-style: italic; }
        .code-function { color: #61afef; }
        .code-type { color: #e5c07b; }
        .code-decorator { color: #e06c75; }
        .code-cursor { 
          color: #528bff;
          animation: cursor-blink 1s step-end infinite;
        }
        @keyframes cursor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ============================================================================
// INTERACTIVE TERMINAL
// ============================================================================

interface TerminalCommand {
  input: string;
  output: string | string[];
  directory?: string;
  isError?: boolean;
  delay?: number;
}

interface InteractiveTerminalProps {
  commands: TerminalCommand[];
  title?: string;
  prompt?: string;
  className?: string;
  autoPlay?: boolean;
  autoPlayDelay?: number;
  showTimestamp?: boolean;
}

export function InteractiveTerminal({
  commands,
  title = "terminal",
  prompt = "~/circuvent $",
  className = "",
  autoPlay = true,
  autoPlayDelay = 500,
  showTimestamp = false,
}: InteractiveTerminalProps) {
  const [executedCommands, setExecutedCommands] = useState<number[]>([]);
  const [currentTyping, setCurrentTyping] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoPlay || currentIndex >= commands.length) return;

    const cmd = commands[currentIndex];
    const delay = cmd.delay || autoPlayDelay;

    const timeout = setTimeout(() => {
      // Start typing
      setIsTyping(true);
      let charIndex = 0;
      const input = cmd.input;

      const typeInterval = setInterval(() => {
        if (charIndex < input.length) {
          setCurrentTyping(input.slice(0, charIndex + 1));
          charIndex++;
        } else {
          clearInterval(typeInterval);
          setIsTyping(false);
          setCurrentTyping("");
          setExecutedCommands((prev) => [...prev, currentIndex]);
          setCurrentIndex((prev) => prev + 1);
        }
      }, 30);

      return () => clearInterval(typeInterval);
    }, delay);

    return () => clearTimeout(timeout);
  }, [autoPlay, autoPlayDelay, commands, currentIndex]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [executedCommands, currentTyping]);

  return (
    <div className={`overflow-hidden rounded-2xl ${className}`} style={{
      background: "#1e1e2e",
      border: "1px solid rgba(255,255,255,0.06)",
      boxShadow: "0 25px 50px rgba(0,0,0,0.4)",
    }}>
      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-3" style={{
        background: "rgba(0,0,0,0.3)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
          <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
          <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
        </div>
        <div className="flex items-center gap-2 ml-2">
          <Terminal className="w-3.5 h-3.5 text-[#6c7086]" />
          <span className="text-xs font-mono text-[#6c7086]">{title}</span>
        </div>
      </div>

      {/* Terminal content */}
      <div ref={scrollRef} className="p-4 font-mono text-sm overflow-y-auto max-h-[400px]" style={{ lineHeight: "1.8" }}>
        {/* Executed commands */}
        {executedCommands.map((cmdIdx) => {
          const cmd = commands[cmdIdx];
          const outputs = Array.isArray(cmd.output) ? cmd.output : [cmd.output];
          return (
            <motion.div
              key={cmdIdx}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="flex items-center gap-2">
                <span className="text-emerald-400">{cmd.directory || prompt}</span>
                <span className="text-[#cdd6f4]">{cmd.input}</span>
                {showTimestamp && (
                  <span className="text-[#45475a] ml-auto text-xs">
                    {new Date().toLocaleTimeString()}
                  </span>
                )}
              </div>
              {outputs.map((output, oi) => (
                <div
                  key={oi}
                  className={`pl-4 ${cmd.isError ? "text-red-400" : "text-[#a6adc8]"}`}
                >
                  {output}
                </div>
              ))}
            </motion.div>
          );
        })}

        {/* Currently typing */}
        {(isTyping || currentTyping) && (
          <div className="flex items-center gap-2">
            <span className="text-emerald-400">{prompt}</span>
            <span className="text-[#cdd6f4]">{currentTyping}</span>
            <motion.span
              className="text-[#528bff] text-lg"
              animate={{ opacity: [1, 0] }}
              transition={{ duration: 0.8, repeat: Infinity }}
            >
              ▎
            </motion.span>
          </div>
        )}

        {/* Waiting cursor */}
        {!isTyping && !currentTyping && currentIndex >= commands.length && (
          <div className="flex items-center gap-2">
            <span className="text-emerald-400">{prompt}</span>
            <motion.span
              className="text-[#528bff] text-lg"
              animate={{ opacity: [1, 0] }}
              transition={{ duration: 0.8, repeat: Infinity }}
            >
              ▎
            </motion.span>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// ANIMATED FEATURE CARDS WITH HOVER EFFECTS
// ============================================================================

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  gradient?: string;
  stats?: Array<{ label: string; value: string }>;
  tags?: string[];
  link?: string;
  className?: string;
  variant?: "default" | "glass" | "bordered" | "gradient" | "neon";
}

export function AnimatedFeatureCard({
  icon,
  title,
  description,
  gradient = "from-cyan-500 to-blue-500",
  stats,
  tags,
  link,
  className = "",
  variant = "default",
}: FeatureCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }, []);

  const variantStyles: Record<string, React.CSSProperties> = {
    default: {
      background: "var(--bg-glass)",
      border: "1px solid var(--border-primary)",
    },
    glass: {
      background: "var(--bg-glass)",
      border: "1px solid var(--border-primary)",
      backdropFilter: "blur(24px)",
    },
    bordered: {
      background: "transparent",
      border: "2px solid var(--border-primary)",
    },
    gradient: {
      background: "var(--bg-glass)",
      border: "1px solid var(--border-primary)",
    },
    neon: {
      background: "var(--bg-glass)",
      border: "1px solid var(--border-accent)",
    },
  };

  return (
    <motion.div
      ref={cardRef}
      className={`group relative overflow-hidden rounded-2xl p-6 transition-all duration-500 ${className}`}
      style={variantStyles[variant]}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onMouseMove={handleMouseMove}
      whileHover={{ y: -4, scale: 1.01 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      {/* Spotlight effect */}
      {isHovered && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            background: `radial-gradient(300px circle at ${mousePos.x}px ${mousePos.y}px, rgba(6, 182, 212, 0.06), transparent 60%)`,
          }}
        />
      )}

      {/* Top gradient line */}
      <div
        className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
      />

      {/* Content */}
      <div className="relative z-10">
        <motion.div
          className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${gradient} mb-4`}
          whileHover={{ rotate: 10, scale: 1.1 }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          {icon}
        </motion.div>

        <h3 className="text-lg font-bold mb-2" style={{ color: "var(--text-primary)" }}>
          {title}
        </h3>
        <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--text-muted)" }}>
          {description}
        </p>

        {/* Stats */}
        {stats && stats.length > 0 && (
          <div className="flex gap-4 mb-4">
            {stats.map((stat) => (
              <div key={stat.label}>
                <div className="text-sm font-bold" style={{ color: "var(--accent-cyan)" }}>
                  {stat.value}
                </div>
                <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tags */}
        {tags && tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                style={{
                  background: "var(--accent-cyan-muted)",
                  color: "var(--accent-cyan)",
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Arrow */}
        {link && (
          <motion.div
            className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity"
            animate={isHovered ? { x: 0, opacity: 1 } : { x: -5, opacity: 0 }}
          >
            <ArrowRight className="w-5 h-5" style={{ color: "var(--accent-cyan)" }} />
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

// ============================================================================
// COMPARISON TABLE
// ============================================================================

interface ComparisonRow {
  feature: string;
  values: Array<boolean | string>;
}

interface ComparisonTableProps {
  headers: string[];
  rows: ComparisonRow[];
  highlightColumn?: number;
  className?: string;
  title?: string;
}

export function AnimatedComparisonTable({
  headers,
  rows,
  highlightColumn = 0,
  className = "",
  title,
}: ComparisonTableProps) {
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
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`overflow-x-auto ${className}`}>
      {title && (
        <h4 className="text-lg font-bold mb-6" style={{ color: "var(--text-primary)" }}>
          {title}
        </h4>
      )}
      <div className="rounded-2xl overflow-hidden" style={{
        background: "var(--bg-glass)",
        border: "1px solid var(--border-primary)",
      }}>
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-left px-5 py-4 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border-primary)" }}>
                Feature
              </th>
              {headers.map((header, i) => (
                <th
                  key={header}
                  className={`text-center px-5 py-4 text-xs font-semibold uppercase tracking-wider ${
                    i === highlightColumn ? "bg-gradient-to-b from-cyan-500/10 to-transparent" : ""
                  }`}
                  style={{
                    color: i === highlightColumn ? "var(--accent-cyan)" : "var(--text-muted)",
                    borderBottom: "1px solid var(--border-primary)",
                  }}
                >
                  {header}
                  {i === highlightColumn && (
                    <div className="text-[10px] text-cyan-400 mt-1">★ Recommended</div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <motion.tr
                key={row.feature}
                initial={{ opacity: 0, x: -20 }}
                animate={isVisible ? { opacity: 1, x: 0 } : {}}
                transition={{ delay: ri * 0.05 }}
                className="hover:bg-white/2 transition-colors"
                style={{ borderBottom: ri < rows.length - 1 ? "1px solid var(--border-primary)" : "none" }}
              >
                <td className="px-5 py-3.5 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                  {row.feature}
                </td>
                {row.values.map((val, vi) => (
                  <td
                    key={vi}
                    className={`text-center px-5 py-3.5 ${
                      vi === highlightColumn ? "bg-cyan-500/5" : ""
                    }`}
                  >
                    {typeof val === "boolean" ? (
                      val ? (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={isVisible ? { scale: 1 } : {}}
                          transition={{ delay: ri * 0.05 + 0.2, type: "spring" }}
                        >
                          <CheckCircle className="w-5 h-5 text-emerald-500 mx-auto" />
                        </motion.div>
                      ) : (
                        <X className="w-5 h-5 text-red-400/50 mx-auto" />
                      )
                    ) : (
                      <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                        {val}
                      </span>
                    )}
                  </td>
                ))}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// PRICING CARDS
// ============================================================================

interface PricingTier {
  name: string;
  description: string;
  price: string;
  period?: string;
  features: Array<{ text: string; included: boolean }>;
  cta: string;
  highlighted?: boolean;
  badge?: string;
  gradient?: string;
}

interface PricingCardsProps {
  tiers: PricingTier[];
  className?: string;
}

export function AnimatedPricingCards({
  tiers,
  className = "",
}: PricingCardsProps) {
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
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`grid md:grid-cols-3 gap-6 ${className}`}>
      {tiers.map((tier, i) => (
        <motion.div
          key={tier.name}
          initial={{ opacity: 0, y: 30 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: i * 0.15, type: "spring" }}
          className={`relative overflow-hidden rounded-2xl p-6 transition-all duration-300 ${
            tier.highlighted ? "scale-[1.02] shadow-2xl" : ""
          }`}
          style={{
            background: tier.highlighted ? "var(--bg-elevated)" : "var(--bg-glass)",
            border: tier.highlighted ? "2px solid var(--accent-cyan)" : "1px solid var(--border-primary)",
          }}
        >
          {/* Badge */}
          {tier.badge && (
            <div className="absolute top-0 right-0 px-3 py-1 rounded-bl-xl text-[10px] font-bold bg-gradient-to-r from-cyan-500 to-violet-500 text-white">
              {tier.badge}
            </div>
          )}

          {/* Highlight glow */}
          {tier.highlighted && (
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-violet-500/5 pointer-events-none" />
          )}

          <div className="relative z-10">
            <h3 className="text-xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>
              {tier.name}
            </h3>
            <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
              {tier.description}
            </p>

            <div className="mb-6">
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold" style={{ color: "var(--text-primary)" }}>
                  {tier.price}
                </span>
                {tier.period && (
                  <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                    /{tier.period}
                  </span>
                )}
              </div>
            </div>

            <ul className="space-y-3 mb-8">
              {tier.features.map((feature, fi) => (
                <motion.li
                  key={feature.text}
                  initial={{ opacity: 0, x: -10 }}
                  animate={isVisible ? { opacity: 1, x: 0 } : {}}
                  transition={{ delay: i * 0.15 + fi * 0.05 + 0.3 }}
                  className="flex items-center gap-2 text-sm"
                >
                  {feature.included ? (
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <X className="w-4 h-4 text-red-400/50 shrink-0" />
                  )}
                  <span style={{ color: feature.included ? "var(--text-secondary)" : "var(--text-muted)" }}>
                    {feature.text}
                  </span>
                </motion.li>
              ))}
            </ul>

            <motion.button
              className={`w-full py-3 px-4 rounded-xl text-sm font-semibold transition-all ${
                tier.highlighted
                  ? "bg-gradient-to-r from-cyan-500 to-violet-500 text-white hover:shadow-lg hover:shadow-cyan-500/20"
                  : "border text-current hover:bg-white/5"
              }`}
              style={!tier.highlighted ? { borderColor: "var(--border-primary)", color: "var(--text-primary)" } : {}}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {tier.cta}
            </motion.button>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ============================================================================
// NOTIFICATION TOAST SYSTEM
// ============================================================================

interface Toast {
  id: string;
  title: string;
  message?: string;
  type: "success" | "error" | "warning" | "info";
  duration?: number;
}

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
  position?: "top-right" | "top-left" | "bottom-right" | "bottom-left";
}

const toastIcons = {
  success: <CheckCircle className="w-5 h-5 text-emerald-500" />,
  error: <AlertCircle className="w-5 h-5 text-red-500" />,
  warning: <AlertTriangle className="w-5 h-5 text-amber-500" />,
  info: <Info className="w-5 h-5 text-blue-500" />,
};

const toastColors = {
  success: "rgba(16, 185, 129, 0.1)",
  error: "rgba(239, 68, 68, 0.1)",
  warning: "rgba(245, 158, 11, 0.1)",
  info: "rgba(59, 130, 246, 0.1)",
};

export function ToastContainer({
  toasts,
  onDismiss,
  position = "top-right",
}: ToastContainerProps) {
  const posClasses: Record<string, string> = {
    "top-right": "top-4 right-4",
    "top-left": "top-4 left-4",
    "bottom-right": "bottom-4 right-4",
    "bottom-left": "bottom-4 left-4",
  };

  return (
    <div className={`fixed ${posClasses[position]} z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none`}>
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 50, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 50, scale: 0.95 }}
            className="pointer-events-auto rounded-xl p-4 flex items-start gap-3"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-primary)",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <div className="shrink-0 mt-0.5 p-1.5 rounded-lg" style={{ background: toastColors[toast.type] }}>
              {toastIcons[toast.type]}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {toast.title}
              </h4>
              {toast.message && (
                <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                  {toast.message}
                </p>
              )}
            </div>
            <button
              onClick={() => onDismiss(toast.id)}
              className="shrink-0 p-1 rounded-md hover:bg-white/5 transition-colors"
            >
              <X className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// ANIMATED ACCORDION / FAQ
// ============================================================================

interface AccordionItem {
  question: string;
  answer: string;
  icon?: React.ReactNode;
}

interface AnimatedAccordionProps {
  items: AccordionItem[];
  className?: string;
  allowMultiple?: boolean;
}

export function AnimatedAccordion({
  items,
  className = "",
  allowMultiple = false,
}: AnimatedAccordionProps) {
  const [openIndices, setOpenIndices] = useState<Set<number>>(new Set());

  const toggle = (index: number) => {
    setOpenIndices((prev) => {
      const next = new Set(allowMultiple ? prev : []);
      if (prev.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {items.map((item, i) => {
        const isOpen = openIndices.has(i);
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className="rounded-2xl overflow-hidden"
            style={{
              background: "var(--bg-glass)",
              border: `1px solid ${isOpen ? "var(--border-accent)" : "var(--border-primary)"}`,
              transition: "border-color 0.3s",
            }}
          >
            <button
              onClick={() => toggle(i)}
              className="w-full flex items-center gap-3 p-5 text-left group"
            >
              {item.icon && (
                <div className="shrink-0 p-2 rounded-lg" style={{ background: "var(--accent-cyan-muted)" }}>
                  {item.icon}
                </div>
              )}
              <span className="flex-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {item.question}
              </span>
              <motion.div
                animate={{ rotate: isOpen ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
              </motion.div>
            </button>
            <AnimatePresence>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <div className="px-5 pb-5 text-sm leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                    {item.answer}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}

// ============================================================================
// ANIMATED TABS
// ============================================================================

interface TabItem {
  label: string;
  icon?: React.ReactNode;
  content: React.ReactNode;
  badge?: string;
}

interface AnimatedTabsProps {
  tabs: TabItem[];
  className?: string;
  variant?: "default" | "pills" | "underline";
}

export function AnimatedTabs({
  tabs,
  className = "",
  variant = "default",
}: AnimatedTabsProps) {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className={className}>
      {/* Tab headers */}
      <div className={`flex gap-1 mb-6 ${
        variant === "pills" ? "p-1 rounded-xl" : "border-b"
      }`} style={{
        background: variant === "pills" ? "var(--bg-surface)" : "transparent",
        borderColor: variant === "underline" ? "var(--border-primary)" : "transparent",
      }}>
        {tabs.map((tab, i) => (
          <button
            key={i}
            onClick={() => setActiveTab(i)}
            className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all ${
              variant === "pills" ? "rounded-lg" : ""
            }`}
            style={{
              color: activeTab === i ? "var(--accent-cyan)" : "var(--text-muted)",
              background: activeTab === i && variant === "pills" ? "var(--bg-elevated)" : "transparent",
            }}
          >
            {tab.icon}
            {tab.label}
            {tab.badge && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/10 text-cyan-500">
                {tab.badge}
              </span>
            )}
            {activeTab === i && variant === "underline" && (
              <motion.div
                layoutId="tab-indicator"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-cyan-500 to-violet-500"
              />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {tabs[activeTab]?.content}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default InteractiveCodeEditor;
