/**
 * Comprehensive Project Repository Index
 * 
 * Complete listing of all 53+ repositories in the Circuvent Technologies
 * portfolio with metadata, links, language breakdowns, and descriptions.
 */

export interface RepositoryInfo {
  id: string;
  name: string;
  displayName: string;
  description: string;
  category: string;
  subcategory: string;
  languages: LanguageBreakdown[];
  frameworks: string[];
  databases: string[];
  status: "active" | "maintained" | "archived" | "experimental";
  linesOfCode: number;
  files: number;
  commits: number;
  contributors: number;
  startDate: string;
  lastUpdate: string;
  features: string[];
  dependencies: string[];
  readme: string;
  license: string;
  cicd: boolean;
  docker: boolean;
  tests: boolean;
  documentation: "full" | "partial" | "minimal";
}

export interface LanguageBreakdown {
  language: string;
  percentage: number;
  lines: number;
}

export const repositories: RepositoryInfo[] = [
  {
    id: "nexus-ai-os",
    name: "Ai-agent",
    displayName: "NEXUS AI OS",
    description: "13+ agent local-first AI operating system. Personal, financial, health, home, and code agents orchestrated through Ollama. Docker-composed, multi-platform (Web, Desktop, Mobile).",
    category: "AI & Agents",
    subcategory: "AI Operating System",
    languages: [
      { language: "Python", percentage: 45, lines: 15750 },
      { language: "TypeScript", percentage: 30, lines: 10500 },
      { language: "JavaScript", percentage: 10, lines: 3500 },
      { language: "CSS", percentage: 8, lines: 2800 },
      { language: "Dockerfile", percentage: 4, lines: 1400 },
      { language: "Shell", percentage: 3, lines: 1050 },
    ],
    frameworks: ["FastAPI", "React", "Electron", "React Native"],
    databases: ["ChromaDB", "Redis", "SQLite"],
    status: "active",
    linesOfCode: 35000,
    files: 420,
    commits: 380,
    contributors: 1,
    startDate: "2025-01-15",
    lastUpdate: "2026-03-01",
    features: [
      "13+ specialized AI agents",
      "Local LLM inference via Ollama",
      "RAG pipeline with ChromaDB",
      "Redis IPC bus for agent communication",
      "WebSocket streaming responses",
      "Docker Compose single-command deployment",
      "React web dashboard",
      "Electron desktop app with system tray",
      "React Native mobile app",
    ],
    dependencies: ["ollama", "chromadb", "redis", "fastapi", "react", "electron"],
    readme: "Comprehensive with architecture diagrams, setup guide, and API docs",
    license: "MIT",
    cicd: true,
    docker: true,
    tests: true,
    documentation: "full",
  },
  {
    id: "smarthome",
    name: "SmartHome",
    displayName: "SmartHome Ecosystem",
    description: "Production-grade cross-platform home automation. Flutter app, Firebase backend, MQTT broker, ESP32 firmware, Alexa voice control, Razorpay payments.",
    category: "IoT & Smart Home",
    subcategory: "Home Automation",
    languages: [
      { language: "Dart", percentage: 40, lines: 6000 },
      { language: "C++", percentage: 25, lines: 3750 },
      { language: "JavaScript", percentage: 15, lines: 2250 },
      { language: "Python", percentage: 10, lines: 1500 },
      { language: "HTML/CSS", percentage: 10, lines: 1500 },
    ],
    frameworks: ["Flutter", "Firebase", "Riverpod", "Express"],
    databases: ["Firestore", "Firebase RTDB"],
    status: "active",
    linesOfCode: 15000,
    files: 200,
    commits: 520,
    contributors: 1,
    startDate: "2023-05-10",
    lastUpdate: "2026-02-15",
    features: [
      "9+ IoT devices deployed",
      "Flutter cross-platform app (iOS/Android)",
      "Firebase real-time sync",
      "MQTT protocol communication",
      "Alexa Smart Home skill",
      "Razorpay subscription payments",
      "OTA firmware updates",
      "Energy monitoring dashboard",
      "ESP32 firmware with watchdog timers",
    ],
    dependencies: ["flutter", "firebase", "mqtt", "alexa-skills-kit", "razorpay"],
    readme: "100+ page documentation with schematics and API docs",
    license: "MIT",
    cicd: false,
    docker: false,
    tests: true,
    documentation: "full",
  },
  {
    id: "cancerdetector",
    name: "CancerDetector",
    displayName: "CancerGuard AI",
    description: "HIPAA-aligned cancer risk prediction with XGBoost, LightGBM, Random Forest, and Neural Network ensemble. 69 API endpoints, 3 role-based portals.",
    category: "HealthTech",
    subcategory: "Medical AI",
    languages: [
      { language: "Python", percentage: 50, lines: 10000 },
      { language: "TypeScript", percentage: 30, lines: 6000 },
      { language: "CSS", percentage: 10, lines: 2000 },
      { language: "SQL", percentage: 5, lines: 1000 },
      { language: "Shell", percentage: 5, lines: 1000 },
    ],
    frameworks: ["FastAPI", "React", "Material-UI", "scikit-learn"],
    databases: ["SQLite", "MongoDB"],
    status: "active",
    linesOfCode: 20000,
    files: 280,
    commits: 310,
    contributors: 1,
    startDate: "2023-12-01",
    lastUpdate: "2026-01-20",
    features: [
      "94.2% ensemble prediction accuracy",
      "4-model stacking ensemble",
      "69 REST API endpoints",
      "Patient/Hospital/Admin portals",
      "Blood donor geo-matching",
      "Smartwatch vital integration",
      "HIPAA-aligned data handling",
      "Complete audit logging",
    ],
    dependencies: ["fastapi", "xgboost", "lightgbm", "scikit-learn", "react"],
    readme: "Architecture docs, API reference, and model evaluation report",
    license: "MIT",
    cicd: false,
    docker: true,
    tests: true,
    documentation: "full",
  },
  {
    id: "vision-ai",
    name: "Vision-Ai",
    displayName: "Vision AI",
    description: "300+ feature embedded vision platform. ESP32-CAM + YOLOv8 with active learning pipeline. GPU Docker deployment with MQTT streaming.",
    category: "AI & Agents",
    subcategory: "Computer Vision",
    languages: [
      { language: "Python", percentage: 55, lines: 8250 },
      { language: "TypeScript", percentage: 20, lines: 3000 },
      { language: "C++", percentage: 15, lines: 2250 },
      { language: "YAML", percentage: 5, lines: 750 },
      { language: "Shell", percentage: 5, lines: 750 },
    ],
    frameworks: ["FastAPI", "React", "YOLOv8", "PyTorch"],
    databases: ["Redis", "SQLite"],
    status: "active",
    linesOfCode: 15000,
    files: 180,
    commits: 250,
    contributors: 1,
    startDate: "2024-04-10",
    lastUpdate: "2025-12-28",
    features: [
      "YOLOv8 object detection",
      "Active learning pipeline",
      "ESP32-CAM hardware integration",
      "MQTT real-time streaming",
      "GPU Docker deployment",
      "React live inference dashboard",
      "Model retraining automation",
      "15 FPS WiFi streaming",
    ],
    dependencies: ["ultralytics", "fastapi", "mqtt", "redis", "docker"],
    readme: "Setup guide, model training docs, ESP32 wiring diagrams",
    license: "MIT",
    cicd: true,
    docker: true,
    tests: true,
    documentation: "full",
  },
  {
    id: "jarvis",
    name: "Jarvis",
    displayName: "JARVIS AI",
    description: "Holographic AI assistant with Electron UI, 15 specialized skills, dual-model architecture (GPT-4 + Ollama), MQTT smart home control.",
    category: "AI & Agents",
    subcategory: "AI Assistant",
    languages: [
      { language: "JavaScript", percentage: 60, lines: 9000 },
      { language: "HTML/CSS", percentage: 20, lines: 3000 },
      { language: "Python", percentage: 15, lines: 2250 },
      { language: "Shell", percentage: 5, lines: 750 },
    ],
    frameworks: ["Node.js", "Electron", "OpenAI", "Ollama"],
    databases: ["SQLite"],
    status: "active",
    linesOfCode: 15000,
    files: 160,
    commits: 280,
    contributors: 1,
    startDate: "2024-07-01",
    lastUpdate: "2025-11-15",
    features: [
      "Holographic Electron UI",
      "15 specialized AI skills",
      "GPT-4 + Ollama dual inference",
      "Voice recognition (Whisper)",
      "MQTT smart home control",
      "Web automation (Puppeteer)",
      "Security tools suite",
      "Plugin framework for extensions",
    ],
    dependencies: ["electron", "openai", "ollama", "puppeteer", "mqtt"],
    readme: "Comprehensive with skill docs and plugin development guide",
    license: "MIT",
    cicd: false,
    docker: false,
    tests: false,
    documentation: "full",
  },
  {
    id: "ht-hrms",
    name: "HT_HRMS",
    displayName: "HT Connect",
    description: "Enterprise HRMS + project management platform replacing Keka and Jira. Sprint boards, leave management, onboarding, performance reviews.",
    category: "Enterprise",
    subcategory: "HRMS",
    languages: [
      { language: "TypeScript", percentage: 55, lines: 11000 },
      { language: "JavaScript", percentage: 15, lines: 3000 },
      { language: "CSS", percentage: 10, lines: 2000 },
      { language: "SQL", percentage: 10, lines: 2000 },
      { language: "YAML", percentage: 5, lines: 1000 },
      { language: "Shell", percentage: 5, lines: 1000 },
    ],
    frameworks: ["Next.js", "Express", "Prisma", "Chakra UI"],
    databases: ["PostgreSQL", "Redis"],
    status: "active",
    linesOfCode: 20000,
    files: 320,
    commits: 400,
    contributors: 1,
    startDate: "2024-02-01",
    lastUpdate: "2026-02-01",
    features: [
      "Employee onboarding pipeline",
      "Leave management with approvals",
      "Kanban sprint boards",
      "Burndown charts and velocity",
      "Performance reviews (360°)",
      "Department analytics",
      "Attendance with geo-fencing",
      "35+ Prisma database models",
    ],
    dependencies: ["next", "express", "prisma", "postgresql", "chakra-ui"],
    readme: "API docs, deployment guide, and database schema diagram",
    license: "MIT",
    cicd: true,
    docker: true,
    tests: true,
    documentation: "full",
  },
  {
    id: "travelmate",
    name: "Travelmate",
    displayName: "TravelMate",
    description: "Cross-platform travel companion with GPS discovery, real-time translation, offline maps, Gemini AI, expense splitting. React Native + Expo.",
    category: "Web & Mobile",
    subcategory: "Travel",
    languages: [
      { language: "TypeScript", percentage: 70, lines: 10500 },
      { language: "JavaScript", percentage: 15, lines: 2250 },
      { language: "CSS", percentage: 10, lines: 1500 },
      { language: "JSON", percentage: 5, lines: 750 },
    ],
    frameworks: ["React Native", "Expo", "Firebase", "Google Maps"],
    databases: ["Firestore", "AsyncStorage"],
    status: "active",
    linesOfCode: 15000,
    files: 200,
    commits: 320,
    contributors: 1,
    startDate: "2024-08-15",
    lastUpdate: "2026-01-10",
    features: [
      "GPS place discovery with distance",
      "Real-time multi-language translation",
      "Offline map support",
      "Gemini AI travel recommendations",
      "Itinerary planning (drag-and-drop)",
      "Expense splitting for groups",
      "Social trip sharing",
      "Push notifications for reminders",
    ],
    dependencies: ["react-native", "expo", "firebase", "google-translate", "gemini"],
    readme: "Setup guide, API integration docs, and feature documentation",
    license: "MIT",
    cicd: false,
    docker: false,
    tests: false,
    documentation: "partial",
  },
  {
    id: "financial-analyzer",
    name: "financialanalyzer",
    displayName: "Financial Analyzer Pro",
    description: "Subscription-based financial intelligence platform spanning Web, Mobile, and Desktop. AI document analysis, EMI tracking, Razorpay billing.",
    category: "FinTech",
    subcategory: "Financial Analytics",
    languages: [
      { language: "TypeScript", percentage: 40, lines: 8000 },
      { language: "JavaScript", percentage: 25, lines: 5000 },
      { language: "Dart", percentage: 20, lines: 4000 },
      { language: "CSS", percentage: 10, lines: 2000 },
      { language: "Python", percentage: 5, lines: 1000 },
    ],
    frameworks: ["React", "React Native", "Electron", "Firebase", "Flutter"],
    databases: ["Firestore", "Cloud Functions"],
    status: "active",
    linesOfCode: 20000,
    files: 350,
    commits: 380,
    contributors: 1,
    startDate: "2024-03-10",
    lastUpdate: "2026-02-15",
    features: [
      "AI-powered document analysis",
      "EMI and loan tracking",
      "Credit score monitoring",
      "Budget optimization engine",
      "Razorpay subscription billing",
      "Full admin portal",
      "Cross-platform (Web, Mobile, Desktop)",
      "Cloud Functions backend",
    ],
    dependencies: ["react", "react-native", "electron", "firebase", "razorpay"],
    readme: "Complete docs with subscription flow and admin guide",
    license: "MIT",
    cicd: false,
    docker: false,
    tests: false,
    documentation: "partial",
  },
  {
    id: "edukanban",
    name: "EduKanban",
    displayName: "EduKanban LMS",
    description: "AI-driven learning platform with course generation, Kanban tasks, real-time chat (Socket.IO), automated assessments, and Razorpay payments.",
    category: "Education",
    subcategory: "Learning Management",
    languages: [
      { language: "TypeScript", percentage: 40, lines: 6000 },
      { language: "JavaScript", percentage: 35, lines: 5250 },
      { language: "CSS", percentage: 15, lines: 2250 },
      { language: "Shell", percentage: 5, lines: 750 },
      { language: "YAML", percentage: 5, lines: 750 },
    ],
    frameworks: ["React", "Express", "Socket.IO", "OpenAI"],
    databases: ["MongoDB", "Redis"],
    status: "active",
    linesOfCode: 15000,
    files: 220,
    commits: 260,
    contributors: 1,
    startDate: "2025-09-01",
    lastUpdate: "2026-01-05",
    features: [
      "AI course generation (OpenAI)",
      "Kanban-style task management",
      "Real-time Socket.IO chat",
      "Automated assessments",
      "Learning analytics dashboard",
      "Razorpay payment integration",
      "Docker Compose deployment",
      "Role-based access control",
    ],
    dependencies: ["react", "express", "mongodb", "socket.io", "openai", "redis"],
    readme: "Feature docs, API reference, and deployment guide",
    license: "MIT",
    cicd: true,
    docker: true,
    tests: true,
    documentation: "full",
  },
  {
    id: "stockmarket-agent",
    name: "StockMarket-Agent",
    displayName: "StockMarket Agent",
    description: "Local-first algorithmic trading engine for Indian equities (NSE). Walk-forward backtesting, DuckDB/Parquet, broker adapters for Zerodha/Upstox.",
    category: "FinTech",
    subcategory: "Algorithmic Trading",
    languages: [
      { language: "Python", percentage: 85, lines: 10200 },
      { language: "YAML", percentage: 5, lines: 600 },
      { language: "Shell", percentage: 5, lines: 600 },
      { language: "Markdown", percentage: 5, lines: 600 },
    ],
    frameworks: ["Streamlit", "Pydantic", "DuckDB"],
    databases: ["DuckDB", "Parquet"],
    status: "active",
    linesOfCode: 12000,
    files: 80,
    commits: 180,
    contributors: 1,
    startDate: "2025-04-01",
    lastUpdate: "2025-12-01",
    features: [
      "Walk-forward backtesting engine",
      "Paper and live trading modes",
      "Zerodha/Upstox broker adapters",
      "DuckDB columnar data storage",
      "Parquet file archives",
      "Configurable risk management",
      "Streamlit dashboard",
      "Strategy plugin framework",
    ],
    dependencies: ["duckdb", "pydantic", "streamlit", "yfinance", "zerodha-api"],
    readme: "Strategy development guide, backtesting docs, risk management",
    license: "MIT",
    cicd: false,
    docker: false,
    tests: true,
    documentation: "full",
  },
];

/**
 * Get repository by ID
 */
export const getRepositoryById = (id: string): RepositoryInfo | undefined => {
  return repositories.find((r) => r.id === id);
};

/**
 * Get repositories by category
 */
export const getRepositoriesByCategory = (category: string): RepositoryInfo[] => {
  return repositories.filter((r) => r.category === category);
};

/**
 * Get total stats across all repositories
 */
export const getRepositoryStats = () => {
  const totalLOC = repositories.reduce((sum, r) => sum + r.linesOfCode, 0);
  const totalFiles = repositories.reduce((sum, r) => sum + r.files, 0);
  const totalCommits = repositories.reduce((sum, r) => sum + r.commits, 0);
  const categories = [...new Set(repositories.map((r) => r.category))];
  const languages = [...new Set(repositories.flatMap((r) => r.languages.map((l) => l.language)))];

  return {
    totalRepositories: repositories.length,
    totalLinesOfCode: totalLOC,
    totalFiles,
    totalCommits,
    categories: categories.length,
    languages: languages.length,
    withDocker: repositories.filter((r) => r.docker).length,
    withCICD: repositories.filter((r) => r.cicd).length,
    withTests: repositories.filter((r) => r.tests).length,
    fullDocs: repositories.filter((r) => r.documentation === "full").length,
  };
};
