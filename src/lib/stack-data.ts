/**
 * Stack Ecosystem Data
 * 
 * Comprehensive technology stack information with learning resources,
 * comparison matrices, and ecosystem maps.
 */

export interface TechComparison {
  criteria: string;
  options: {
    name: string;
    rating: number; // 1-5
    notes: string;
  }[];
}

export interface LearningResource {
  title: string;
  type: "docs" | "course" | "book" | "video" | "repo";
  url: string;
  description: string;
  difficulty: "beginner" | "intermediate" | "advanced";
}

export interface TechEcosystemNode {
  name: string;
  category: string;
  connections: string[];
  usage: string;
  projectCount: number;
}

export const techComparisons: TechComparison[] = [
  {
    criteria: "State Management (React)",
    options: [
      { name: "Redux Toolkit", rating: 4, notes: "Enterprise-grade, verbose, excellent DevTools. Used in App Builder." },
      { name: "Zustand", rating: 5, notes: "Minimal, TypeScript-first, no boilerplate. Our go-to for new projects." },
      { name: "React Query", rating: 5, notes: "Server state management. Used alongside Zustand for API caching." },
      { name: "Context API", rating: 3, notes: "Built-in, but re-render issues at scale. Only for simple shared state." },
    ],
  },
  {
    criteria: "State Management (Flutter)",
    options: [
      { name: "Riverpod", rating: 5, notes: "Compile-safe, testable, our current standard for all Flutter projects." },
      { name: "Bloc", rating: 4, notes: "Event-driven, good for complex flows. Used in early SmartHome version." },
      { name: "Provider", rating: 3, notes: "Simple but InheritedWidget limitations. Replaced by Riverpod." },
      { name: "GetX", rating: 2, notes: "Easy to learn but hard to maintain. Avoided in production code." },
    ],
  },
  {
    criteria: "Backend Framework",
    options: [
      { name: "FastAPI", rating: 5, notes: "Async Python, auto-docs, Pydantic validation. Primary for AI backends." },
      { name: "Express.js", rating: 4, notes: "Mature Node.js framework. Primary for real-time and CRUD backends." },
      { name: "Next.js API Routes", rating: 4, notes: "Serverless-ready, co-located with frontend. Great for BFF pattern." },
      { name: "Flask", rating: 3, notes: "Simple Python framework. Used for lightweight tools like NetShare Pro." },
    ],
  },
  {
    criteria: "Database Selection",
    options: [
      { name: "PostgreSQL", rating: 5, notes: "ACID compliance, complex queries, Prisma ORM. Enterprise workloads." },
      { name: "MongoDB", rating: 4, notes: "Flexible schema, good for rapid prototyping. Used with Mongoose." },
      { name: "Firebase Firestore", rating: 4, notes: "Real-time sync, offline support. Primary for mobile apps." },
      { name: "DuckDB", rating: 5, notes: "Embedded analytics, columnar storage. Perfect for FinTech time-series." },
      { name: "SQLite", rating: 4, notes: "Zero-config, embedded. JARVIS, App Builder, and CLI tools." },
      { name: "Redis", rating: 5, notes: "In-memory speed, pub/sub, caching. Essential for real-time systems." },
    ],
  },
  {
    criteria: "Deployment Strategy",
    options: [
      { name: "Docker Compose", rating: 5, notes: "Our production standard. Health checks, resource limits, logging." },
      { name: "Vercel", rating: 4, notes: "Zero-config Next.js deployment. Used for static/SSR marketing sites." },
      { name: "Firebase Hosting", rating: 3, notes: "Simple static hosting. Used for Flutter web and SPA deployments." },
      { name: "Kubernetes", rating: 3, notes: "Overkill for our scale. Considered for future multi-service expansion." },
    ],
  },
  {
    criteria: "AI/LLM Inference",
    options: [
      { name: "Ollama", rating: 5, notes: "Local-first, easy model management, great for privacy. Our default." },
      { name: "OpenAI API", rating: 5, notes: "Best quality (GPT-4), but cloud-dependent. Used for complex tasks." },
      { name: "Google Gemini", rating: 4, notes: "Multimodal, good free tier. Used in TravelMate for recommendations." },
      { name: "OpenVINO", rating: 4, notes: "Intel NPU acceleration. Used in Neural Sentinel for on-device trading AI." },
    ],
  },
  {
    criteria: "Mobile Framework",
    options: [
      { name: "Flutter", rating: 5, notes: "Beautiful UI, single codebase, Dart. Primary for IoT and FinTech mobile." },
      { name: "React Native", rating: 4, notes: "JavaScript ecosystem, Expo toolchain. Primary for consumer/social apps." },
      { name: "Ionic/Capacitor", rating: 3, notes: "Web-to-native bridge. Used for Angular-based apps (Guide Me)." },
      { name: "Native (Swift/Kotlin)", rating: 4, notes: "Best performance but double codebase. Used for specific native features." },
    ],
  },
  {
    criteria: "IoT Communication",
    options: [
      { name: "MQTT", rating: 5, notes: "Lightweight pub/sub, QoS levels, retained messages. Our IoT backbone." },
      { name: "WebSocket", rating: 4, notes: "Full-duplex, browser-native. Used for web dashboard realtime data." },
      { name: "ESP-NOW", rating: 4, notes: "Peer-to-peer, low latency. Used for mesh networking between ESP32 nodes." },
      { name: "BLE", rating: 3, notes: "Low energy, short range. Used for initial device provisioning and config." },
    ],
  },
];

export const learningResources: LearningResource[] = [
  {
    title: "React Documentation",
    type: "docs",
    url: "https://react.dev",
    description: "Official React docs with hooks, server components, and best practices.",
    difficulty: "beginner",
  },
  {
    title: "Next.js App Router",
    type: "docs",
    url: "https://nextjs.org/docs/app",
    description: "Next.js 14+ App Router documentation for server-side rendering and API routes.",
    difficulty: "intermediate",
  },
  {
    title: "FastAPI Documentation",
    type: "docs",
    url: "https://fastapi.tiangolo.com",
    description: "Comprehensive FastAPI guide with async patterns, dependency injection, and OpenAPI.",
    difficulty: "intermediate",
  },
  {
    title: "Flutter Riverpod Guide",
    type: "docs",
    url: "https://riverpod.dev",
    description: "Complete Riverpod state management guide for Flutter applications.",
    difficulty: "intermediate",
  },
  {
    title: "ESP32 Programming Guide",
    type: "docs",
    url: "https://docs.espressif.com/projects/esp-idf/en/latest/esp32/",
    description: "Official ESP-IDF documentation for ESP32 firmware development.",
    difficulty: "advanced",
  },
  {
    title: "MQTT Protocol Specification",
    type: "docs",
    url: "https://mqtt.org/mqtt-specification/",
    description: "MQTT v5.0 specification for IoT messaging protocol implementation.",
    difficulty: "advanced",
  },
  {
    title: "Docker Compose Production Guide",
    type: "docs",
    url: "https://docs.docker.com/compose/production/",
    description: "Official Docker Compose guide for production deployment best practices.",
    difficulty: "intermediate",
  },
  {
    title: "Ollama Model Library",
    type: "docs",
    url: "https://ollama.com/library",
    description: "Available LLM models for local inference with Ollama.",
    difficulty: "beginner",
  },
  {
    title: "Prisma ORM Documentation",
    type: "docs",
    url: "https://www.prisma.io/docs",
    description: "Type-safe database access with Prisma for PostgreSQL, MySQL, SQLite.",
    difficulty: "beginner",
  },
  {
    title: "YOLOv8 Ultralytics",
    type: "docs",
    url: "https://docs.ultralytics.com",
    description: "YOLOv8 object detection training, inference, and deployment documentation.",
    difficulty: "advanced",
  },
];

export const techEcosystemMap: TechEcosystemNode[] = [
  {
    name: "React",
    category: "Frontend",
    connections: ["Next.js", "TypeScript", "Tailwind CSS", "Framer Motion", "Redux Toolkit"],
    usage: "UI library for web applications",
    projectCount: 15,
  },
  {
    name: "Next.js",
    category: "Frontend",
    connections: ["React", "TypeScript", "Prisma", "Vercel", "Express.js"],
    usage: "Full-stack framework with SSR/SSG",
    projectCount: 8,
  },
  {
    name: "Flutter",
    category: "Mobile",
    connections: ["Dart", "Firebase", "Riverpod", "MQTT", "Razorpay"],
    usage: "Cross-platform mobile development",
    projectCount: 4,
  },
  {
    name: "React Native",
    category: "Mobile",
    connections: ["TypeScript", "Expo", "Firebase", "Zustand", "Google Maps"],
    usage: "Cross-platform mobile with JS ecosystem",
    projectCount: 5,
  },
  {
    name: "FastAPI",
    category: "Backend",
    connections: ["Python", "Pydantic", "Ollama", "PostgreSQL", "Docker"],
    usage: "Async Python API framework",
    projectCount: 7,
  },
  {
    name: "Express.js",
    category: "Backend",
    connections: ["Node.js", "TypeScript", "PostgreSQL", "MongoDB", "Redis"],
    usage: "Node.js web framework",
    projectCount: 10,
  },
  {
    name: "ESP32",
    category: "Embedded",
    connections: ["C++", "MQTT", "PlatformIO", "WiFi", "Firebase"],
    usage: "IoT microcontroller platform",
    projectCount: 9,
  },
  {
    name: "MQTT",
    category: "Protocol",
    connections: ["ESP32", "Mosquitto", "Flutter", "Node.js", "React"],
    usage: "IoT messaging protocol",
    projectCount: 9,
  },
  {
    name: "Firebase",
    category: "BaaS",
    connections: ["Flutter", "React", "React Native", "Cloud Functions", "Firestore"],
    usage: "Backend-as-a-Service platform",
    projectCount: 14,
  },
  {
    name: "Docker",
    category: "DevOps",
    connections: ["Docker Compose", "Nginx", "PostgreSQL", "Redis", "GitHub Actions"],
    usage: "Container orchestration",
    projectCount: 8,
  },
  {
    name: "Ollama",
    category: "AI",
    connections: ["Python", "FastAPI", "ChromaDB", "Llama", "CodeLlama"],
    usage: "Local LLM inference engine",
    projectCount: 5,
  },
  {
    name: "PostgreSQL",
    category: "Database",
    connections: ["Prisma", "Express.js", "FastAPI", "Docker", "Next.js"],
    usage: "Relational database",
    projectCount: 7,
  },
];

/**
 * Architecture patterns used across projects
 */
export interface ArchitecturePattern {
  name: string;
  description: string;
  usedIn: string[];
  diagram: string;
  benefits: string[];
  tradeoffs: string[];
}

export const architecturePatterns: ArchitecturePattern[] = [
  {
    name: "Multi-Agent Orchestration",
    description:
      "Multiple specialized AI agents communicate through an IPC bus, with an orchestrator routing queries to the appropriate agent based on intent classification.",
    usedIn: ["NEXUS AI OS", "JARVIS AI"],
    diagram: `
User Query → Orchestrator Agent → Intent Classification
                                    ├→ Personal Agent
                                    ├→ Financial Agent  
                                    ├→ Health Agent
                                    ├→ Home Agent
                                    └→ Code Agent
All agents share context via ChromaDB + Redis Pub/Sub`,
    benefits: [
      "Separation of concerns — each agent is an expert",
      "Scalable — add new agents without modifying existing ones",
      "Fault-tolerant — one agent failing doesn't crash the system",
      "Testable — each agent can be unit tested independently",
    ],
    tradeoffs: [
      "Increased complexity in agent communication",
      "Higher memory usage with multiple model instances",
      "Latency from intent classification step",
      "Debugging across agents requires distributed tracing",
    ],
  },
  {
    name: "Split Edge-Cloud Architecture",
    description:
      "Lightweight edge devices (ESP32) handle sensing and actuation, while compute-heavy tasks (ML inference) run on an edge server. Communication is via MQTT.",
    usedIn: ["Vision AI", "SmartHome Ecosystem"],
    diagram: `
ESP32-CAM → [MQTT] → Edge Server (YOLOv8) → [MQTT] → React Dashboard
   ↑                       ↓
Sensors              Active Learning
   ↓                       ↓
Actuators         Model Retraining`,
    benefits: [
      "ESP32 devices are cheap ($4-8 each) and low power",
      "ML models run on GPU-equipped edge server",
      "MQTT provides reliable async communication",
      "Active learning continuously improves models",
    ],
    tradeoffs: [
      "Requires WiFi connectivity for ESP32 → server",
      "Edge server is a single point of failure",
      "Latency depends on network quality",
      "ESP32 SRAM limits on-device processing",
    ],
  },
  {
    name: "Monorepo with Shared Types",
    description:
      "A single repository containing web, mobile, desktop, and API projects sharing TypeScript types, utilities, and business logic through internal packages.",
    usedIn: ["Financial Analyzer", "NEXUS AI OS", "TimeCapsule"],
    diagram: `
project-root/
├── packages/
│   ├── shared/     ← TypeScript types, utils
│   ├── ui/         ← Shared React components
│   └── api-client/ ← Generated from OpenAPI
├── apps/
│   ├── web/        ← Next.js
│   ├── mobile/     ← React Native
│   ├── desktop/    ← Electron
│   └── api/        ← FastAPI / Express
└── docker-compose.yml`,
    benefits: [
      "100% type safety from API to UI",
      "No type drift between platforms",
      "Shared business logic reduces duplication",
      "Single CI/CD pipeline for all platforms",
    ],
    tradeoffs: [
      "Larger repository size",
      "Complex build configuration",
      "All platforms must be compatible with shared types",
      "Learning curve for monorepo tooling (Turborepo, Nx)",
    ],
  },
  {
    name: "Docker Compose Production Stack",
    description:
      "All services (app, database, cache, reverse proxy) run as Docker containers orchestrated by docker-compose with health checks, resource limits, and automated backups.",
    usedIn: ["HT Connect", "EduKanban", "CancerGuard AI", "Vision AI"],
    diagram: `
┌─────────────────────────────────────┐
│ Docker Compose                       │
├─────────┬──────────┬────────────────┤
│ Nginx   │ App      │ Background     │
│ (Proxy) │ (Node/   │ Workers        │
│         │  Python) │                │
├─────────┼──────────┼────────────────┤
│ PostgreSQL / MongoDB │ Redis Cache  │
├──────────────────────┴──────────────┤
│ Volumes: pgdata, uploads, backups   │
└─────────────────────────────────────┘`,
    benefits: [
      "Single-command deployment (docker-compose up)",
      "Reproducible environments across dev/staging/prod",
      "Resource isolation between services",
      "Easy horizontal scaling per service",
    ],
    tradeoffs: [
      "Single host limitation (no multi-node)",
      "Container orchestration is less sophisticated than K8s",
      "Requires Docker knowledge for operations",
      "Storage management needs attention",
    ],
  },
  {
    name: "Ensemble ML with Stacking",
    description:
      "Multiple ML algorithms (XGBoost, LightGBM, Random Forest, Neural Network) make independent predictions, which are combined by a meta-learner for superior accuracy.",
    usedIn: ["CancerGuard AI"],
    diagram: `
Input Features
    ├→ XGBoost      → Prediction₁ ─┐
    ├→ LightGBM     → Prediction₂ ─┤
    ├→ Random Forest → Prediction₃ ─┼→ Meta-Learner → Final Prediction
    └→ Neural Net   → Prediction₄ ─┘
    
Level 1: Base Models (cross-validated)
Level 2: Logistic Regression Meta-Learner`,
    benefits: [
      "3-7% accuracy improvement over individual models",
      "More robust to overfitting",
      "Diverse model perspectives reduce bias",
      "Meta-learner learns optimal model weighting",
    ],
    tradeoffs: [
      "Higher computational cost (4 models + meta-learner)",
      "More complex training pipeline",
      "Harder to explain predictions (not a single model)",
      "Requires careful cross-validation to avoid data leakage",
    ],
  },
  {
    name: "Offline-First with Real-time Sync",
    description:
      "Mobile applications cache data locally (SharedPreferences, SQLite, or Firestore offline mode) and sync when connectivity is restored. Essential for IoT apps where internet may be unreliable.",
    usedIn: ["SmartHome Flutter", "TravelMate", "Guide Me"],
    diagram: `
┌──────────────┐     ┌──────────────┐
│ Mobile App   │     │ Cloud Backend │
│              │     │              │
│ Local Cache  │◄───►│ Firestore    │
│ (Hive/SQflite)     │ (Real-time)  │
│              │     │              │
│ MQTT Direct  │◄───►│ MQTT Broker  │
│ (IoT control)│     │              │
└──────────────┘     └──────────────┘
        ↕
┌──────────────┐
│ ESP32 Devices │
│ (Local WiFi)  │
└──────────────┘`,
    benefits: [
      "App works without internet (critical for IoT)",
      "MQTT provides low-latency local device control",
      "Firestore handles cloud sync automatically",
      "Users never see loading states for cached data",
    ],
    tradeoffs: [
      "Conflict resolution for concurrent edits",
      "Cache invalidation complexity",
      "Higher storage usage on device",
      "Testing offline scenarios is challenging",
    ],
  },
];

/**
 * Project metrics over time
 */
export interface ProjectMilestone {
  date: string;
  metric: string;
  value: string;
  description: string;
}

export const projectMilestones: ProjectMilestone[] = [
  { date: "2023-01", metric: "Projects", value: "1", description: "First ESP32 blink project" },
  { date: "2023-03", metric: "Projects", value: "3", description: "HomeAutomation series begins" },
  { date: "2023-06", metric: "Projects", value: "8", description: "SmartHome Flutter app launched" },
  { date: "2023-09", metric: "Projects", value: "12", description: "First web applications" },
  { date: "2023-12", metric: "Projects", value: "18", description: "CancerGuard AI inception" },
  { date: "2024-03", metric: "Projects", value: "24", description: "HT Connect HRMS launch" },
  { date: "2024-06", metric: "Projects", value: "30", description: "Vision AI with YOLOv8" },
  { date: "2024-09", metric: "Projects", value: "38", description: "JARVIS AI assistant" },
  { date: "2024-12", metric: "Projects", value: "42", description: "First production deployments" },
  { date: "2025-03", metric: "Projects", value: "45", description: "NEXUS AI OS begins" },
  { date: "2025-06", metric: "Projects", value: "48", description: "CITADEL trading platform" },
  { date: "2025-09", metric: "Projects", value: "50", description: "150K lines milestone" },
  { date: "2025-12", metric: "Projects", value: "52", description: "EduKanban, TimeCapsule" },
  { date: "2026-03", metric: "Projects", value: "53+", description: "200K+ lines, 8 production apps" },
];

export const codeMetrics = {
  totalLines: 200000,
  totalFiles: 2500,
  totalCommits: 4200,
  avgCommitsPerWeek: 28,
  languages: [
    { name: "TypeScript", percentage: 32, lines: 64000 },
    { name: "Python", percentage: 22, lines: 44000 },
    { name: "Dart", percentage: 15, lines: 30000 },
    { name: "JavaScript", percentage: 12, lines: 24000 },
    { name: "C++", percentage: 8, lines: 16000 },
    { name: "CSS/SCSS", percentage: 5, lines: 10000 },
    { name: "HTML", percentage: 3, lines: 6000 },
    { name: "Other", percentage: 3, lines: 6000 },
  ],
  topContributor: {
    name: "Hema Koteswar Naidu",
    commits: 3800,
    linesAdded: 180000,
    linesDeleted: 45000,
  },
};
