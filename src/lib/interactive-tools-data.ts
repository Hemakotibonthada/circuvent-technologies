// ============================================================================
// INTERACTIVE TOOLS DATA - Data for playground components
// ============================================================================

// Tech Periodic Table elements
export const techPeriodicElements = [
  { symbol: "Re", name: "React", number: 1, category: "frontend", color: "#61dafb", description: "Component-based UI framework with virtual DOM and hooks API", proficiency: 95, icon: "⚛️" },
  { symbol: "Nx", name: "Next.js", number: 2, category: "frontend", color: "#ffffff", description: "React meta-framework with SSR, SSG, ISR, and App Router", proficiency: 95, icon: "▲" },
  { symbol: "Ts", name: "TypeScript", number: 3, category: "frontend", color: "#3178c6", description: "Strongly-typed JavaScript superset with advanced type system", proficiency: 95, icon: "🔷" },
  { symbol: "Tw", name: "Tailwind", number: 4, category: "frontend", color: "#06b6d4", description: "Utility-first CSS framework with JIT compilation", proficiency: 93, icon: "🎨" },
  { symbol: "Fm", name: "Framer Motion", number: 5, category: "frontend", color: "#bb4bf7", description: "Production-ready animation library for React", proficiency: 90, icon: "🎬" },
  { symbol: "Fl", name: "Flutter", number: 6, category: "mobile", color: "#02569b", description: "Cross-platform mobile framework with Dart language", proficiency: 88, icon: "💙" },
  { symbol: "Rn", name: "React Native", number: 7, category: "mobile", color: "#61dafb", description: "Native mobile apps using React", proficiency: 85, icon: "📱" },
  { symbol: "El", name: "Electron", number: 8, category: "frontend", color: "#47848f", description: "Desktop apps with web technologies", proficiency: 82, icon: "⚡" },
  { symbol: "Nd", name: "Node.js", number: 9, category: "backend", color: "#339933", description: "JavaScript runtime built on Chrome's V8 engine", proficiency: 93, icon: "💚" },
  { symbol: "Py", name: "Python", number: 10, category: "backend", color: "#3776ab", description: "Versatile programming language for AI, web, and data science", proficiency: 92, icon: "🐍" },
  { symbol: "Fa", name: "FastAPI", number: 11, category: "backend", color: "#009688", description: "High-performance async Python web framework", proficiency: 90, icon: "⚡" },
  { symbol: "Gq", name: "GraphQL", number: 12, category: "backend", color: "#e10098", description: "Query language for APIs with type system", proficiency: 85, icon: "◈" },
  { symbol: "Pr", name: "Prisma", number: 13, category: "backend", color: "#2d3748", description: "Type-safe ORM for Node.js and TypeScript", proficiency: 88, icon: "💎" },
  { symbol: "So", name: "Socket.IO", number: 14, category: "backend", color: "#010101", description: "Real-time bidirectional event-based communication", proficiency: 87, icon: "🔌" },
  { symbol: "Dt", name: "Dart", number: 15, category: "mobile", color: "#0175c2", description: "Language optimized for UI and performance", proficiency: 85, icon: "🎯" },
  { symbol: "Oa", name: "OpenAI", number: 16, category: "ai", color: "#412991", description: "GPT-4, DALL-E, and Whisper APIs for AI capabilities", proficiency: 90, icon: "🤖" },
  { symbol: "Ol", name: "Ollama", number: 17, category: "ai", color: "#ffffff", description: "Local LLM inference server with model management", proficiency: 88, icon: "🦙" },
  { symbol: "Yv", name: "YOLOv8", number: 18, category: "ai", color: "#ff6f00", description: "State-of-the-art object detection model", proficiency: 85, icon: "👁️" },
  { symbol: "Cb", name: "ChromaDB", number: 19, category: "ai", color: "#ff6b6b", description: "Open-source embedding database for RAG", proficiency: 87, icon: "🧠" },
  { symbol: "Lc", name: "LangChain", number: 20, category: "ai", color: "#1c3c3c", description: "Framework for developing LLM-powered applications", proficiency: 85, icon: "🔗" },
  { symbol: "Hf", name: "Hugging Face", number: 21, category: "ai", color: "#ff9d00", description: "Platform for ML models and datasets", proficiency: 82, icon: "🤗" },
  { symbol: "Dk", name: "Docker", number: 22, category: "devops", color: "#2496ed", description: "Containerization platform with Compose orchestration", proficiency: 90, icon: "🐳" },
  { symbol: "Ga", name: "GitHub Actions", number: 23, category: "devops", color: "#2088ff", description: "CI/CD automation directly from GitHub", proficiency: 88, icon: "⚙️" },
  { symbol: "Vc", name: "Vercel", number: 24, category: "devops", color: "#ffffff", description: "Zero-config deployment platform for Next.js", proficiency: 92, icon: "▲" },
  { symbol: "Ng", name: "Nginx", number: 25, category: "devops", color: "#009639", description: "High-performance reverse proxy and web server", proficiency: 82, icon: "🌐" },
  { symbol: "Pg", name: "PostgreSQL", number: 26, category: "database", color: "#336791", description: "Advanced open-source relational database", proficiency: 90, icon: "🐘" },
  { symbol: "Mg", name: "MongoDB", number: 27, category: "database", color: "#47a248", description: "NoSQL document database for flexible schemas", proficiency: 87, icon: "🍃" },
  { symbol: "Fb", name: "Firebase", number: 28, category: "database", color: "#ffca28", description: "Google's BaaS with Realtime DB and Firestore", proficiency: 88, icon: "🔥" },
  { symbol: "Rd", name: "Redis", number: 29, category: "database", color: "#dc382d", description: "In-memory data store for caching and pub/sub", proficiency: 85, icon: "🔴" },
  { symbol: "Dd", name: "DuckDB", number: 30, category: "database", color: "#fff000", description: "In-process SQL OLAP database for analytics", proficiency: 80, icon: "🦆" },
  { symbol: "Ep", name: "ESP32", number: 31, category: "iot", color: "#e7352c", description: "Wi-Fi + BLE microcontroller for IoT projects", proficiency: 90, icon: "🔌" },
  { symbol: "Mq", name: "MQTT", number: 32, category: "iot", color: "#660066", description: "Lightweight messaging protocol for IoT devices", proficiency: 88, icon: "📡" },
  { symbol: "Ar", name: "Arduino", number: 33, category: "iot", color: "#00979d", description: "Open-source electronics platform for prototyping", proficiency: 85, icon: "🔧" },
  { symbol: "Tf", name: "TensorFlow", number: 34, category: "ai", color: "#ff6f00", description: "End-to-end ML platform with TFLite for mobile", proficiency: 78, icon: "🔶" },
  { symbol: "Pt", name: "PyTorch", number: 35, category: "ai", color: "#ee4c2c", description: "Deep learning framework for research and production", proficiency: 80, icon: "🔥" },
  { symbol: "S3", name: "AWS S3", number: 36, category: "devops", color: "#569a31", description: "Scalable object storage with versioning", proficiency: 85, icon: "☁️" },
];

// World map points
export const worldMapPoints = [
  { lat: 17.385, lng: 78.4867, label: "Hyderabad (HQ)", value: 50, color: "#06b6d4", category: "office" },
  { lat: 12.9716, lng: 77.5946, label: "Bangalore", value: 30, color: "#8b5cf6", category: "office" },
  { lat: 19.076, lng: 72.8777, label: "Mumbai", value: 25, color: "#ec4899", category: "clients" },
  { lat: 28.6139, lng: 77.209, label: "New Delhi", value: 20, color: "#f59e0b", category: "clients" },
  { lat: 40.7128, lng: -74.006, label: "New York", value: 35, color: "#3b82f6", category: "clients" },
  { lat: 37.7749, lng: -122.4194, label: "San Francisco", value: 40, color: "#10b981", category: "clients" },
  { lat: 51.5074, lng: -0.1278, label: "London", value: 28, color: "#6366f1", category: "clients" },
  { lat: 35.6762, lng: 139.6503, label: "Tokyo", value: 22, color: "#ef4444", category: "users" },
  { lat: 1.3521, lng: 103.8198, label: "Singapore", value: 18, color: "#14b8a6", category: "users" },
  { lat: 48.8566, lng: 2.3522, label: "Paris", value: 15, color: "#a855f7", category: "users" },
  { lat: -33.8688, lng: 151.2093, label: "Sydney", value: 12, color: "#f43f5e", category: "users" },
  { lat: 25.2048, lng: 55.2708, label: "Dubai", value: 15, color: "#fbbf24", category: "clients" },
  { lat: 55.7558, lng: 37.6173, label: "Moscow", value: 10, color: "#ef4444", category: "users" },
  { lat: 22.3193, lng: 114.1694, label: "Hong Kong", value: 14, color: "#06b6d4", category: "users" },
  { lat: -23.5505, lng: -46.6333, label: "São Paulo", value: 8, color: "#10b981", category: "users" },
  { lat: 37.5665, lng: 126.978, label: "Seoul", value: 16, color: "#8b5cf6", category: "users" },
  { lat: 52.52, lng: 13.405, label: "Berlin", value: 12, color: "#3b82f6", category: "users" },
  { lat: 43.6532, lng: -79.3832, label: "Toronto", value: 11, color: "#ec4899", category: "users" },
];

// Network topology data
export const topologyNodes = [
  { id: "cdn", label: "Vercel CDN", icon: "🌐", x: 100, y: 50, type: "cdn" as const, color: "#06b6d4", status: "healthy" as const, metrics: { requests: 850 } },
  { id: "gateway", label: "API Gateway", icon: "🚪", x: 350, y: 50, type: "gateway" as const, color: "#8b5cf6", status: "healthy" as const, metrics: { cpu: 35, requests: 420 } },
  { id: "web", label: "Next.js", icon: "▲", x: 100, y: 170, type: "server" as const, color: "#ffffff", status: "healthy" as const, metrics: { cpu: 28, memory: 45 } },
  { id: "api", label: "FastAPI", icon: "⚡", x: 250, y: 170, type: "server" as const, color: "#009688", status: "healthy" as const, metrics: { cpu: 42, memory: 55, requests: 380 } },
  { id: "ai", label: "AI Engine", icon: "🧠", x: 400, y: 170, type: "service" as const, color: "#8b5cf6", status: "healthy" as const, metrics: { cpu: 78, memory: 82 } },
  { id: "mqtt", label: "MQTT Broker", icon: "📡", x: 550, y: 170, type: "service" as const, color: "#10b981", status: "healthy" as const, metrics: { requests: 1200 } },
  { id: "ws", label: "WebSocket", icon: "🔌", x: 175, y: 290, type: "service" as const, color: "#06b6d4", status: "healthy" as const },
  { id: "redis", label: "Redis", icon: "🔴", x: 325, y: 290, type: "cache" as const, color: "#dc382d", status: "healthy" as const, metrics: { memory: 32 } },
  { id: "ollama", label: "Ollama", icon: "🦙", x: 475, y: 290, type: "service" as const, color: "#ffffff", status: "healthy" as const, metrics: { cpu: 65, memory: 75 } },
  { id: "postgres", label: "PostgreSQL", icon: "🐘", x: 175, y: 400, type: "database" as const, color: "#336791", status: "healthy" as const, metrics: { cpu: 22, memory: 48 } },
  { id: "chroma", label: "ChromaDB", icon: "🧠", x: 350, y: 400, type: "database" as const, color: "#ff6b6b", status: "healthy" as const, metrics: { memory: 60 } },
  { id: "s3", label: "Storage", icon: "📦", x: 525, y: 400, type: "database" as const, color: "#f59e0b", status: "healthy" as const },
];

export const topologyLinks = [
  { source: "cdn", target: "web", protocol: "HTTPS", latency: 5 },
  { source: "cdn", target: "gateway", protocol: "HTTPS", latency: 8 },
  { source: "gateway", target: "api", protocol: "REST", latency: 2 },
  { source: "gateway", target: "ai", protocol: "gRPC", latency: 5 },
  { source: "web", target: "ws", protocol: "WS", latency: 1 },
  { source: "api", target: "redis", protocol: "TCP", latency: 1 },
  { source: "api", target: "postgres", protocol: "SQL", latency: 3 },
  { source: "ai", target: "ollama", protocol: "HTTP", latency: 10 },
  { source: "ai", target: "chroma", protocol: "HTTP", latency: 5 },
  { source: "mqtt", target: "redis", protocol: "PubSub", latency: 2 },
  { source: "ws", target: "redis", protocol: "PubSub", latency: 1 },
  { source: "ollama", target: "chroma", protocol: "HTTP", latency: 8 },
  { source: "api", target: "s3", protocol: "HTTPS", latency: 15 },
  { source: "redis", target: "chroma", bandwidth: 100 },
];

// Solar system planets for tech visualization
export const techSolarPlanets = [
  { name: "HTML/CSS", color: "#e34c26", size: 6, orbitRadius: 45, speed: 3, icon: "🌐", description: "Web fundamentals", moons: 2 },
  { name: "JavaScript", color: "#f7df1e", size: 7, orbitRadius: 70, speed: 2.5, icon: "💛", description: "Dynamic language", moons: 3 },
  { name: "React", color: "#61dafb", size: 9, orbitRadius: 100, speed: 2, icon: "⚛️", description: "UI framework", moons: 4 },
  { name: "Python", color: "#3776ab", size: 10, orbitRadius: 130, speed: 1.5, icon: "🐍", description: "AI & Backend", moons: 5 },
  { name: "Docker", color: "#2496ed", size: 8, orbitRadius: 165, speed: 1, icon: "🐳", description: "Containers", moons: 3 },
  { name: "AI/ML", color: "#8b5cf6", size: 12, orbitRadius: 200, speed: 0.7, icon: "🧠", description: "Intelligence", moons: 6 },
  { name: "IoT", color: "#10b981", size: 7, orbitRadius: 230, speed: 0.5, icon: "🔌", description: "Edge devices", moons: 4 },
];

// Activity heatmap time-based data
export const activityHeatmapData = (() => {
  const rows = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const cols = ["12am", "3am", "6am", "9am", "12pm", "3pm", "6pm", "9pm"];
  const data: Array<{ row: string; col: string; value: number }> = [];

  const patterns: Record<string, number[]> = {
    Mon: [2, 1, 3, 45, 68, 72, 55, 30],
    Tue: [3, 2, 5, 52, 75, 80, 60, 35],
    Wed: [5, 1, 4, 55, 82, 85, 65, 40],
    Thu: [4, 2, 6, 50, 70, 78, 58, 32],
    Fri: [6, 3, 5, 48, 65, 70, 50, 45],
    Sat: [10, 5, 8, 25, 35, 40, 45, 50],
    Sun: [8, 4, 6, 20, 28, 32, 38, 42],
  };

  for (const row of rows) {
    const pattern = patterns[row] || [5, 3, 5, 40, 60, 65, 50, 35];
    cols.forEach((col, i) => {
      data.push({
        row,
        col,
        value: pattern[i],
      });
    });
  }

  return { data, rows, cols };
})();

// Code quality metrics over time
export const codeQualityTimeline = [
  { label: "Oct '25", value: 72 },
  { label: "Nov '25", value: 78 },
  { label: "Dec '25", value: 82 },
  { label: "Jan '26", value: 85 },
  { label: "Feb '26", value: 89 },
  { label: "Mar '26", value: 92 },
];

// Performance metrics over time
export const performanceTimeline = [
  { label: "Oct", value: 82 },
  { label: "Nov", value: 85 },
  { label: "Dec", value: 88 },
  { label: "Jan", value: 91 },
  { label: "Feb", value: 93 },
  { label: "Mar", value: 95 },
];

// Dependency graph data
export const dependencyNodes = [
  { id: "next", name: "Next.js", version: "15.2", size: 12, type: "production" as const, color: "#ffffff" },
  { id: "react", name: "React", version: "19.0", size: 14, type: "production" as const, color: "#61dafb" },
  { id: "react-dom", name: "React DOM", version: "19.0", size: 10, type: "production" as const, color: "#61dafb" },
  { id: "framer", name: "Framer Motion", version: "11.0", size: 11, type: "production" as const, color: "#bb4bf7" },
  { id: "tailwind", name: "Tailwind CSS", version: "4.0", size: 9, type: "production" as const, color: "#06b6d4" },
  { id: "lucide", name: "Lucide React", version: "0.300", size: 8, type: "production" as const, color: "#f56565" },
  { id: "resend", name: "Resend", version: "6.9", size: 6, type: "production" as const, color: "#000000" },
  { id: "typescript", name: "TypeScript", version: "5.7", size: 10, type: "development" as const, color: "#3178c6" },
  { id: "eslint", name: "ESLint", version: "9.0", size: 7, type: "development" as const, color: "#4b32c3" },
  { id: "jest", name: "Jest", version: "29.0", size: 8, type: "development" as const, color: "#c63d14" },
  { id: "playwright", name: "Playwright", version: "1.48", size: 7, type: "development" as const, color: "#2ead33" },
  { id: "postcss", name: "PostCSS", version: "8.4", size: 5, type: "production" as const, color: "#dd3a0a" },
];

export const dependencyLinks = [
  { source: "next", target: "react" },
  { source: "next", target: "react-dom" },
  { source: "next", target: "postcss" },
  { source: "react-dom", target: "react" },
  { source: "framer", target: "react" },
  { source: "lucide", target: "react" },
  { source: "tailwind", target: "postcss" },
  { source: "eslint", target: "typescript" },
  { source: "jest", target: "typescript" },
  { source: "jest", target: "react" },
  { source: "playwright", target: "next" },
];

// Stats for animated counter section
export const showcaseStats = [
  { icon: "📦", value: "53+", label: "Total Projects", description: "Across 6 technology domains", change: 12, color: "#06b6d4", gradient: "from-cyan-500 to-blue-500" },
  { icon: "📝", value: "50K+", label: "Lines of Code", description: "Production-quality TypeScript, Python, C++", change: 25, color: "#8b5cf6", gradient: "from-violet-500 to-purple-500" },
  { icon: "⭐", value: "1.2K", label: "GitHub Stars", description: "Growing open-source community", change: 15, color: "#fbbf24", gradient: "from-amber-500 to-orange-500" },
  { icon: "🚀", value: "8", label: "In Production", description: "Live apps serving real users", change: 3, color: "#10b981", gradient: "from-emerald-500 to-teal-500" },
  { icon: "🧠", value: "13+", label: "AI Agents", description: "Running locally with zero cloud", change: 8, color: "#ec4899", gradient: "from-pink-500 to-rose-500" },
  { icon: "🔌", value: "9+", label: "IoT Devices", description: "ESP32 sensors in production", change: 5, color: "#3b82f6", gradient: "from-blue-500 to-indigo-500" },
  { icon: "📡", value: "<100ms", label: "MQTT Latency", description: "Real-time sensor communication", change: -15, color: "#10b981", gradient: "from-teal-500 to-cyan-500" },
  { icon: "🏆", value: "99.5%", label: "Uptime", description: "30-day rolling average", change: 0.2, color: "#f59e0b", gradient: "from-amber-500 to-yellow-500" },
];
