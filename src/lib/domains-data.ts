import {
  Brain,
  Cpu,
  Shield,
  Globe,
  HeartPulse,
  GraduationCap,
  type LucideIcon,
} from "lucide-react";

export interface DomainInfo {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  description: string;
  longDescription: string;
  icon: string;
  gradient: string;
  coverGradient: string;
  projectCount: number;
  technologies: string[];
  keyProjects: string[];
  capabilities: DomainCapability[];
  caseStudy: DomainCaseStudy;
  stats: DomainStat[];
}

export interface DomainCapability {
  title: string;
  description: string;
  icon: string;
}

export interface DomainCaseStudy {
  title: string;
  challenge: string;
  solution: string;
  results: string[];
  techStack: string[];
}

export interface DomainStat {
  value: string;
  label: string;
}

export const domains: DomainInfo[] = [
  {
    id: "ai-agents",
    name: "AI & Agents",
    slug: "ai",
    tagline: "Intelligent Systems That Think, Learn, and Act",
    description:
      "Multi-agent orchestration, LLM integration, computer vision, and natural language processing — all running local-first.",
    longDescription:
      "Our AI & Agents domain represents the cutting edge of what's possible with local-first artificial intelligence. We build multi-agent systems that orchestrate specialized AI models to handle complex, real-world tasks — from personal assistants to computer vision pipelines. Every system is designed to run on-device, protecting privacy while delivering cloud-level intelligence.",
    icon: "Brain",
    gradient: "from-violet-500 to-purple-500",
    coverGradient: "from-violet-600 via-purple-600 to-indigo-600",
    projectCount: 8,
    technologies: [
      "Python",
      "FastAPI",
      "Ollama",
      "OpenAI GPT-4",
      "LangChain",
      "ChromaDB",
      "YOLOv8",
      "TensorFlow",
      "PyTorch",
      "Whisper",
      "OpenVINO",
      "ONNX",
      "Electron",
      "React",
      "Docker",
    ],
    keyProjects: [
      "nexus-ai-os",
      "jarvis-ai",
      "vision-ai",
      "cancerguard-ai",
    ],
    capabilities: [
      {
        title: "Multi-Agent Orchestration",
        description:
          "Design and deploy systems with 13+ specialized AI agents that collaborate through custom IPC buses, shared context via ChromaDB, and intelligent routing.",
        icon: "Brain",
      },
      {
        title: "Computer Vision",
        description:
          "YOLOv8 object detection with active learning pipelines, ESP32-CAM integration, and real-time MQTT streaming for edge deployment.",
        icon: "Eye",
      },
      {
        title: "LLM Integration",
        description:
          "Local LLM inference via Ollama (Llama, CodeLlama, Mistral), cloud API integration (GPT-4, Gemini), and RAG pipelines with ChromaDB vector stores.",
        icon: "Zap",
      },
      {
        title: "Voice & NLP",
        description:
          "Speech-to-text with Whisper, natural language understanding, intent classification, and conversational AI with persistent memory.",
        icon: "Globe",
      },
      {
        title: "NPU Acceleration",
        description:
          "Hardware-accelerated inference on Intel Core Ultra NPUs using OpenVINO, enabling desktop-grade AI performance without discrete GPUs.",
        icon: "Cpu",
      },
      {
        title: "Edge AI Deployment",
        description:
          "Model optimization with quantization, pruning, and ONNX export for deployment on resource-constrained edge devices.",
        icon: "Shield",
      },
    ],
    caseStudy: {
      title: "NEXUS AI OS — 13-Agent Local AI Operating System",
      challenge:
        "Build a personal AI operating system that handles finances, health, home automation, and productivity — entirely on-device with no cloud dependency.",
      solution:
        "Designed a multi-agent architecture with specialized agents (Personal, Financial, Health, Home, Code, Research, Calendar, Email, File, Security, Learning, Social, Orchestrator) communicating through Redis Pub/Sub IPC. All LLM inference runs through Ollama with dynamic model selection based on system resources.",
      results: [
        "13+ specialized agents running concurrently",
        "1.2s average response time for simple queries",
        "Zero data leaves the device",
        "Single docker-compose deployment",
        "Supports Llama 3.1 70B quantized for complex reasoning",
      ],
      techStack: [
        "FastAPI",
        "React",
        "Electron",
        "React Native",
        "Ollama",
        "ChromaDB",
        "Redis",
        "Docker",
      ],
    },
    stats: [
      { value: "13+", label: "AI Agents" },
      { value: "8", label: "Projects" },
      { value: "12+", label: "ML Models" },
      { value: "50K+", label: "Lines of AI Code" },
    ],
  },
  {
    id: "iot-smart-home",
    name: "IoT & Smart Home",
    slug: "iot",
    tagline: "From Silicon to Cloud — Complete IoT Verticals",
    description:
      "ESP32 ecosystems, MQTT protocols, sensor networks, and embedded firmware engineering for intelligent environments.",
    longDescription:
      "Our IoT & Smart Home domain spans the entire hardware-software stack: from ESP32 firmware written in C++ to MQTT broker management, Flutter mobile apps, Firebase cloud backends, and Alexa voice integrations. We've deployed 9+ IoT devices in production environments and built cross-platform control interfaces that work seamlessly across mobile, web, and voice.",
    icon: "Cpu",
    gradient: "from-cyan-500 to-teal-500",
    coverGradient: "from-cyan-500 via-teal-500 to-emerald-500",
    projectCount: 9,
    technologies: [
      "ESP32",
      "Arduino",
      "C++",
      "MQTT",
      "PlatformIO",
      "Flutter",
      "Dart",
      "Firebase",
      "Alexa Skills Kit",
      "Node.js",
      "Riverpod",
      "OTA Updates",
      "SPIFFS",
      "ESP-NOW",
    ],
    keyProjects: [
      "smarthome-ecosystem",
    ],
    capabilities: [
      {
        title: "Embedded Firmware",
        description:
          "Production-grade ESP32 firmware with OTA updates, watchdog timers, deep sleep optimization, and fail-safe relay control.",
        icon: "Cpu",
      },
      {
        title: "MQTT Architecture",
        description:
          "Hierarchical topic design, QoS level management, bridge networking, and Mosquitto broker configuration for reliable IoT communication.",
        icon: "Globe",
      },
      {
        title: "Sensor Networks",
        description:
          "DHT22 temperature/humidity, PIR motion, LDR light, ACS712 current sensing, and MQ-series gas detectors — all integrated and calibrated.",
        icon: "Activity",
      },
      {
        title: "Cross-Platform Control",
        description:
          "Flutter mobile apps, React web dashboards, and Alexa voice skills — all connected to the same MQTT backbone.",
        icon: "Layers",
      },
      {
        title: "Energy Monitoring",
        description:
          "Real-time power consumption tracking, cost estimation, daily/weekly/monthly aggregation, and smart scheduling.",
        icon: "Zap",
      },
      {
        title: "OTA Firmware Updates",
        description:
          "Remote firmware deployment across 9+ devices with progress tracking, rollback capability, and safety interlocks.",
        icon: "Shield",
      },
    ],
    caseStudy: {
      title: "SmartHome Ecosystem — Production IoT Platform",
      challenge:
        "Create a unified smart home platform that controls 9+ IoT devices across rooms with real-time responsiveness, voice control, and energy monitoring.",
      solution:
        "Built a three-layer architecture: ESP32 firmware layer (C++/PlatformIO), communication layer (MQTT/Firebase), and application layer (Flutter/Web/Alexa). Each device runs custom firmware with OTA update capability, watchdog timers, and automatic WiFi reconnection.",
      results: [
        "9+ IoT devices deployed and running 24/7",
        "<100ms average command latency",
        "99.5% uptime over 12 months",
        "Energy savings tracked and reported daily",
        "Alexa voice control for all rooms",
      ],
      techStack: [
        "Flutter",
        "Firebase",
        "ESP32",
        "MQTT",
        "C++",
        "Riverpod",
        "Alexa Skills Kit",
        "Razorpay",
      ],
    },
    stats: [
      { value: "9+", label: "IoT Devices" },
      { value: "9", label: "Projects" },
      { value: "<100ms", label: "Latency" },
      { value: "99.5%", label: "Uptime" },
    ],
  },
  {
    id: "fintech",
    name: "FinTech",
    slug: "fintech",
    tagline: "Algorithmic Trading, Financial Analytics, and Payment Infrastructure",
    description:
      "Quantitative trading engines, financial analysis platforms, subscription billing, and NPU-accelerated inference for market intelligence.",
    longDescription:
      "Our FinTech domain combines deep financial domain knowledge with cutting-edge technology. From algorithmic trading engines that run entirely on your machine (no cloud latency) to cross-platform financial analysis suites with subscription billing — we build financial tools that are powerful, private, and production-ready.",
    icon: "Shield",
    gradient: "from-green-500 to-emerald-500",
    coverGradient: "from-green-500 via-emerald-500 to-teal-500",
    projectCount: 4,
    technologies: [
      "Python",
      "DuckDB",
      "Apache Arrow",
      "Parquet",
      "Streamlit",
      "PySide6",
      "Qt",
      "OpenVINO",
      "React",
      "React Native",
      "Electron",
      "Firebase",
      "Razorpay",
      "Zerodha API",
      "Tauri 2.0",
    ],
    keyProjects: [
      "financial-analyzer",
      "stockmarket-agent",
      "citadel",
      "neural-sentinel",
    ],
    capabilities: [
      {
        title: "Algorithmic Trading",
        description:
          "Walk-forward backtesting, paper/live trading modes, broker adapters for Zerodha/Upstox, and configurable risk management.",
        icon: "TrendingUp",
      },
      {
        title: "Financial Analytics",
        description:
          "EMI calculation, credit score monitoring, budget optimization, AI-powered document analysis, and comprehensive reporting.",
        icon: "BarChart3",
      },
      {
        title: "Subscription Platforms",
        description:
          "Razorpay integration for subscription billing, plan management, payment webhooks, and revenue analytics dashboards.",
        icon: "Shield",
      },
      {
        title: "NPU Acceleration",
        description:
          "Intel Core Ultra NPU acceleration via OpenVINO for real-time market analysis and DeepSeek-R1 inference.",
        icon: "Cpu",
      },
      {
        title: "Market Data Pipelines",
        description:
          "DuckDB + Parquet storage for time-series data, Apache Arrow for zero-copy sharing, and real-time data streaming.",
        icon: "Globe",
      },
      {
        title: "Risk Management",
        description:
          "Position sizing, sector exposure limits, correlation analysis, daily loss limits, and automated stop-loss execution.",
        icon: "Shield",
      },
    ],
    caseStudy: {
      title: "StockMarket Agent — Local-First Quantitative Trading",
      challenge:
        "Build an algorithmic trading platform for Indian equities (NSE) that runs entirely on the user's machine — no cloud dependency, no subscription fees, no strategy exposure.",
      solution:
        "Designed a modular Python architecture with DuckDB for columnar data storage, walk-forward backtesting engine, pluggable strategy framework, and broker adapters for Zerodha/Upstox. Risk management module enforces position limits, sector exposure, and daily loss caps.",
      results: [
        "Sharpe Ratio: 1.8 on 5-year backtest",
        "Maximum Drawdown: 12%",
        "Trade execution: <50ms paper, <200ms live",
        "Zero cloud dependency",
        "Supports 10+ concurrent strategies",
      ],
      techStack: [
        "Python",
        "DuckDB",
        "Parquet",
        "Pydantic",
        "Streamlit",
        "Zerodha API",
      ],
    },
    stats: [
      { value: "4", label: "FinTech Projects" },
      { value: "1.8", label: "Sharpe Ratio" },
      { value: "<50ms", label: "Trade Speed" },
      { value: "5yr", label: "Backtest Data" },
    ],
  },
  {
    id: "healthtech",
    name: "HealthTech",
    slug: "healthtech",
    tagline: "AI-Powered Healthcare Intelligence",
    description:
      "Cancer detection AI, health analytics, vitals tracking, and HIPAA-aligned medical platforms.",
    longDescription:
      "Our HealthTech domain applies machine learning to healthcare's most pressing challenges. From cancer risk prediction using ensemble learning to comprehensive health analytics with GPT-4 powered risk assessment — we build healthcare tools that save lives while respecting patient privacy.",
    icon: "HeartPulse",
    gradient: "from-pink-500 to-rose-500",
    coverGradient: "from-rose-500 via-pink-500 to-fuchsia-500",
    projectCount: 3,
    technologies: [
      "Python",
      "FastAPI",
      "React",
      "TypeScript",
      "XGBoost",
      "LightGBM",
      "Neural Networks",
      "scikit-learn",
      "Node.js",
      "MongoDB",
      "OpenAI GPT-4",
      "Material-UI",
      "Recharts",
    ],
    keyProjects: [
      "cancerguard-ai",
      "health-india",
    ],
    capabilities: [
      {
        title: "Ensemble ML Models",
        description:
          "XGBoost, LightGBM, Random Forest, and Neural Network ensembles with stacking meta-learners for maximum prediction accuracy.",
        icon: "Brain",
      },
      {
        title: "Multi-Portal Architecture",
        description:
          "Role-based portals (Patient, Hospital, Admin) with 69+ API endpoints, RBAC, and complete audit logging.",
        icon: "Shield",
      },
      {
        title: "Health Analytics",
        description:
          "Vitals tracking, sleep analytics, disease records, lab test management, and AI-powered risk assessment scoring.",
        icon: "Activity",
      },
      {
        title: "Blood Donor Matching",
        description:
          "Geo-spatial blood donor matching with compatible type calculation, proximity search, and availability tracking.",
        icon: "HeartPulse",
      },
      {
        title: "Wearable Integration",
        description:
          "Smartwatch vital integration for continuous health monitoring, anomaly detection, and trend analysis.",
        icon: "Cpu",
      },
      {
        title: "HIPAA Alignment",
        description:
          "End-to-end encryption, role-based access control, audit logging, and data anonymization following healthcare compliance standards.",
        icon: "Shield",
      },
    ],
    caseStudy: {
      title: "CancerGuard AI — Ensemble Cancer Risk Prediction",
      challenge:
        "Build a reliable cancer risk prediction system that considers multiple risk factors, supports three user roles, and includes geo-spatial blood donor matching.",
      solution:
        "Implemented a two-level stacking ensemble: Level 1 with XGBoost, LightGBM, Random Forest, and Neural Networks making independent predictions; Level 2 with Logistic Regression meta-learner combining results. FastAPI backend serves 69 endpoints across three role-based portals.",
      results: [
        "94.2% prediction accuracy on held-out test set",
        "AUC-ROC: 0.967",
        "<200ms API response time",
        "69 REST endpoints across 3 portals",
        "Geo-spatial donor matching within 25km radius",
      ],
      techStack: [
        "React",
        "TypeScript",
        "FastAPI",
        "XGBoost",
        "LightGBM",
        "Neural Networks",
        "Material-UI",
      ],
    },
    stats: [
      { value: "94.2%", label: "ML Accuracy" },
      { value: "3", label: "HealthTech Projects" },
      { value: "69", label: "API Endpoints" },
      { value: "0.967", label: "AUC-ROC" },
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    slug: "enterprise",
    tagline: "Business-Critical Platforms and Internal Tooling",
    description:
      "HRMS platforms, email infrastructure, CMS systems, and enterprise-grade internal tooling.",
    longDescription:
      "Our Enterprise domain builds the operational backbone that businesses run on. From full-featured HRMS platforms that replace Keka + Jira to self-hosted email infrastructure — we create tools that save companies thousands in SaaS subscriptions while providing complete data ownership.",
    icon: "Building2",
    gradient: "from-slate-400 to-zinc-500",
    coverGradient: "from-slate-500 via-zinc-500 to-neutral-500",
    projectCount: 5,
    technologies: [
      "Next.js",
      "Express",
      "PostgreSQL",
      "Prisma",
      "Docker",
      "Chakra UI",
      "React",
      "Firebase",
      "SMTP",
      "Material-UI",
      "Redux Toolkit",
      "SQLite",
      "Python",
      "Flask",
    ],
    keyProjects: [
      "ht-hrms",
      "app-builder",
      "circuvent-mail",
      "netshare-pro",
    ],
    capabilities: [
      {
        title: "HRMS Platforms",
        description:
          "Complete HR management with onboarding, leave management, attendance, performance reviews, and payroll integration.",
        icon: "Users",
      },
      {
        title: "Project Management",
        description:
          "Kanban boards, sprint planning, burndown charts, velocity tracking, and time management in unified platforms.",
        icon: "Layers",
      },
      {
        title: "Email Infrastructure",
        description:
          "Self-hosted SMTP email with custom domains, 25MB attachments, intelligent folder management, and admin controls.",
        icon: "Mail",
      },
      {
        title: "Application Builders",
        description:
          "Visual drag-and-drop app builder platforms with code generation, project management, and deployment pipelines.",
        icon: "Layers",
      },
      {
        title: "File Sharing",
        description:
          "Cross-platform enterprise file sharing with authentication, audit trails, and standalone executable distribution.",
        icon: "Share2",
      },
      {
        title: "Docker Deployment",
        description:
          "All enterprise tools deploy via Docker Compose with health checks, resource limits, and automated backups.",
        icon: "Shield",
      },
    ],
    caseStudy: {
      title: "HT Connect — Unified HR + Project Management",
      challenge:
        "Replace two separate SaaS tools (Keka for HR and Jira for project management) with a single, self-hosted platform that provides both capabilities.",
      solution:
        "Built HT Connect on Next.js + Express + PostgreSQL with 35+ Prisma models. The HR module handles onboarding, leave, attendance, and reviews. The project module provides Kanban boards, sprints, burndown charts, and time tracking. Single Docker Compose deployment.",
      results: [
        "$2,400/month saved in SaaS subscriptions",
        "200+ sprints completed",
        "5,000+ tasks managed",
        "98.5% uptime over 12 months",
        "50-person company fully using the platform",
      ],
      techStack: [
        "Next.js",
        "Express",
        "PostgreSQL",
        "Prisma",
        "Docker",
        "Chakra UI",
      ],
    },
    stats: [
      { value: "5", label: "Enterprise Projects" },
      { value: "$2.4K", label: "Monthly Savings" },
      { value: "5K+", label: "Tasks Managed" },
      { value: "98.5%", label: "Uptime" },
    ],
  },
  {
    id: "education",
    name: "Education & Health",
    slug: "education",
    tagline: "Learning Platforms, Habit Engines, and Community Tools",
    description:
      "LMS platforms, micro-habit engines, community platforms, and cross-platform consumer applications.",
    longDescription:
      "Our Education & Consumer domain builds products that help people learn, grow, and connect. From AI-driven learning platforms with automated assessments to micro-habit engines that build lasting behavioral change — we create products that make a real difference in people's daily lives.",
    icon: "GraduationCap",
    gradient: "from-sky-500 to-indigo-500",
    coverGradient: "from-sky-500 via-blue-500 to-indigo-500",
    projectCount: 6,
    technologies: [
      "React",
      "React Native",
      "Express",
      "MongoDB",
      "Socket.IO",
      "OpenAI",
      "Redis",
      "Docker",
      "Expo",
      "Firebase",
      "Angular",
      "Ionic",
      "Capacitor",
      "Zustand",
      "TypeScript",
    ],
    keyProjects: [
      "edukanban",
      "travelmate",
      "timecapsule",
      "mana-uru",
      "guide-me",
    ],
    capabilities: [
      {
        title: "AI-Driven Learning",
        description:
          "Automated course generation, intelligent assessment creation, learning analytics, and personalized study path recommendations.",
        icon: "GraduationCap",
      },
      {
        title: "Real-Time Collaboration",
        description:
          "Socket.IO powered real-time chat, collaborative document editing, live notifications, and presence indicators.",
        icon: "Users",
      },
      {
        title: "Cross-Platform Delivery",
        description:
          "Single codebase deploying to iOS, Android, Web, and PWA using React Native/Expo and Ionic/Capacitor frameworks.",
        icon: "Globe",
      },
      {
        title: "Community Platforms",
        description:
          "Social feeds, crowdfunding, event management, multi-language support, and community moderation tools.",
        icon: "Users",
      },
      {
        title: "Memory Preservation",
        description:
          "Temporal navigation, Google Photos integration, adaptive timelines, and intelligent memory resurfacing.",
        icon: "Clock",
      },
      {
        title: "Travel Intelligence",
        description:
          "GPS discovery, multi-language translation, offline maps, AI recommendations, and expense splitting.",
        icon: "Map",
      },
    ],
    caseStudy: {
      title: "EduKanban — AI-Driven Learning Management System",
      challenge:
        "Build a production-ready LMS that combines traditional course management with AI-powered content generation and real-time collaboration.",
      solution:
        "Created EduKanban with React frontend, Express backend, MongoDB + Redis data layer. AI generates course outlines and assessments via OpenAI. Real-time chat via Socket.IO. Kanban-style task management for student assignments. Razorpay payment integration for premium content.",
      results: [
        "AI course generation in <30 seconds",
        "Real-time collaboration with <100ms latency",
        "Automated assessments with instant grading",
        "Docker deployment with single command",
        "Payment processing via Razorpay",
      ],
      techStack: [
        "React",
        "Express",
        "MongoDB",
        "Socket.IO",
        "OpenAI",
        "Redis",
        "Docker",
      ],
    },
    stats: [
      { value: "6", label: "Consumer Projects" },
      { value: "4", label: "Platforms" },
      { value: "3+", label: "Mobile Apps" },
      { value: "Real-time", label: "Collaboration" },
    ],
  },
];

export const getDomainBySlug = (slug: string): DomainInfo | undefined => {
  return domains.find((d) => d.slug === slug);
};

export const getAllDomainSlugs = (): string[] => {
  return domains.map((d) => d.slug);
};
