// ============================================================================
// QUIZ DATA - Tech knowledge quiz questions
// ============================================================================

export const techQuizQuestions = [
  {
    id: "q1",
    question: "What does SSR stand for in Next.js?",
    options: [
      { id: "a", text: "Server-Side Rendering", correct: true },
      { id: "b", text: "Static Site Rebuilding", correct: false },
      { id: "c", text: "Serverless State Recovery", correct: false },
      { id: "d", text: "Synchronized Server Response", correct: false },
    ],
    explanation: "SSR (Server-Side Rendering) generates HTML on the server for each request, providing better SEO and faster initial page loads.",
    category: "Next.js",
    difficulty: "easy" as const,
  },
  {
    id: "q2",
    question: "What protocol does MQTT use for IoT communication?",
    options: [
      { id: "a", text: "HTTP/HTTPS", correct: false },
      { id: "b", text: "Publish/Subscribe over TCP", correct: true },
      { id: "c", text: "REST over UDP", correct: false },
      { id: "d", text: "GraphQL over WebSocket", correct: false },
    ],
    explanation: "MQTT uses a publish/subscribe pattern over TCP, making it lightweight and ideal for IoT devices with limited bandwidth.",
    category: "IoT",
    difficulty: "medium" as const,
  },
  {
    id: "q3",
    question: "What is ChromaDB primarily used for?",
    options: [
      { id: "a", text: "Relational data storage", correct: false },
      { id: "b", text: "File system management", correct: false },
      { id: "c", text: "Vector embeddings storage for RAG", correct: true },
      { id: "d", text: "Session caching", correct: false },
    ],
    explanation: "ChromaDB is an open-source embedding database designed for storing and querying vector embeddings, commonly used in RAG (Retrieval-Augmented Generation) pipelines.",
    category: "AI/ML",
    difficulty: "medium" as const,
  },
  {
    id: "q4",
    question: "What does the 'use client' directive do in Next.js 13+?",
    options: [
      { id: "a", text: "Marks a component as a Client Component", correct: true },
      { id: "b", text: "Enables client-side caching", correct: false },
      { id: "c", text: "Restricts access to authenticated users", correct: false },
      { id: "d", text: "Optimizes bundle for client download", correct: false },
    ],
    explanation: "'use client' marks a component boundary as a Client Component, enabling hooks, browser APIs, and interactivity. Without it, components are Server Components by default.",
    category: "Next.js",
    difficulty: "easy" as const,
  },
  {
    id: "q5",
    question: "What quantization format reduces LLM memory usage while maintaining quality?",
    options: [
      { id: "a", text: "FP32 (Full Precision)", correct: false },
      { id: "b", text: "Q4_K_M (4-bit quantization)", correct: true },
      { id: "c", text: "BF16 (Brain Float)", correct: false },
      { id: "d", text: "INT1 (Binary)", correct: false },
    ],
    explanation: "Q4_K_M is a 4-bit quantization format used by llama.cpp and Ollama that significantly reduces memory usage (4x less than FP16) while maintaining good quality through k-quant mixed precision.",
    category: "AI/ML",
    difficulty: "hard" as const,
  },
  {
    id: "q6",
    question: "What's the primary advantage of Prisma over raw SQL?",
    options: [
      { id: "a", text: "Faster query execution", correct: false },
      { id: "b", text: "Type-safe database client with auto-completion", correct: true },
      { id: "c", text: "Built-in caching layer", correct: false },
      { id: "d", text: "NoSQL compatibility", correct: false },
    ],
    explanation: "Prisma generates a type-safe client from your schema, providing auto-completion, compile-time error checking, and a fluent query API — eliminating an entire class of runtime SQL errors.",
    category: "Backend",
    difficulty: "easy" as const,
  },
  {
    id: "q7",
    question: "What deep sleep mechanism does ESP32 use to save power?",
    options: [
      { id: "a", text: "CPU clock reduction", correct: false },
      { id: "b", text: "ULP (Ultra-Low-Power) co-processor", correct: true },
      { id: "c", text: "RAM compression", correct: false },
      { id: "d", text: "WiFi power cycling", correct: false },
    ],
    explanation: "ESP32's ULP co-processor can run simple programs (sensor reading, GPIO monitoring) while the main CPU is in deep sleep, consuming only microamps of current. Perfect for battery-powered IoT sensors.",
    category: "IoT",
    difficulty: "hard" as const,
  },
  {
    id: "q8",
    question: "What is the purpose of Docker Compose health checks?",
    options: [
      { id: "a", text: "Monitor container CPU usage", correct: false },
      { id: "b", text: "Verify service readiness before starting dependents", correct: true },
      { id: "c", text: "Restart containers on crash", correct: false },
      { id: "d", text: "Load balance between containers", correct: false },
    ],
    explanation: "Health checks verify a service is fully ready (not just started) before Docker marks it as 'healthy'. Combined with 'depends_on: condition: service_healthy', this ensures proper startup order.",
    category: "DevOps",
    difficulty: "medium" as const,
  },
  {
    id: "q9",
    question: "What React 19 feature enables async data fetching in components?",
    options: [
      { id: "a", text: "useEffect with async callback", correct: false },
      { id: "b", text: "Server Components with async/await", correct: true },
      { id: "c", text: "useFetch hook", correct: false },
      { id: "d", text: "React.lazy with Suspense", correct: false },
    ],
    explanation: "React 19 Server Components can be async functions that directly await data fetches. This eliminates the need for useEffect-based data fetching patterns and waterfall requests.",
    category: "React",
    difficulty: "medium" as const,
  },
  {
    id: "q10",
    question: "What algorithm does YOLOv8 use for object detection?",
    options: [
      { id: "a", text: "Region-based CNN (R-CNN)", correct: false },
      { id: "b", text: "Single-shot detection with anchor-free head", correct: true },
      { id: "c", text: "Sliding window with HOG features", correct: false },
      { id: "d", text: "Template matching with scale invariance", correct: false },
    ],
    explanation: "YOLOv8 uses an anchor-free detection head with a CSPDarknet backbone, enabling real-time object detection in a single forward pass — much faster than two-stage detectors like R-CNN.",
    category: "AI/ML",
    difficulty: "hard" as const,
  },
];

// Additional stats data 
export const additionalShowcaseStats = [
  { label: "Components Built", value: "45+", description: "Custom React components", change: 30, color: "#06b6d4", gradient: "from-cyan-500 to-blue-500", icon: "🧩" },
  { label: "Canvas Animations", value: "10+", description: "Interactive canvas-based visuals", change: 100, color: "#8b5cf6", gradient: "from-violet-500 to-purple-500", icon: "🎨" },
  { label: "Custom Hooks", value: "25+", description: "Reusable React hooks", change: 20, color: "#ec4899", gradient: "from-pink-500 to-rose-500", icon: "🪝" },
  { label: "Data Files", value: "10+", description: "Structured data sources", change: 15, color: "#10b981", gradient: "from-emerald-500 to-teal-500", icon: "📊" },
  { label: "Interactive Tools", value: "4", description: "Gradient, color, animation builders", change: 100, color: "#f59e0b", gradient: "from-amber-500 to-orange-500", icon: "🛠️" },
  { label: "Visualizations", value: "15+", description: "Charts, graphs, and diagrams", change: 50, color: "#3b82f6", gradient: "from-blue-500 to-indigo-500", icon: "📈" },
  { label: "Device Mockups", value: "3", description: "Browser, phone, tablet frames", change: 100, color: "#6366f1", gradient: "from-indigo-500 to-violet-500", icon: "📱" },
  { label: "Test Coverage", value: "92%", description: "Unit and integration tests", change: 5, color: "#10b981", gradient: "from-green-500 to-emerald-500", icon: "✅" },
];
