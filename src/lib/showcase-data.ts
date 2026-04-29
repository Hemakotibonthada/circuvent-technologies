/**
 * Comprehensive project gallery data with screenshots, technical specs,
 * and detailed feature breakdowns for the portfolio showcase.
 */

export interface ProjectShowcase {
  projectId: string;
  heroImage: string;
  gallery: GalleryItem[];
  technicalSpecs: TechnicalSpec[];
  featureBreakdown: FeatureCategory[];
  timeline: ProjectTimeline;
  teamContributions: TeamContribution[];
  performanceBenchmarks: Benchmark[];
  deploymentInfo: DeploymentInfo;
  apiDocumentation: APIEndpoint[];
}

export interface GalleryItem {
  title: string;
  description: string;
  type: "screenshot" | "architecture" | "diagram" | "code";
  gradient: string;
}

export interface TechnicalSpec {
  category: string;
  specs: { label: string; value: string }[];
}

export interface FeatureCategory {
  category: string;
  features: {
    name: string;
    description: string;
    status: "shipped" | "beta" | "planned";
    complexity: "low" | "medium" | "high";
  }[];
}

export interface ProjectTimeline {
  startDate: string;
  currentPhase: string;
  keyDates: { date: string; event: string }[];
}

export interface TeamContribution {
  role: string;
  contributor: string;
  contribution: string;
  linesOfCode: number;
}

export interface Benchmark {
  metric: string;
  value: string;
  target: string;
  unit: string;
  status: "exceeds" | "meets" | "below";
}

export interface DeploymentInfo {
  platform: string;
  services: { name: string; image: string; port: number; resources: string }[];
  cicd: string;
  monitoring: string;
  backup: string;
}

export interface APIEndpoint {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  description: string;
  auth: boolean;
  rateLimit: string;
}

export const projectShowcases: ProjectShowcase[] = [
  {
    projectId: "nexus-ai-os",
    heroImage: "/showcase/nexus-hero.png",
    gallery: [
      { title: "Dashboard Overview", description: "Main NEXUS AI OS dashboard with agent status, recent conversations, and system metrics.", type: "screenshot", gradient: "from-violet-500 to-purple-500" },
      { title: "Agent Chat Interface", description: "Real-time streaming chat with the orchestrator agent, showing intent classification and routing.", type: "screenshot", gradient: "from-cyan-500 to-blue-500" },
      { title: "System Architecture", description: "Multi-agent orchestration diagram showing IPC bus, model serving, and frontend platforms.", type: "architecture", gradient: "from-pink-500 to-rose-500" },
      { title: "ChromaDB Memory", description: "Vector memory visualization showing stored agent contexts and retrieval patterns.", type: "diagram", gradient: "from-emerald-500 to-teal-500" },
      { title: "Ollama Model Manager", description: "Model management interface showing loaded LLMs, memory usage, and inference stats.", type: "screenshot", gradient: "from-amber-500 to-orange-500" },
      { title: "Docker Services", description: "Docker Compose service stack with health monitoring and resource allocation.", type: "diagram", gradient: "from-slate-400 to-zinc-500" },
    ],
    technicalSpecs: [
      {
        category: "Frontend",
        specs: [
          { label: "Framework", value: "React 19 (Web) + Electron (Desktop)" },
          { label: "Language", value: "TypeScript 5.4" },
          { label: "State Management", value: "Zustand + React Query" },
          { label: "Animations", value: "Framer Motion 12" },
          { label: "Styling", value: "Tailwind CSS 4.0" },
          { label: "Build Tool", value: "Vite 5" },
        ],
      },
      {
        category: "Backend",
        specs: [
          { label: "Framework", value: "FastAPI 0.110+" },
          { label: "Language", value: "Python 3.12" },
          { label: "ASGI Server", value: "Uvicorn + Gunicorn" },
          { label: "WebSocket", value: "FastAPI WebSocket" },
          { label: "Task Queue", value: "Celery + Redis" },
          { label: "API Docs", value: "OpenAPI 3.1 (auto-generated)" },
        ],
      },
      {
        category: "AI / ML",
        specs: [
          { label: "LLM Engine", value: "Ollama 0.3+" },
          { label: "Primary Model", value: "Llama 3.1 70B (Q4_K_M)" },
          { label: "Fast Model", value: "Llama 3.1 8B" },
          { label: "Code Model", value: "CodeLlama 34B" },
          { label: "Embedding", value: "nomic-embed-text" },
          { label: "Vector Store", value: "ChromaDB 0.5+" },
          { label: "Memory", value: "Redis + ChromaDB hybrid" },
        ],
      },
      {
        category: "Infrastructure",
        specs: [
          { label: "Container", value: "Docker 24+" },
          { label: "Orchestration", value: "Docker Compose 2.24+" },
          { label: "IPC Bus", value: "Redis 7 Pub/Sub" },
          { label: "Logging", value: "structlog + JSON" },
          { label: "Monitoring", value: "Prometheus metrics endpoint" },
          { label: "Storage", value: "12GB (models) + 2GB (vectors)" },
        ],
      },
    ],
    featureBreakdown: [
      {
        category: "Core Agent System",
        features: [
          { name: "Orchestrator Agent", description: "Intent classification and agent routing with context propagation", status: "shipped", complexity: "high" },
          { name: "Personal Assistant", description: "Daily planning, reminders, notes, and personal knowledge management", status: "shipped", complexity: "medium" },
          { name: "Financial Advisor", description: "Budget tracking, expense categorization, investment analysis", status: "shipped", complexity: "high" },
          { name: "Health Monitor", description: "Vitals tracking, medication reminders, health trend analysis", status: "shipped", complexity: "medium" },
          { name: "Home Controller", description: "IoT device management via MQTT, automation rules, energy tracking", status: "shipped", complexity: "high" },
          { name: "Code Assistant", description: "Code generation, review, debugging, documentation via CodeLlama", status: "shipped", complexity: "high" },
          { name: "Research Analyst", description: "Web scraping, document analysis, trend identification", status: "beta", complexity: "high" },
          { name: "Calendar Manager", description: "Schedule management, conflict detection, meeting preparation", status: "shipped", complexity: "medium" },
          { name: "Email Handler", description: "Email triage, draft generation, priority classification", status: "shipped", complexity: "medium" },
          { name: "File Organizer", description: "Local file indexing, search, classification, and cleanup suggestions", status: "shipped", complexity: "medium" },
          { name: "Security Guardian", description: "Password auditing, privacy scanning, threat monitoring", status: "beta", complexity: "high" },
          { name: "Learning Tutor", description: "Adaptive learning paths, quiz generation, knowledge gaps analysis", status: "shipped", complexity: "medium" },
          { name: "Social Coordinator", description: "Contact management, social planning, communication analysis", status: "beta", complexity: "medium" },
        ],
      },
      {
        category: "RAG & Memory",
        features: [
          { name: "Long-term Memory", description: "Persistent vector storage in ChromaDB with automatic indexing", status: "shipped", complexity: "high" },
          { name: "Short-term Context", description: "Redis-based session context sharing between agents", status: "shipped", complexity: "medium" },
          { name: "Document Ingestion", description: "PDF, DOCX, TXT, MD file processing and chunking", status: "shipped", complexity: "medium" },
          { name: "Semantic Search", description: "Vector similarity search with metadata filtering", status: "shipped", complexity: "medium" },
          { name: "Query Expansion", description: "LLM-powered query rewriting for improved retrieval", status: "beta", complexity: "high" },
          { name: "Memory Pruning", description: "Automatic cleanup of stale or irrelevant memories", status: "planned", complexity: "medium" },
        ],
      },
      {
        category: "User Experience",
        features: [
          { name: "Web Dashboard", description: "React-based chat interface with agent panels and system status", status: "shipped", complexity: "medium" },
          { name: "Desktop App", description: "Electron app with system tray, global hotkeys, and notifications", status: "shipped", complexity: "high" },
          { name: "Mobile App", description: "React Native app with push notifications and offline queuing", status: "beta", complexity: "high" },
          { name: "Streaming Responses", description: "Token-by-token streaming via WebSocket for real-time feel", status: "shipped", complexity: "medium" },
          { name: "Voice Interface", description: "Local Whisper speech-to-text for hands-free interaction", status: "planned", complexity: "high" },
          { name: "Theme System", description: "Light/dark/system themes with CSS variable system", status: "shipped", complexity: "low" },
        ],
      },
    ],
    timeline: {
      startDate: "2025-01-15",
      currentPhase: "Beta",
      keyDates: [
        { date: "2025-01-15", event: "Project inception and architecture design" },
        { date: "2025-02-10", event: "FastAPI backend + Ollama integration complete" },
        { date: "2025-03-01", event: "First 3 agents operational (Personal, Financial, Home)" },
        { date: "2025-04-15", event: "ChromaDB RAG pipeline integrated" },
        { date: "2025-05-20", event: "8 agents operational, IPC bus live" },
        { date: "2025-07-01", event: "Desktop (Electron) + Web dashboards complete" },
        { date: "2025-08-15", event: "13 agents live, Docker Compose deployment" },
        { date: "2025-10-01", event: "React Native mobile app beta" },
        { date: "2025-12-15", event: "Public beta release" },
        { date: "2026-03-01", event: "35K+ lines of code, stable beta" },
      ],
    },
    teamContributions: [
      { role: "Lead Architect", contributor: "Hema Koteswar Naidu", contribution: "Architecture design, agent framework, DevOps", linesOfCode: 28000 },
      { role: "AI Engineer", contributor: "Hema Koteswar Naidu", contribution: "Agent development, RAG pipeline, prompt engineering", linesOfCode: 7000 },
    ],
    performanceBenchmarks: [
      { metric: "Simple Query Latency", value: "1.2s", target: "<2s", unit: "seconds", status: "meets" },
      { metric: "Complex Multi-Agent", value: "4.5s", target: "<5s", unit: "seconds", status: "meets" },
      { metric: "Memory (Idle)", value: "8GB", target: "<10GB", unit: "GB", status: "meets" },
      { metric: "Memory (Active)", value: "12GB", target: "<16GB", unit: "GB", status: "meets" },
      { metric: "Startup Time", value: "45s", target: "<60s", unit: "seconds", status: "meets" },
      { metric: "Embedding Speed", value: "12ms", target: "<50ms", unit: "ms/chunk", status: "exceeds" },
      { metric: "RAG Retrieval", value: "45ms", target: "<100ms", unit: "ms", status: "exceeds" },
      { metric: "Concurrent Agents", value: "5", target: "3+", unit: "agents", status: "exceeds" },
    ],
    deploymentInfo: {
      platform: "Docker Compose",
      services: [
        { name: "nexus-api", image: "python:3.12-slim", port: 8000, resources: "2GB RAM, 1 CPU" },
        { name: "nexus-web", image: "node:20-alpine", port: 3000, resources: "512MB RAM, 0.5 CPU" },
        { name: "ollama", image: "ollama/ollama:latest", port: 11434, resources: "8GB RAM, GPU preferred" },
        { name: "chromadb", image: "chromadb/chroma:latest", port: 8100, resources: "1GB RAM, 0.5 CPU" },
        { name: "redis", image: "redis:7-alpine", port: 6379, resources: "256MB RAM, 0.25 CPU" },
        { name: "worker", image: "python:3.12-slim", port: 0, resources: "1GB RAM, 0.5 CPU" },
      ],
      cicd: "GitHub Actions → Docker Build → Push to Registry → SSH Deploy → Health Check",
      monitoring: "Prometheus metrics endpoint at /metrics, Grafana dashboards planned",
      backup: "ChromaDB: daily persisted to volume. Redis: RDB snapshots every 6 hours.",
    },
    apiDocumentation: [
      { method: "POST", path: "/api/v1/chat", description: "Send a message to the orchestrator agent", auth: true, rateLimit: "60/min" },
      { method: "GET", path: "/api/v1/chat/history", description: "Get conversation history with pagination", auth: true, rateLimit: "120/min" },
      { method: "POST", path: "/api/v1/chat/stream", description: "WebSocket endpoint for streaming responses", auth: true, rateLimit: "30/min" },
      { method: "GET", path: "/api/v1/agents", description: "List all available agents and their status", auth: true, rateLimit: "60/min" },
      { method: "GET", path: "/api/v1/agents/:id", description: "Get specific agent details and configuration", auth: true, rateLimit: "60/min" },
      { method: "POST", path: "/api/v1/memory/ingest", description: "Ingest a document into ChromaDB memory", auth: true, rateLimit: "10/min" },
      { method: "POST", path: "/api/v1/memory/search", description: "Search vector memory with query", auth: true, rateLimit: "60/min" },
      { method: "GET", path: "/api/v1/memory/collections", description: "List memory collections and stats", auth: true, rateLimit: "30/min" },
      { method: "GET", path: "/api/v1/models", description: "List available Ollama models", auth: true, rateLimit: "30/min" },
      { method: "POST", path: "/api/v1/models/pull", description: "Pull a new model from Ollama registry", auth: true, rateLimit: "5/min" },
      { method: "GET", path: "/api/v1/system/health", description: "System health check with service status", auth: false, rateLimit: "120/min" },
      { method: "GET", path: "/api/v1/system/metrics", description: "Prometheus-format metrics", auth: false, rateLimit: "60/min" },
      { method: "POST", path: "/api/v1/auth/login", description: "Authenticate and get JWT token", auth: false, rateLimit: "10/min" },
      { method: "POST", path: "/api/v1/auth/refresh", description: "Refresh expired JWT token", auth: true, rateLimit: "30/min" },
      { method: "GET", path: "/api/v1/user/profile", description: "Get user profile and preferences", auth: true, rateLimit: "60/min" },
      { method: "PUT", path: "/api/v1/user/preferences", description: "Update user preferences (theme, agents, etc.)", auth: true, rateLimit: "30/min" },
    ],
  },
];

export const getProjectShowcase = (projectId: string): ProjectShowcase | undefined => {
  return projectShowcases.find((s) => s.projectId === projectId);
};

/**
 * Company timeline data for animation purposes
 */
export const companyTimeline = [
  { year: 2023, month: "Jan", event: "First ESP32 project — the LED that started it all", category: "origin" },
  { year: 2023, month: "Mar", event: "HomeAutomation v1 with Arduino IoT Cloud", category: "iot" },
  { year: 2023, month: "Jun", event: "SmartHome Flutter app launched on Play Store", category: "mobile" },
  { year: 2023, month: "Sep", event: "First React web applications shipped", category: "web" },
  { year: 2023, month: "Dec", event: "CancerGuard AI project inception", category: "ai" },
  { year: 2024, month: "Mar", event: "HT Connect HRMS launched — replaces Keka + Jira", category: "enterprise" },
  { year: 2024, month: "Jun", event: "Vision AI with YOLOv8 active learning", category: "ai" },
  { year: 2024, month: "Sep", event: "JARVIS AI assistant with holographic Electron UI", category: "ai" },
  { year: 2024, month: "Nov", event: "30+ projects milestone — first production deployments", category: "milestone" },
  { year: 2025, month: "Jan", event: "NEXUS AI OS begins — 13-agent architecture", category: "ai" },
  { year: 2025, month: "Apr", event: "StockMarket Agent — local-first algorithmic trading", category: "fintech" },
  { year: 2025, month: "Jul", event: "CITADEL multi-agent trading platform", category: "fintech" },
  { year: 2025, month: "Sep", event: "50 projects — 150K lines of code", category: "milestone" },
  { year: 2025, month: "Dec", event: "EduKanban, TimeCapsule, MicroHabit launched", category: "consumer" },
  { year: 2026, month: "Jan", event: "53+ projects — 200K+ lines — 8 production apps", category: "milestone" },
  { year: 2026, month: "Mar", event: "Circuvent Technologies portfolio launch", category: "company" },
];
