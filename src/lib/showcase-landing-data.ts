// ============================================================================
// SHOWCASE DATA - Data for interactive demos and showcases on the landing page
// ============================================================================

// Code editor demo tabs
export const codeEditorTabs = [
  {
    name: "agent.ts",
    language: "typescript",
    code: `import { Agent, Memory, Tool } from "@nexus/core";
import { OllamaProvider } from "@nexus/providers";

export class PersonalAgent extends Agent {
  private memory: Memory;
  private tools: Map<string, Tool> = new Map();

  constructor(config: AgentConfig) {
    super(config);
    this.memory = new Memory({
      provider: "chromadb",
      collection: "personal",
      maxTokens: 8192,
    });
  }

  async process(input: string): Promise<AgentResponse> {
    const context = await this.memory.recall(input, { limit: 5 });
    const relevantTools = this.selectTools(input);

    const response = await this.llm.generate({
      system: this.systemPrompt,
      messages: [
        ...context.map((c) => ({ role: "assistant", content: c.text })),
        { role: "user", content: input },
      ],
      tools: relevantTools,
      temperature: 0.7,
      maxTokens: 2048,
    });

    await this.memory.store({
      input,
      output: response.content,
      metadata: { timestamp: Date.now(), tools: relevantTools.map(t => t.name) },
    });

    return {
      content: response.content,
      toolCalls: response.toolCalls,
      confidence: response.confidence,
      tokensUsed: response.usage.totalTokens,
    };
  }

  private selectTools(input: string): Tool[] {
    const keywords = this.extractKeywords(input);
    return Array.from(this.tools.values())
      .filter((tool) => tool.matchesContext(keywords))
      .slice(0, 5);
  }
}`,
  },
  {
    name: "iot-sensor.cpp",
    language: "cpp",
    code: `#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DHT.h>

#define DHT_PIN 4
#define MOTION_PIN 13
#define BUZZER_PIN 15
#define LED_PIN 2

DHT dht(DHT_PIN, DHT22);
WiFiClient espClient;
PubSubClient mqtt(espClient);
StaticJsonDocument<512> doc;

struct SensorData {
  float temperature;
  float humidity;
  bool motionDetected;
  float lightLevel;
  unsigned long timestamp;
};

SensorData currentData;

void setup() {
  Serial.begin(115200);
  dht.begin();
  
  pinMode(MOTION_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  mqtt.setServer(MQTT_BROKER, 1883);
  mqtt.setCallback(onMessage);
  reconnectMQTT();
}

void loop() {
  if (!mqtt.connected()) reconnectMQTT();
  mqtt.loop();

  currentData.temperature = dht.readTemperature();
  currentData.humidity = dht.readHumidity();
  currentData.motionDetected = digitalRead(MOTION_PIN);
  currentData.lightLevel = analogRead(A0) / 4095.0;
  currentData.timestamp = millis();

  publishSensorData();
  delay(2000);
}

void publishSensorData() {
  doc.clear();
  doc["temp"] = currentData.temperature;
  doc["humidity"] = currentData.humidity;
  doc["motion"] = currentData.motionDetected;
  doc["light"] = currentData.lightLevel;
  doc["ts"] = currentData.timestamp;
  doc["device"] = "esp32-sensor-01";

  char buffer[512];
  serializeJson(doc, buffer);
  mqtt.publish("home/sensors/living-room", buffer);
}`,
  },
  {
    name: "pipeline.py",
    language: "python",
    code: `import asyncio
from typing import List, Optional
from pydantic import BaseModel
from fastapi import FastAPI, BackgroundTasks
from transformers import pipeline
import chromadb
import numpy as np

app = FastAPI(title="NEXUS AI Pipeline")

class InferenceRequest(BaseModel):
    text: str
    model: str = "llama3"
    temperature: float = 0.7
    max_tokens: int = 2048
    context_window: Optional[int] = 8192

class PipelineResult(BaseModel):
    output: str
    confidence: float
    tokens_used: int
    latency_ms: float
    model_version: str

class AIOrchestrator:
    def __init__(self):
        self.models = {}
        self.chroma = chromadb.PersistentClient(path="./data/vectors")
        self.collection = self.chroma.get_or_create_collection("pipeline")
        self.classifier = pipeline("zero-shot-classification")
        
    async def process(self, request: InferenceRequest) -> PipelineResult:
        import time
        start = time.perf_counter()
        
        # Retrieve relevant context
        context = self.collection.query(
            query_texts=[request.text],
            n_results=5,
        )
        
        # Classify intent
        labels = ["question", "command", "analysis", "creative"]
        classification = self.classifier(
            request.text, labels, multi_label=True
        )
        
        # Select optimal model
        model = self._select_model(classification["labels"][0])
        
        # Generate response
        response = await model.generate(
            prompt=request.text,
            context=context["documents"][0] if context["documents"] else [],
            temperature=request.temperature,
            max_tokens=request.max_tokens,
        )
        
        latency = (time.perf_counter() - start) * 1000
        
        # Store for future retrieval
        self.collection.add(
            documents=[response.text],
            metadatas=[{"source": "pipeline", "model": request.model}],
            ids=[f"resp_{int(time.time())}"],
        )
        
        return PipelineResult(
            output=response.text,
            confidence=response.confidence,
            tokens_used=response.usage.total_tokens,
            latency_ms=round(latency, 2),
            model_version=model.version,
        )

orchestrator = AIOrchestrator()

@app.post("/api/v1/infer", response_model=PipelineResult)
async def infer(request: InferenceRequest):
    return await orchestrator.process(request)`,
  },
  {
    name: "deploy.yaml",
    language: "typescript",
    code: `# docker-compose.yml - Production Deployment
version: "3.9"

services:
  nexus-api:
    build:
      context: .
      dockerfile: Dockerfile.api
    ports:
      - "8000:8000"
    environment:
      - OLLAMA_HOST=http://ollama:11434
      - CHROMA_HOST=http://chromadb:8001
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql://nexus:secret@postgres:5432/nexusdb
    depends_on:
      - ollama
      - chromadb
      - redis
      - postgres
    restart: always
    deploy:
      resources:
        limits:
          memory: 4G

  nexus-web:
    build:
      context: ./web
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://nexus-api:8000
    depends_on:
      - nexus-api

  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - capabilities: [gpu]

  chromadb:
    image: chromadb/chroma:latest
    ports:
      - "8001:8000"
    volumes:
      - chroma_data:/chroma/chroma

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: nexusdb
      POSTGRES_USER: nexus
      POSTGRES_PASSWORD: secret
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  ollama_data:
  chroma_data:
  redis_data:
  postgres_data:`,
  },
];

// Terminal demo commands
export const terminalCommands = [
  {
    input: "npx create-nexus-app my-project --template full-stack",
    output: [
      "🚀 Creating NEXUS project: my-project",
      "📦 Installing dependencies...",
      "✓ next@15.2 installed",
      "✓ react@19 installed",
      "✓ tailwindcss@4 installed",
      "✓ framer-motion@11 installed",
      "✓ prisma@6 installed",
    ],
    delay: 300,
  },
  {
    input: "cd my-project && npm run setup",
    output: [
      "🔧 Setting up database...",
      "✓ PostgreSQL connected",
      "✓ Prisma schema generated",
      "✓ Migrations applied",
      "✓ Seed data inserted",
    ],
    delay: 500,
  },
  {
    input: "docker-compose up -d",
    output: [
      "Creating network 'nexus_default'",
      "Creating nexus_redis_1      ... done",
      "Creating nexus_postgres_1   ... done",
      "Creating nexus_chromadb_1   ... done",
      "Creating nexus_ollama_1     ... done",
      "Creating nexus_api_1        ... done",
      "Creating nexus_web_1        ... done",
    ],
    delay: 500,
  },
  {
    input: "nexus health --all",
    output: [
      "┌───────────────┬─────────┬────────────┐",
      "│ Service       │ Status  │ Latency    │",
      "├───────────────┼─────────┼────────────┤",
      "│ API Server    │ ✅ UP   │ 12ms       │",
      "│ Ollama        │ ✅ UP   │ 45ms       │",
      "│ ChromaDB      │ ✅ UP   │ 8ms        │",
      "│ PostgreSQL    │ ✅ UP   │ 3ms        │",
      "│ Redis         │ ✅ UP   │ 1ms        │",
      "│ Web Dashboard │ ✅ UP   │ 15ms       │",
      "└───────────────┴─────────┴────────────┘",
      "",
      "🟢 All 6 services healthy. NEXUS is ready.",
    ],
    delay: 600,
  },
];

// Tech stack data with proficiency
export const fullTechStack = [
  // Frontend
  { name: "React", icon: "⚛️", category: "frontend", proficiency: 95, color: "#61dafb" },
  { name: "Next.js", icon: "▲", category: "frontend", proficiency: 95, color: "#ffffff" },
  { name: "TypeScript", icon: "🔷", category: "frontend", proficiency: 95, color: "#3178c6" },
  { name: "Tailwind", icon: "🎨", category: "frontend", proficiency: 93, color: "#06b6d4" },
  { name: "Framer Motion", icon: "🎬", category: "frontend", proficiency: 90, color: "#bb4bf7" },
  { name: "Flutter", icon: "💙", category: "frontend", proficiency: 88, color: "#02569b" },
  { name: "React Native", icon: "📱", category: "frontend", proficiency: 85, color: "#61dafb" },
  { name: "Electron", icon: "⚡", category: "frontend", proficiency: 82, color: "#47848f" },
  
  // Backend
  { name: "Node.js", icon: "💚", category: "backend", proficiency: 93, color: "#339933" },
  { name: "Python", icon: "🐍", category: "backend", proficiency: 92, color: "#3776ab" },
  { name: "FastAPI", icon: "⚡", category: "backend", proficiency: 90, color: "#009688" },
  { name: "GraphQL", icon: "◈", category: "backend", proficiency: 85, color: "#e10098" },
  { name: "Prisma", icon: "💎", category: "backend", proficiency: 88, color: "#2d3748" },
  { name: "Socket.IO", icon: "🔌", category: "backend", proficiency: 87, color: "#010101" },
  { name: "Dart", icon: "🎯", category: "backend", proficiency: 85, color: "#0175c2" },
  
  // AI & ML
  { name: "OpenAI", icon: "🤖", category: "ai", proficiency: 90, color: "#412991" },
  { name: "Ollama", icon: "🦙", category: "ai", proficiency: 88, color: "#ffffff" },
  { name: "YOLOv8", icon: "👁️", category: "ai", proficiency: 85, color: "#ff6f00" },
  { name: "ChromaDB", icon: "🧠", category: "ai", proficiency: 87, color: "#ff6b6b" },
  { name: "LangChain", icon: "🔗", category: "ai", proficiency: 85, color: "#1c3c3c" },
  { name: "Hugging Face", icon: "🤗", category: "ai", proficiency: 82, color: "#ff9d00" },
  
  // DevOps
  { name: "Docker", icon: "🐳", category: "devops", proficiency: 90, color: "#2496ed" },
  { name: "GitHub Actions", icon: "⚙️", category: "devops", proficiency: 88, color: "#2088ff" },
  { name: "Vercel", icon: "▲", category: "devops", proficiency: 92, color: "#ffffff" },
  { name: "Nginx", icon: "🌐", category: "devops", proficiency: 82, color: "#009639" },
  
  // Database
  { name: "PostgreSQL", icon: "🐘", category: "database", proficiency: 90, color: "#336791" },
  { name: "MongoDB", icon: "🍃", category: "database", proficiency: 87, color: "#47a248" },
  { name: "Firebase", icon: "🔥", category: "database", proficiency: 88, color: "#ffca28" },
  { name: "Redis", icon: "🔴", category: "database", proficiency: 85, color: "#dc382d" },
  { name: "DuckDB", icon: "🦆", category: "database", proficiency: 80, color: "#fff000" },
  
  // IoT
  { name: "ESP32", icon: "🔌", category: "iot", proficiency: 90, color: "#e7352c" },
  { name: "MQTT", icon: "📡", category: "iot", proficiency: 88, color: "#660066" },
  { name: "Arduino", icon: "🔧", category: "iot", proficiency: 85, color: "#00979d" },
];

// Orbit data for tech ecosystem
export const orbitItems = [
  { icon: "⚛️", label: "React", color: "#61dafb" },
  { icon: "🐍", label: "Python", color: "#3776ab" },
  { icon: "💙", label: "Flutter", color: "#02569b" },
  { icon: "🔌", label: "ESP32", color: "#e7352c" },
  { icon: "🤖", label: "AI", color: "#8b5cf6" },
  { icon: "🐳", label: "Docker", color: "#2496ed" },
  { icon: "🐘", label: "Postgres", color: "#336791" },
  { icon: "🔥", label: "Firebase", color: "#ffca28" },
  { icon: "📡", label: "MQTT", color: "#660066" },
  { icon: "🦙", label: "Ollama", color: "#ffffff" },
  { icon: "▲", label: "Next.js", color: "#ffffff" },
  { icon: "🎨", label: "Tailwind", color: "#06b6d4" },
];

// Donut chart data - Project distribution
export const projectDistribution = [
  { label: "AI & ML", value: 8, color: "#8b5cf6" },
  { label: "IoT", value: 9, color: "#06b6d4" },
  { label: "Full-Stack", value: 13, color: "#3b82f6" },
  { label: "FinTech", value: 4, color: "#10b981" },
  { label: "Enterprise", value: 5, color: "#64748b" },
  { label: "Health & Ed", value: 6, color: "#ec4899" },
  { label: "Mobile", value: 8, color: "#f59e0b" },
];

// Area chart - Growth data
export const growthData = [
  { label: "Jan", value: 5 },
  { label: "Mar", value: 10 },
  { label: "May", value: 16 },
  { label: "Jul", value: 22 },
  { label: "Sep", value: 30 },
  { label: "Nov", value: 38 },
  { label: "Jan", value: 42 },
  { label: "Mar", value: 48 },
  { label: "May", value: 53 },
];

// Comparison data
export const comparisonHeaders = ["Circuvent", "Agency A", "Freelancer"];
export const comparisonRows = [
  { feature: "Full-Stack Development", values: [true, true, false] },
  { feature: "AI/ML Integration", values: [true, false, false] },
  { feature: "IoT & Embedded", values: [true, false, false] },
  { feature: "Mobile (Flutter/RN)", values: [true, true, true] },
  { feature: "DevOps & Docker", values: [true, true, false] },
  { feature: "Open Source Portfolio", values: [true, false, false] },
  { feature: "Custom AI Agents", values: [true, false, false] },
  { feature: "Real-time MQTT", values: [true, false, false] },
  { feature: "Enterprise HRMS", values: [true, true, false] },
  { feature: "Local-First AI", values: [true, false, false] },
];

// FAQ data
export const faqItems = [
  {
    question: "What technologies do you specialize in?",
    answer: "We work across 15+ tech stacks including React/Next.js, Python/FastAPI, Flutter, ESP32/IoT, Docker, and AI/ML with Ollama, OpenAI, YOLOv8, and more. Our strength is building full systems that span from embedded hardware to cloud-deployed AI.",
  },
  {
    question: "Do you build custom AI solutions?",
    answer: "Yes! Our NEXUS AI OS features 13+ specialized agents running entirely on-device with zero cloud dependency. We build custom AI pipelines using Ollama for local inference, ChromaDB for vector storage, and LangChain for orchestration. From computer vision (YOLOv8) to NLP, we cover it all.",
  },
  {
    question: "Can you build IoT systems from scratch?",
    answer: "Absolutely. We engineer complete IoT ecosystems — from ESP32 firmware in C++ to MQTT communication protocols to Flutter mobile apps for device control. Our SmartHome system manages 9 sensors/actuators with sub-100ms latency via MQTT.",
  },
  {
    question: "What's your development process?",
    answer: "We follow an agile approach: 1) Discovery deep-dive, 2) Architecture design with optimal tech stack selection, 3) Weekly sprint iterations with continuous demos, 4) Docker-containerized deployment with CI/CD. Every project gets a GitHub repo, documentation, and production-grade deployment.",
  },
  {
    question: "Are your projects open source?",
    answer: "Yes, all 53+ projects are MIT-licensed and publicly available on GitHub. We believe in transparency and contributing to the open-source community. Browse our full portfolio at github.com/Hemakotibonthada.",
  },
  {
    question: "What about ongoing support and maintenance?",
    answer: "We provide continuous support including monitoring, security updates, performance optimization, and feature iterations. Our production apps maintain 99.5% uptime with automated health checks and zero-downtime deployments.",
  },
  {
    question: "How do you handle data privacy and security?",
    answer: "Security is core to our architecture. Our local-first AI approach means sensitive data never leaves your device. For cloud deployments, we implement end-to-end encryption, role-based access control, and follow OWASP security guidelines. All databases are encrypted at rest.",
  },
  {
    question: "Can you integrate with existing systems?",
    answer: "Yes. We build flexible APIs (REST + GraphQL) and support various integration patterns — webhooks, event-driven architectures, message queues (Redis), and real-time communication (WebSockets/MQTT). We've integrated with Stripe, Twilio, SendGrid, AWS services, and more.",
  },
];

// Pricing tiers
export const pricingTiers = [
  {
    name: "Starter",
    description: "Perfect for MVPs and proof of concepts",
    price: "$2,999",
    period: "project",
    highlighted: false,
    features: [
      { text: "Single-page web application", included: true },
      { text: "Responsive design (mobile-first)", included: true },
      { text: "Basic API integration", included: true },
      { text: "Docker deployment setup", included: true },
      { text: "GitHub repository + docs", included: true },
      { text: "AI/ML integration", included: false },
      { text: "IoT/embedded systems", included: false },
      { text: "Post-launch support", included: false },
    ],
    cta: "Start Project",
  },
  {
    name: "Professional",
    description: "Full-stack apps with AI & real-time features",
    price: "$9,999",
    period: "project",
    highlighted: true,
    badge: "Most Popular",
    features: [
      { text: "Multi-page full-stack app", included: true },
      { text: "Custom AI agent integration", included: true },
      { text: "Real-time features (WebSockets)", included: true },
      { text: "Database design + migrations", included: true },
      { text: "CI/CD + Docker Compose", included: true },
      { text: "Performance optimization", included: true },
      { text: "30-day post-launch support", included: true },
      { text: "Mobile app (Flutter/RN)", included: false },
    ],
    cta: "Get Started",
  },
  {
    name: "Enterprise",
    description: "Complete systems with IoT, AI & mobile",
    price: "Custom",
    period: "",
    highlighted: false,
    features: [
      { text: "Everything in Professional", included: true },
      { text: "Mobile app (Flutter/RN)", included: true },
      { text: "IoT & embedded systems", included: true },
      { text: "Multi-agent AI orchestration", included: true },
      { text: "Custom hardware integration", included: true },
      { text: "Enterprise SSO + RBAC", included: true },
      { text: "90-day post-launch support", included: true },
      { text: "SLA & dedicated channel", included: true },
    ],
    cta: "Contact Us",
  },
];

// Horizontal timeline data
export const timelineEvents = [
  {
    date: "Jan 2023",
    title: "The First Circuit",
    description: "A single ESP32 blinking an LED. The project that started it all — from this tiny spark, Circuvent Technologies was born. We began exploring the intersection of hardware and software.",
    icon: "🔌",
    color: "#06b6d4",
    tags: ["ESP32", "Arduino", "Embedded"],
  },
  {
    date: "Jun 2023",
    title: "IoT Ecosystem",
    description: "Expanded to 8 projects with SmartHome Flutter app, Firebase MQTT integration, and Alexa voice control. Our first real production system serving actual users.",
    icon: "🏠",
    color: "#10b981",
    tags: ["Flutter", "Firebase", "MQTT", "Alexa"],
  },
  {
    date: "Dec 2023",
    title: "Full-Stack Mastery",
    description: "Built complete web platforms including e-commerce, portfolio systems, and real-time collaboration tools. Mastered the React/Next.js/Node.js/PostgreSQL stack.",
    icon: "🌐",
    color: "#3b82f6",
    tags: ["React", "Next.js", "PostgreSQL", "Node.js"],
  },
  {
    date: "Mar 2024",
    title: "AI Revolution",
    description: "Launched CancerGuard AI with 94.2% accuracy and built our first AI agents using Ollama for 100% local inference. Zero cloud dependency, maximum privacy.",
    icon: "🧠",
    color: "#8b5cf6",
    tags: ["Ollama", "YOLOv8", "ChromaDB", "LangChain"],
  },
  {
    date: "Sep 2024",
    title: "Enterprise & FinTech",
    description: "Built HT Connect HRMS replacing Keka + Jira, and launched algorithmic trading platforms with NPU-accelerated inference. Enterprise-grade systems at scale.",
    icon: "🏢",
    color: "#f59e0b",
    tags: ["HRMS", "FinTech", "Trading", "Enterprise"],
  },
  {
    date: "Jan 2025",
    title: "NEXUS AI OS",
    description: "Our magnum opus: 13-agent local-first AI operating system. Personal, financial, health, and home agents — all running on-device. The future of personal AI.",
    icon: "🚀",
    color: "#ec4899",
    tags: ["Multi-Agent", "Local AI", "NEXUS", "13 Agents"],
  },
  {
    date: "Mar 2026",
    title: "53+ Projects",
    description: "200K+ lines of code, 8 production apps, 15+ tech stacks mastered, and a thriving open-source portfolio. The journey continues with new frontiers in AI, IoT, and beyond.",
    icon: "✨",
    color: "#f97316",
    tags: ["200K+ LoC", "53+ Projects", "Open Source"],
  },
];

// Bento grid items
export const bentoItems = [
  {
    title: "AI-First Architecture",
    description: "Every system we build is designed with AI integration in mind — from embedded inference to cloud-scale ML pipelines.",
    gradient: "from-violet-500/10 to-purple-500/5",
    span: "2x1" as const,
    stats: [{ label: "AI Agents", value: "13+" }, { label: "Local Models", value: "8" }],
  },
  {
    title: "Real-Time IoT",
    description: "Sub-100ms MQTT messaging across ESP32 sensor networks.",
    gradient: "from-cyan-500/10 to-teal-500/5",
    span: "1x1" as const,
    stats: [{ label: "Devices", value: "9+" }],
  },
  {
    title: "Full-Stack Mastery",
    description: "React, Next.js, Flutter, Python — spanning every layer.",
    gradient: "from-blue-500/10 to-indigo-500/5",
    span: "1x1" as const,
    stats: [{ label: "Stacks", value: "15+" }],
  },
  {
    title: "Open Source",
    description: "All projects MIT-licensed. Transparent code, community-driven development.",
    gradient: "from-emerald-500/10 to-green-500/5",
    span: "1x1" as const,
    stats: [{ label: "Repos", value: "53+" }],
  },
  {
    title: "DevOps Excellence",
    description: "Docker Compose, CI/CD, zero-downtime deployments. Production-grade from day one.",
    gradient: "from-amber-500/10 to-orange-500/5",
    span: "1x1" as const,
    stats: [{ label: "Uptime", value: "99.5%" }],
  },
  {
    title: "Privacy-First",
    description: "Local-first AI means your data never leaves your device. Complete data sovereignty.",
    gradient: "from-pink-500/10 to-rose-500/5",
    span: "2x1" as const,
    stats: [{ label: "Cloud Dep.", value: "Zero" }, { label: "Encryption", value: "E2E" }],
  },
];

// Testimonials for masonry
export const masonryTestimonials = [
  {
    name: "Hema Koteswar Naidu",
    role: "Founder & CEO",
    company: "Circuvent Technologies",
    avatar: "🧑‍💻",
    content: "We built our entire IoT monitoring platform in 6 weeks. The ESP32 firmware, MQTT backend, and Flutter dashboard work flawlessly. Sub-100ms sensor updates — exactly what our clients needed.",
    rating: 5,
    featured: true,
  },
  {
    name: "Chiru Kotcherla",
    role: "Co-Founder & Marketing Director",
    company: "Circuvent Technologies",
    avatar: "👨‍💼",
    content: "Our algorithmic trading platform handles real-time market data with NPU-accelerated inference. The architecture is enterprise-grade — built for scale from day one.",
    rating: 5,
    featured: true,
  },
  {
    name: "Hema Koteswar Naidu",
    role: "Founder & CEO",
    company: "Circuvent Technologies",
    avatar: "🧑‍💼",
    content: "The local-first AI approach is genuinely innovative. NEXUS runs 13 agents on-device with zero cloud dependency. Privacy without compromising capability.",
    rating: 5,
  },
  {
    name: "Vijay Pithani",
    role: "Co-Founder & Head of Electronics",
    company: "Circuvent Technologies",
    avatar: "🧑‍🔧",
    content: "From ESP32 sensor design to cloud analytics dashboard — we delivered an end-to-end solution. The MQTT + Firebase architecture scales beautifully.",
    rating: 5,
  },
  {
    name: "Hema Koteswar Naidu",
    role: "Founder & CEO",
    company: "Circuvent Technologies",
    avatar: "👨‍💻",
    content: "We replaced traditional HR tools with a single HRMS platform. Saved thousands in SaaS costs. The system handles everything from attendance to project management.",
    rating: 5,
  },
  {
    name: "Chiru Kotcherla",
    role: "Co-Founder & Marketing Director",
    company: "Circuvent Technologies",
    avatar: "👨‍🏫",
    content: "Outstanding full-stack work. The React/Next.js frontend is buttery smooth (95+ Lighthouse score), and the FastAPI backend handles 10K+ concurrent requests.",
    rating: 5,
  },
];

// Heat map data for activity (deterministic — derived from the weekday/work-hour profile)
export function generateHeatMapData() {
  const rows = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const cols = ["6am", "8am", "10am", "12pm", "2pm", "4pm", "6pm", "8pm", "10pm"];
  const data = [];

  for (const row of rows) {
    for (const col of cols) {
      const isWeekday = !["Sat", "Sun"].includes(row);
      const isWorkHours = ["10am", "12pm", "2pm", "4pm"].includes(col);
      const base = isWeekday && isWorkHours ? 60 : isWeekday ? 30 : 15;
      const ramp = Math.round((cols.indexOf(col) / (cols.length - 1)) * 30);
      data.push({
        row,
        col,
        value: base + ramp,
      });
    }
  }

  return { data, rows, cols };
}

// Tree map data
export const treeMapData = [
  { label: "TypeScript", value: 90000, color: "#3178c6" },
  { label: "Python", value: 35000, color: "#3776ab" },
  { label: "Dart", value: 25000, color: "#0175c2" },
  { label: "C++", value: 16000, color: "#00599c" },
  { label: "CSS", value: 12000, color: "#264de4" },
  { label: "YAML", value: 8000, color: "#cb171e" },
  { label: "SQL", value: 5000, color: "#336791" },
  { label: "Bash", value: 3000, color: "#4eaa25" },
  { label: "HTML", value: 6000, color: "#e34c26" },
];
