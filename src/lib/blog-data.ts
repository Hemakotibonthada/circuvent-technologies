export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  author: string;
  authorAvatar: string;
  authorRole: string;
  date: string;
  readTime: string;
  category: string;
  tags: string[];
  featured: boolean;
  coverGradient: string;
  icon: string;
}

export const BLOG_CATEGORIES = [
  "All",
  "Engineering",
  "AI & ML",
  "IoT",
  "Architecture",
  "DevOps",
  "Open Source",
  "Company",
] as const;

export type BlogCategory = (typeof BLOG_CATEGORIES)[number];

export const blogPosts: BlogPost[] = [
  {
    slug: "building-nexus-ai-os-architecture",
    title: "Building NEXUS AI OS: Architecture of a 13-Agent Local AI System",
    excerpt:
      "Deep dive into the architecture behind NEXUS AI OS — how we orchestrate 13+ specialized AI agents running entirely on-device with Ollama, ChromaDB, and a custom IPC bus.",
    content: `
## The Vision

When we set out to build NEXUS AI OS, the goal was audacious: create an AI operating system that runs entirely on your machine — no cloud dependency, no data leaving your device, and no subscription fees. Just pure, local intelligence.

### Why Local-First?

The AI landscape in 2025-2026 is dominated by cloud APIs. OpenAI, Anthropic, Google — they all require sending your data to remote servers. For many use cases, this is fine. But for a *personal AI operating system* that handles your finances, health data, home automation, and private documents? Cloud dependency is a non-starter.

Our philosophy: **Your data, your hardware, your AI.**

## The Architecture

NEXUS AI OS is built around a multi-agent orchestration system. Each agent is a specialized module that handles a specific domain:

### Agent Registry

\`\`\`python
AGENT_REGISTRY = {
    "personal_assistant": PersonalAgent,
    "financial_advisor": FinancialAgent,
    "health_monitor": HealthAgent,
    "home_controller": HomeAgent,
    "code_assistant": CodeAgent,
    "research_analyst": ResearchAgent,
    "calendar_manager": CalendarAgent,
    "email_handler": EmailAgent,
    "file_organizer": FileAgent,
    "security_guardian": SecurityAgent,
    "learning_tutor": LearningAgent,
    "social_coordinator": SocialAgent,
    "orchestrator": OrchestratorAgent,
}
\`\`\`

### The Orchestrator Pattern

The Orchestrator agent is the brain. It receives all user queries, classifies intent, and routes to the appropriate specialized agent. But here's the key innovation: agents can **collaborate**.

When you say "Schedule a meeting with my doctor next week and remind me to fast 12 hours before," the Orchestrator:

1. Routes to CalendarAgent for scheduling
2. Sends context to HealthAgent for medical context
3. Creates a reminder via PersonalAgent
4. All three agents share context through our IPC bus

### Inter-Process Communication

We use a custom IPC (Inter-Process Communication) bus built on Redis Pub/Sub and shared SQLite databases:

\`\`\`python
class AgentIPCBus:
    def __init__(self):
        self.redis = Redis(host='localhost', port=6379)
        self.context_db = ChromaDB(path='./agent_contexts')
    
    async def send_message(self, from_agent: str, to_agent: str, payload: dict):
        message = AgentMessage(
            sender=from_agent,
            receiver=to_agent,
            payload=payload,
            timestamp=datetime.utcnow(),
            correlation_id=uuid4()
        )
        await self.redis.publish(f"agent:{to_agent}", message.json())
        
    async def broadcast(self, from_agent: str, payload: dict):
        for agent_id in AGENT_REGISTRY:
            if agent_id != from_agent:
                await self.send_message(from_agent, agent_id, payload)
\`\`\`

## The LLM Layer

We run all inference through Ollama, supporting multiple model sizes:

- **Orchestrator**: Llama 3.1 70B (quantized) for complex routing
- **Code Agent**: CodeLlama 34B for code generation and review
- **General Agents**: Llama 3.1 8B for fast, lightweight responses
- **Embedding**: nomic-embed-text for RAG retrieval

The model selection is dynamic — NEXUS monitors system resources and automatically downsizes models when memory pressure increases.

## Frontend Stack

The user interface spans three platforms:

1. **Desktop (Electron)**: Full-featured dashboard with system tray integration
2. **Web (React)**: Browser-based access for quick queries
3. **Mobile (React Native)**: On-the-go access with push notifications

All three share the same FastAPI backend through WebSocket connections for real-time streaming responses.

## Docker Deployment

The entire system deploys with a single command:

\`\`\`bash
docker-compose up -d
\`\`\`

This spins up:
- FastAPI backend (port 8000)
- Ollama inference server (port 11434)
- ChromaDB vector store (port 8100)
- Redis IPC bus (port 6379)
- React web dashboard (port 3000)

## Performance Results

After 6 months of development:

- **Average response time**: 1.2s for simple queries, 4.5s for complex multi-agent tasks
- **Memory usage**: 8GB RAM baseline, 16GB recommended
- **Storage**: 12GB for models, ~2GB for vector stores
- **Concurrent agents**: Up to 5 agents can process simultaneously

## What's Next

We're working on:
- NPU acceleration for Intel Core Ultra processors
- Voice interaction with local Whisper models
- ESP32 IoT integration for true smart home AI
- Offline-first mobile experience

NEXUS AI OS represents our belief that AI should be personal, private, and powerful — without compromise.
    `,
    author: "Harsha Bonthada",
    authorAvatar: "🧑‍💻",
    authorRole: "Founder & Lead Engineer",
    date: "2026-03-01",
    readTime: "12 min read",
    category: "AI & ML",
    tags: ["AI", "Ollama", "Multi-Agent", "Local-First", "Architecture", "Docker"],
    featured: true,
    coverGradient: "from-violet-600 via-purple-600 to-indigo-600",
    icon: "Brain",
  },
  {
    slug: "esp32-mqtt-smart-home-at-scale",
    title: "ESP32 + MQTT: Building Smart Home Infrastructure at Scale",
    excerpt:
      "How we scaled our home automation from a single ESP32 relay to a production-grade IoT ecosystem with 9+ devices, MQTT mesh networking, and OTA firmware updates.",
    content: `
## From One Relay to an Ecosystem

It started with a single ESP32 controlling a relay to toggle a light bulb. That was 2023. Today, our SmartHome ecosystem manages 9+ IoT devices across multiple rooms, with real-time MQTT communication, over-the-air firmware updates, and cross-platform control from Flutter, Web, and Alexa.

### The Hardware Stack

Each node in our smart home network runs on the ESP32 platform:

\`\`\`cpp
// Core ESP32 Configuration
#define DEVICE_ID "living_room_main"
#define MQTT_BROKER "mqtt.circuvent.local"
#define MQTT_PORT 1883
#define OTA_HOSTNAME "esp32-living-room"
#define FIRMWARE_VERSION "3.2.1"

// Pin Mapping
const int RELAY_PINS[] = {25, 26, 27, 14};
const int SENSOR_DHT = 4;
const int SENSOR_PIR = 15;
const int SENSOR_LDR = 34;
const int LED_STATUS = 2;
\`\`\`

### MQTT Topic Architecture

We designed a hierarchical topic structure that scales:

\`\`\`
home/{room}/{device}/{action}
home/{room}/{device}/status
home/{room}/sensors/{type}
home/system/ota/{device_id}
home/system/health/{device_id}
\`\`\`

This means:
- \`home/living_room/light_1/toggle\` — Control a specific light
- \`home/kitchen/sensors/temperature\` — Read kitchen temperature
- \`home/system/health/esp32_bedroom\` — Device health check

### OTA Update System

One of our biggest challenges was updating firmware across 9 devices without physically accessing each one. We built a custom OTA system:

\`\`\`cpp
void setupOTA() {
    ArduinoOTA.setHostname(OTA_HOSTNAME);
    ArduinoOTA.setPassword(OTA_PASSWORD);
    
    ArduinoOTA.onStart([]() {
        mqtt.publish("home/system/ota/status", "updating");
        disableAllRelays(); // Safety first
    });
    
    ArduinoOTA.onEnd([]() {
        mqtt.publish("home/system/ota/status", "complete");
        ESP.restart();
    });
    
    ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
        int percent = (progress / (total / 100));
        if (percent % 10 == 0) {
            char msg[32];
            snprintf(msg, sizeof(msg), "progress:%d", percent);
            mqtt.publish("home/system/ota/progress", msg);
        }
    });
    
    ArduinoOTA.begin();
}
\`\`\`

### Energy Monitoring

Each SmartHome node reports energy consumption data:

- Real-time current sensing via ACS712 modules
- Power factor calculation
- Daily/weekly/monthly aggregation
- Cost estimation based on utility rates

The data flows from ESP32 → MQTT → Firebase → Flutter Dashboard, giving homeowners complete visibility into their energy usage.

## Flutter Cross-Platform App

The SmartHome Flutter app is our most mature mobile product:

- **4,000+ lines of Dart code**
- Riverpod state management for reactive UI
- Firebase Realtime Database for device state
- MQTT direct connection for low-latency control
- Alexa skill for voice control
- Razorpay integration for premium features

## Lessons Learned

1. **WiFi reliability matters more than anything** — We added automatic reconnection logic with exponential backoff
2. **MQTT QoS levels are critical** — QoS 1 for commands, QoS 0 for sensor data
3. **Flash memory wear** — We switched to SPIFFS for configuration to reduce EEPROM writes
4. **Power supply quality** — Cheap USB adapters cause ESP32 brownouts. Use proper 5V/2A supplies
5. **Mesh networking** — For larger homes, ESP-NOW bridges solve WiFi range issues

## What's Next

- Integration with NEXUS AI OS for intelligent automation rules
- Machine learning on sensor data for predictive climate control
- Solar panel monitoring and smart grid integration
- Thread/Matter protocol support for ecosystem compatibility
    `,
    author: "Harsha Bonthada",
    authorAvatar: "🧑‍💻",
    authorRole: "Founder & Lead Engineer",
    date: "2026-02-15",
    readTime: "10 min read",
    category: "IoT",
    tags: ["ESP32", "MQTT", "IoT", "Smart Home", "Flutter", "Embedded"],
    featured: true,
    coverGradient: "from-cyan-500 via-teal-500 to-emerald-500",
    icon: "Cpu",
  },
  {
    slug: "full-stack-monorepo-architecture-2026",
    title: "Our Full-Stack Monorepo Architecture in 2026",
    excerpt:
      "A practical guide to how we structure our multi-platform projects — from shared TypeScript types to Docker orchestration — across React, React Native, Electron, and Node.js.",
    content: `
## Why Monorepo?

When you're building products that span Web, Mobile, Desktop, and Backend — all sharing business logic, types, and utilities — a monorepo isn't just convenient. It's essential.

At Circuvent, our larger projects (NEXUS AI OS, Financial Analyzer, TimeCapsule) all follow a monorepo structure. Here's how we organize them.

### Directory Structure

\`\`\`
project-root/
├── packages/
│   ├── shared/          # Shared types, utils, constants
│   ├── ui/              # Shared React components
│   └── api-client/      # Generated API client
├── apps/
│   ├── web/             # Next.js web app
│   ├── mobile/          # React Native / Expo
│   ├── desktop/         # Electron app
│   └── api/             # FastAPI / Express backend
├── infra/
│   ├── docker/          # Dockerfiles
│   ├── scripts/         # Build & deploy scripts
│   └── ci/              # GitHub Actions workflows
├── docs/                # Architecture docs
├── docker-compose.yml
├── package.json         # Root workspace config
└── turbo.json           # Turborepo config
\`\`\`

### Shared Type Safety

The \`packages/shared\` directory contains TypeScript interfaces that are used across all platforms:

\`\`\`typescript
// packages/shared/src/types/user.ts
export interface User {
  id: string;
  email: string;
  displayName: string;
  avatar?: string;
  role: 'admin' | 'user' | 'premium';
  preferences: UserPreferences;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  notifications: boolean;
  language: string;
  timezone: string;
}
\`\`\`

Both the React web app and React Native mobile app import from the same package:

\`\`\`typescript
import type { User, UserPreferences } from '@project/shared';
\`\`\`

This eliminates type drift between platforms — a change to the User interface immediately shows type errors everywhere it's used.

### API Client Generation

We auto-generate API clients from our FastAPI OpenAPI schema:

\`\`\`bash
# Generate TypeScript client from FastAPI OpenAPI spec
openapi-generator-cli generate \\
  -i http://localhost:8000/openapi.json \\
  -g typescript-fetch \\
  -o packages/api-client/src \\
  --additional-properties=supportsES6=true
\`\`\`

### Docker Orchestration

Every service runs in Docker, orchestrated by docker-compose:

\`\`\`yaml
version: '3.8'
services:
  api:
    build: ./apps/api
    ports: ["8000:8000"]
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/app
    depends_on: [db, redis]
    
  web:
    build: ./apps/web
    ports: ["3000:3000"]
    depends_on: [api]
    
  db:
    image: postgres:16-alpine
    volumes: ["pgdata:/var/lib/postgresql/data"]
    
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

volumes:
  pgdata:
\`\`\`

### CI/CD Pipeline

Our GitHub Actions pipeline:

1. **Lint & Type Check** — ESLint + TypeScript across all packages
2. **Unit Tests** — Jest for shared packages, Pytest for backend
3. **Build** — Turborepo parallel builds
4. **Docker Build** — Multi-stage Docker images
5. **Deploy** — Push to container registry, deploy via SSH

## Results

This architecture has allowed us to:
- Ship features across 3 platforms simultaneously
- Maintain 100% type safety from API to UI
- Deploy with a single \`docker-compose up\` command
- Onboard new developers in hours, not days
    `,
    author: "Harsha Bonthada",
    authorAvatar: "🧑‍💻",
    authorRole: "Founder & Lead Engineer",
    date: "2026-02-01",
    readTime: "8 min read",
    category: "Architecture",
    tags: ["Monorepo", "TypeScript", "Docker", "CI/CD", "Architecture"],
    featured: true,
    coverGradient: "from-blue-500 via-indigo-500 to-violet-500",
    icon: "Layers",
  },
  {
    slug: "cancer-detection-ai-ensemble-learning",
    title: "Ensemble Learning for Cancer Risk Prediction: Our CancerGuard AI Approach",
    excerpt:
      "How we built a HIPAA-aligned cancer risk prediction system using an ensemble of XGBoost, LightGBM, Random Forest, and Neural Networks — with 69 API endpoints.",
    content: `
## The Challenge

Cancer risk prediction is one of the most impactful applications of machine learning in healthcare. Early detection saves lives — but building a reliable prediction system requires more than just training a single model.

### Why Ensemble Learning?

No single ML algorithm performs best across all cancer types and patient demographics. Our approach: combine multiple models and let them vote.

\`\`\`python
class CancerEnsemblePredictor:
    def __init__(self):
        self.models = {
            'xgboost': XGBClassifier(
                n_estimators=500,
                max_depth=6,
                learning_rate=0.01,
                subsample=0.8,
                colsample_bytree=0.8
            ),
            'lightgbm': LGBMClassifier(
                n_estimators=500,
                num_leaves=31,
                learning_rate=0.01,
                feature_fraction=0.8
            ),
            'random_forest': RandomForestClassifier(
                n_estimators=300,
                max_depth=10,
                min_samples_split=5
            ),
            'neural_net': self._build_neural_network()
        }
        self.meta_learner = LogisticRegression()
    
    def _build_neural_network(self):
        model = Sequential([
            Dense(256, activation='relu', input_shape=(feature_count,)),
            BatchNormalization(),
            Dropout(0.3),
            Dense(128, activation='relu'),
            BatchNormalization(),
            Dropout(0.2),
            Dense(64, activation='relu'),
            Dense(1, activation='sigmoid')
        ])
        model.compile(optimizer='adam', loss='binary_crossentropy')
        return model
\`\`\`

### The Stacking Architecture

We use a two-level stacking approach:

1. **Level 1**: Four base models each make independent predictions
2. **Level 2**: A meta-learner (Logistic Regression) combines the base predictions

This consistently outperforms any individual model by 3-7% on our validation set.

### Data Pipeline

Patient data flows through a rigorous preprocessing pipeline:

1. **Missing Value Imputation** — KNN imputer for numerical, mode for categorical
2. **Feature Engineering** — BMI calculation, age binning, interaction features
3. **Normalization** — StandardScaler for neural network, raw for tree models
4. **Class Balancing** — SMOTE for minority class oversampling

### API Architecture

The backend exposes 69 REST endpoints organized by role:

- **Patient Portal** (22 endpoints): Risk assessment, history, reports
- **Hospital Portal** (28 endpoints): Patient management, analytics, blood bank
- **Admin Portal** (19 endpoints): System config, model management, audit logs

### Blood Donor Geo-Matching

A unique feature is our blood donor geo-matching system. When a patient needs a transfusion:

\`\`\`python
async def find_nearest_donors(
    patient_location: GeoPoint,
    blood_type: str,
    radius_km: float = 25.0,
    limit: int = 10
) -> list[DonorMatch]:
    compatible_types = get_compatible_blood_types(blood_type)
    
    donors = await db.donors.find({
        'blood_type': {'$in': compatible_types},
        'is_available': True,
        'last_donation_date': {'$lt': thirty_days_ago},
        'location': {
            '$nearSphere': {
                '$geometry': patient_location,
                '$maxDistance': radius_km * 1000
            }
        }
    }).limit(limit)
    
    return [DonorMatch(
        donor=d,
        distance=calculate_distance(patient_location, d.location),
        compatibility_score=score_compatibility(blood_type, d.blood_type)
    ) for d in donors]
\`\`\`

### Results

- **Model Accuracy**: 94.2% on held-out test set
- **AUC-ROC**: 0.967
- **API Response Time**: <200ms for risk prediction
- **Data Processing**: Handles 10K+ patient records

## Privacy & Compliance

All patient data is encrypted at rest and in transit. We follow HIPAA guidelines for data handling, with role-based access control and complete audit logging.
    `,
    author: "Harsha Bonthada",
    authorAvatar: "🧑‍💻",
    authorRole: "Founder & Lead Engineer",
    date: "2026-01-20",
    readTime: "11 min read",
    category: "AI & ML",
    tags: ["Healthcare", "Machine Learning", "Ensemble", "Python", "FastAPI"],
    featured: false,
    coverGradient: "from-rose-500 via-pink-500 to-fuchsia-500",
    icon: "HeartPulse",
  },
  {
    slug: "docker-compose-production-deployment",
    title: "Docker Compose for Production: Lessons from Deploying 8 Apps",
    excerpt:
      "Real-world lessons from running 8 production applications on Docker Compose — from health checks to zero-downtime deployments.",
    content: `
## Docker Compose in Production? Yes, Really.

There's a common misconception that Docker Compose is only for development. At Circuvent, we run 8 production applications on Docker Compose, and here's why it works.

### When Docker Compose Makes Sense

- Single-server deployments (most startups)
- Teams of 1-5 engineers
- Applications that don't need Kubernetes-level orchestration
- When simplicity > complexity

### Our Production docker-compose.yml Pattern

\`\`\`yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=\${DATABASE_URL}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  db:
    image: postgres:16-alpine
    restart: unless-stopped
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./backups:/backups
    environment:
      - POSTGRES_PASSWORD=\${DB_PASSWORD}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro
    depends_on:
      app:
        condition: service_healthy

volumes:
  pgdata:
\`\`\`

### Health Checks Are Non-Negotiable

Every service must have a health check. Without them, Docker will route traffic to containers that aren't ready.

### Zero-Downtime Deploys

Our deployment script:

\`\`\`bash
#!/bin/bash
set -euo pipefail

echo "Pulling latest images..."
docker compose pull

echo "Building new containers..."
docker compose build --no-cache app

echo "Rolling update..."
docker compose up -d --no-deps app

echo "Waiting for health check..."
timeout 60 bash -c 'until docker compose exec app curl -sf http://localhost:3000/health; do sleep 2; done'

echo "Cleaning up old images..."
docker image prune -f

echo "Deployment complete!"
\`\`\`

### Monitoring

We use a lightweight monitoring stack:
- **cAdvisor** for container metrics
- **Prometheus** for time-series data
- **Grafana** for dashboards
- **Loki** for log aggregation

### Backup Strategy

Automated daily backups with 30-day retention:

\`\`\`bash
# Run daily via cron
docker compose exec db pg_dump -U postgres app_db | gzip > "/backups/app_db_$(date +%Y%m%d).sql.gz"
find /backups -name "*.sql.gz" -mtime +30 -delete
\`\`\`

## Key Takeaways

1. Docker Compose is production-viable for small teams
2. Health checks prevent routing to unhealthy containers
3. Resource limits prevent one service from starving others
4. Logging configuration prevents disk space issues
5. Automated backups are essential, test your restores regularly
    `,
    author: "Harsha Bonthada",
    authorAvatar: "🧑‍💻",
    authorRole: "Founder & Lead Engineer",
    date: "2026-01-10",
    readTime: "7 min read",
    category: "DevOps",
    tags: ["Docker", "DevOps", "Deployment", "Production", "Infrastructure"],
    featured: false,
    coverGradient: "from-slate-500 via-zinc-500 to-neutral-500",
    icon: "Shield",
  },
  {
    slug: "vision-ai-yolov8-active-learning",
    title: "Vision AI: Active Learning with YOLOv8 on ESP32-CAM",
    excerpt:
      "How we built an active learning pipeline that continuously improves YOLOv8 object detection accuracy using ESP32-CAM edge devices.",
    content: `
## The Edge AI Challenge

Running object detection at the edge presents unique challenges: limited compute, constrained memory, unreliable networks. Our Vision AI platform solves this with a clever split-architecture approach.

### Split Architecture

Instead of running the full model on ESP32 (impossible with a 520KB SRAM device), we split the pipeline:

1. **ESP32-CAM**: Captures frames, basic preprocessing, MQTT streaming
2. **Edge Server**: Runs YOLOv8 inference on GPU
3. **React Dashboard**: Real-time visualization and annotation

### Active Learning Pipeline

The most innovative part of Vision AI is its active learning loop:

\`\`\`python
class ActiveLearningPipeline:
    def __init__(self, model: YOLO, confidence_threshold: float = 0.3):
        self.model = model
        self.confidence_threshold = confidence_threshold
        self.uncertain_buffer = []
        
    async def process_frame(self, frame: np.ndarray) -> DetectionResult:
        results = self.model(frame)
        
        for detection in results:
            if detection.confidence < self.confidence_threshold:
                # Low confidence = uncertain → queue for human review
                self.uncertain_buffer.append({
                    'frame': frame,
                    'detection': detection,
                    'timestamp': datetime.utcnow()
                })
                
        if len(self.uncertain_buffer) >= 50:
            await self.request_human_annotation()
            
        return DetectionResult(
            detections=results,
            uncertain_count=len(self.uncertain_buffer)
        )
    
    async def request_human_annotation(self):
        # Send uncertain detections to React dashboard for human labeling
        batch = self.uncertain_buffer[:50]
        await mqtt.publish("vision/annotation/request", {
            'batch_id': uuid4(),
            'frames': [encode_frame(f['frame']) for f in batch],
            'predictions': [f['detection'] for f in batch]
        })
        self.uncertain_buffer = self.uncertain_buffer[50:]
\`\`\`

### Model Retraining Pipeline

Once humans annotate the uncertain detections, the model retrains:

\`\`\`python
class ModelRetrainer:
    def __init__(self, base_model_path: str):
        self.base_model = YOLO(base_model_path)
        self.training_data_path = Path('./datasets/active_learning')
        
    async def retrain(self, new_annotations: list[Annotation]):
        # Add new annotations to training data
        self.add_to_dataset(new_annotations)
        
        # Fine-tune the model
        results = self.base_model.train(
            data=str(self.training_data_path / 'data.yaml'),
            epochs=10,
            imgsz=640,
            batch=16,
            lr0=0.001,  # Lower LR for fine-tuning
            freeze=10,  # Freeze backbone layers
            project='runs/active_learning',
            name=f'retrain_{datetime.now().strftime("%Y%m%d_%H%M")}'
        )
        
        # Validate improvement
        if results.metrics.mAP50 > self.current_map:
            self.deploy_new_model(results.best)
            await mqtt.publish("vision/model/updated", {
                'version': self.version + 1,
                'mAP50': results.metrics.mAP50,
                'improvement': results.metrics.mAP50 - self.current_map
            })
\`\`\`

### Results

After 3 months of active learning:

- **Initial mAP50**: 72.3%
- **After 500 annotations**: 81.7%
- **After 2000 annotations**: 89.4%
- **Current mAP50**: 91.2%

The model continuously improves without manual data collection — it identifies what it doesn't know and asks for help.

## ESP32-CAM Optimizations

To maximize frame rate on the ESP32-CAM:

\`\`\`cpp
void configureCamera() {
    camera_config_t config;
    config.ledc_channel = LEDC_CHANNEL_0;
    config.ledc_timer = LEDC_TIMER_0;
    config.pin_d0 = Y2_GPIO_NUM;
    // ... pin configuration
    
    // Optimized for speed over quality
    config.frame_size = FRAMESIZE_VGA;  // 640x480
    config.jpeg_quality = 12;            // 0-63, lower = better quality
    config.fb_count = 2;                 // Double-buffering
    config.fb_location = CAMERA_FB_IN_PSRAM;
    config.grab_mode = CAMERA_GRAB_LATEST;
    
    esp_camera_init(&config);
}
\`\`\`

This achieves 15 FPS streaming over WiFi to the edge server — more than sufficient for most security and monitoring applications.
    `,
    author: "Harsha Bonthada",
    authorAvatar: "🧑‍💻",
    authorRole: "Founder & Lead Engineer",
    date: "2025-12-28",
    readTime: "9 min read",
    category: "AI & ML",
    tags: ["Computer Vision", "YOLOv8", "ESP32", "Active Learning", "Edge AI"],
    featured: false,
    coverGradient: "from-amber-500 via-orange-500 to-red-500",
    icon: "Eye",
  },
  {
    slug: "building-enterprise-hrms-from-scratch",
    title: "Building an Enterprise HRMS from Scratch: Replacing Keka + Jira",
    excerpt:
      "How HT Connect became a unified platform replacing two enterprise tools — sprint boards, leave management, onboarding, and performance reviews in one codebase.",
    content: `
## The Problem

Our parent company was paying for both Keka (HRMS) and Jira (Project Management). Two separate tools, two separate logins, two separate data silos. We decided to build one platform that does both — better.

### HT Connect Features

**HR Module:**
- Employee onboarding pipeline with document management
- Leave management with approval workflows
- Attendance tracking with geo-fencing
- Performance reviews with 360° feedback
- Department analytics and headcount planning
- Payroll integration hooks

**Project Management Module:**
- Kanban sprint boards with drag-and-drop
- Burndown charts and velocity tracking
- Sprint planning with story point estimation
- Backlog grooming and priority management
- Time tracking per task
- Custom workflow states

### Tech Stack

\`\`\`
Frontend:  Next.js 14 + Chakra UI
Backend:   Express.js + Prisma ORM
Database:  PostgreSQL 16
Cache:     Redis 7
Deploy:    Docker Compose
Auth:      JWT + Refresh Tokens
\`\`\`

### Database Schema

The Prisma schema grew to 35+ models:

\`\`\`prisma
model Employee {
  id            String    @id @default(cuid())
  employeeId    String    @unique
  email         String    @unique
  firstName     String
  lastName      String
  department    Department @relation(fields: [departmentId], references: [id])
  departmentId  String
  role          EmployeeRole @default(EMPLOYEE)
  joiningDate   DateTime
  status        EmployeeStatus @default(ACTIVE)
  leaves        Leave[]
  tasks         Task[]
  reviews       PerformanceReview[]
  attendance    Attendance[]
  documents     Document[]
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

model Sprint {
  id          String   @id @default(cuid())
  name        String
  goal        String?
  startDate   DateTime
  endDate     DateTime
  status      SprintStatus @default(PLANNED)
  tasks       Task[]
  velocity    Int?
  project     Project  @relation(fields: [projectId], references: [id])
  projectId   String
  createdAt   DateTime @default(now())
}

model Task {
  id            String     @id @default(cuid())
  title         String
  description   String?
  status        TaskStatus @default(TODO)
  priority      Priority   @default(MEDIUM)
  storyPoints   Int?
  assignee      Employee?  @relation(fields: [assigneeId], references: [id])
  assigneeId    String?
  sprint        Sprint?    @relation(fields: [sprintId], references: [id])
  sprintId      String?
  timeTracked   Int        @default(0) // minutes
  tags          String[]
  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt
}
\`\`\`

### The Result

HT Connect now serves as the primary operational tool for a 50-person company:
- 200+ sprints completed
- 5,000+ tasks managed
- 98.5% uptime over 12 months
- $2,400/month saved in SaaS subscriptions
    `,
    author: "Harsha Bonthada",
    authorAvatar: "🧑‍💻",
    authorRole: "Founder & Lead Engineer",
    date: "2025-12-15",
    readTime: "8 min read",
    category: "Engineering",
    tags: ["Enterprise", "HRMS", "Next.js", "PostgreSQL", "Prisma"],
    featured: false,
    coverGradient: "from-slate-500 via-zinc-500 to-neutral-500",
    icon: "Building2",
  },
  {
    slug: "algorithmic-trading-local-first-python",
    title: "Local-First Algorithmic Trading with DuckDB and Python",
    excerpt:
      "How we built a quantitative trading engine for Indian equities (NSE) that runs entirely on your machine — no cloud, no latency, no subscription fees.",
    content: `
## Why Local-First Trading?

Cloud-based trading platforms add latency, require subscriptions, and expose your strategies to third parties. Our StockMarket Agent runs entirely on your machine.

### Architecture

\`\`\`
┌─────────────┐    ┌──────────────┐    ┌──────────────┐
│  Data Feed   │───>│  Strategy    │───>│  Execution   │
│  (yfinance)  │    │  Engine      │    │  Engine      │
└─────────────┘    └──────────────┘    └──────────────┘
       │                  │                    │
       ▼                  ▼                    ▼
┌─────────────┐    ┌──────────────┐    ┌──────────────┐
│  DuckDB     │    │  Risk Guard  │    │  Broker API  │
│  (Storage)  │    │  (Limits)    │    │  (Zerodha)   │
└─────────────┘    └──────────────┘    └──────────────┘
\`\`\`

### DuckDB for Financial Data

We chose DuckDB over PostgreSQL for several reasons:
- Zero-setup (embedded database)
- Columnar storage is perfect for time-series data
- Apache Arrow integration for zero-copy data sharing
- Parquet file support for historical data archives

\`\`\`python
import duckdb

class MarketDataStore:
    def __init__(self, db_path: str = "market_data.duckdb"):
        self.conn = duckdb.connect(db_path)
        self._init_schema()
    
    def _init_schema(self):
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS ohlcv (
                symbol VARCHAR,
                timestamp TIMESTAMP,
                open DOUBLE,
                high DOUBLE,
                low DOUBLE,
                close DOUBLE,
                volume BIGINT,
                PRIMARY KEY (symbol, timestamp)
            )
        """)
    
    def query_candles(
        self, symbol: str, start: datetime, end: datetime
    ) -> pa.Table:
        return self.conn.execute("""
            SELECT * FROM ohlcv
            WHERE symbol = ? AND timestamp BETWEEN ? AND ?
            ORDER BY timestamp
        """, [symbol, start, end]).arrow()
\`\`\`

### Walk-Forward Backtesting

Our backtesting engine uses walk-forward optimization to prevent overfitting:

\`\`\`python
class WalkForwardBacktester:
    def __init__(
        self,
        strategy: Strategy,
        train_window: int = 252,  # 1 year
        test_window: int = 63,    # 3 months
        step_size: int = 21       # 1 month
    ):
        self.strategy = strategy
        self.train_window = train_window
        self.test_window = test_window
        self.step_size = step_size
    
    def run(self, data: pd.DataFrame) -> BacktestResult:
        results = []
        
        for i in range(0, len(data) - self.train_window - self.test_window, self.step_size):
            train_data = data.iloc[i:i + self.train_window]
            test_data = data.iloc[i + self.train_window:i + self.train_window + self.test_window]
            
            # Optimize on training data
            self.strategy.optimize(train_data)
            
            # Test on out-of-sample data
            period_result = self.strategy.backtest(test_data)
            results.append(period_result)
        
        return BacktestResult.aggregate(results)
\`\`\`

### Risk Management

Every trade passes through the Risk Guard:

- Maximum position size: 5% of portfolio
- Daily loss limit: 2% of portfolio
- Maximum open positions: 10
- Sector exposure limit: 20%
- Correlation limit between positions

## Performance

- Backtested on 5 years of NSE data (2021-2026)
- Sharpe Ratio: 1.8
- Maximum Drawdown: 12%
- Win Rate: 58%
- Trade Execution: <50ms paper, <200ms live
    `,
    author: "Harsha Bonthada",
    authorAvatar: "🧑‍💻",
    authorRole: "Founder & Lead Engineer",
    date: "2025-12-01",
    readTime: "10 min read",
    category: "Engineering",
    tags: ["Trading", "Python", "DuckDB", "FinTech", "Quantitative"],
    featured: false,
    coverGradient: "from-green-500 via-emerald-500 to-teal-500",
    icon: "TrendingUp",
  },
  {
    slug: "open-source-philosophy-circuvent",
    title: "Why We Open Source Everything: The Circuvent Philosophy",
    excerpt:
      "Our approach to open source development — why every project is public, how we structure repositories for community contribution, and the business case for transparency.",
    content: `
## Building in Public

At Circuvent Technologies, every project is open source. Not as an afterthought — by design. Here's why.

### The Business Case

"But won't competitors copy your code?" This is the most common pushback. Here's our response:

1. **Code is not the moat** — Execution, speed, and domain expertise are
2. **Trust through transparency** — Clients can audit our code quality
3. **Community contributions** — Bug reports and patches from users
4. **Hiring signal** — Engineers want to work on open-source projects
5. **Portfolio proof** — Our GitHub *is* our resume

### Repository Standards

Every Circuvent repository follows these standards:

\`\`\`
repo-name/
├── README.md              # Comprehensive with badges, screenshots
├── CONTRIBUTING.md         # How to contribute
├── LICENSE                 # MIT by default
├── ARCHITECTURE.md         # System design docs
├── .github/
│   ├── ISSUE_TEMPLATE/
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── workflows/         # CI/CD
├── docs/                   # Detailed documentation
└── src/                    # Clean, documented source code
\`\`\`

### README Template

Every README includes:
- Project overview with hero screenshot
- Quick start guide (< 5 steps)
- Architecture diagram
- Tech stack badges
- API documentation link
- Contributing guidelines
- License

### Semantic Versioning

We follow strict semver across all packages:
- **MAJOR**: Breaking API changes
- **MINOR**: New features, backwards compatible
- **PATCH**: Bug fixes, no API changes

### Commit Convention

\`\`\`
feat(scope): add new feature
fix(scope): fix bug description
docs: update README
refactor: restructure module
test: add unit tests
chore: update dependencies
\`\`\`

## Community Impact

Our open source projects have been used by:
- 15+ student projects for academic submissions
- 3 startups who forked and adapted our code
- University curricula for IoT and AI courses

## Get Involved

We welcome contributions to any of our 53+ repositories. Check out our GitHub organization and pick a "good first issue" to get started!
    `,
    author: "Harsha Bonthada",
    authorAvatar: "🧑‍💻",
    authorRole: "Founder & Lead Engineer",
    date: "2025-11-15",
    readTime: "6 min read",
    category: "Open Source",
    tags: ["Open Source", "Community", "Philosophy", "GitHub"],
    featured: false,
    coverGradient: "from-emerald-500 via-teal-500 to-cyan-500",
    icon: "Globe",
  },
  {
    slug: "flutter-firebase-production-lessons",
    title: "Flutter + Firebase in Production: 4 Apps, 18 Months, Key Lessons",
    excerpt:
      "Practical lessons from running 4 Flutter applications with Firebase backends in production — from Firestore query optimization to FCM notification delivery.",
    content: `
## Flutter in Production

We've shipped 4 Flutter apps to production: SmartHome, Ai-Home, Loan Manager, and Financial Analyzer mobile. Here are the key lessons.

### Firestore Query Optimization

The #1 mistake we made early: unoptimized Firestore queries that blew through our free tier in days.

\`\`\`dart
// BAD: Reads ALL documents
final snapshot = await FirebaseFirestore.instance
    .collection('devices')
    .get();

// GOOD: Paginated + filtered
final snapshot = await FirebaseFirestore.instance
    .collection('devices')
    .where('userId', isEqualTo: currentUser.uid)
    .where('isActive', isEqualTo: true)
    .orderBy('lastSeen', descending: true)
    .limit(20)
    .get();
\`\`\`

### State Management: Riverpod

After trying Provider, Bloc, and GetX, we settled on Riverpod for all new projects:

\`\`\`dart
@riverpod
class DeviceController extends _$DeviceController {
  @override
  Future<List<Device>> build() async {
    final userId = ref.watch(currentUserProvider).value?.uid;
    if (userId == null) return [];
    
    return ref.watch(deviceRepositoryProvider).getDevices(userId);
  }
  
  Future<void> toggleDevice(String deviceId) async {
    final repo = ref.read(deviceRepositoryProvider);
    await repo.toggleDevice(deviceId);
    ref.invalidateSelf();
  }
}
\`\`\`

### FCM Notification Delivery

Firebase Cloud Messaging has quirks on different Android OEMs:

- **Xiaomi/Redmi**: Requires manual "autostart" permission
- **Samsung**: Battery optimization kills background services
- **OnePlus**: Aggressive memory management

Our solution: a comprehensive onboarding flow that guides users through device-specific settings.

### Offline-First Architecture

SmartHome needs to work even when the internet is down (your lights shouldn't stop working):

\`\`\`dart
class OfflineFirstRepository {
  final FirebaseFirestore _firestore;
  final SharedPreferences _prefs;
  
  Future<List<Device>> getDevices(String userId) async {
    try {
      // Try network first
      final snapshot = await _firestore
          .collection('devices')
          .where('userId', isEqualTo: userId)
          .get(const GetOptions(source: Source.server));
      
      // Cache locally
      await _cacheDevices(snapshot.docs);
      return _parseDevices(snapshot);
    } catch (e) {
      // Fallback to cache
      return _getCachedDevices();
    }
  }
}
\`\`\`

### Performance Metrics (Real Production Data)

| App | MAU | Crash Rate | Avg Launch | Firestore Reads/Day |
|-----|-----|------------|------------|---------------------|
| SmartHome | 150 | 0.3% | 1.8s | 12K |
| Ai-Home | 80 | 0.5% | 2.1s | 8K |
| Loan Manager | 200 | 0.2% | 1.5s | 5K |
| Financial Analyzer | 120 | 0.4% | 2.3s | 15K |

## Key Takeaways

1. Riverpod > Provider for complex state
2. Firestore queries need pagination from day one
3. Offline-first is mandatory for IoT apps
4. Test on cheap Android phones, not just flagships
5. Firebase Cloud Functions are great for backend logic you don't want to maintain
    `,
    author: "Harsha Bonthada",
    authorAvatar: "🧑‍💻",
    authorRole: "Founder & Lead Engineer",
    date: "2025-11-01",
    readTime: "9 min read",
    category: "Engineering",
    tags: ["Flutter", "Firebase", "Mobile", "Production", "Riverpod"],
    featured: false,
    coverGradient: "from-sky-500 via-blue-500 to-indigo-500",
    icon: "Layers",
  },
  {
    slug: "react-native-cross-platform-2026",
    title: "React Native in 2026: Building TravelMate Across iOS, Android, and Web",
    excerpt:
      "Our experience building TravelMate — a cross-platform travel app with GPS, real-time translation, offline maps, and Gemini AI — using React Native and Expo.",
    content: `
## Cross-Platform Reality

TravelMate is our most ambitious React Native project: a full-featured travel companion running on iOS, Android, and Web from a single codebase.

### The Feature Set

- GPS-based place discovery with distance calculation
- Real-time multi-language translation (Google Translate API)
- Offline map support with downloaded regions
- Gemini AI integration for travel recommendations
- Itinerary planning with drag-and-drop reordering
- Expense splitting among travel groups
- Social sharing with trip timelines
- Push notifications for flight/hotel reminders

### Expo for Rapid Development

We chose Expo SDK 50+ for its mature ecosystem:

\`\`\`typescript
// app.json
{
  "expo": {
    "name": "TravelMate",
    "plugins": [
      "expo-router",
      "expo-location",
      "expo-camera",
      "expo-notifications",
      [
        "expo-maps",
        { "apiKey": process.env.GOOGLE_MAPS_KEY }
      ]
    ],
    "experiments": {
      "tsconfigPaths": true
    }
  }
}
\`\`\`

### Gemini AI Integration

The AI travel advisor uses Google's Gemini API:

\`\`\`typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function getAIRecommendations(
  destination: string,
  interests: string[],
  budget: 'budget' | 'moderate' | 'luxury',
  duration: number
): Promise<TravelRecommendation[]> {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
  
  const prompt = \`
    You are a travel expert. Generate recommendations for:
    Destination: \${destination}
    Interests: \${interests.join(', ')}
    Budget: \${budget}
    Duration: \${duration} days
    
    Return a JSON array of recommendations with:
    - name, description, category, estimatedCost, duration, location
  \`;
  
  const result = await model.generateContent(prompt);
  return JSON.parse(result.response.text());
}
\`\`\`

### Offline Maps

For offline map support, we pre-download map tiles:

\`\`\`typescript
import * as FileSystem from 'expo-file-system';

export async function downloadMapRegion(
  bounds: LatLngBounds,
  zoomLevels: number[] = [10, 12, 14, 16]
): Promise<void> {
  const tiles = calculateTilesForBounds(bounds, zoomLevels);
  const downloadDir = FileSystem.documentDirectory + 'map_tiles/';
  
  await FileSystem.makeDirectoryAsync(downloadDir, { intermediates: true });
  
  for (const tile of tiles) {
    const url = \`https://tile.openstreetmap.org/\${tile.z}/\${tile.x}/\${tile.y}.png\`;
    const localPath = \`\${downloadDir}\${tile.z}_\${tile.x}_\${tile.y}.png\`;
    
    await FileSystem.downloadAsync(url, localPath);
  }
}
\`\`\`

### Performance Results

- App size: 28MB (iOS), 22MB (Android)
- Cold start: 1.8s (iOS), 2.1s (Android)
- Map rendering: 60fps with hardware acceleration
- Translation latency: <500ms average
- Offline mode: Full functionality with cached data

TravelMate proves that React Native in 2026 is truly production-ready for complex, feature-rich applications.
    `,
    author: "Harsha Bonthada",
    authorAvatar: "🧑‍💻",
    authorRole: "Founder & Lead Engineer",
    date: "2025-10-20",
    readTime: "8 min read",
    category: "Engineering",
    tags: ["React Native", "Expo", "Cross-Platform", "Gemini AI", "Mobile"],
    featured: false,
    coverGradient: "from-emerald-500 via-green-500 to-lime-500",
    icon: "Globe",
  },
  {
    slug: "circuvent-technologies-origin-story",
    title: "The Origin Story: How Circuvent Technologies Was Born",
    excerpt:
      "From a single ESP32 blinking an LED to a 53-project technology portfolio — the journey of building Circuvent Technologies from zero.",
    content: `
## It Started With a Blinking LED

Every great engineering journey starts somewhere small. For Circuvent Technologies, it started with an ESP32 development board and a single LED.

### The First Circuit

In early 2023, I plugged an ESP32 into a breadboard, connected an LED to GPIO pin 2, and wrote my first embedded C++ program:

\`\`\`cpp
void setup() {
    pinMode(2, OUTPUT);
}

void loop() {
    digitalWrite(2, HIGH);
    delay(1000);
    digitalWrite(2, LOW);
    delay(1000);
}
\`\`\`

That blinking LED was the first "circuvent" — the first time I bypassed the barrier between software and hardware. A simple act, but it planted a seed.

### The Name

"Circuvent" is a portmanteau: **Circuit** + **Circumvent**. It encapsulates our philosophy:

> Use circuits — both electrical and logical — to circumvent the limits of what technology can do.

### Growth Timeline

**2023 Q1**: First ESP32 projects, Arduino IoT Cloud experiments
**2023 Q2**: SmartHome v1 with Flutter and Firebase  
**2023 Q3**: First AI integration — adding GPT to our projects
**2023 Q4**: 10 projects completed, started full-stack web development
**2024 Q1**: CancerGuard AI inception, HRMS platform launch
**2024 Q2**: Vision AI with ESP32-CAM and YOLOv8
**2024 Q3**: JARVIS AI assistant, cross-platform expansion
**2024 Q4**: 30+ projects, first production deployments
**2025 Q1**: NEXUS AI OS begins, FinTech expansion
**2025 Q2**: CITADEL trading platform, StockMarket Agent
**2025 Q3**: 45+ projects, 150K lines of code
**2025 Q4**: EduKanban, MicroHabit, TimeCapsule
**2026 Q1**: 53+ projects, 200K+ lines, 8 production apps

### The Numbers Today

- **53+** projects across 6 technology domains
- **200,000+** lines of production code
- **15+** technology stacks mastered
- **8** applications in production
- **12+** AI/ML models deployed
- **9+** IoT devices in the field

### What's Next

Circuvent Technologies is just getting started. Our roadmap includes:
- NPU-accelerated AI for Intel Core Ultra
- Thread/Matter smart home protocol support
- Expanding the NEXUS AI OS agent ecosystem
- Mobile-first experiences for all platforms
- Community building and contributor growth

The blinking LED was chapter one. We're writing chapter fifty-three right now, and the story is far from over.
    `,
    author: "Harsha Bonthada",
    authorAvatar: "🧑‍💻",
    authorRole: "Founder & Lead Engineer",
    date: "2025-10-01",
    readTime: "6 min read",
    category: "Company",
    tags: ["Company", "Story", "Journey", "Startup"],
    featured: false,
    coverGradient: "from-cyan-500 via-violet-500 to-pink-500",
    icon: "Rocket",
  },
];

export const getBlogPostsByCategory = (category: BlogCategory): BlogPost[] => {
  if (category === "All") return blogPosts;
  return blogPosts.filter((p) => p.category === category);
};

export const getFeaturedBlogPosts = (): BlogPost[] => {
  return blogPosts.filter((p) => p.featured);
};

export const getBlogPostBySlug = (slug: string): BlogPost | undefined => {
  return blogPosts.find((p) => p.slug === slug);
};

export const getRelatedPosts = (currentSlug: string, limit = 3): BlogPost[] => {
  const current = getBlogPostBySlug(currentSlug);
  if (!current) return blogPosts.slice(0, limit);

  return blogPosts
    .filter((p) => p.slug !== currentSlug)
    .map((p) => ({
      post: p,
      relevance:
        (p.category === current.category ? 3 : 0) +
        p.tags.filter((t) => current.tags.includes(t)).length,
    }))
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, limit)
    .map((p) => p.post);
};
