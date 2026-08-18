"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PageHeader from "@/components/PageHeader";
import ScrollReveal from "@/components/ScrollReveal";
import CTASection from "@/components/CTASection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabContent } from "@/components/ui/tabs";
import {
  BookOpen,
  Code2,
  Terminal,
  FileText,
  GitBranch,
  Layers,
  Database,
  ExternalLink,
  Copy,
  CheckCircle,
  ArrowRight,
  Cpu,
  Globe,
  Shield,
  Brain,
  Zap,
} from "lucide-react";

interface DocSection {
  id: string;
  title: string;
  icon: React.ElementType;
  content: DocItem[];
}

interface DocItem {
  title: string;
  description: string;
  code?: string;
  language?: string;
  notes?: string[];
}

const docSections: DocSection[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: Terminal,
    content: [
      {
        title: "Quick Setup",
        description: "Get Circuvent Technologies projects running locally in minutes.",
        code: `# Clone a project
git clone https://github.com/Hemakotibonthada/nexus-ai-os.git
cd nexus-ai-os

# Install dependencies
npm install        # or yarn / pnpm install

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Start development server
npm run dev

# Or start with Docker
docker-compose up -d`,
        language: "bash",
        notes: [
          "All projects include a .env.example with documented variables",
          "Docker Compose is the recommended deployment method",
          "Node 20+ is required for most JavaScript/TypeScript projects",
          "Python 3.12+ is required for FastAPI and ML projects",
        ],
      },
      {
        title: "Project Structure Convention",
        description: "Every Circuvent project follows this standard directory layout.",
        code: `project-root/
├── README.md              # Project overview, setup guide
├── ARCHITECTURE.md         # System design documentation
├── CONTRIBUTING.md         # Contribution guidelines
├── LICENSE                 # MIT License
├── .env.example            # Environment template
├── .gitignore
├── docker-compose.yml      # Docker deployment
├── Dockerfile              # Container build
│
├── src/                    # Source code
│   ├── app/                # Next.js App Router pages
│   ├── components/         # React components
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utilities, data, configs
│   └── types/              # TypeScript interfaces
│
├── public/                 # Static assets
├── docs/                   # Extended documentation
├── tests/                  # Test files
└── scripts/                # Build/deploy scripts`,
        language: "text",
      },
      {
        title: "Development Workflow",
        description: "Our standard development process for all projects.",
        code: `# 1. Create a feature branch
git checkout -b feature/new-feature

# 2. Make changes and test
npm run dev          # Start dev server
npm run lint         # Check code style
npm run type-check   # TypeScript validation

# 3. Commit with conventional commits
git add .
git commit -m "feat(component): add new feature"

# 4. Push and create PR
git push origin feature/new-feature
# Create PR on GitHub with description

# 5. After review and merge
git checkout main
git pull origin main`,
        language: "bash",
        notes: [
          "We follow Conventional Commits for all commit messages",
          "PRs require at least one review before merge",
          "All PRs must pass CI (lint, type-check, build)",
          "Squash merging is preferred for clean history",
        ],
      },
    ],
  },
  {
    id: "api-reference",
    title: "API Reference",
    icon: Code2,
    content: [
      {
        title: "REST API Conventions",
        description: "Standard API patterns used across all Circuvent backends.",
        code: `// Response Format (Success)
{
  "success": true,
  "data": { /* response payload */ },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 53,
    "totalPages": 3
  }
}

// Response Format (Error)
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email is required",
    "details": {
      "field": "email",
      "constraint": "required"
    }
  }
}

// Authentication Header
Authorization: Bearer <jwt_token>

// Rate Limiting Headers
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 58
X-RateLimit-Reset: 1709913600`,
        language: "json",
        notes: [
          "All APIs return consistent JSON response format",
          "Pagination uses cursor-based or offset pagination",
          "Rate limits are indicated via response headers",
          "JWT tokens expire after 24 hours, refresh tokens after 30 days",
        ],
      },
      {
        title: "WebSocket Protocol",
        description: "Real-time communication protocol for streaming AI responses.",
        code: `// Connect to WebSocket
const ws = new WebSocket('ws://localhost:8000/ws/chat');

// Send a message
ws.send(JSON.stringify({
  type: 'chat.message',
  payload: {
    content: 'What is the weather like?',
    agent: 'auto',  // or specific agent ID
    stream: true
  }
}));

// Receive streaming tokens
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch (data.type) {
    case 'chat.token':
      // Individual token from streaming response
      appendToResponse(data.payload.token);
      break;
    case 'chat.complete':
      // Full response complete
      finalizeResponse(data.payload);
      break;
    case 'agent.status':
      // Agent routing/status update
      updateAgentPanel(data.payload);
      break;
    case 'error':
      handleError(data.payload);
      break;
  }
};

// Heartbeat (keep connection alive)
setInterval(() => {
  ws.send(JSON.stringify({ type: 'ping' }));
}, 30000);`,
        language: "typescript",
        notes: [
          "WebSocket connections require JWT authentication",
          "Heartbeat messages prevent idle timeout (60s)",
          "Tokens are streamed individually for real-time UX",
          "Agent routing decisions are sent as status updates",
        ],
      },
      {
        title: "MQTT Protocol",
        description: "IoT messaging protocol for smart home device communication.",
        code: `// MQTT Topic Structure
// Control: home/{room}/{device}/{action}
// Status:  home/{room}/{device}/status
// Sensor:  home/{room}/sensors/{type}
// System:  home/system/{topic}

// Example: Toggle a light
mqtt.publish('home/living_room/light_1/toggle', '1');

// Example: Subscribe to all sensors in a room
mqtt.subscribe('home/bedroom/sensors/+');

// Example: Device status payload
{
  "device_id": "esp32_living_room",
  "relays": [true, false, true, false],
  "sensors": {
    "temperature": 24.5,
    "humidity": 62.3,
    "motion": true,
    "light": 450
  },
  "uptime": 86400,
  "firmware": "3.2.1",
  "wifi_rssi": -42
}

// QoS Levels
// QoS 0: Sensor data (best effort)
// QoS 1: Device commands (at least once)
// QoS 2: Safety-critical (exactly once)

// Last Will and Testament
mqtt.connect({
  will: {
    topic: 'home/system/health/esp32_living_room',
    payload: '{"status": "offline"}',
    qos: 1,
    retain: true
  }
});`,
        language: "javascript",
        notes: [
          "MQTT broker runs on Mosquitto with ACL authentication",
          "Device discovery uses retained messages on system/discovery",
          "Health heartbeats every 30 seconds, alert after 90s silence",
          "All device credentials are unique per-device, not shared",
        ],
      },
    ],
  },
  {
    id: "deployment",
    title: "Deployment Guide",
    icon: Layers,
    content: [
      {
        title: "Docker Compose Deployment",
        description: "Standard Docker Compose deployment pattern for all Circuvent applications.",
        code: `# docker-compose.yml
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
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
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
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    restart: unless-stopped
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      - POSTGRES_PASSWORD=\${DB_PASSWORD}
      - POSTGRES_DB=app
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --appendonly yes
    volumes:
      - redisdata:/data

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro
    depends_on:
      app:
        condition: service_healthy

volumes:
  pgdata:
  redisdata:`,
        language: "yaml",
        notes: [
          "Health checks are mandatory for all services",
          "Resource limits prevent memory/CPU exhaustion",
          "Logging is configured to prevent disk space issues",
          "Nginx handles SSL termination and reverse proxying",
        ],
      },
      {
        title: "CI/CD Pipeline",
        description: "GitHub Actions workflow for automated testing and deployment.",
        code: `# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check
      - run: npm run build
      - run: npm test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      
      - name: Build Docker image
        run: docker build -t app:latest .
      
      - name: Deploy to server
        uses: appleboy/ssh-action@v1
        with:
          host: \${{ secrets.SERVER_HOST }}
          username: \${{ secrets.SERVER_USER }}
          key: \${{ secrets.SSH_KEY }}
          script: |
            cd /opt/app
            docker compose pull
            docker compose build --no-cache app
            docker compose up -d --no-deps app
            timeout 60 bash -c 'until curl -sf http://localhost:3000/api/health; do sleep 2; done'
            docker image prune -f`,
        language: "yaml",
      },
      {
        title: "Database Backup",
        description: "Automated backup and recovery procedures.",
        code: `#!/bin/bash
# scripts/backup.sh
set -euo pipefail

BACKUP_DIR="/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

echo "Starting backup at $TIMESTAMP"

# PostgreSQL dump
docker compose exec -T db pg_dump -U postgres app_db | \\
  gzip > "$BACKUP_DIR/db_$TIMESTAMP.sql.gz"

# ChromaDB data
tar -czf "$BACKUP_DIR/chroma_$TIMESTAMP.tar.gz" \\
  -C /var/lib/docker/volumes/ nexus_chromadata

# Redis RDB snapshot
docker compose exec -T redis redis-cli BGSAVE
sleep 5
cp /var/lib/docker/volumes/nexus_redisdata/_data/dump.rdb \\
  "$BACKUP_DIR/redis_$TIMESTAMP.rdb"

# Cleanup old backups
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "*.rdb" -mtime +$RETENTION_DAYS -delete

echo "Backup complete: db_$TIMESTAMP.sql.gz"

# Verify backup integrity
gunzip -t "$BACKUP_DIR/db_$TIMESTAMP.sql.gz"
echo "Backup verified successfully"`,
        language: "bash",
        notes: [
          "Run daily via cron: 0 2 * * * /opt/app/scripts/backup.sh",
          "30-day retention policy for all backups",
          "Backup verification with gunzip -t after each backup",
          "Consider off-site backup replication for disaster recovery",
        ],
      },
      {
        title: "Monitoring Setup",
        description: "Prometheus + Grafana monitoring stack configuration.",
        code: `# monitoring/docker-compose.monitoring.yml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    restart: unless-stopped
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheusdata:/prometheus
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana:latest
    restart: unless-stopped
    volumes:
      - grafanadata:/var/lib/grafana
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=\${GRAFANA_PASSWORD}

  loki:
    image: grafana/loki:latest
    restart: unless-stopped
    ports:
      - "3100:3100"
    volumes:
      - loki_data:/loki

  cadvisor:
    image: gcr.io/cadvisor/cadvisor:latest
    restart: unless-stopped
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
    ports:
      - "8080:8080"

volumes:
  prometheusdata:
  grafanadata:
  loki_data:`,
        language: "yaml",
      },
    ],
  },
  {
    id: "architecture-patterns",
    title: "Architecture Patterns",
    icon: Database,
    content: [
      {
        title: "Multi-Agent AI Pattern",
        description: "How we structure AI agent systems for modularity and scalability.",
        code: `# Base Agent Interface
from abc import ABC, abstractmethod
from pydantic import BaseModel

class AgentMessage(BaseModel):
    sender: str
    receiver: str
    payload: dict
    correlation_id: str
    timestamp: datetime

class BaseAgent(ABC):
    def __init__(self, name: str, model: str, system_prompt: str):
        self.name = name
        self.model = model
        self.system_prompt = system_prompt
        self.tools: list[Tool] = []
        self.memory: MemoryStore
    
    @abstractmethod
    async def process(
        self, 
        query: str, 
        context: dict
    ) -> AgentResponse:
        """Process a user query and return a response."""
        pass
    
    async def use_tool(self, tool_name: str, params: dict) -> Any:
        """Execute a registered tool."""
        tool = next(t for t in self.tools if t.name == tool_name)
        return await tool.execute(params)
    
    async def remember(self, key: str, value: str) -> None:
        """Store information in long-term memory."""
        await self.memory.store(
            collection=self.name,
            document=value,
            metadata={"key": key, "agent": self.name}
        )
    
    async def recall(self, query: str, k: int = 5) -> list[str]:
        """Retrieve relevant memories."""
        return await self.memory.search(
            collection=self.name,
            query=query,
            n_results=k
        )

# Specialized Agent Example
class FinancialAgent(BaseAgent):
    def __init__(self):
        super().__init__(
            name="financial_advisor",
            model="llama3.1:70b-q4",
            system_prompt=FINANCIAL_SYSTEM_PROMPT
        )
        self.tools = [
            BudgetAnalysisTool(),
            ExpenseCategorizer(),
            InvestmentCalculator(),
            TaxEstimator(),
        ]
    
    async def process(self, query: str, context: dict) -> AgentResponse:
        # Retrieve relevant financial history
        memories = await self.recall(query)
        
        # Classify intent
        intent = await self.classify(query)
        
        # Use appropriate tool if needed
        if intent.requires_tool:
            tool_result = await self.use_tool(
                intent.tool_name, 
                intent.tool_params
            )
            context["tool_result"] = tool_result
        
        # Generate response with context
        response = await self.llm.generate(
            model=self.model,
            system=self.system_prompt,
            messages=[
                {"role": "system", "content": f"Context: {memories}"},
                {"role": "user", "content": query}
            ],
            stream=True
        )
        
        # Store interaction in memory
        await self.remember(
            key=f"interaction_{datetime.now().isoformat()}",
            value=f"Q: {query}\\nA: {response.text}"
        )
        
        return AgentResponse(
            text=response.text,
            agent=self.name,
            tools_used=intent.tool_name if intent.requires_tool else None,
            confidence=response.confidence
        )`,
        language: "python",
      },
      {
        title: "ESP32 Firmware Template",
        description: "Standard firmware structure for production IoT devices.",
        code: `#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <ArduinoOTA.h>
#include <SPIFFS.h>

// ===== Configuration =====
#define DEVICE_ID "esp32_living_room"
#define DEVICE_ROOM "living_room"
#define DEVICE_TYPE "relay_controller"
#define FIRMWARE_VERSION "3.2.1"
#define MQTT_BROKER "mqtt.circuvent.local"
#define MQTT_PORT 1883
#define NUM_RELAYS 4
#define HEALTH_INTERVAL 30000  // 30 seconds
#define SENSOR_INTERVAL 5000   // 5 seconds

// Pin mapping
const int RELAY_PINS[] = {25, 26, 27, 14};
const int DHT_PIN = 4;
const int PIR_PIN = 15;
const int LDR_PIN = 34;
const int STATUS_LED = 2;

// State
bool relayStates[NUM_RELAYS] = {false};
unsigned long lastHealthPing = 0;
unsigned long lastSensorRead = 0;
int reconnectAttempts = 0;

WiFiClient espClient;
PubSubClient mqtt(espClient);

// ===== WiFi Management =====
void connectWiFi() {
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 30) {
        delay(500);
        digitalWrite(STATUS_LED, !digitalRead(STATUS_LED));
        attempts++;
    }
    
    if (WiFi.status() == WL_CONNECTED) {
        digitalWrite(STATUS_LED, HIGH);
        Serial.printf("WiFi connected: %s\\n", WiFi.localIP().toString().c_str());
        reconnectAttempts = 0;
    } else {
        // Exponential backoff
        int backoff = min(60000, 1000 * (1 << reconnectAttempts));
        reconnectAttempts++;
        delay(backoff);
        ESP.restart();
    }
}

// ===== MQTT Management =====
void connectMQTT() {
    mqtt.setServer(MQTT_BROKER, MQTT_PORT);
    mqtt.setCallback(mqttCallback);
    mqtt.setBufferSize(512);
    
    String clientId = String(DEVICE_ID) + "_" + String(random(0xffff), HEX);
    
    // Last Will and Testament
    String willTopic = "home/system/health/" + String(DEVICE_ID);
    String willPayload = "{\\"status\\":\\"offline\\",\\"device_id\\":\\"" + String(DEVICE_ID) + "\\"}";
    
    if (mqtt.connect(clientId.c_str(), MQTT_USER, MQTT_PASS, 
                     willTopic.c_str(), 1, true, willPayload.c_str())) {
        // Subscribe to control topics
        mqtt.subscribe(("home/" + String(DEVICE_ROOM) + "/" + String(DEVICE_ID) + "/#").c_str());
        mqtt.subscribe("home/system/ota/" + String(DEVICE_ID));
        
        // Announce presence
        announceDevice();
        publishStatus();
    }
}

// ===== Relay Control =====
void toggleRelay(int index) {
    if (index >= 0 && index < NUM_RELAYS) {
        relayStates[index] = !relayStates[index];
        digitalWrite(RELAY_PINS[index], relayStates[index] ? HIGH : LOW);
        publishStatus();
        saveRelayStates();
    }
}

void setRelay(int index, bool state) {
    if (index >= 0 && index < NUM_RELAYS) {
        relayStates[index] = state;
        digitalWrite(RELAY_PINS[index], state ? HIGH : LOW);
    }
}

void disableAllRelays() {
    for (int i = 0; i < NUM_RELAYS; i++) {
        setRelay(i, false);
    }
    publishStatus();
}

// ===== Sensor Reading =====
void readAndPublishSensors() {
    StaticJsonDocument<256> doc;
    doc["temperature"] = readTemperature();
    doc["humidity"] = readHumidity();
    doc["motion"] = digitalRead(PIR_PIN);
    doc["light"] = analogRead(LDR_PIN);
    doc["timestamp"] = millis();
    
    char buffer[256];
    serializeJson(doc, buffer);
    
    mqtt.publish(
        ("home/" + String(DEVICE_ROOM) + "/sensors/environment").c_str(),
        buffer
    );
}

// ===== Persistence =====
void saveRelayStates() {
    if (SPIFFS.begin(true)) {
        File file = SPIFFS.open("/relay_states.json", "w");
        if (file) {
            StaticJsonDocument<128> doc;
            JsonArray arr = doc.createNestedArray("states");
            for (int i = 0; i < NUM_RELAYS; i++) {
                arr.add(relayStates[i]);
            }
            serializeJson(doc, file);
            file.close();
        }
    }
}

void loadRelayStates() {
    if (SPIFFS.begin(true)) {
        File file = SPIFFS.open("/relay_states.json", "r");
        if (file) {
            StaticJsonDocument<128> doc;
            DeserializationError error = deserializeJson(doc, file);
            if (!error) {
                JsonArray arr = doc["states"].as<JsonArray>();
                for (int i = 0; i < min((int)arr.size(), NUM_RELAYS); i++) {
                    relayStates[i] = arr[i].as<bool>();
                    digitalWrite(RELAY_PINS[i], relayStates[i] ? HIGH : LOW);
                }
            }
            file.close();
        }
    }
}

// ===== Setup =====
void setup() {
    Serial.begin(115200);
    
    // Initialize pins
    for (int i = 0; i < NUM_RELAYS; i++) {
        pinMode(RELAY_PINS[i], OUTPUT);
        digitalWrite(RELAY_PINS[i], LOW);
    }
    pinMode(STATUS_LED, OUTPUT);
    pinMode(PIR_PIN, INPUT);
    
    // Load saved states
    loadRelayStates();
    
    // Connect
    connectWiFi();
    connectMQTT();
    
    // Enable OTA
    setupOTA();
    
    // Enable watchdog (8 second timeout)
    esp_task_wdt_init(8, true);
    esp_task_wdt_add(NULL);
}

// ===== Loop =====
void loop() {
    // Reset watchdog
    esp_task_wdt_reset();
    
    // Maintain connections
    if (WiFi.status() != WL_CONNECTED) connectWiFi();
    if (!mqtt.connected()) connectMQTT();
    mqtt.loop();
    
    // OTA updates
    ArduinoOTA.handle();
    
    // Health heartbeat
    if (millis() - lastHealthPing > HEALTH_INTERVAL) {
        publishHealthStatus();
        lastHealthPing = millis();
    }
    
    // Sensor readings
    if (millis() - lastSensorRead > SENSOR_INTERVAL) {
        readAndPublishSensors();
        lastSensorRead = millis();
    }
}`,
        language: "cpp",
        notes: [
          "Watchdog timer prevents firmware hangs — device auto-resets after 8s of inactivity",
          "SPIFFS stores relay states persistently — survives power cycles",
          "Exponential backoff on WiFi reconnection prevents rapid restart loops",
          "Last Will and Testament publishes 'offline' status on unexpected disconnection",
          "OTA updates allow remote firmware deployment without physical access",
        ],
      },
    ],
  },
  {
    id: "contributing",
    title: "Contributing",
    icon: GitBranch,
    content: [
      {
        title: "Contribution Guide",
        description: "How to contribute to Circuvent Technologies open source projects.",
        code: `# Step 1: Fork the repository on GitHub

# Step 2: Clone your fork
git clone https://github.com/YOUR_USERNAME/project-name.git
cd project-name

# Step 3: Add upstream remote
git remote add upstream https://github.com/Hemakotibonthada/project-name.git

# Step 4: Create feature branch
git checkout -b feature/your-feature-name

# Step 5: Make your changes
# - Follow the existing code style
# - Add tests for new features
# - Update documentation

# Step 6: Commit with conventional commits
git add .
git commit -m "feat(scope): add your feature description"

# Commit types:
# feat:     New feature
# fix:      Bug fix
# docs:     Documentation changes
# style:    Code formatting (no logic changes)
# refactor: Code restructuring
# test:     Add/update tests
# chore:    Dependency updates, config changes

# Step 7: Push to your fork
git push origin feature/your-feature-name

# Step 8: Create Pull Request on GitHub
# - Clear title describing the change
# - Link any related issues
# - Include screenshots for UI changes
# - Ensure CI passes`,
        language: "bash",
        notes: [
          "All PRs must pass CI (lint, type-check, build) before review",
          "Include tests for new features and bug fixes",
          "Update CHANGELOG.md for user-facing changes",
          "Respond to review comments within 48 hours",
          "Squash commits on merge for clean history",
        ],
      },
      {
        title: "Code Style Guide",
        description: "Coding conventions we follow across all projects.",
        code: `// TypeScript / React Conventions

// 1. Use function declarations for components
export default function ComponentName({ prop1, prop2 }: Props) {
  // ...
}

// 2. Extract types/interfaces above the component
interface Props {
  prop1: string;
  prop2: number;
  onAction?: () => void;
}

// 3. Use 'const' by default, 'let' when mutation needed
const immutableValue = "hello";
let mutableCounter = 0;

// 4. Prefer arrow functions for callbacks
const handleClick = () => {
  // ...
};

// 5. Use descriptive variable names
// Bad: const d = new Date();
// Good: const createdAt = new Date();

// 6. Early returns for guard clauses
function processData(data: Data | null) {
  if (!data) return null;
  if (data.isEmpty) return [];
  
  // Main logic here
  return data.process();
}

// 7. Use CSS variables for theming
// Bad: color: "#0891b2"
// Good: color: "var(--accent-cyan)"

// 8. Co-locate related code
// components/ProjectCard.tsx       ← Component
// components/ProjectCard.test.tsx  ← Tests
// components/ProjectCard.stories.tsx ← Stories (if using Storybook)

// Python Conventions
# 1. Use type hints everywhere
async def process_query(query: str, context: dict[str, Any]) -> AgentResponse:
    pass

# 2. Use Pydantic for data validation
class UserInput(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    message: str = Field(min_length=20, max_length=2000)

# 3. Use async/await for I/O operations
async def fetch_data(url: str) -> dict:
    async with httpx.AsyncClient() as client:
        response = await client.get(url)
        return response.json()

# 4. Use dataclasses or Pydantic for structured data
@dataclass
class AgentConfig:
    name: str
    model: str
    max_tokens: int = 2048
    temperature: float = 0.7`,
        language: "typescript",
      },
    ],
  },
];

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState(docSections[0].id);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const currentSection = docSections.find((s) => s.id === activeSection)!;

  const handleCopy = async (code: string, id: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(id);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      // fallback
    }
  };

  const tabs = docSections.map((s) => ({
    id: s.id,
    label: s.title,
    icon: <s.icon className="w-4 h-4" />,
  }));

  return (
    <>

      <PageHeader
        eyebrow="Documentation"
        eyebrowColor="var(--accent-cyan-text)"
        title="Developer"
        titleHighlight="Docs"
        description="Comprehensive documentation for setting up, developing, deploying, and contributing to Circuvent Technologies projects."
      />

      {/* Tabs */}
      <section className="relative z-10 py-8">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="flex justify-center mb-12">
              <Tabs
                tabs={tabs}
                activeTab={activeSection}
                onTabChange={setActiveSection}
                variant="pills"
              />
            </div>
          </ScrollReveal>

          {/* Content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="max-w-4xl mx-auto space-y-8"
            >
              {currentSection.content.map((item, i) => (
                <ScrollReveal key={item.title} delay={i * 0.08}>
                  <div
                    className="rounded-2xl overflow-hidden"
                    style={{
                      background: "var(--bg-glass)",
                      border: "1px solid var(--border-primary)",
                      backdropFilter: "blur(24px)",
                    }}
                  >
                    <div className="p-6 sm:p-8">
                      <h3
                        className="text-xl font-bold mb-2"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {item.title}
                      </h3>
                      <p
                        className="text-sm mb-6"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {item.description}
                      </p>

                      {/* Code Block */}
                      {item.code && (
                        <div
                          className="rounded-xl overflow-hidden mb-4"
                          style={{
                            background: "var(--bg-surface)",
                            border: "1px solid var(--border-primary)",
                          }}
                        >
                          <div
                            className="flex items-center justify-between px-4 py-2"
                            style={{
                              background: "var(--bg-elevated)",
                              borderBottom: "1px solid var(--border-primary)",
                            }}
                          >
                            <span
                              className="text-xs font-mono"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {item.language}
                            </span>
                            <button
                              onClick={() => handleCopy(item.code!, `${activeSection}-${i}`)}
                              className="min-h-[44px] flex items-center gap-1 text-xs cursor-pointer transition-colors hover:text-[var(--accent-cyan)]"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {copiedCode === `${activeSection}-${i}` ? (
                                <>
                                  <CheckCircle className="w-3 h-3 text-emerald-500" />
                                  Copied!
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  Copy
                                </>
                              )}
                            </button>
                          </div>
                          <pre className="p-4 overflow-x-auto text-xs leading-relaxed">
                            <code style={{ color: "var(--text-secondary)" }}>
                              {item.code}
                            </code>
                          </pre>
                        </div>
                      )}

                      {/* Notes */}
                      {item.notes && item.notes.length > 0 && (
                        <div
                          className="rounded-xl p-4"
                          style={{
                            background: "var(--accent-cyan-muted)",
                            border: "1px solid var(--border-accent)",
                          }}
                        >
                          <h4
                            className="text-xs font-semibold uppercase tracking-wider mb-2"
                            style={{ color: "var(--accent-cyan-text)" }}
                          >
                            Notes
                          </h4>
                          <ul className="space-y-1.5">
                            {item.notes.map((note, j) => (
                              <li
                                key={j}
                                className="flex items-start gap-2 text-xs"
                                style={{ color: "var(--text-tertiary)" }}
                              >
                                <span style={{ color: "var(--accent-cyan-text)" }}>•</span>
                                {note}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </ScrollReveal>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>
      </section>

      <CTASection
        title="Need help with"
        titleHighlight="Integration?"
        description="Our documentation is continuously updated. Can't find what you need? Reach out and we'll help."
        primaryCTA={{ label: "Contact Us", href: "/contact" }}
        secondaryCTA={{ label: "View Source", href: "https://github.com/Hemakotibonthada" }}
      />
    </>
  );
}
