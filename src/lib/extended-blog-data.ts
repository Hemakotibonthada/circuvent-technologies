/**
 * Extended Blog Post Data
 * 
 * Additional in-depth technical articles covering advanced topics
 * to complement the main blog-data.ts file.
 */

import type { BlogPost } from "./blog-data";

export const extendedBlogPosts: BlogPost[] = [
  {
    slug: "prisma-postgresql-schema-evolution",
    title: "Prisma + PostgreSQL: Managing Schema Evolution Across 7 Projects",
    excerpt:
      "Practical strategies for database schema evolution using Prisma ORM — from initial design to migration management across 7 production PostgreSQL databases.",
    content: `
## Schema Design Philosophy

When you're managing 7+ PostgreSQL databases across different projects (HT Connect, EduKanban, App Builder, etc.), consistent schema design patterns become essential.

### Our Prisma Schema Standards

Every Prisma schema in our codebase follows these conventions:

\`\`\`prisma
// Standard model template
model Entity {
  id        String   @id @default(cuid())
  // Business fields go here
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime? // Soft delete
  
  // Relations
  createdBy   User?   @relation("EntityCreatedBy", fields: [createdById], references: [id])
  createdById String?
  
  @@index([createdAt])
  @@index([deletedAt])
}
\`\`\`

### Key Decisions

**1. CUID over UUID**

We chose CUIDs (Collision-resistant Unique Identifiers) over UUIDs for primary keys:
- Sortable by creation time (CUIDs have a timestamp component)
- URL-safe (no hyphens)
- Shorter than UUIDs (25 chars vs 36)
- Collision-resistant without coordination

**2. Soft Deletes Everywhere**

Every model has a \`deletedAt\` field. We never hard-delete records. This provides:
- Complete audit trail
- "Undo" functionality
- Data recovery capability
- Compliance with data retention policies

\`\`\`typescript
// Prisma middleware for soft deletes
prisma.$use(async (params, next) => {
  if (params.action === 'delete') {
    params.action = 'update';
    params.args.data = { deletedAt: new Date() };
  }
  if (params.action === 'findMany') {
    params.args.where = {
      ...params.args.where,
      deletedAt: null,
    };
  }
  return next(params);
});
\`\`\`

**3. JSON Columns for Flexible Data**

For fields that don't need individual querying (settings, metadata, preferences), we use JSON columns:

\`\`\`prisma
model User {
  id          String @id @default(cuid())
  email       String @unique
  preferences Json   @default("{}")
  metadata    Json   @default("{}")
}
\`\`\`

### Migration Strategy

For production databases, we follow this migration workflow:

1. Modify Prisma schema
2. Generate migration: \`prisma migrate dev --name descriptive_name\`
3. Review generated SQL
4. Test on staging database
5. Apply to production: \`prisma migrate deploy\`
6. Verify with \`prisma db pull\` comparison

### Performance Patterns

**Composite Indexes**

\`\`\`prisma
model Task {
  id         String     @id @default(cuid())
  status     TaskStatus
  assigneeId String?
  sprintId   String?
  createdAt  DateTime   @default(now())
  
  @@index([status, assigneeId]) // Most common query pattern
  @@index([sprintId, status])   // Sprint board queries
}
\`\`\`

**Connection Pooling**

\`\`\`typescript
// prisma/client.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
\`\`\`

### Lessons from 7 Databases

1. **Always add indexes** for foreign keys and frequently queried fields
2. **Use enums** for status fields — they're type-safe and performant
3. **JSON columns** are great for flexible data but terrible for querying
4. **Seed data** should be idempotent — run it 100 times, same result
5. **Name migrations** descriptively — \`add_employee_department_relation\` not \`migration_001\`
6. **Test migrations** on a copy of production data before deploying
7. **Monitor query performance** with Prisma's query logging in development
    `,
    author: "Harsha Bonthada",
    authorAvatar: "🧑‍💻",
    authorRole: "Founder & Lead Engineer",
    date: "2025-09-15",
    readTime: "7 min read",
    category: "Engineering",
    tags: ["Prisma", "PostgreSQL", "Database", "Schema Design", "ORM"],
    featured: false,
    coverGradient: "from-blue-500 via-indigo-500 to-violet-500",
    icon: "Layers",
  },
  {
    slug: "mqtt-topic-design-patterns",
    title: "MQTT Topic Design Patterns for IoT at Scale",
    excerpt:
      "How we designed hierarchical MQTT topic architectures that manage 9+ IoT devices across multiple rooms with automatic discovery, health monitoring, and OTA updates.",
    content: `
## The MQTT Topic Architecture

MQTT (Message Queuing Telemetry Transport) is the backbone of our IoT communication. But the quality of your MQTT implementation depends heavily on your topic design.

### Our Topic Hierarchy

\`\`\`
home/{room}/{device}/{action}
home/{room}/{device}/status
home/{room}/sensors/{type}
home/system/ota/{device_id}
home/system/health/{device_id}
home/system/discovery
\`\`\`

### Design Principles

**1. Hierarchical Structure**

Topics should be hierarchical, allowing wildcard subscriptions:

\`\`\`
home/living_room/light_1/toggle    → Control a specific light
home/living_room/+/status          → All device statuses in living room
home/+/+/status                    → All device statuses in all rooms
home/system/#                      → All system messages
\`\`\`

**2. Action vs. State Separation**

Never combine commands and status in the same topic:

\`\`\`
// Command topics (sent TO devices)
home/bedroom/fan_1/set          → {"speed": 3, "oscillate": true}
home/bedroom/fan_1/toggle       → no payload needed

// Status topics (sent FROM devices)
home/bedroom/fan_1/status       → {"speed": 3, "on": true, "uptime": 3600}
\`\`\`

**3. QoS Level Strategy**

\`\`\`
QoS 0 (At most once):  Sensor data, periodic status updates
QoS 1 (At least once): Device commands, OTA triggers
QoS 2 (Exactly once):  Safety-critical commands (gas valve, door locks)
\`\`\`

### Device Discovery Protocol

New devices announce themselves via the discovery topic:

\`\`\`cpp
void announceDevice() {
    StaticJsonDocument<256> doc;
    doc["device_id"] = DEVICE_ID;
    doc["room"] = DEVICE_ROOM;
    doc["type"] = DEVICE_TYPE;
    doc["firmware"] = FIRMWARE_VERSION;
    doc["ip"] = WiFi.localIP().toString();
    doc["capabilities"] = capabilities; // ["relay", "temp", "motion"]
    
    char buffer[256];
    serializeJson(doc, buffer);
    
    mqtt.publish("home/system/discovery", buffer, true); // Retained message
}
\`\`\`

The subscriber (Flutter app, React dashboard) listens to \`home/system/discovery\` and automatically adds new devices to the UI.

### Health Monitoring

Every device publishes a health heartbeat every 30 seconds:

\`\`\`cpp
void publishHealthStatus() {
    StaticJsonDocument<256> doc;
    doc["device_id"] = DEVICE_ID;
    doc["uptime"] = millis() / 1000;
    doc["free_heap"] = ESP.getFreeHeap();
    doc["wifi_rssi"] = WiFi.RSSI();
    doc["mqtt_connected"] = mqtt.connected();
    doc["firmware"] = FIRMWARE_VERSION;
    doc["temperature"] = readInternalTemp();
    
    char buffer[256];
    serializeJson(doc, buffer);
    
    mqtt.publish(
        ("home/system/health/" + String(DEVICE_ID)).c_str(),
        buffer
    );
}
\`\`\`

The monitoring dashboard alerts if a device misses 3 consecutive heartbeats (90 seconds without a signal).

### Retained Messages

We use retained messages for:
- Device discovery announcements
- Device status (last known state)
- System configuration

This means new subscribers immediately get the current state, not just future updates.

### Security Considerations

\`\`\`
# Mosquitto ACL Configuration
user esp32_living_room
topic readwrite home/living_room/#
topic read home/system/ota/esp32_living_room
topic write home/system/health/esp32_living_room
topic write home/system/discovery

user flutter_app
topic readwrite home/#
topic read home/system/#
\`\`\`

Each ESP32 device only has read/write access to its own room, plus system topics. The Flutter app has full access.

### Performance Metrics

After 12 months of operation:
- **Average message latency**: 23ms (local network)
- **Messages per day**: ~50,000 (9 devices, 30s intervals + commands)
- **Broker uptime**: 99.8%
- **Longest downtime**: 4 minutes (during router restart)
- **Storage for retained messages**: 2.3MB

### Common Pitfalls

1. **Don't use leading slashes**: \`/home/room\` creates an empty first level
2. **Don't put device IDs in the topic structure** — use room/device names instead
3. **Don't subscribe to \`#\`** from embedded devices — it floods the memory
4. **Do use retained messages** for status — new subscribers need current state
5. **Do implement Last Will and Testament** — devices that disconnect unexpectedly should publish an offline status
    `,
    author: "Harsha Bonthada",
    authorAvatar: "🧑‍💻",
    authorRole: "Founder & Lead Engineer",
    date: "2025-08-20",
    readTime: "9 min read",
    category: "IoT",
    tags: ["MQTT", "IoT", "ESP32", "Protocol Design", "Smart Home"],
    featured: false,
    coverGradient: "from-cyan-500 via-teal-500 to-emerald-500",
    icon: "Cpu",
  },
  {
    slug: "tauri-vs-electron-desktop-apps",
    title: "Tauri 2.0 vs Electron: Building CITADEL's Desktop Trading UI",
    excerpt:
      "Why we chose Tauri 2.0 over Electron for our algorithmic trading platform — performance benchmarks, Rust integration, and real-world trade-offs.",
    content: `
## The Desktop Framework Decision

For CITADEL — our multi-agent algorithmic trading platform — we needed a desktop UI framework that could:
- Render real-time market data at 60fps
- Handle DuckDB/Arrow data without serialization overhead
- Keep memory usage under 200MB
- Support native system tray and notifications

### Why Not Electron?

We love Electron — JARVIS AI runs on it. But for a trading platform:

| Criteria | Electron | Tauri 2.0 |
|----------|----------|-----------|
| Binary Size | 120MB+ | 5-8MB |
| Memory (idle) | 150MB | 30MB |
| Startup Time | 3-5s | 0.5-1s |
| IPC Overhead | High (JSON) | Low (serde) |
| Rust Integration | FFI/NAPI | Native |
| Auto-update | electron-updater | Built-in |

### Tauri 2.0 Architecture

\`\`\`
┌─────────────────────────────────┐
│      React 19 Frontend          │
│    (TypeScript + TanStack)      │
├─────────────────────────────────┤
│      Tauri WebView (WRY)        │
│    ┌───────────────────────┐    │
│    │   WebView2 (Windows)  │    │
│    │   WebKitGTK (Linux)   │    │
│    │   WKWebView (macOS)   │    │
│    └───────────────────────┘    │
├─────────────────────────────────┤
│      Rust Backend               │
│   ┌─────────┬─────────────┐    │
│   │ DuckDB  │ Arrow IPC   │    │
│   ├─────────┼─────────────┤    │
│   │ Trading │ Risk Guard  │    │
│   │ Engine  │             │    │
│   ├─────────┼─────────────┤    │
│   │ OpenVINO│ Model Mgr   │    │
│   └─────────┴─────────────┘    │
└─────────────────────────────────┘
\`\`\`

### Tauri Commands (Rust → JS Bridge)

\`\`\`rust
#[tauri::command]
async fn get_portfolio_summary(
    state: State<'_, AppState>
) -> Result<PortfolioSummary, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    
    let summary = conn.execute(
        "SELECT 
            COUNT(*) as total_positions,
            SUM(current_value) as total_value,
            SUM(unrealized_pnl) as total_pnl,
            AVG(weight) as avg_position_weight
         FROM positions WHERE status = 'OPEN'"
    ).map_err(|e| e.to_string())?;
    
    Ok(PortfolioSummary::from_row(summary))
}

#[tauri::command]
async fn execute_trade(
    state: State<'_, AppState>,
    order: TradeOrder
) -> Result<TradeResult, String> {
    // Validate through risk guard
    let risk_check = state.risk_guard.validate(&order)?;
    if !risk_check.approved {
        return Err(format!("Risk guard rejected: {}", risk_check.reason));
    }
    
    // Execute through broker adapter
    let result = state.broker.execute(order).await?;
    
    // Log to DuckDB
    state.db.lock()?.execute(
        "INSERT INTO trade_log VALUES (?, ?, ?, ?, ?, ?)",
        &[&result.id, &result.symbol, &result.side, 
          &result.quantity, &result.price, &result.timestamp]
    )?;
    
    Ok(result)
}
\`\`\`

### Performance Benchmarks

Testing on Intel Core i7-12700H, 16GB RAM:

\`\`\`
Metric                    Electron    Tauri 2.0
──────────────────────────────────────────────
Cold startup              4.2s        0.8s      (5.2x faster)
Memory (idle)             168MB       32MB      (5.2x less)
Memory (1000 candles)     245MB       58MB      (4.2x less)
IPC roundtrip             2.1ms       0.15ms    (14x faster)
Chart render (60fps)      42fps       60fps     (stable)
Binary size               142MB       7.2MB     (19.7x smaller)
\`\`\`

### Trade-offs

**Tauri Advantages:**
- Rust backend gives us zero-cost DuckDB integration
- 5x less memory means more headroom for ML models
- Sub-ms IPC is critical for real-time trading data
- Tiny binary size (7MB vs 142MB)

**Electron Advantages:**
- Chromium DevTools for debugging
- Larger ecosystem and community
- Cross-platform consistency (same engine everywhere)
- Node.js npm ecosystem access

### Our Verdict

For CITADEL specifically, Tauri was the clear winner. The Rust backend gives us native DuckDB/Arrow integration without serialization overhead, which is essential for a trading platform processing thousands of market data points per second.

For simpler desktop apps (like JARVIS), Electron remains a great choice — the ecosystem maturity and developer experience are hard to beat.
    `,
    author: "Harsha Bonthada",
    authorAvatar: "🧑‍💻",
    authorRole: "Founder & Lead Engineer",
    date: "2025-08-01",
    readTime: "8 min read",
    category: "Engineering",
    tags: ["Tauri", "Electron", "Rust", "Desktop Apps", "Trading"],
    featured: false,
    coverGradient: "from-red-500 via-rose-500 to-pink-500",
    icon: "Shield",
  },
  {
    slug: "chromadb-rag-pipelines-production",
    title: "ChromaDB RAG Pipelines in Production: Lessons from NEXUS AI OS",
    excerpt:
      "Building production-grade RAG (Retrieval-Augmented Generation) pipelines with ChromaDB — from chunk sizing to embedding strategies to query optimization.",
    content: `
## RAG in NEXUS AI OS

Retrieval-Augmented Generation (RAG) is the backbone of NEXUS AI OS's memory system. Instead of fine-tuning models on user data (expensive, slow, privacy concerns), we retrieve relevant context at query time.

### Our RAG Architecture

\`\`\`
User Query → Embedding (nomic-embed-text via Ollama)
     → ChromaDB Similarity Search (top-k=5)
          → Context Injection into Prompt
               → LLM Inference (Llama 3.1)
                    → Response with Citations
\`\`\`

### ChromaDB Setup

\`\`\`python
import chromadb
from chromadb.config import Settings

class MemoryStore:
    def __init__(self, persist_dir: str = "./chroma_data"):
        self.client = chromadb.PersistentClient(
            path=persist_dir,
            settings=Settings(
                anonymized_telemetry=False,
                allow_reset=True
            )
        )
        
        # Separate collections per agent domain
        self.collections = {
            "personal": self.client.get_or_create_collection(
                name="personal_memory",
                metadata={"hnsw:space": "cosine"}
            ),
            "financial": self.client.get_or_create_collection(
                name="financial_data",
                metadata={"hnsw:space": "cosine"}
            ),
            "health": self.client.get_or_create_collection(
                name="health_records",
                metadata={"hnsw:space": "cosine"}
            ),
            "code": self.client.get_or_create_collection(
                name="code_knowledge",
                metadata={"hnsw:space": "cosine"}
            ),
        }
\`\`\`

### Chunking Strategy

The #1 factor affecting RAG quality is chunk size. Too small = no context. Too large = noise.

\`\`\`python
class SmartChunker:
    def __init__(
        self,
        chunk_size: int = 512,
        chunk_overlap: int = 50,
        separators: list[str] = None
    ):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.separators = separators or [
            "\\n\\n",   # Paragraph breaks
            "\\n",     # Line breaks
            ". ",     # Sentences
            " ",      # Words
        ]
    
    def chunk(self, text: str) -> list[str]:
        chunks = []
        current = ""
        
        # Split by most significant separator first
        for sep in self.separators:
            if sep in text:
                parts = text.split(sep)
                for part in parts:
                    if len(current) + len(part) <= self.chunk_size:
                        current += part + sep
                    else:
                        if current:
                            chunks.append(current.strip())
                        current = part + sep
                break
        
        if current:
            chunks.append(current.strip())
        
        # Add overlap
        overlapped = []
        for i, chunk in enumerate(chunks):
            if i > 0:
                overlap = chunks[i-1][-self.chunk_overlap:]
                chunk = overlap + chunk
            overlapped.append(chunk)
        
        return overlapped
\`\`\`

### Our Chunk Size Analysis

We tested different chunk sizes on a 50-document knowledge base:

| Chunk Size | Retrieval Precision | Context Relevance | LLM Answer Quality |
|-----------|--------------------|--------------------|-------------------|
| 128 tokens | 82% | Low (missing context) | 3.2/5 |
| 256 tokens | 89% | Medium | 3.8/5 |
| 512 tokens | 93% | High | 4.4/5 (our choice) |
| 1024 tokens | 88% | Very High (noisy) | 4.1/5 |
| 2048 tokens | 79% | Too much noise | 3.5/5 |

512 tokens with 50-token overlap gave us the best balance of precision and context.

### Embedding Strategy

We use Ollama's nomic-embed-text model for local embeddings:

\`\`\`python
import requests

def get_embedding(text: str) -> list[float]:
    response = requests.post(
        "http://localhost:11434/api/embeddings",
        json={
            "model": "nomic-embed-text",
            "prompt": text
        }
    )
    return response.json()["embedding"]
\`\`\`

### Query Optimization

For better retrieval, we rewrite user queries before searching:

\`\`\`python
async def enhanced_search(
    self,
    query: str,
    collection_name: str,
    n_results: int = 5
) -> list[dict]:
    # Step 1: Expand query with LLM
    expanded = await self.llm.generate(
        f"Rewrite this search query with synonyms and related terms: {query}"
    )
    
    # Step 2: Search with both original and expanded
    results_original = self.collections[collection_name].query(
        query_texts=[query],
        n_results=n_results
    )
    results_expanded = self.collections[collection_name].query(
        query_texts=[expanded],
        n_results=n_results
    )
    
    # Step 3: Merge and deduplicate, preferring original matches
    merged = self.merge_results(results_original, results_expanded)
    
    return merged[:n_results]
\`\`\`

### Production Metrics

After 6 months of operation:
- **Collection sizes**: ~5,000 documents across 4 collections
- **Query latency**: 45ms average (embedding + search)
- **Retrieval precision**: 91% (relevant in top-5)
- **Storage**: 1.8GB on disk
- **Embedding speed**: 12ms per chunk (nomic-embed-text)

### Key Learnings

1. **Separate collections per domain** — mixing financial and health data hurts retrieval quality
2. **512 tokens is the sweet spot** for general-purpose documents
3. **Query expansion improves results by ~15%** but doubles latency
4. **Cosine similarity outperforms L2 distance** for text embeddings
5. **Regular re-indexing** when source documents change significantly
6. **Metadata filtering** (date ranges, categories) reduces noise dramatically
    `,
    author: "Harsha Bonthada",
    authorAvatar: "🧑‍💻",
    authorRole: "Founder & Lead Engineer",
    date: "2025-07-10",
    readTime: "10 min read",
    category: "AI & ML",
    tags: ["RAG", "ChromaDB", "Embeddings", "LLM", "Vector Database"],
    featured: false,
    coverGradient: "from-violet-600 via-purple-600 to-indigo-600",
    icon: "Brain",
  },
  {
    slug: "nextjs-16-app-router-migration",
    title: "Migrating to Next.js 16: App Router, React 19, and Turbopack",
    excerpt:
      "Our experience migrating 8 Next.js projects to version 16 — from Pages Router to App Router, React Server Components, and the Turbopack bundler.",
    content: `
## The Next.js 16 Migration

When Next.js 16 landed with stable Turbopack, React 19 integration, and mature App Router APIs, we decided to migrate all 8 Next.js projects. Here's what we learned.

### Migration Checklist

1. Update dependencies (\`next@16\`, \`react@19\`, \`react-dom@19\`)
2. Convert Pages Router (\`pages/\`) to App Router (\`app/\`)
3. Move API routes from \`pages/api/\` to \`app/api/route.ts\`
4. Replace \`getServerSideProps\` / \`getStaticProps\` with async components
5. Add \`"use client"\` directives to interactive components
6. Update middleware and layout patterns
7. Configure Turbopack for development

### Key Differences

**Before (Pages Router):**
\`\`\`typescript
// pages/projects.tsx
export async function getStaticProps() {
  const projects = await fetchProjects();
  return { props: { projects }, revalidate: 3600 };
}

export default function ProjectsPage({ projects }) {
  return <ProjectList projects={projects} />;
}
\`\`\`

**After (App Router):**
\`\`\`typescript
// app/projects/page.tsx
export const revalidate = 3600;

export default async function ProjectsPage() {
  const projects = await fetchProjects(); // Direct async in component
  return <ProjectList projects={projects} />;
}
\`\`\`

### React Server Components

The biggest paradigm shift: components are server-rendered by default. Only add \`"use client"\` when you need:
- useState, useEffect, useRef
- Event handlers (onClick, onChange)
- Browser-only APIs
- Third-party client libraries

Our rule: **Keep pages as Server Components, push client code to leaf components.**

### Turbopack Performance

Development server comparison:

| Metric | Webpack | Turbopack |
|--------|---------|-----------|
| Cold start | 8.2s | 2.1s |
| HMR (small change) | 450ms | 80ms |
| HMR (large change) | 2.3s | 350ms |
| Memory usage | 650MB | 280MB |

Turbopack is genuinely transformative for development speed.

### Migration Pain Points

1. **Third-party libraries**: Many UI libraries weren't ready for RSC. Had to wrap them in client components.
2. **Layout nesting**: The new nested layout system required restructuring our component hierarchy.
3. **Metadata API**: Moving from \`Head\` component to \`export const metadata\` object.
4. **Loading states**: New \`loading.tsx\` convention required designing loading skeletons.
5. **Error boundaries**: \`error.tsx\` convention needed careful error handling design.

### Results

After migrating all 8 projects:
- **42% faster development** (Turbopack HMR)
- **31% smaller bundles** (server components)
- **28% better Core Web Vitals** (less client JS)
- **Zero regressions** in functionality

The migration took 2 weeks across 8 projects. Worth every minute.
    `,
    author: "Harsha Bonthada",
    authorAvatar: "🧑‍💻",
    authorRole: "Founder & Lead Engineer",
    date: "2026-02-20",
    readTime: "7 min read",
    category: "Engineering",
    tags: ["Next.js", "React 19", "App Router", "Turbopack", "Migration"],
    featured: false,
    coverGradient: "from-gray-600 via-slate-600 to-zinc-600",
    icon: "Layers",
  },
];

/**
 * Merge extended blog posts with the main blog data
 */
export function getAllBlogPosts(): BlogPost[] {
  // Import main posts lazily to avoid circular deps
  const { blogPosts: mainPosts } = require("./blog-data");
  return [...mainPosts, ...extendedBlogPosts].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}
