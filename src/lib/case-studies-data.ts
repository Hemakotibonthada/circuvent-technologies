/**
 * Extended project data with detailed case studies, architecture details,
 * and comprehensive documentation for each major project.
 */

export interface ProjectCaseStudy {
  projectId: string;
  overview: string;
  challenge: string;
  approach: string;
  architecture: string[];
  implementation: ImplementationPhase[];
  results: ProjectResult[];
  lessonsLearned: string[];
  futureRoadmap: string[];
  metrics: ProjectMetric[];
  screenshots: string[];
  codeSnippets: CodeSnippet[];
}

export interface ImplementationPhase {
  phase: string;
  duration: string;
  description: string;
  deliverables: string[];
}

export interface ProjectResult {
  metric: string;
  value: string;
  improvement?: string;
}

export interface ProjectMetric {
  label: string;
  value: string;
  category: "performance" | "scale" | "quality" | "business";
}

export interface CodeSnippet {
  title: string;
  language: string;
  code: string;
  description: string;
}

export const projectCaseStudies: ProjectCaseStudy[] = [
  {
    projectId: "nexus-ai-os",
    overview:
      "NEXUS AI OS is our most ambitious project — a local-first AI operating system that orchestrates 13+ specialized agents to handle personal, financial, health, home automation, and productivity tasks entirely on-device. No cloud dependency, no data leaving the machine, zero subscription fees.",
    challenge:
      "The traditional AI landscape relies on cloud APIs which compromise privacy and require ongoing costs. We needed to build a system that matches cloud AI quality while running 100% locally, handling diverse domains (finance, health, home, code), and maintaining sub-2-second response times.",
    approach:
      "We designed a multi-agent architecture where each domain has a specialized agent with its own prompt templates and tool access. An orchestrator agent performs intent classification and routes queries. All inference runs through Ollama with dynamic model selection based on system resources. Agent context is shared via ChromaDB vector store and Redis pub/sub IPC bus.",
    architecture: [
      "Frontend Layer: React (web), Electron (desktop), React Native (mobile) sharing a common API client",
      "API Gateway: FastAPI with async WebSocket connections for streaming responses",
      "Orchestrator: Intent classification using Llama 3.1 8B for fast routing decisions",
      "Specialist Agents: 13 agents each with domain-specific prompts, tools, and context",
      "Memory Layer: ChromaDB for long-term memory, Redis for short-term session context",
      "Model Serving: Ollama managing Llama 3.1 70B (complex), 8B (fast), CodeLlama 34B (code)",
      "IPC Bus: Redis Pub/Sub for inter-agent communication with correlation IDs",
      "Deployment: Docker Compose with 6 services (API, Ollama, ChromaDB, Redis, Web, Worker)",
    ],
    implementation: [
      {
        phase: "Foundation",
        duration: "4 weeks",
        description: "Core infrastructure — FastAPI backend, Ollama integration, basic agent framework, Docker setup.",
        deliverables: ["FastAPI server with WebSocket support", "Ollama model management", "Agent base class with tool framework", "Docker Compose configuration"],
      },
      {
        phase: "Agent Development",
        duration: "6 weeks",
        description: "Building specialized agents — Personal, Financial, Health, Home, Code, Research, Calendar, Email.",
        deliverables: ["8 specialized agents", "Intent classification system", "Agent IPC bus via Redis", "ChromaDB memory integration"],
      },
      {
        phase: "Frontend Platforms",
        duration: "4 weeks",
        description: "React web dashboard, Electron desktop app with system tray, React Native mobile app.",
        deliverables: ["React web dashboard", "Electron desktop build", "React Native mobile app", "Shared API client package"],
      },
      {
        phase: "Integration & Polish",
        duration: "3 weeks",
        description: "Agent collaboration flows, performance optimization, error handling, documentation.",
        deliverables: ["Multi-agent collaboration chains", "Performance benchmarks", "Error recovery system", "User documentation"],
      },
    ],
    results: [
      { metric: "Average Response Time", value: "1.2s", improvement: "Simple queries" },
      { metric: "Complex Query Time", value: "4.5s", improvement: "Multi-agent tasks" },
      { metric: "Memory Baseline", value: "8GB RAM", improvement: "16GB recommended" },
      { metric: "Model Storage", value: "12GB", improvement: "For all models" },
      { metric: "Concurrent Agents", value: "5", improvement: "Simultaneous processing" },
      { metric: "Zero Cloud Dependency", value: "100%", improvement: "All local" },
    ],
    lessonsLearned: [
      "Dynamic model sizing is critical — Llama 70B is unnecessary for simple queries",
      "Redis Pub/Sub is excellent for agent IPC but needs correlation IDs for tracking",
      "ChromaDB chunk size significantly affects RAG retrieval quality",
      "Electron + React shares 95% of the web codebase with minimal platform-specific code",
      "Docker memory limits prevent OOM kills when running multiple LLM instances",
      "Prompt engineering is 80% of agent quality — good prompts beat bigger models",
    ],
    futureRoadmap: [
      "NPU acceleration for Intel Core Ultra processors via OpenVINO",
      "Voice interaction with local Whisper speech-to-text model",
      "ESP32 IoT integration for true smart home AI",
      "Offline-first mobile experience with on-device inference",
      "Plugin marketplace for community-contributed agents",
      "Multi-language support (Hindi, Telugu, Spanish)",
    ],
    metrics: [
      { label: "Total Lines of Code", value: "35K+", category: "scale" },
      { label: "Agent Count", value: "13+", category: "scale" },
      { label: "API Endpoints", value: "45", category: "scale" },
      { label: "Docker Services", value: "6", category: "scale" },
      { label: "Avg Query Latency", value: "1.2s", category: "performance" },
      { label: "Memory Usage", value: "8GB", category: "performance" },
      { label: "Test Coverage", value: "72%", category: "quality" },
      { label: "Uptime", value: "99.2%", category: "quality" },
    ],
    screenshots: [],
    codeSnippets: [
      {
        title: "Agent Orchestrator",
        language: "python",
        description: "The orchestrator classifies user intent and routes to the appropriate specialist agent.",
        code: `class OrchestratorAgent(BaseAgent):
    def __init__(self):
        super().__init__(
            name="orchestrator",
            model="llama3.1:8b",
            system_prompt=ORCHESTRATOR_SYSTEM_PROMPT
        )
        self.agent_registry = AgentRegistry()
        self.ipc_bus = AgentIPCBus()
    
    async def process(self, query: str, context: dict) -> AgentResponse:
        # Step 1: Classify intent
        classification = await self.classify_intent(query)
        
        # Step 2: Route to specialist
        target_agent = self.agent_registry.get(classification.agent_id)
        
        # Step 3: Execute with context
        response = await target_agent.process(
            query=query,
            context={**context, **classification.extracted_params}
        )
        
        # Step 4: Post-process and return
        return self.format_response(response, classification)`,
      },
      {
        title: "IPC Message Bus",
        language: "python",
        description: "Redis-based inter-process communication for agent collaboration.",
        code: `class AgentIPCBus:
    def __init__(self):
        self.redis = Redis(host='localhost', port=6379)
        self.context_db = ChromaDB(path='./agent_contexts')
    
    async def send_message(
        self, 
        from_agent: str, 
        to_agent: str, 
        payload: dict
    ):
        message = AgentMessage(
            sender=from_agent,
            receiver=to_agent,
            payload=payload,
            timestamp=datetime.utcnow(),
            correlation_id=uuid4()
        )
        await self.redis.publish(
            f"agent:{to_agent}", 
            message.model_dump_json()
        )
    
    async def request_collaboration(
        self, 
        initiator: str, 
        agents: list[str], 
        task: dict
    ) -> list[AgentResponse]:
        responses = []
        for agent_id in agents:
            await self.send_message(initiator, agent_id, task)
            response = await self.wait_for_response(
                agent_id, timeout=30
            )
            responses.append(response)
        return responses`,
      },
    ],
  },
  {
    projectId: "smarthome-ecosystem",
    overview:
      "Our SmartHome Ecosystem is a production-grade cross-platform home automation platform built on Flutter, Firebase, and MQTT. It integrates ESP32 firmware, Alexa voice skills, Razorpay payments, and real-time energy monitoring — a complete IoT vertical from silicon to subscription.",
    challenge:
      "Build a unified smart home platform that controls 9+ IoT devices across multiple rooms with real-time responsiveness (<100ms), voice control, energy monitoring, and a subscription business model — all running reliably 24/7.",
    approach:
      "Three-layer architecture: ESP32 firmware layer (C++/PlatformIO), communication layer (MQTT/Firebase), and application layer (Flutter/Web/Alexa). Each device runs custom firmware with OTA update capability, watchdog timers, and automatic WiFi reconnection with exponential backoff.",
    architecture: [
      "Device Layer: ESP32 nodes with DHT22, PIR, LDR, ACS712 sensors and relay control",
      "Communication: Mosquitto MQTT broker with hierarchical topics and QoS management",
      "Backend: Firebase (Auth, Firestore, Cloud Functions, FCM) for cloud sync",
      "Mobile App: Flutter with Riverpod state management and MQTT direct connection",
      "Web Dashboard: React dashboard for monitoring and administration",
      "Voice: Alexa Smart Home Skill for voice-activated device control",
      "Payments: Razorpay integration for premium subscription features",
      "OTA: Custom firmware update system with progress tracking and rollback",
    ],
    implementation: [
      {
        phase: "Hardware Prototype",
        duration: "3 weeks",
        description: "ESP32 firmware development, sensor integration, relay control circuits, MQTT topic design.",
        deliverables: ["ESP32 firmware v1.0", "Sensor calibration", "MQTT topic architecture", "Circuit schematics"],
      },
      {
        phase: "Cloud Backend",
        duration: "2 weeks",
        description: "Firebase setup, Firestore schema, Cloud Functions, authentication system.",
        deliverables: ["Firebase project configuration", "Firestore security rules", "Cloud Functions for automation", "User authentication flow"],
      },
      {
        phase: "Mobile Application",
        duration: "4 weeks",
        description: "Flutter app with Riverpod, device control UI, energy monitoring, MQTT integration.",
        deliverables: ["Flutter app (iOS + Android)", "Device control interface", "Energy monitoring dashboard", "MQTT real-time control"],
      },
      {
        phase: "Voice & Payments",
        duration: "2 weeks",
        description: "Alexa skill development, Razorpay subscription integration, premium features.",
        deliverables: ["Alexa Smart Home skill", "Razorpay payment flow", "Subscription management", "Premium feature gates"],
      },
      {
        phase: "OTA & Deployment",
        duration: "2 weeks",
        description: "OTA firmware update system, 9-device deployment, monitoring, documentation.",
        deliverables: ["OTA update system", "9 deployed devices", "Monitoring dashboard", "User manual"],
      },
    ],
    results: [
      { metric: "Devices Deployed", value: "9+", improvement: "24/7 operation" },
      { metric: "Command Latency", value: "<100ms", improvement: "Via MQTT direct" },
      { metric: "System Uptime", value: "99.5%", improvement: "Over 12 months" },
      { metric: "OTA Updates", value: "Remote", improvement: "Progress tracked" },
      { metric: "Voice Control", value: "Alexa", improvement: "All rooms" },
      { metric: "Energy Tracking", value: "Real-time", improvement: "Cost estimation" },
    ],
    lessonsLearned: [
      "WiFi reconnection with exponential backoff is essential for ESP32 reliability",
      "MQTT QoS 1 for commands (guaranteed delivery), QoS 0 for sensor data (best effort)",
      "Watchdog timers prevent ESP32 from hanging — critical for safety-sensitive relays",
      "SPIFFS filesystem for configuration reduces EEPROM wear significantly",
      "Cheap USB power adapters cause ESP32 brownouts — use proper 5V/2A supplies",
      "Flutter's Riverpod state management is far superior to Provider for complex IoT state",
    ],
    futureRoadmap: [
      "Integration with NEXUS AI OS for intelligent automation rules",
      "Machine learning on sensor data for predictive climate control",
      "Solar panel monitoring and smart grid integration",
      "Thread/Matter protocol support for ecosystem compatibility",
      "Energy optimization recommendations based on usage patterns",
    ],
    metrics: [
      { label: "Total Lines of Code", value: "15K+", category: "scale" },
      { label: "IoT Devices", value: "9+", category: "scale" },
      { label: "Sensor Types", value: "5", category: "scale" },
      { label: "Platform Coverage", value: "iOS, Android, Web, Alexa", category: "scale" },
      { label: "MQTT Latency", value: "<100ms", category: "performance" },
      { label: "System Uptime", value: "99.5%", category: "quality" },
      { label: "OTA Success Rate", value: "98%", category: "quality" },
      { label: "Daily Energy Reports", value: "Automated", category: "business" },
    ],
    screenshots: [],
    codeSnippets: [
      {
        title: "ESP32 MQTT Handler",
        language: "cpp",
        description: "MQTT message handler on ESP32 for device control commands.",
        code: `void mqttCallback(char* topic, byte* payload, unsigned int length) {
    String message;
    for (unsigned int i = 0; i < length; i++) {
        message += (char)payload[i];
    }
    
    String topicStr = String(topic);
    
    // Parse room/device/action from topic
    // Format: home/{room}/{device}/{action}
    int firstSlash = topicStr.indexOf('/', 5);
    int secondSlash = topicStr.indexOf('/', firstSlash + 1);
    int thirdSlash = topicStr.indexOf('/', secondSlash + 1);
    
    String room = topicStr.substring(5, firstSlash);
    String device = topicStr.substring(firstSlash + 1, secondSlash);
    String action = topicStr.substring(secondSlash + 1);
    
    if (room == DEVICE_ROOM && device == DEVICE_NAME) {
        if (action == "toggle") {
            int relayIndex = message.toInt();
            if (relayIndex >= 0 && relayIndex < NUM_RELAYS) {
                toggleRelay(relayIndex);
                publishStatus();
            }
        } else if (action == "set") {
            // Parse JSON for multiple relay states
            handleSetCommand(message);
        }
    }
    
    // Health check response
    if (topicStr == "home/system/health/ping") {
        publishHealthStatus();
    }
}`,
      },
      {
        title: "Flutter Riverpod Device Controller",
        language: "dart",
        description: "Riverpod provider for managing IoT device state with MQTT.",
        code: `@riverpod
class DeviceController extends _\$DeviceController {
  late MqttClient _mqttClient;
  
  @override
  Future<List<Device>> build() async {
    final userId = ref.watch(currentUserProvider).value?.uid;
    if (userId == null) return [];
    
    // Initialize MQTT connection
    _mqttClient = await ref.watch(mqttClientProvider.future);
    
    // Subscribe to device status updates
    _mqttClient.subscribe('home/+/+/status', MqttQos.atLeastOnce);
    
    // Listen for status updates
    _mqttClient.updates?.listen((messages) {
      for (final msg in messages) {
        final payload = MqttPublishPayload.bytesToStringAsString(
          msg.payload.message
        );
        _handleStatusUpdate(msg.topic, payload);
      }
    });
    
    // Load initial state from Firestore
    return ref.watch(deviceRepositoryProvider).getDevices(userId);
  }
  
  Future<void> toggleDevice(String deviceId, int relayIndex) async {
    // Send MQTT command for instant response
    _mqttClient.publishMessage(
      'home/\${_getRoom(deviceId)}/\${_getDeviceName(deviceId)}/toggle',
      MqttQos.atLeastOnce,
      MqttClientPayloadBuilder()
        ..addString(relayIndex.toString())
    );
    
    // Update Firestore for cloud sync
    await ref.read(deviceRepositoryProvider).updateRelayState(
      deviceId, relayIndex
    );
    
    ref.invalidateSelf();
  }
}`,
      },
    ],
  },
  {
    projectId: "cancerguard-ai",
    overview:
      "CancerGuard AI is a HIPAA-aligned healthcare platform using an ensemble of XGBoost, LightGBM, Random Forest, and Neural Networks for cancer risk prediction. The system serves 3 role-based portals (Patient, Hospital, Admin) through 69 API endpoints, with features including blood donor geo-matching and smartwatch vital integration.",
    challenge:
      "Build a reliable cancer risk prediction system that considers multiple risk factors with high accuracy, supports three different user roles with appropriate access controls, includes geo-spatial blood donor matching, and follows healthcare compliance standards.",
    approach:
      "Two-level stacking ensemble: Level 1 with four base ML models making independent predictions, Level 2 with a Logistic Regression meta-learner combining results. FastAPI backend with role-based access control, SQLite database with comprehensive audit logging, and React frontend with Material-UI.",
    architecture: [
      "ML Pipeline: Data preprocessing → Feature engineering → Model training → Ensemble stacking",
      "Base Models: XGBoost (n=500), LightGBM (n=500), Random Forest (n=300), Neural Network (4 layers)",
      "Meta-Learner: Logistic Regression combining Level 1 predictions",
      "Backend: FastAPI with 69 REST endpoints organized by role (Patient: 22, Hospital: 28, Admin: 19)",
      "Database: SQLite with encrypted patient data and complete audit trail",
      "Frontend: React with TypeScript, Material-UI, role-based dashboard routing",
      "Blood Bank: Geo-spatial donor matching with MongoDB $nearSphere queries",
      "Compliance: End-to-end encryption, RBAC, audit logging, data anonymization",
    ],
    implementation: [
      {
        phase: "Data & ML Pipeline",
        duration: "3 weeks",
        description: "Data preprocessing, feature engineering, model training, ensemble architecture.",
        deliverables: ["Training pipeline", "4 base models", "Meta-learner", "Evaluation metrics"],
      },
      {
        phase: "Backend API",
        duration: "4 weeks",
        description: "FastAPI with 69 endpoints, RBAC, database schema, audit logging.",
        deliverables: ["69 API endpoints", "Role-based access control", "Database schema", "Audit logging system"],
      },
      {
        phase: "Frontend Portals",
        duration: "4 weeks",
        description: "Three role-based React portals — Patient, Hospital, Admin — with dashboards.",
        deliverables: ["Patient portal", "Hospital portal", "Admin portal", "Analytics dashboards"],
      },
      {
        phase: "Blood Bank & Integration",
        duration: "2 weeks",
        description: "Geo-spatial donor matching, smartwatch integration, compliance review.",
        deliverables: ["Blood donor matching", "Wearable data integration", "HIPAA compliance audit", "Documentation"],
      },
    ],
    results: [
      { metric: "Prediction Accuracy", value: "94.2%", improvement: "Held-out test set" },
      { metric: "AUC-ROC", value: "0.967", improvement: "Ensemble vs single model" },
      { metric: "API Response Time", value: "<200ms", improvement: "Risk prediction" },
      { metric: "API Endpoints", value: "69", improvement: "3 role-based portals" },
      { metric: "Donor Matching", value: "25km radius", improvement: "Geo-spatial search" },
    ],
    lessonsLearned: [
      "Ensemble stacking consistently outperforms individual models by 3-7%",
      "SMOTE for class balancing is essential for cancer risk (imbalanced dataset)",
      "Feature engineering (BMI calculation, age binning) contributes more than model complexity",
      "Role-based API design prevents data leakage between patient and hospital portals",
      "SQLite is sufficient for single-server medical systems with proper indexing",
    ],
    futureRoadmap: [
      "Integration with hospital EHR systems",
      "Explainable AI (SHAP values) for model interpretability",
      "Real-time wearable data monitoring",
      "Multi-cancer type prediction expansion",
      "Clinical trial matching based on patient profile",
    ],
    metrics: [
      { label: "ML Accuracy", value: "94.2%", category: "quality" },
      { label: "AUC-ROC", value: "0.967", category: "quality" },
      { label: "API Endpoints", value: "69", category: "scale" },
      { label: "User Roles", value: "3", category: "scale" },
      { label: "Response Time", value: "<200ms", category: "performance" },
      { label: "Total LOC", value: "20K+", category: "scale" },
    ],
    screenshots: [],
    codeSnippets: [
      {
        title: "Ensemble Predictor",
        language: "python",
        description: "Two-level stacking ensemble for cancer risk prediction.",
        code: `class CancerEnsemblePredictor:
    def __init__(self):
        self.base_models = {
            'xgboost': XGBClassifier(
                n_estimators=500, max_depth=6,
                learning_rate=0.01, subsample=0.8
            ),
            'lightgbm': LGBMClassifier(
                n_estimators=500, num_leaves=31,
                learning_rate=0.01
            ),
            'random_forest': RandomForestClassifier(
                n_estimators=300, max_depth=10
            ),
            'neural_net': self._build_nn()
        }
        self.meta_learner = LogisticRegression()
    
    def fit(self, X, y):
        # Level 1: Cross-validated base model training
        meta_features = np.zeros((len(X), len(self.base_models)))
        
        kf = StratifiedKFold(n_splits=5, shuffle=True)
        for i, (name, model) in enumerate(self.base_models.items()):
            for train_idx, val_idx in kf.split(X, y):
                model.fit(X[train_idx], y[train_idx])
                meta_features[val_idx, i] = model.predict_proba(
                    X[val_idx]
                )[:, 1]
        
        # Level 2: Meta-learner on stacked predictions
        self.meta_learner.fit(meta_features, y)
        
        # Refit base models on full data
        for model in self.base_models.values():
            model.fit(X, y)
    
    def predict_proba(self, X):
        meta_features = np.column_stack([
            model.predict_proba(X)[:, 1]
            for model in self.base_models.values()
        ])
        return self.meta_learner.predict_proba(meta_features)`,
      },
    ],
  },
];

export const getProjectCaseStudy = (projectId: string): ProjectCaseStudy | undefined => {
  return projectCaseStudies.find((cs) => cs.projectId === projectId);
};

/**
 * Project statistics aggregated across all projects
 */
export const aggregatedProjectStats = {
  summary: {
    totalProjects: 53,
    productionApps: 8,
    betaApps: 12,
    alphaApps: 3,
    conceptApps: 2,
    totalLinesOfCode: 200000,
    totalCommits: 4200,
    totalContributors: 1,
    averageImpactScore: 84.6,
  },
  byCategory: [
    { category: "AI & Agents", count: 8, avgImpact: 92.5, totalLOC: 65000 },
    { category: "IoT & Smart Home", count: 9, avgImpact: 88.3, totalLOC: 35000 },
    { category: "FinTech", count: 4, avgImpact: 84.5, totalLOC: 28000 },
    { category: "HealthTech", count: 3, avgImpact: 91.0, totalLOC: 25000 },
    { category: "Enterprise", count: 5, avgImpact: 83.2, totalLOC: 22000 },
    { category: "Web & Mobile", count: 7, avgImpact: 80.1, totalLOC: 18000 },
    { category: "Education", count: 3, avgImpact: 82.0, totalLOC: 7000 },
  ],
  byTechnology: [
    { tech: "React / Next.js", projects: 15, percentage: 28 },
    { tech: "Firebase", projects: 14, percentage: 26 },
    { tech: "Node.js / Express", projects: 12, percentage: 23 },
    { tech: "Python / FastAPI", projects: 10, percentage: 19 },
    { tech: "ESP32 / MQTT", projects: 9, percentage: 17 },
    { tech: "TypeScript", projects: 18, percentage: 34 },
    { tech: "Docker", projects: 8, percentage: 15 },
    { tech: "Flutter / Dart", projects: 4, percentage: 8 },
    { tech: "React Native", projects: 5, percentage: 9 },
    { tech: "PostgreSQL", projects: 7, percentage: 13 },
  ],
  byStatus: {
    production: {
      count: 8,
      apps: ["SmartHome", "HT Connect", "TravelMate", "Financial Analyzer", "EduKanban", "ATS Resume", "NetShare Pro", "Health India"],
    },
    beta: {
      count: 12,
      apps: ["NEXUS AI OS", "CancerGuard AI", "Vision AI", "JARVIS", "StockMarket Agent", "TimeCapsule"],
    },
    alpha: {
      count: 3,
      apps: ["CITADEL", "Neural Sentinel", "MicroHabit"],
    },
  },
  timeline: {
    startDate: "January 2023",
    currentDate: "March 2026",
    monthsActive: 38,
    avgProjectsPerMonth: 1.4,
    mostProductiveMonth: { month: "September 2024", projects: 4 },
  },
};
