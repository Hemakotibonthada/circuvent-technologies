// ============================================================================
// EXTENDED SHOWCASE DATA - More data for advanced landing page features
// ============================================================================

// Architecture diagram nodes
export const architectureNodes = [
  { id: "client", label: "Browser", icon: "🌐", x: 50, y: 30, width: 100, height: 60, color: "#06b6d4", group: "frontend", description: "React/Next.js client application with SSR/SSG" },
  { id: "mobile", label: "Mobile", icon: "📱", x: 180, y: 30, width: 100, height: 60, color: "#3b82f6", group: "frontend", description: "Flutter/React Native cross-platform apps" },
  { id: "iot", label: "IoT Device", icon: "🔌", x: 310, y: 30, width: 100, height: 60, color: "#10b981", group: "frontend", description: "ESP32 sensor nodes with MQTT" },
  { id: "cdn", label: "CDN/Edge", icon: "⚡", x: 50, y: 130, width: 100, height: 60, color: "#f59e0b", group: "infra", description: "Vercel Edge Network for static assets" },
  { id: "gateway", label: "API Gateway", icon: "🚪", x: 250, y: 130, width: 120, height: 60, color: "#8b5cf6", group: "backend", description: "Rate limiting, auth, routing" },
  { id: "mqtt", label: "MQTT Broker", icon: "📡", x: 420, y: 130, width: 110, height: 60, color: "#10b981", group: "backend", description: "Mosquitto MQTT for IoT messaging" },
  { id: "api", label: "FastAPI", icon: "⚡", x: 130, y: 240, width: 110, height: 60, color: "#ec4899", group: "backend", description: "Python REST API with async support" },
  { id: "ws", label: "WebSocket", icon: "🔌", x: 280, y: 240, width: 110, height: 60, color: "#06b6d4", group: "backend", description: "Real-time bidirectional communication" },
  { id: "ai", label: "AI Engine", icon: "🧠", x: 430, y: 240, width: 110, height: 60, color: "#8b5cf6", group: "ai", description: "Ollama + LangChain inference pipeline" },
  { id: "postgres", label: "PostgreSQL", icon: "🐘", x: 50, y: 350, width: 100, height: 60, color: "#336791", group: "data", description: "Primary relational database" },
  { id: "redis", label: "Redis", icon: "🔴", x: 180, y: 350, width: 90, height: 60, color: "#dc382d", group: "data", description: "Caching, sessions, pub/sub" },
  { id: "chroma", label: "ChromaDB", icon: "🧠", x: 300, y: 350, width: 100, height: 60, color: "#ff6b6b", group: "data", description: "Vector database for embeddings" },
  { id: "ollama", label: "Ollama", icon: "🦙", x: 430, y: 350, width: 100, height: 60, color: "#ffffff", group: "ai", description: "Local LLM inference server" },
  { id: "docker", label: "Docker", icon: "🐳", x: 180, y: 440, width: 100, height: 60, color: "#2496ed", group: "infra", description: "Container orchestration" },
  { id: "ci", label: "CI/CD", icon: "⚙️", x: 320, y: 440, width: 100, height: 60, color: "#2088ff", group: "infra", description: "GitHub Actions pipelines" },
];

export const architectureConnections = [
  { from: "client", to: "cdn", label: "HTTPS", color: "#06b6d4", animated: true },
  { from: "client", to: "gateway", label: "API", color: "#8b5cf6", animated: true },
  { from: "mobile", to: "gateway", label: "REST", color: "#3b82f6", animated: true },
  { from: "iot", to: "mqtt", label: "MQTT", color: "#10b981", animated: true },
  { from: "cdn", to: "api", color: "#f59e0b", animated: false, dashed: true },
  { from: "gateway", to: "api", label: "Route", color: "#ec4899", animated: true },
  { from: "gateway", to: "ws", color: "#06b6d4", animated: true },
  { from: "mqtt", to: "ws", label: "Bridge", color: "#10b981", animated: true },
  { from: "api", to: "postgres", label: "Prisma", color: "#336791", animated: true },
  { from: "api", to: "redis", label: "Cache", color: "#dc382d", animated: false },
  { from: "api", to: "ai", label: "Infer", color: "#8b5cf6", animated: true },
  { from: "ai", to: "chroma", label: "RAG", color: "#ff6b6b", animated: true },
  { from: "ai", to: "ollama", label: "LLM", color: "#ffffff", animated: true },
  { from: "docker", to: "api", color: "#2496ed", dashed: true },
  { from: "docker", to: "postgres", color: "#2496ed", dashed: true },
  { from: "ci", to: "docker", label: "Deploy", color: "#2088ff", animated: true },
];

// Skill tree data
export const skillTreeData = [
  { id: "html", name: "HTML/CSS", icon: "🌐", level: 10, maxLevel: 10, color: "#e34c26", x: 15, y: 15, prerequisites: [], description: "Foundation of web development. Semantic HTML5, modern CSS3, Flexbox, Grid.", unlocked: true },
  { id: "js", name: "JavaScript", icon: "💛", level: 10, maxLevel: 10, color: "#f7df1e", x: 35, y: 15, prerequisites: ["html"], description: "ES2024, async/await, DOM manipulation, event handling.", unlocked: true },
  { id: "ts", name: "TypeScript", icon: "🔷", level: 9, maxLevel: 10, color: "#3178c6", x: 55, y: 15, prerequisites: ["js"], description: "Type-safe JavaScript with generics, utility types, and decorators.", unlocked: true },
  { id: "react", name: "React", icon: "⚛️", level: 10, maxLevel: 10, color: "#61dafb", x: 25, y: 35, prerequisites: ["js", "ts"], description: "Hooks, context, suspense, server components, concurrent features.", unlocked: true },
  { id: "next", name: "Next.js", icon: "▲", level: 9, maxLevel: 10, color: "#ffffff", x: 45, y: 35, prerequisites: ["react", "ts"], description: "App Router, SSR/SSG/ISR, middleware, API routes, edge functions.", unlocked: true },
  { id: "tailwind", name: "Tailwind", icon: "🎨", level: 9, maxLevel: 10, color: "#06b6d4", x: 65, y: 35, prerequisites: ["html"], description: "Utility-first CSS, custom themes, responsive design, animations.", unlocked: true },
  { id: "python", name: "Python", icon: "🐍", level: 9, maxLevel: 10, color: "#3776ab", x: 15, y: 55, prerequisites: [], description: "Async programming, type hints, data science libraries.", unlocked: true },
  { id: "fastapi", name: "FastAPI", icon: "⚡", level: 9, maxLevel: 10, color: "#009688", x: 35, y: 55, prerequisites: ["python"], description: "High-performance async REST APIs with automatic OpenAPI docs.", unlocked: true },
  { id: "flutter", name: "Flutter", icon: "💙", level: 8, maxLevel: 10, color: "#02569b", x: 55, y: 55, prerequisites: ["js"], description: "Cross-platform mobile/desktop apps with Dart.", unlocked: true },
  { id: "docker", name: "Docker", icon: "🐳", level: 9, maxLevel: 10, color: "#2496ed", x: 75, y: 55, prerequisites: [], description: "Containerization, Docker Compose, multi-stage builds.", unlocked: true },
  { id: "ai", name: "AI/ML", icon: "🧠", level: 8, maxLevel: 10, color: "#8b5cf6", x: 25, y: 75, prerequisites: ["python"], description: "LLMs, embeddings, RAG pipelines, computer vision.", unlocked: true },
  { id: "iot", name: "IoT", icon: "🔌", level: 9, maxLevel: 10, color: "#10b981", x: 45, y: 75, prerequisites: [], description: "ESP32, MQTT, sensor networks, firmware development.", unlocked: true },
  { id: "db", name: "Databases", icon: "🗄️", level: 9, maxLevel: 10, color: "#336791", x: 65, y: 75, prerequisites: ["python", "ts"], description: "PostgreSQL, MongoDB, Redis, ChromaDB, DuckDB.", unlocked: true },
  { id: "devops", name: "DevOps", icon: "⚙️", level: 8, maxLevel: 10, color: "#2088ff", x: 85, y: 75, prerequisites: ["docker"], description: "CI/CD, monitoring, zero-downtime deployments.", unlocked: true },
  { id: "nexus", name: "NEXUS AI", icon: "🚀", level: 7, maxLevel: 10, color: "#ec4899", x: 50, y: 92, prerequisites: ["ai", "fastapi", "next", "docker"], description: "13-agent local-first AI operating system. Our magnum opus.", unlocked: true },
];

// Feature showcase tabs
export const featureShowcaseTabs = [
  {
    id: "ai-agents",
    title: "AI Agents",
    icon: "🧠",
    description: "Our NEXUS AI OS orchestrates 13 specialized agents running entirely on-device. From personal assistants to financial analyzers, each agent is purpose-built yet interconnected.",
    features: [
      { title: "Local Inference", description: "100% on-device with Ollama — no cloud dependency", icon: "🔒" },
      { title: "Multi-Agent RAG", description: "ChromaDB-powered retrieval across all agent memories", icon: "📚" },
      { title: "Tool Calling", description: "Agents can invoke APIs, run code, and manage devices", icon: "🔧" },
      { title: "Context Window", description: "8192-token sliding window with priority-based recall", icon: "🪟" },
    ],
    stats: [{ label: "Agents", value: "13+" }, { label: "Models", value: "8" }, { label: "Cloud Dep.", value: "Zero" }],
    color: "#8b5cf6",
    codeSnippet: `// NEXUS Agent Orchestrator
const orchestrator = new AgentOrchestrator({
  agents: [
    new PersonalAgent({ model: "llama3" }),
    new FinanceAgent({ model: "codestral" }),
    new HealthAgent({ model: "mistral" }),
    new HomeAgent({ mqttBroker: "mqtt://home" }),
  ],
  memory: new SharedMemory("chromadb"),
  coordinator: new TaskCoordinator(),
});

// Process multi-agent query
const result = await orchestrator.process({
  input: "Analyze my spending and optimize",
  agents: ["finance", "personal"],
  context: await memory.recall(query, 5),
});`,
  },
  {
    id: "iot-systems",
    title: "IoT Systems",
    icon: "🔌",
    description: "End-to-end IoT solutions from ESP32 firmware to cloud dashboards. Sub-100ms MQTT messaging, 9+ production sensors, and Alexa voice control integration.",
    features: [
      { title: "ESP32 Firmware", description: "Custom C++ firmware with OTA updates", icon: "⚡" },
      { title: "MQTT Protocol", description: "Mosquitto broker with QoS 1/2 support", icon: "📡" },
      { title: "Flutter Dashboard", description: "Real-time device monitoring and control", icon: "📱" },
      { title: "Voice Control", description: "Alexa skill integration for smart home", icon: "🎙️" },
    ],
    stats: [{ label: "Devices", value: "9+" }, { label: "Latency", value: "<100ms" }, { label: "Uptime", value: "99.5%" }],
    color: "#10b981",
    codeSnippet: `// ESP32 Sensor Publishing
void publishSensorData() {
  StaticJsonDocument<512> doc;
  doc["temperature"] = dht.readTemperature();
  doc["humidity"] = dht.readHumidity();
  doc["motion"] = digitalRead(MOTION_PIN);
  doc["light"] = analogRead(A0) / 4095.0;
  doc["device"] = "esp32-sensor-01";
  doc["timestamp"] = millis();

  char buffer[512];
  serializeJson(doc, buffer);
  mqtt.publish("home/sensors/room", buffer, true);

  Serial.printf("Published: %.1f°C, %.1f%%\\n",
    doc["temperature"].as<float>(),
    doc["humidity"].as<float>());
}`,
  },
  {
    id: "fullstack",
    title: "Full-Stack",
    icon: "🌐",
    description: "Modern web applications built with Next.js 15, React 19, and Tailwind CSS 4. Server components, streaming SSR, and 95+ Lighthouse scores.",
    features: [
      { title: "Next.js App Router", description: "Server components, streaming, and parallel routing", icon: "▲" },
      { title: "Type-Safe APIs", description: "End-to-end TypeScript with Prisma ORM", icon: "🔷" },
      { title: "Real-Time", description: "WebSocket + Socket.IO for live features", icon: "⚡" },
      { title: "Performance", description: "95+ Lighthouse score with optimized bundles", icon: "🏎️" },
    ],
    stats: [{ label: "Projects", value: "13+" }, { label: "Lighthouse", value: "95+" }, { label: "Stacks", value: "15+" }],
    color: "#3b82f6",
    codeSnippet: `// Next.js 15 Server Component
import { db } from "@/lib/prisma";
import { Suspense } from "react";

export default async function Dashboard() {
  const [projects, metrics] = await Promise.all([
    db.project.findMany({
      where: { status: "active" },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
    db.$queryRaw\`
      SELECT domain, COUNT(*) as count
      FROM projects
      GROUP BY domain
    \`,
  ]);

  return (
    <main className="max-w-7xl mx-auto">
      <Suspense fallback={<Skeleton />}>
        <ProjectGrid projects={projects} />
        <MetricsChart data={metrics} />
      </Suspense>
    </main>
  );
}`,
  },
  {
    id: "devops",
    title: "DevOps",
    icon: "🐳",
    description: "Production-grade deployment with Docker Compose, GitHub Actions CI/CD, and zero-downtime strategies. Every project ships containerized.",
    features: [
      { title: "Docker Compose", description: "Multi-service orchestration with health checks", icon: "🐳" },
      { title: "CI/CD", description: "GitHub Actions with build, test, deploy pipelines", icon: "⚙️" },
      { title: "Monitoring", description: "Health checks, error tracking, uptime monitoring", icon: "📊" },
      { title: "Zero-Downtime", description: "Blue-green deployments with rollback support", icon: "🔄" },
    ],
    stats: [{ label: "Containers", value: "8" }, { label: "Uptime", value: "99.5%" }, { label: "Deploy", value: "<2min" }],
    color: "#2496ed",
    codeSnippet: `# GitHub Actions - CI/CD Pipeline
name: Deploy Production
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }

      - run: npm ci
      - run: npm run lint
      - run: npm run test -- --coverage
      - run: npm run build

      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: \${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: \${{ secrets.ORG_ID }}
          vercel-project-id: \${{ secrets.PROJECT_ID }}
          vercel-args: '--prod'`,
  },
];

// Showcase carousel slides
export const showcaseSlides = [
  {
    title: "NEXUS AI OS",
    description: "13-agent local-first AI operating system. Personal, financial, health, and home agents running entirely on-device with Ollama, ChromaDB, and custom orchestration.",
    gradient: "from-violet-600/90 to-purple-800/90",
    icon: "🧠",
    stats: [{ label: "Agents", value: "13+" }, { label: "Models", value: "8" }, { label: "Cloud", value: "Zero" }],
    tags: ["AI", "Local-First", "Multi-Agent"],
  },
  {
    title: "SmartHome IoT",
    description: "Complete IoT ecosystem with 9 ESP32 sensors, MQTT broker, Flutter dashboard, and Alexa voice control. Sub-100ms sensor updates in production.",
    gradient: "from-cyan-600/90 to-teal-800/90",
    icon: "🏠",
    stats: [{ label: "Sensors", value: "9+" }, { label: "Latency", value: "<100ms" }, { label: "Uptime", value: "99.5%" }],
    tags: ["IoT", "ESP32", "Flutter"],
  },
  {
    title: "CancerGuard AI",
    description: "Deep learning cancer detection system achieving 94.2% accuracy. YOLOv8 computer vision pipeline with ChromaDB for medical image retrieval.",
    gradient: "from-pink-600/90 to-rose-800/90",
    icon: "🏥",
    stats: [{ label: "Accuracy", value: "94.2%" }, { label: "Images", value: "50K+" }, { label: "Models", value: "3" }],
    tags: ["HealthTech", "Computer Vision", "YOLOv8"],
  },
  {
    title: "HT Connect HRMS",
    description: "Enterprise HRMS replacing Keka + Jira with a unified platform. Attendance, payroll, project management, and performance reviews in one app.",
    gradient: "from-amber-600/90 to-orange-800/90",
    icon: "🏢",
    stats: [{ label: "Users", value: "500+" }, { label: "Modules", value: "12" }, { label: "Saves", value: "$30K/yr" }],
    tags: ["Enterprise", "SaaS", "HRMS"],
  },
  {
    title: "FinEdge Trading",
    description: "Algorithmic trading platform with real-time market data, NPU-accelerated inference, and automated portfolio optimization.",
    gradient: "from-emerald-600/90 to-green-800/90",
    icon: "📈",
    stats: [{ label: "Trades", value: "1K+/day" }, { label: "Latency", value: "<50ms" }, { label: "ROI", value: "+18%" }],
    tags: ["FinTech", "Trading", "NPU"],
  },
];

// Notification feed data
export const notificationFeedData = [
  { id: "n1", type: "deploy" as const, title: "Production Deploy", message: "nexus-ai-os v2.4.1 deployed to production", time: "2m ago", color: "#10b981" },
  { id: "n2", type: "commit" as const, title: "New Commit", message: "feat: add multi-agent task coordination", time: "5m ago", color: "#3b82f6" },
  { id: "n3", type: "success" as const, title: "Tests Passed", message: "All 847 tests passing (coverage: 92%)", time: "8m ago", color: "#10b981" },
  { id: "n4", type: "build" as const, title: "Build Complete", message: "Docker image built: nexus-api:latest (234MB)", time: "12m ago", color: "#f59e0b" },
  { id: "n5", type: "review" as const, title: "PR Merged", message: "#142: Implement RAG pipeline with ChromaDB", time: "15m ago", color: "#8b5cf6" },
  { id: "n6", type: "alert" as const, title: "Performance Alert", message: "API p99 latency improved: 45ms → 32ms", time: "20m ago", color: "#06b6d4" },
  { id: "n7", type: "deploy" as const, title: "Staging Deploy", message: "cancerguard-ai v1.3.0 deployed to staging", time: "25m ago", color: "#ec4899" },
  { id: "n8", type: "commit" as const, title: "New Commit", message: "fix: optimize MQTT reconnection logic", time: "30m ago", color: "#10b981" },
  { id: "n9", type: "success" as const, title: "Health Check", message: "All 6 services healthy, uptime: 99.5%", time: "35m ago", color: "#10b981" },
  { id: "n10", type: "build" as const, title: "ESP32 Firmware", message: "OTA update pushed to 9 IoT devices", time: "40m ago", color: "#f59e0b" },
];

// Metrics grid data
export const metricsGridData = [
  { label: "TypeScript Coverage", value: 92, max: 100, unit: "%", color: "#3178c6", icon: "🔷", description: "Type-safe codebase coverage", trend: "up" as const, trendValue: "3%" },
  { label: "Test Coverage", value: 87, max: 100, unit: "%", color: "#10b981", icon: "✅", description: "Unit & integration tests", trend: "up" as const, trendValue: "5%" },
  { label: "Lighthouse Score", value: 95, max: 100, unit: "pts", color: "#06b6d4", icon: "⚡", description: "Performance, A11y, SEO, Best Practices", trend: "up" as const, trendValue: "2pts" },
  { label: "API Response Time", value: 32, max: 200, unit: "ms", color: "#8b5cf6", icon: "🏎️", description: "Average p50 latency", trend: "down" as const, trendValue: "8ms" },
  { label: "Docker Image Size", value: 234, max: 500, unit: "MB", color: "#2496ed", icon: "🐳", description: "Optimized multi-stage build", trend: "down" as const, trendValue: "12MB" },
  { label: "Build Time", value: 48, max: 120, unit: "sec", color: "#f59e0b", icon: "🔨", description: "CI/CD pipeline duration", trend: "down" as const, trendValue: "15s" },
  { label: "Bundle Size", value: 145, max: 500, unit: "KB", color: "#ec4899", icon: "📦", description: "Gzipped JS bundle", trend: "down" as const, trendValue: "20KB" },
  { label: "Uptime", value: 99.5, max: 100, unit: "%", color: "#10b981", icon: "🟢", description: "30-day rolling average", trend: "stable" as const, trendValue: "0.0%" },
  { label: "AI Accuracy", value: 94.2, max: 100, unit: "%", color: "#8b5cf6", icon: "🧠", description: "CancerGuard detection rate", trend: "up" as const, trendValue: "1.2%" },
];

// Logo wall items
export const logoWallItems = [
  { name: "React", icon: "⚛️", color: "#61dafb", category: "frontend" },
  { name: "Next.js", icon: "▲", color: "#ffffff", category: "frontend" },
  { name: "TypeScript", icon: "🔷", color: "#3178c6", category: "frontend" },
  { name: "Python", icon: "🐍", color: "#3776ab", category: "backend" },
  { name: "Flutter", icon: "💙", color: "#02569b", category: "mobile" },
  { name: "FastAPI", icon: "⚡", color: "#009688", category: "backend" },
  { name: "ESP32", icon: "🔌", color: "#e7352c", category: "iot" },
  { name: "MQTT", icon: "📡", color: "#660066", category: "iot" },
  { name: "Docker", icon: "🐳", color: "#2496ed", category: "devops" },
  { name: "PostgreSQL", icon: "🐘", color: "#336791", category: "database" },
  { name: "Firebase", icon: "🔥", color: "#ffca28", category: "database" },
  { name: "Redis", icon: "🔴", color: "#dc382d", category: "database" },
  { name: "Ollama", icon: "🦙", color: "#ffffff", category: "ai" },
  { name: "YOLOv8", icon: "👁️", color: "#ff6f00", category: "ai" },
  { name: "Electron", icon: "⚡", color: "#47848f", category: "frontend" },
  { name: "Tailwind", icon: "🎨", color: "#06b6d4", category: "frontend" },
  { name: "Prisma", icon: "💎", color: "#2d3748", category: "backend" },
  { name: "MongoDB", icon: "🍃", color: "#47a248", category: "database" },
  { name: "React Native", icon: "📱", color: "#61dafb", category: "mobile" },
  { name: "ChromaDB", icon: "🧠", color: "#ff6b6b", category: "ai" },
  { name: "Socket.IO", icon: "🔌", color: "#010101", category: "backend" },
  { name: "OpenAI", icon: "🤖", color: "#412991", category: "ai" },
  { name: "DuckDB", icon: "🦆", color: "#fff000", category: "database" },
  { name: "Arduino", icon: "🔧", color: "#00979d", category: "iot" },
  { name: "Dart", icon: "🎯", color: "#0175c2", category: "mobile" },
  { name: "Node.js", icon: "💚", color: "#339933", category: "backend" },
  { name: "Framer Motion", icon: "🎬", color: "#bb4bf7", category: "frontend" },
  { name: "GraphQL", icon: "◈", color: "#e10098", category: "backend" },
  { name: "Vercel", icon: "▲", color: "#ffffff", category: "devops" },
  { name: "GitHub", icon: "🐙", color: "#ffffff", category: "devops" },
  { name: "LangChain", icon: "🔗", color: "#1c3c3c", category: "ai" },
  { name: "Nginx", icon: "🌐", color: "#009639", category: "devops" },
];
