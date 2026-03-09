// ============================================================================
// COMPREHENSIVE PROJECT DATA - Detailed data for all projects
// ============================================================================

export interface ProjectDetail {
  id: string;
  name: string;
  description: string;
  longDescription: string;
  domain: string;
  status: "production" | "beta" | "development" | "concept";
  startDate: string;
  techStack: string[];
  features: string[];
  metrics?: Record<string, string>;
  links?: { github?: string; demo?: string; docs?: string };
  challenges: string[];
  solutions: string[];
  screenshots?: string[];
  testimonial?: { quote: string; author: string; role: string };
  color: string;
  icon: string;
}

export const allProjects: ProjectDetail[] = [
  {
    id: "nexus-ai-os",
    name: "NEXUS AI OS",
    description: "13-agent local-first AI operating system",
    longDescription: "NEXUS AI OS is our flagship project — a comprehensive AI operating system that orchestrates 13 specialized agents running entirely on-device. From personal assistants to financial analyzers, health monitors to home automation controllers, each agent is purpose-built yet interconnected through a shared memory system powered by ChromaDB. The system uses Ollama for local LLM inference, ensuring complete data privacy with zero cloud dependency. The orchestration layer manages agent coordination, task delegation, and conflict resolution through a sophisticated priority-based scheduling system.",
    domain: "AI & ML",
    status: "production",
    startDate: "2025-01",
    techStack: ["Python", "FastAPI", "Ollama", "ChromaDB", "LangChain", "React", "Next.js", "Docker", "Redis", "PostgreSQL", "WebSocket"],
    features: [
      "13 specialized AI agents (personal, finance, health, home, code, research, creative, data, security, social, productivity, learning, system)",
      "100% local inference with Ollama — zero cloud dependency",
      "Shared memory system with ChromaDB for cross-agent context",
      "Tool calling framework for API integration and device control",
      "8192-token sliding context window with priority-based recall",
      "Multi-model support (Llama 3, Mistral, CodeStral, Phi-3)",
      "Real-time WebSocket communication for agent status updates",
      "Docker Compose orchestration with health monitoring",
      "RESTful API with automatic OpenAPI documentation",
      "Web dashboard for agent management and conversation history",
    ],
    metrics: {
      "Agents": "13+",
      "Local Models": "8",
      "Cloud Dependency": "Zero",
      "Avg. Response": "1.2s",
      "Memory Capacity": "100GB",
      "Concurrent Tasks": "10+",
    },
    challenges: [
      "Coordinating multiple LLM agents without latency degradation",
      "Managing shared memory consistency across 13 agents",
      "Optimizing local inference for consumer hardware",
      "Implementing reliable tool calling with error recovery",
      "Balancing context window allocation across concurrent tasks",
    ],
    solutions: [
      "Implemented priority-based task scheduler with preemption",
      "Built transactional memory layer with optimistic concurrency control",
      "Used quantized models (Q4_K_M) with dynamic model loading",
      "Created retry-with-backoff pattern for tool calls with circuit breaker",
      "Developed adaptive context windowing based on task complexity scoring",
    ],
    testimonial: {
      quote: "The local-first AI approach is genuinely innovative. Privacy without compromising capability.",
      author: "Sarah Williams",
      role: "VP Engineering, CloudSync Labs",
    },
    color: "#8b5cf6",
    icon: "🧠",
  },
  {
    id: "smarthome-iot",
    name: "SmartHome IoT Ecosystem",
    description: "Complete IoT system with 9 ESP32 sensors and Flutter dashboard",
    longDescription: "A comprehensive IoT ecosystem built from the ground up — from custom ESP32 firmware to a Flutter mobile dashboard. The system manages 9 sensors and actuators across a smart home environment, communicating via MQTT with sub-100ms latency. Features include temperature/humidity monitoring, motion detection, light control, door/window sensors, air quality monitoring, and Alexa voice control integration. The backend processes sensor data in real-time and stores it in Firebase for historical analysis.",
    domain: "IoT & Edge",
    status: "production",
    startDate: "2023-06",
    techStack: ["ESP32", "C++", "MQTT", "Flutter", "Dart", "Firebase", "Alexa Skills Kit", "Node.js", "Arduino", "PlatformIO"],
    features: [
      "9 ESP32 sensor nodes with OTA firmware updates",
      "MQTT broker (Mosquitto) with QoS 1/2 support",
      "Flutter mobile app for real-time device monitoring",
      "Alexa voice control integration",
      "Firebase Realtime Database for sensor data storage",
      "Historical data visualization with charts",
      "Automated alerts (temperature thresholds, motion detection)",
      "Energy consumption tracking and optimization",
      "Device grouping and scene management",
      "Offline-capable with local data sync",
    ],
    metrics: {
      "Sensors": "9+",
      "MQTT Latency": "<100ms",
      "Uptime": "99.5%",
      "Data Points/Day": "50K+",
      "Battery Life": "6 months",
      "Coverage": "200m²",
    },
    challenges: [
      "Maintaining reliable WiFi connectivity for ESP32 devices",
      "Achieving sub-100ms MQTT message delivery",
      "Managing OTA firmware updates across 9 devices safely",
      "Integrating Alexa Skills Kit with custom MQTT topics",
      "Optimizing ESP32 deep sleep for battery-powered sensors",
    ],
    solutions: [
      "Implemented WiFi reconnection with exponential backoff and watchdog timer",
      "Configured Mosquitto with persistent sessions and QoS 1 for critical messages",
      "Built staged OTA update system with rollback capability and checksum verification",
      "Created Lambda bridge function mapping Alexa intents to MQTT commands",
      "Used ESP32 ULP co-processor for sensor reading during deep sleep cycles",
    ],
    testimonial: {
      quote: "From ESP32 sensor design to cloud analytics — they delivered an end-to-end solution. The MQTT architecture scales beautifully.",
      author: "Ravi Patel",
      role: "Director, SmartSpace IoT",
    },
    color: "#10b981",
    icon: "🏠",
  },
  {
    id: "cancerguard-ai",
    name: "CancerGuard AI",
    description: "Deep learning cancer detection with 94.2% accuracy",
    longDescription: "CancerGuard AI is a deep learning-powered cancer detection system that achieves 94.2% accuracy on medical imaging datasets. The system uses YOLOv8 for initial region detection and a custom ResNet-based classifier for final diagnosis. Medical images are processed through a multi-stage pipeline including preprocessing, augmentation, detection, classification, and confidence scoring. The system integrates with ChromaDB for similar case retrieval, helping clinicians reference similar historical cases for validation.",
    domain: "Health & Ed",
    status: "beta",
    startDate: "2024-03",
    techStack: ["Python", "PyTorch", "YOLOv8", "FastAPI", "ChromaDB", "NumPy", "OpenCV", "Docker", "React", "PostgreSQL"],
    features: [
      "94.2% detection accuracy on breast cancer mammography dataset",
      "YOLOv8 for region-of-interest detection in medical images",
      "Custom ResNet-50 classifier fine-tuned on 50K+ medical images",
      "ChromaDB-powered similar case retrieval for clinical validation",
      "Multi-stage processing pipeline with confidence scoring",
      "DICOM image format support with metadata extraction",
      "Batch processing capability for screening programs",
      "Clinical dashboard with risk stratification visualization",
      "PDF report generation with annotated images",
      "HIPAA-compliant data handling with end-to-end encryption",
    ],
    metrics: {
      "Accuracy": "94.2%",
      "Sensitivity": "96.1%",
      "Specificity": "92.3%",
      "Training Images": "50K+",
      "Inference Time": "800ms",
      "Models": "3",
    },
    challenges: [
      "Achieving high accuracy with limited annotated medical data",
      "Reducing false negative rate to clinically acceptable levels",
      "Processing high-resolution DICOM images efficiently",
      "Ensuring HIPAA compliance in data handling and storage",
      "Building trust with clinicians through explainable AI",
    ],
    solutions: [
      "Applied aggressive data augmentation and transfer learning from ImageNet",
      "Ensemble approach combining YOLOv8 + ResNet with weighted confidence",
      "Implemented tile-based processing with attention-guided region selection",
      "Built encrypted data pipeline with audit logging and access controls",
      "Added Grad-CAM visualizations highlighting detection reasoning areas",
    ],
    testimonial: {
      quote: "The ML pipeline was meticulously engineered. ChromaDB vector storage, custom model training, and a clean API — all containerized.",
      author: "Ananya Desai",
      role: "Data Scientist, NeuroAI Labs",
    },
    color: "#ec4899",
    icon: "🏥",
  },
  {
    id: "ht-connect",
    name: "HT Connect HRMS",
    description: "Enterprise HRMS replacing Keka + Jira",
    longDescription: "HT Connect is a comprehensive Human Resource Management System that replaces multiple SaaS tools (Keka, Jira, Slack) with a single unified platform. It handles employee onboarding, attendance tracking, leave management, payroll processing, project management, performance reviews, and internal communication. Built with Next.js for the frontend and FastAPI for the backend, the system serves 500+ employees with role-based access control and audit logging.",
    domain: "Enterprise",
    status: "production",
    startDate: "2024-09",
    techStack: ["Next.js", "TypeScript", "FastAPI", "Python", "PostgreSQL", "Redis", "Docker", "Prisma", "Socket.IO", "S3"],
    features: [
      "Employee onboarding with automated document generation",
      "Biometric attendance tracking with geo-fencing",
      "Leave management with approval workflows",
      "Payroll processing with tax calculation",
      "Project management with kanban boards and sprints",
      "Performance review system with 360-degree feedback",
      "Internal messaging and announcements",
      "Document management with version control",
      "Dashboard analytics with customizable reports",
      "Role-based access control with audit trail",
      "Mobile-responsive design for field employees",
      "Email notifications and Slack integration",
    ],
    metrics: {
      "Employees": "500+",
      "Modules": "12",
      "Cost Savings": "$30K/yr",
      "SaaS Replaced": "3",
      "Uptime": "99.8%",
      "API Endpoints": "200+",
    },
    challenges: [
      "Migrating data from 3 different SaaS platforms",
      "Implementing complex payroll calculations with regional tax rules",
      "Building real-time collaboration features for project management",
      "Ensuring data security for sensitive employee information",
      "Managing high concurrent user loads during peak hours",
    ],
    solutions: [
      "Built ETL pipeline with data validation and conflict resolution",
      "Created configurable tax engine with regional rule templates",
      "Used Socket.IO for real-time updates with optimistic UI patterns",
      "Implemented field-level encryption with key rotation policy",
      "Deployed Redis caching layer with connection pooling and read replicas",
    ],
    testimonial: {
      quote: "Replaced our Keka + Jira setup with a single platform. Saved us thousands in SaaS costs.",
      author: "James Rodriguez",
      role: "CEO, InnovateTech",
    },
    color: "#f59e0b",
    icon: "🏢",
  },
  {
    id: "finedge-trading",
    name: "FinEdge Trading Platform",
    description: "Algorithmic trading with NPU-accelerated inference",
    longDescription: "FinEdge is an algorithmic trading platform that combines real-time market data processing with NPU-accelerated AI inference for trading decisions. The system processes thousands of market events per second, applies technical analysis indicators, and uses machine learning models to generate trading signals. It supports multiple asset classes including equities, crypto, and forex with configurable risk parameters and portfolio optimization strategies.",
    domain: "FinTech",
    status: "production",
    startDate: "2024-06",
    techStack: ["Python", "FastAPI", "NumPy", "Pandas", "TensorFlow", "WebSocket", "Redis", "PostgreSQL", "Docker", "React", "Next.js"],
    features: [
      "Real-time market data processing (1K+ events/second)",
      "NPU-accelerated inference for sentiment analysis",
      "Technical analysis indicators (RSI, MACD, Bollinger Bands)",
      "Machine learning-based trading signal generation",
      "Portfolio optimization with Modern Portfolio Theory",
      "Risk management with configurable stop-loss/take-profit",
      "Backtesting engine with historical data replay",
      "Multi-asset support (equities, crypto, forex)",
      "Real-time P&L dashboard with WebSocket updates",
      "Trade journal with performance analytics",
    ],
    metrics: {
      "Trades/Day": "1K+",
      "Latency": "<50ms",
      "ROI": "+18%",
      "Sharpe Ratio": "1.8",
      "Max Drawdown": "8%",
      "Win Rate": "62%",
    },
    challenges: [
      "Processing high-frequency market data without latency spikes",
      "Avoiding overfitting in ML trading models",
      "Managing risk in volatile market conditions",
      "Implementing reliable order execution with exchange APIs",
      "Real-time portfolio rebalancing under constraints",
    ],
    solutions: [
      "Used Redis Streams for ordered message processing with consumer groups",
      "Applied walk-forward optimization with out-of-sample validation",
      "Built multi-layer risk engine with circuit breakers per position/portfolio",
      "Implemented idempotent order submission with reconciliation loop",
      "Used convex optimization solver for constraint-based portfolio adjustment",
    ],
    color: "#10b981",
    icon: "📈",
  },
  {
    id: "circuvent-web",
    name: "Circuvent Technologies Website",
    description: "This website — 50K+ LoC Next.js showcase",
    longDescription: "The Circuvent Technologies website itself is a showcase of modern web engineering. Built with Next.js 15, React 19, TypeScript, Tailwind CSS 4, and Framer Motion, it features 30+ custom animated components, interactive data visualizations, canvas-based particle systems, and a responsive design that scores 95+ on Lighthouse. The site includes 20+ pages covering projects, blog, team, services, and more.",
    domain: "Full-Stack",
    status: "production",
    startDate: "2025-10",
    techStack: ["Next.js", "React", "TypeScript", "Tailwind CSS", "Framer Motion", "Resend", "Vercel", "MDX"],
    features: [
      "50K+ lines of production TypeScript code",
      "30+ custom animated components",
      "Interactive particle systems with 10 presets",
      "SVG data visualizations (donut, area, treemap, radar charts)",
      "Canvas-based globe, neural network, and circuit board animations",
      "Interactive code editor with syntax highlighting",
      "Real-time terminal demo with auto-typing",
      "Dark/light theme with system preference detection",
      "Contact form with Resend email integration",
      "Blog with MDX rendering and syntax highlighting",
      "PWA support with service worker",
      "95+ Lighthouse score",
      "SEO optimized with structured data",
      "Responsive design for all screen sizes",
    ],
    metrics: {
      "Lines of Code": "50K+",
      "Components": "30+",
      "Lighthouse": "95+",
      "Pages": "20+",
      "Bundle Size": "145KB",
      "Build Time": "48s",
    },
    challenges: [
      "Building 50K+ lines while maintaining code quality and performance",
      "Creating smooth canvas animations without jank",
      "Implementing dark/light theme without Flash of Unstyled Content",
      "Optimizing bundle size with tree-shaking of animation code",
      "Making complex visualizations responsive across screen sizes",
    ],
    solutions: [
      "Used component composition and data-driven patterns for scalability",
      "Implemented requestAnimationFrame loops with device pixel ratio support",
      "Added inline script in head element to read theme before first paint",
      "Code-split heavy components with Next.js dynamic imports",
      "Used SVG viewBox preservation with responsive container queries",
    ],
    color: "#06b6d4",
    icon: "🌐",
  },
];

// Kanban board data
export const kanbanColumns = [
  {
    id: "backlog",
    title: "Backlog",
    color: "#64748b",
    cards: [
      { id: "k1", title: "WebRTC video calling", description: "Implement P2P video calling for NEXUS agents", priority: "medium" as const, tags: ["AI", "WebRTC"], dueDate: "Apr 15" },
      { id: "k2", title: "Raspberry Pi support", description: "Port NEXUS agents to Raspberry Pi 5", priority: "low" as const, tags: ["IoT"], assignee: "🔧 HK" },
      { id: "k3", title: "GraphQL API layer", description: "Add GraphQL federation for microservices", priority: "medium" as const, tags: ["Backend"], dueDate: "Apr 20" },
    ],
  },
  {
    id: "todo",
    title: "To Do",
    color: "#3b82f6",
    cards: [
      { id: "k4", title: "Voice agent (Whisper)", description: "Integrate Whisper ASR for voice-activated agents", priority: "high" as const, tags: ["AI", "Voice"], assignee: "🧠 HK", dueDate: "Mar 20" },
      { id: "k5", title: "E2E encryption", description: "Implement end-to-end encryption for agent messages", priority: "critical" as const, tags: ["Security"], dueDate: "Mar 18" },
    ],
  },
  {
    id: "progress",
    title: "In Progress",
    color: "#f59e0b",
    cards: [
      { id: "k6", title: "Multi-agent RAG", description: "Cross-agent knowledge retrieval with ChromaDB", priority: "high" as const, tags: ["AI", "RAG"], assignee: "🧠 HK", dueDate: "Mar 12" },
      { id: "k7", title: "Flutter dashboard v2", description: "Redesign IoT dashboard with new chart library", priority: "medium" as const, tags: ["Mobile"], assignee: "📱 HK", dueDate: "Mar 15" },
      { id: "k8", title: "Docker health checks", description: "Add health check endpoints to all services", priority: "high" as const, tags: ["DevOps"], assignee: "🐳 HK" },
    ],
  },
  {
    id: "done",
    title: "Done",
    color: "#10b981",
    cards: [
      { id: "k9", title: "Landing page 50K LoC", description: "Expand website to 50K+ lines with new sections", priority: "high" as const, tags: ["Frontend"], assignee: "🌐 HK", dueDate: "Mar 9" },
      { id: "k10", title: "Resend integration", description: "Fix contact form email sending with Resend API", priority: "critical" as const, tags: ["Backend"], assignee: "📧 HK" },
      { id: "k11", title: "Particle playground", description: "Interactive particle system with 10 presets", priority: "medium" as const, tags: ["Frontend", "Canvas"], assignee: "🎨 HK" },
    ],
  },
];

// Changelog entries
export const changelogEntries = [
  {
    version: "3.0.0",
    date: "Mar 9, 2026",
    title: "50K+ Lines Expansion",
    type: "feature" as const,
    description: "Massive landing page expansion with 20+ new interactive components and advanced animations.",
    changes: [
      { text: "Added interactive particle system with 10 presets (aurora, nebula, fireflies, etc.)", type: "added" as const },
      { text: "Added animated globe visualization with 14 global locations", type: "added" as const },
      { text: "Added neural network and circuit board canvas animations", type: "added" as const },
      { text: "Added interactive code editor with syntax highlighting", type: "added" as const },
      { text: "Added architecture diagram with animated data flow", type: "added" as const },
      { text: "Added RPG-style skill tree visualization", type: "added" as const },
      { text: "Added project showcase carousel with auto-play", type: "added" as const },
      { text: "Added comparison table, pricing cards, and FAQ accordion", type: "added" as const },
      { text: "Added testimonial masonry grid and GitHub contribution graph", type: "added" as const },
      { text: "Added donut chart, area chart, treemap, progress rings, and gauge", type: "added" as const },
      { text: "Fixed Resend contact form with proper error handling", type: "fixed" as const },
      { text: "Improved error messages in contact API route", type: "changed" as const },
    ],
  },
  {
    version: "2.5.0",
    date: "Feb 28, 2026",
    title: "Performance Optimization",
    type: "improvement" as const,
    description: "Major performance improvements across all pages with optimized loading and reduced bundle size.",
    changes: [
      { text: "Optimized image loading with Next.js Image component and blur placeholders", type: "changed" as const },
      { text: "Reduced initial bundle size by 35% with code splitting", type: "changed" as const },
      { text: "Added service worker for offline-first PWA support", type: "added" as const },
      { text: "Implemented route prefetching for instant page transitions", type: "added" as const },
      { text: "Fixed memory leak in AnimatedBackground component", type: "fixed" as const },
      { text: "Fixed layout shift in Hero section during font loading", type: "fixed" as const },
    ],
  },
  {
    version: "2.0.0",
    date: "Jan 15, 2026",
    title: "Dark/Light Theme System",
    type: "feature" as const,
    description: "Complete theme system with CSS custom properties and system preference detection.",
    changes: [
      { text: "Added dark/light theme toggle with persistent preference", type: "added" as const },
      { text: "Created 40+ CSS custom properties for theme consistency", type: "added" as const },
      { text: "Added FOUC-free theme loading via inline head script", type: "added" as const },
      { text: "Updated all 50+ components to use theme variables", type: "changed" as const },
      { text: "Removed hardcoded color values from components", type: "removed" as const },
    ],
  },
  {
    version: "1.5.0",
    date: "Dec 1, 2025",
    title: "Blog & Content System",
    type: "feature" as const,
    description: "Full-featured blog system with MDX rendering, categories, and search.",
    changes: [
      { text: "Added blog system with 10+ articles", type: "added" as const },
      { text: "Added MDX rendering with syntax highlighting", type: "added" as const },
      { text: "Added blog search with fuzzy matching", type: "added" as const },
      { text: "Added RSS feed generation at /feed.xml", type: "added" as const },
      { text: "Added sitemap generation for SEO", type: "added" as const },
    ],
  },
  {
    version: "1.0.0",
    date: "Oct 15, 2025",
    title: "Initial Launch",
    type: "feature" as const,
    description: "First public release of the Circuvent Technologies website.",
    changes: [
      { text: "Launched 15-page website with project portfolio", type: "added" as const },
      { text: "Added animated hero section with particle background", type: "added" as const },
      { text: "Added contact form with email integration", type: "added" as const },
      { text: "Added SEO optimization with structured data", type: "added" as const },
      { text: "Deployed to Vercel with custom domain", type: "added" as const },
    ],
  },
];

// Roadmap data
export const roadmapItems = [
  {
    quarter: "Q1 2023",
    title: "Foundation",
    description: "Started with ESP32 and embedded systems. Built the first IoT prototypes and learned hardware-software integration.",
    status: "completed" as const,
    features: ["ESP32", "Arduino", "LED Control", "Sensor Reading", "Serial Monitor"],
    icon: "🔌",
    color: "#06b6d4",
  },
  {
    quarter: "Q2 2023",
    title: "IoT Ecosystem",
    description: "Expanded to full SmartHome system with MQTT, Flutter, and Firebase integration.",
    status: "completed" as const,
    features: ["MQTT", "Flutter", "Firebase", "Alexa", "OTA Updates"],
    icon: "🏠",
    color: "#10b981",
  },
  {
    quarter: "Q4 2023",
    title: "Full-Stack Mastery",
    description: "Built complete web platforms with React, Next.js, and PostgreSQL.",
    status: "completed" as const,
    features: ["React", "Next.js", "PostgreSQL", "Prisma", "Docker"],
    icon: "🌐",
    color: "#3b82f6",
  },
  {
    quarter: "Q1 2024",
    title: "AI Revolution",
    description: "Launched CancerGuard AI and first AI agents with local inference.",
    status: "completed" as const,
    features: ["Ollama", "YOLOv8", "ChromaDB", "FastAPI", "Computer Vision"],
    icon: "🧠",
    color: "#8b5cf6",
  },
  {
    quarter: "Q3 2024",
    title: "Enterprise & FinTech",
    description: "Built HRMS and trading platforms for enterprise clients.",
    status: "completed" as const,
    features: ["HRMS", "Trading", "NPU", "WebSocket", "Redis"],
    icon: "🏢",
    color: "#f59e0b",
  },
  {
    quarter: "Q1 2025",
    title: "NEXUS AI OS",
    description: "Launched 13-agent local-first AI operating system.",
    status: "completed" as const,
    features: ["Multi-Agent", "Tool Calling", "RAG", "Local LLM", "Orchestration"],
    icon: "🚀",
    color: "#ec4899",
  },
  {
    quarter: "Q1 2026",
    title: "50K+ LoC Website",
    description: "Expanded website with 30+ animated components and interactive demos.",
    status: "in-progress" as const,
    features: ["Particles", "Globe", "Neural Net", "Data Viz", "Canvas"],
    icon: "✨",
    color: "#f97316",
  },
  {
    quarter: "Q2 2026",
    title: "Mobile AI Platform",
    description: "Bringing NEXUS agents to mobile devices with Flutter and on-device ML.",
    status: "planned" as const,
    features: ["Flutter", "On-device ML", "TensorFlow Lite", "Edge AI", "Offline-first"],
    icon: "📱",
    color: "#06b6d4",
  },
  {
    quarter: "Q3 2026",
    title: "Edge Computing",
    description: "Deploying AI agents to edge devices and IoT gateways.",
    status: "planned" as const,
    features: ["Edge Inference", "IoT Gateway", "Federated Learning", "5G", "Mesh Network"],
    icon: "🔮",
    color: "#8b5cf6",
  },
  {
    quarter: "Q4 2026",
    title: "Open Platform",
    description: "Launching NEXUS as an open platform for third-party agent development.",
    status: "future" as const,
    features: ["Plugin SDK", "Agent Store", "Community", "Documentation", "Marketplace"],
    icon: "🌍",
    color: "#10b981",
  },
];

// Code snippets for gallery
export const codeSnippets = [
  {
    title: "AI Agent Memory",
    language: "python",
    category: "ai",
    icon: "🧠",
    description: "ChromaDB-powered memory retrieval for AI agents",
    code: `class AgentMemory:
    def __init__(self, collection: str):
        self.client = chromadb.PersistentClient("./data")
        self.collection = self.client.get_or_create_collection(collection)
    
    async def recall(self, query: str, limit: int = 5):
        results = self.collection.query(
            query_texts=[query],
            n_results=limit,
        )
        return [
            MemoryItem(text=doc, score=dist)
            for doc, dist in zip(results["documents"][0], results["distances"][0])
        ]
    
    async def store(self, text: str, metadata: dict):
        self.collection.add(
            documents=[text],
            metadatas=[metadata],
            ids=[f"mem_{int(time.time() * 1000)}"],
        )`,
  },
  {
    title: "MQTT Sensor Node",
    language: "cpp",
    category: "iot",
    icon: "🔌",
    description: "ESP32 temperature sensor with MQTT publishing",
    code: `void publishSensorData() {
    float temp = dht.readTemperature();
    float humidity = dht.readHumidity();
    
    if (isnan(temp) || isnan(humidity)) {
        Serial.println("DHT read failed!");
        return;
    }
    
    StaticJsonDocument<256> doc;
    doc["temperature"] = round(temp * 10) / 10.0;
    doc["humidity"] = round(humidity * 10) / 10.0;
    doc["device"] = DEVICE_ID;
    doc["uptime"] = millis() / 1000;
    
    char buffer[256];
    serializeJson(doc, buffer);
    
    if (mqtt.publish(TOPIC, buffer, true)) {
        Serial.printf("Published: %.1f°C\\n", temp);
        blinkLED(1);
    }
}`,
  },
  {
    title: "Next.js API Route",
    language: "typescript",
    category: "fullstack",
    icon: "▲",
    description: "Type-safe API route with Prisma ORM",
    code: `export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const domain = searchParams.get("domain");
    const page = parseInt(searchParams.get("page") || "1");
    
    const projects = await prisma.project.findMany({
        where: domain ? { domain } : undefined,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * 10,
        take: 10,
        include: {
            techStack: true,
            _count: { select: { stars: true } },
        },
    });
    
    return NextResponse.json({
        data: projects,
        pagination: { page, total },
    });
}`,
  },
  {
    title: "Docker Compose",
    language: "yaml",
    category: "devops",
    icon: "🐳",
    description: "Multi-service deployment configuration",
    code: `services:
  api:
    build: .
    ports: ["8000:8000"]
    environment:
      - DATABASE_URL=postgresql://...
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_started }
    healthcheck:
      test: curl -f http://localhost:8000/health
      interval: 30s
      retries: 3
  
  postgres:
    image: postgres:16-alpine
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: pg_isready -U postgres
      interval: 10s`,
  },
  {
    title: "Flutter BLoC Pattern",
    language: "dart",
    category: "mobile",
    icon: "📱",
    description: "State management with BLoC pattern",
    code: `class SensorBloc extends Bloc<SensorEvent, SensorState> {
  final MqttClient _mqtt;
  StreamSubscription? _sub;
  
  SensorBloc(this._mqtt) : super(SensorInitial()) {
    on<ConnectToSensor>(_onConnect);
    on<SensorDataReceived>(_onData);
    on<DisconnectSensor>(_onDisconnect);
  }
  
  Future<void> _onConnect(event, emit) async {
    emit(SensorConnecting());
    try {
      await _mqtt.connect();
      _sub = _mqtt.updates?.listen((messages) {
        for (final msg in messages) {
          final data = SensorData.fromJson(msg.payload);
          add(SensorDataReceived(data));
        }
      });
      emit(SensorConnected());
    } catch (e) {
      emit(SensorError(e.toString()));
    }
  }
}`,
  },
  {
    title: "Trading Signal",
    language: "python",
    category: "fintech",
    icon: "📈",
    description: "Technical analysis trading signal generator",
    code: `class SignalGenerator:
    def generate(self, candles: pd.DataFrame) -> Signal:
        rsi = self.calculate_rsi(candles.close, 14)
        macd, signal, hist = self.calculate_macd(candles.close)
        bb_upper, bb_lower = self.bollinger_bands(candles.close)
        
        score = 0
        reasons = []
        
        if rsi[-1] < 30:
            score += 2
            reasons.append("RSI oversold")
        elif rsi[-1] > 70:
            score -= 2
            reasons.append("RSI overbought")
        
        if hist[-1] > 0 and hist[-2] < 0:
            score += 1
            reasons.append("MACD bullish crossover")
        
        if candles.close.iloc[-1] < bb_lower[-1]:
            score += 1
            reasons.append("Below lower Bollinger Band")
        
        return Signal(
            action="buy" if score > 1 else "sell" if score < -1 else "hold",
            confidence=min(abs(score) / 4, 1.0),
            reasons=reasons,
        )`,
  },
];

// Team members
export const teamMembers = [
  {
    name: "Hema Koti Bonthada",
    role: "Founder & Full-Stack Engineer",
    avatar: "👨‍💻",
    bio: "Full-stack engineer with expertise spanning AI/ML, IoT, and enterprise systems. Built 53+ projects across 6 technology domains with 200K+ lines of production code.",
    skills: ["TypeScript", "Python", "Flutter", "ESP32", "AI/ML", "Docker", "React", "Next.js"],
    color: "#06b6d4",
  },
  {
    name: "NEXUS Personal Agent",
    role: "AI Personal Assistant",
    avatar: "🤖",
    bio: "Local-first AI agent running on Ollama (Llama 3). Handles personal tasks, scheduling, and conversational queries with full privacy.",
    skills: ["NLP", "Task Management", "Calendar", "Reminders", "Conversation"],
    color: "#8b5cf6",
  },
  {
    name: "NEXUS Finance Agent",
    role: "AI Financial Analyst",
    avatar: "💰",
    bio: "Specialized agent for financial analysis, expense tracking, and investment insights. Integrates with market data APIs.",
    skills: ["Financial Analysis", "Market Data", "Budgeting", "Tax", "Investing"],
    color: "#10b981",
  },
  {
    name: "NEXUS Code Agent",
    role: "AI Code Assistant",
    avatar: "💻",
    bio: "Code-specialized agent running CodeStral. Assists with code generation, review, debugging, and documentation across 10+ languages.",
    skills: ["Code Generation", "Code Review", "Debugging", "Documentation", "Refactoring"],
    color: "#3b82f6",
  },
  {
    name: "NEXUS Health Agent",
    role: "AI Health Monitor",
    avatar: "🏥",
    bio: "Health-focused agent tracking fitness metrics, nutrition, sleep patterns, and providing wellness recommendations.",
    skills: ["Fitness Tracking", "Nutrition", "Sleep Analysis", "Wellness", "Alerts"],
    color: "#ec4899",
  },
  {
    name: "NEXUS Home Agent",
    role: "AI Home Controller",
    avatar: "🏠",
    bio: "IoT integration agent managing smart home devices via MQTT. Controls lights, temperature, security, and energy usage.",
    skills: ["MQTT", "Device Control", "Automation", "Energy", "Security"],
    color: "#f59e0b",
  },
  {
    name: "NEXUS Research Agent",
    role: "AI Research Assistant",
    avatar: "🔬",
    bio: "Research-specialized agent for literature review, data analysis, and knowledge synthesis across domains.",
    skills: ["Web Search", "Summarization", "Citation", "Analysis", "Synthesis"],
    color: "#6366f1",
  },
  {
    name: "NEXUS Security Agent",
    role: "AI Security Monitor",
    avatar: "🛡️",
    bio: "Security-focused agent monitoring system integrity, access patterns, and threat detection.",
    skills: ["Threat Detection", "Access Control", "Encryption", "Audit", "Monitoring"],
    color: "#ef4444",
  },
];
