export interface ServiceItem {
  id: string;
  title: string;
  tagline: string;
  description: string;
  icon: string;
  gradient: string;
  features: string[];
  technologies: string[];
  deliverables: string[];
  timeline: string;
  ideal: string;
}

export const services: ServiceItem[] = [
  {
    id: "ai-ml-solutions",
    title: "AI & ML Solutions",
    tagline: "Intelligent Systems That Learn and Adapt",
    description:
      "We design, train, and deploy AI systems that solve real business problems. From multi-agent orchestration and RAG pipelines to computer vision and predictive analytics — our AI solutions run on-device or in the cloud, depending on your needs.",
    icon: "Brain",
    gradient: "from-violet-500 to-purple-500",
    features: [
      "Custom LLM integration (GPT-4, Gemini, Ollama)",
      "Multi-agent systems with orchestration",
      "RAG pipelines with vector databases",
      "Computer vision (YOLOv8, OpenCV)",
      "Predictive analytics and forecasting",
      "NPU-accelerated edge inference",
      "Active learning pipelines",
      "Conversational AI with memory",
    ],
    technologies: [
      "Python",
      "FastAPI",
      "Ollama",
      "OpenAI",
      "ChromaDB",
      "YOLOv8",
      "TensorFlow",
      "PyTorch",
    ],
    deliverables: [
      "Trained models with evaluation metrics",
      "API endpoints for model inference",
      "Monitoring dashboard for model performance",
      "Docker-composed deployment",
      "Documentation and model cards",
    ],
    timeline: "4-12 weeks",
    ideal: "Businesses looking to automate complex processes with custom AI, or startups building AI-first products.",
  },
  {
    id: "iot-embedded",
    title: "IoT & Embedded Systems",
    tagline: "Hardware-Software Integration at Scale",
    description:
      "From ESP32 firmware development to complete IoT ecosystems with cloud backends and mobile apps. We handle the full vertical: circuit design, firmware, communication protocols, cloud integration, and cross-platform control interfaces.",
    icon: "Cpu",
    gradient: "from-cyan-500 to-teal-500",
    features: [
      "ESP32/Arduino firmware development",
      "MQTT broker design and deployment",
      "Sensor integration and calibration",
      "OTA firmware update systems",
      "Energy monitoring and optimization",
      "Home automation ecosystems",
      "Industrial IoT data pipelines",
      "Edge computing solutions",
    ],
    technologies: [
      "ESP32",
      "Arduino",
      "C++",
      "MQTT",
      "PlatformIO",
      "Flutter",
      "Firebase",
      "Node.js",
    ],
    deliverables: [
      "Production-ready firmware",
      "MQTT topic architecture design",
      "Cross-platform control app",
      "Cloud backend with real-time sync",
      "Hardware schematics and BOM",
    ],
    timeline: "6-16 weeks",
    ideal: "Companies building smart products, home automation integrators, or industrial IoT deployments.",
  },
  {
    id: "full-stack-web",
    title: "Full-Stack Web Development",
    tagline: "Modern Web Applications Built to Scale",
    description:
      "Production-grade web applications built with Next.js, React, and robust backends. We handle everything from UI/UX design to database architecture, API development, authentication, payment integration, and deployment.",
    icon: "Globe",
    gradient: "from-blue-500 to-indigo-500",
    features: [
      "Next.js / React SPA and SSR applications",
      "RESTful and GraphQL API design",
      "Database design (PostgreSQL, MongoDB, Firebase)",
      "Authentication (JWT, OAuth, SSO)",
      "Payment integration (Razorpay, Stripe)",
      "Real-time features with WebSockets",
      "Admin dashboards and analytics",
      "SEO optimization and performance tuning",
    ],
    technologies: [
      "Next.js",
      "React",
      "TypeScript",
      "Express",
      "PostgreSQL",
      "Prisma",
      "MongoDB",
      "Redis",
    ],
    deliverables: [
      "Production-deployed web application",
      "API documentation (OpenAPI/Swagger)",
      "Admin panel for content management",
      "CI/CD pipeline configuration",
      "Performance audit report",
    ],
    timeline: "4-12 weeks",
    ideal: "Startups launching MVPs, SaaS companies, or businesses digitizing operations.",
  },
  {
    id: "mobile-development",
    title: "Mobile App Development",
    tagline: "Cross-Platform Apps for iOS, Android, and Web",
    description:
      "High-quality mobile applications built with Flutter and React Native. Single codebase, native performance, seamless Firebase integration. From concept to App Store and Play Store deployment.",
    icon: "Layers",
    gradient: "from-pink-500 to-rose-500",
    features: [
      "Flutter and React Native development",
      "Firebase backend integration",
      "Push notifications (FCM)",
      "Offline-first architecture",
      "Biometric authentication",
      "Payment integration (Razorpay, Stripe)",
      "App Store and Play Store deployment",
      "Deep linking and dynamic links",
    ],
    technologies: [
      "Flutter",
      "React Native",
      "Dart",
      "TypeScript",
      "Firebase",
      "Expo",
      "Riverpod",
      "Zustand",
    ],
    deliverables: [
      "iOS and Android builds",
      "App Store / Play Store submission",
      "Firebase backend configuration",
      "Analytics and crash reporting",
      "User documentation",
    ],
    timeline: "6-14 weeks",
    ideal: "Companies needing iOS + Android apps from a single codebase, or existing web apps expanding to mobile.",
  },
  {
    id: "enterprise-platforms",
    title: "Enterprise Platforms",
    tagline: "Custom Internal Tools That Replace SaaS",
    description:
      "Self-hosted enterprise platforms that replace expensive SaaS subscriptions. HRMS, project management, CMS, email infrastructure, and custom business tools — built to your exact requirements with complete data ownership.",
    icon: "Building2",
    gradient: "from-slate-400 to-zinc-500",
    features: [
      "HRMS and employee management",
      "Project management and sprint boards",
      "Custom CMS and content platforms",
      "Self-hosted email infrastructure",
      "Document management systems",
      "Role-based access control",
      "Audit logging and compliance",
      "Integration with existing tools",
    ],
    technologies: [
      "Next.js",
      "Express",
      "PostgreSQL",
      "Prisma",
      "Docker",
      "Redis",
      "Nginx",
      "OAuth 2.0",
    ],
    deliverables: [
      "Self-hosted platform with Docker Compose",
      "Admin documentation",
      "Data migration scripts",
      "Backup and recovery procedures",
      "SLA and maintenance plan",
    ],
    timeline: "8-20 weeks",
    ideal: "Companies paying $2K+ monthly for SaaS tools, or organizations requiring data sovereignty.",
  },
  {
    id: "devops-infrastructure",
    title: "DevOps & Infrastructure",
    tagline: "Reliable Deployment and Monitoring",
    description:
      "Docker containerization, CI/CD pipelines, monitoring stacks, and production deployment. We ensure your applications run reliably with automated backups, health checks, and zero-downtime deployments.",
    icon: "Shield",
    gradient: "from-emerald-500 to-teal-500",
    features: [
      "Docker and Docker Compose setup",
      "CI/CD pipeline design (GitHub Actions)",
      "Monitoring (Prometheus, Grafana, Loki)",
      "Nginx reverse proxy and SSL",
      "Automated backup systems",
      "Zero-downtime deployments",
      "Log aggregation and alerting",
      "Security hardening and audit",
    ],
    technologies: [
      "Docker",
      "GitHub Actions",
      "Nginx",
      "Prometheus",
      "Grafana",
      "Loki",
      "Let's Encrypt",
      "Ubuntu Server",
    ],
    deliverables: [
      "Docker Compose production setup",
      "CI/CD pipeline configuration",
      "Monitoring dashboard",
      "Runbook documentation",
      "Security audit report",
    ],
    timeline: "2-6 weeks",
    ideal: "Teams deploying their first production app, or companies modernizing from manual deployments.",
  },
];

export const getServiceById = (id: string): ServiceItem | undefined => {
  return services.find((s) => s.id === id);
};

export interface Testimonial {
  id: string;
  name: string;
  role: string;
  company: string;
  avatar: string;
  content: string;
  rating: number;
  service: string;
}

export const testimonials: Testimonial[] = [
  {
    id: "1",
    name: "Hema Koteswar Naidu",
    role: "Founder & CEO",
    company: "Circuvent Technologies",
    avatar: "👨‍💼",
    content:
      "We built our entire smart home IoT platform — from ESP32 firmware to the Flutter app and Alexa integration. The quality of our embedded systems work is exceptional. The product went from concept to production in 3 months.",
    rating: 5,
    service: "IoT & Embedded Systems",
  },
  {
    id: "3",
    name: "Chiru Kotcherla",
    role: "Co-Founder & Marketing Director",
    company: "Circuvent Technologies",
    avatar: "👨‍💼",
    content:
      "We replaced multiple SaaS tools with HT Connect — saving significant costs monthly. The platform handles our team's HR operations and sprint management flawlessly. 98.5% uptime over 12 months speaks for itself.",
    rating: 5,
    service: "Enterprise Platforms",
  },
  {
    id: "4",
    name: "Vijay Pithani",
    role: "Co-Founder & Head of Electronics",
    company: "Circuvent Technologies",
    avatar: "🧑‍🔧",
    content:
      "TravelMate is one of the best cross-platform apps we've built. Offline maps, real-time translation, Gemini AI integration — all from a single React Native codebase. Delivered on every requirement.",
    rating: 5,
    service: "Mobile App Development",
  },
  {
    id: "5",
    name: "Hema Koteswar Naidu",
    role: "Founder & CEO",
    company: "Circuvent Technologies",
    avatar: "📊",
    content:
      "The StockMarket Agent is exactly what we needed — a local-first trading engine with proper walk-forward backtesting. No cloud dependency means strategies stay private. The DuckDB + Parquet data stack is lightning fast.",
    rating: 5,
    service: "FinTech Solutions",
  },
];

export interface FAQ {
  question: string;
  answer: string;
  category: string;
}

export const faqs: FAQ[] = [
  {
    question: "What technologies do you specialize in?",
    answer:
      "We specialize in 15+ technology stacks spanning AI/ML (Python, FastAPI, Ollama, OpenAI), IoT (ESP32, MQTT, Arduino), Web (React, Next.js, Express), Mobile (Flutter, React Native), Databases (PostgreSQL, MongoDB, Firebase, DuckDB), and DevOps (Docker, GitHub Actions).",
    category: "General",
  },
  {
    question: "Do you work with startups or only enterprises?",
    answer:
      "We work with both. Startups benefit from our rapid prototyping and MVP development capabilities, while enterprises leverage our production-grade architecture and DevOps expertise. Our pricing models accommodate both scales.",
    category: "General",
  },
  {
    question: "What is your approach to AI — cloud or local?",
    answer:
      "We follow a 'local-first' philosophy. Our default is to run AI on-device using Ollama, OpenVINO, or ONNX Runtime. For use cases requiring cloud-scale models (GPT-4, Gemini), we provide secure API integrations with caching and fallback mechanisms.",
    category: "AI",
  },
  {
    question: "Can you build custom IoT hardware solutions?",
    answer:
      "Yes. We handle the entire IoT vertical: circuit design, PCB layout guidance, ESP32 firmware development, MQTT broker setup, cloud backend, and cross-platform mobile/web control apps. We've deployed 9+ production IoT devices.",
    category: "IoT",
  },
  {
    question: "How do you handle project management?",
    answer:
      "We use our own HT Connect platform (a tool we built) for sprint management with Kanban boards, burndown charts, and velocity tracking. Clients get visibility into progress through weekly demos and shared dashboards.",
    category: "Process",
  },
  {
    question: "What's your typical project timeline?",
    answer:
      "MVP: 4-8 weeks. Full production application: 8-16 weeks. Enterprise platform: 12-24 weeks. IoT ecosystem (firmware + app + cloud): 6-16 weeks. AI/ML model development: 4-12 weeks. These are estimates — actual timelines depend on scope.",
    category: "Process",
  },
  {
    question: "Do you provide ongoing maintenance and support?",
    answer:
      "Yes. We offer maintenance plans that include bug fixes, security updates, performance monitoring, and feature enhancements. All our production applications are Docker-composed, making updates straightforward.",
    category: "Support",
  },
  {
    question: "Is your code open source?",
    answer:
      "All our internal projects are open source on GitHub. For client projects, we provide full source code ownership — you get the complete codebase, no proprietary lock-in. We believe transparency builds trust.",
    category: "General",
  },
  {
    question: "What databases do you recommend?",
    answer:
      "It depends on the use case: PostgreSQL for relational data (HRMS, enterprise), MongoDB for document-heavy apps (CMS, health records), Firebase for real-time sync (mobile apps, IoT), DuckDB for analytics and time-series (FinTech), and Redis for caching and pub/sub.",
    category: "Technical",
  },
  {
    question: "Can you integrate with existing systems?",
    answer:
      "Absolutely. We've integrated with Razorpay, Stripe, Zerodha API, Google APIs (Maps, Translate, Gemini), Alexa Skills Kit, Firebase services, SMTP servers, and various REST/GraphQL APIs. We can work with your existing tech stack.",
    category: "Technical",
  },
];

export interface CareerRole {
  id: string;
  title: string;
  department: string;
  type: string;
  location: string;
  experience: string;
  description: string;
  responsibilities: string[];
  requirements: string[];
  niceToHave: string[];
  benefits: string[];
  gradient: string;
}

export const careerRoles: CareerRole[] = [
  {
    id: "senior-ai-engineer",
    title: "Senior AI Engineer",
    department: "AI & Agents",
    type: "Full-time",
    location: "Remote / India",
    experience: "3+ years",
    description:
      "Lead our AI agent architecture and build the next generation of NEXUS AI OS. You'll design multi-agent systems, implement RAG pipelines, and optimize LLM inference for local deployment.",
    responsibilities: [
      "Architect and build multi-agent AI systems with Ollama and OpenAI",
      "Design and implement RAG pipelines with ChromaDB and LangChain",
      "Optimize LLM inference for local deployment using quantization and pruning",
      "Build FastAPI backends for AI model serving",
      "Implement active learning loops for continuous model improvement",
      "Mentor junior engineers on ML best practices",
    ],
    requirements: [
      "3+ years of professional ML/AI experience",
      "Strong Python skills (FastAPI, asyncio, Pydantic)",
      "Experience with LLMs (fine-tuning, prompting, RAG)",
      "Familiarity with vector databases (ChromaDB, Pinecone, Weaviate)",
      "Understanding of ML model deployment and serving",
      "Experience with Docker containerization",
    ],
    niceToHave: [
      "Experience with Ollama or local LLM inference",
      "Computer vision experience (YOLOv8, OpenCV)",
      "NPU/GPU acceleration experience (OpenVINO, CUDA)",
      "Contributions to open-source AI projects",
    ],
    benefits: [
      "Work on cutting-edge local-first AI systems",
      "Full ownership of the AI stack",
      "Open source contributions on company time",
      "Flexible remote work",
      "Conference and learning budget",
    ],
    gradient: "from-violet-500 to-purple-500",
  },
  {
    id: "iot-platform-engineer",
    title: "IoT Platform Engineer",
    department: "IoT & Embedded",
    type: "Full-time",
    location: "Hyderabad, India",
    experience: "2+ years",
    description:
      "Design and scale our ESP32 firmware and MQTT infrastructure. You'll write production-grade embedded code, design communication protocols, and integrate with cloud and mobile platforms.",
    responsibilities: [
      "Develop production-grade ESP32 firmware in C++ using PlatformIO",
      "Design MQTT topic architectures and broker configurations",
      "Implement OTA firmware update systems",
      "Integrate sensor networks (temperature, motion, energy, gas)",
      "Build fail-safe relay control with watchdog timers",
      "Collaborate with mobile team on IoT app features",
    ],
    requirements: [
      "2+ years of embedded systems experience",
      "Strong C/C++ skills",
      "Experience with ESP32 or similar microcontrollers",
      "Understanding of MQTT, WiFi, and BLE protocols",
      "Familiarity with PlatformIO or Arduino IDE",
      "Basic understanding of circuit design",
    ],
    niceToHave: [
      "Experience with ESP-NOW mesh networking",
      "Flutter or React Native mobile development",
      "PCB design experience (KiCad, EasyEDA)",
      "Industrial IoT or energy monitoring experience",
    ],
    benefits: [
      "Work with real hardware — devices you build get deployed",
      "Full IoT stack experience (firmware to cloud)",
      "Open source contributions",
      "Hardware experimentation budget",
      "Flexible work arrangements",
    ],
    gradient: "from-cyan-500 to-teal-500",
  },
  {
    id: "full-stack-developer",
    title: "Full-Stack Developer",
    department: "Web & Mobile",
    type: "Full-time",
    location: "Remote / India",
    experience: "2+ years",
    description:
      "Ship features across multiple products simultaneously. You'll build React/Next.js frontends, Node.js/Python backends, and everything in between. We need someone who can own the full stack.",
    responsibilities: [
      "Build production-quality React/Next.js web applications",
      "Develop Node.js/Express or FastAPI backends",
      "Design and optimize database schemas (PostgreSQL, MongoDB)",
      "Implement authentication, payments, and third-party integrations",
      "Write clean, tested, documented code",
      "Participate in code reviews and architecture discussions",
    ],
    requirements: [
      "2+ years of full-stack development experience",
      "Strong React/Next.js skills with TypeScript",
      "Backend experience with Node.js or Python",
      "Database design (SQL and/or NoSQL)",
      "Understanding of REST API design principles",
      "Git proficiency and CI/CD awareness",
    ],
    niceToHave: [
      "React Native or Flutter experience",
      "Docker and deployment experience",
      "Experience with Prisma, Drizzle, or similar ORMs",
      "Open-source contributions",
    ],
    benefits: [
      "Work on diverse projects (not just one product)",
      "Full-stack ownership — frontend to database",
      "Open source by default",
      "Remote-first culture",
      "Learning and conference budget",
    ],
    gradient: "from-blue-500 to-indigo-500",
  },
  {
    id: "flutter-mobile-engineer",
    title: "Flutter Mobile Engineer",
    department: "Mobile",
    type: "Contract / Full-time",
    location: "Remote",
    experience: "2+ years",
    description:
      "Build and maintain our cross-platform mobile applications. You'll work on SmartHome, Financial Analyzer, and new mobile products using Flutter with Firebase, Riverpod, and native integrations.",
    responsibilities: [
      "Build production-quality Flutter applications for iOS and Android",
      "Implement Firebase integration (Auth, Firestore, FCM, Cloud Functions)",
      "Design state management with Riverpod",
      "Optimize app performance and startup time",
      "Handle App Store and Play Store submissions",
      "Implement offline-first data architectures",
    ],
    requirements: [
      "2+ years of Flutter development experience",
      "Strong Dart skills",
      "Firebase integration experience",
      "Published apps on App Store or Play Store",
      "Understanding of mobile UI/UX principles",
      "State management experience (Riverpod, Bloc, or Provider)",
    ],
    niceToHave: [
      "IoT or MQTT integration experience",
      "React Native experience (for cross-training)",
      "Native iOS (Swift) or Android (Kotlin) skills",
      "Payment integration experience (Razorpay, Stripe)",
    ],
    benefits: [
      "Work on IoT, FinTech, and consumer mobile apps",
      "Ship to real users on multiple platforms",
      "Firebase backend expertise",
      "Remote work with flexible hours",
      "Hardware provided for testing",
    ],
    gradient: "from-pink-500 to-rose-500",
  },
  {
    id: "frontend-design-engineer",
    title: "Frontend / Design Engineer",
    department: "Design & Frontend",
    type: "Full-time",
    location: "Remote / India",
    experience: "2+ years",
    description:
      "Craft pixel-perfect interfaces with React, Next.js, and Framer Motion. We want someone who cares about every detail — from micro-interactions to accessibility to performance.",
    responsibilities: [
      "Design and build pixel-perfect React/Next.js interfaces",
      "Create fluid animations with Framer Motion",
      "Implement responsive, accessible UI components",
      "Build and maintain a shared component library",
      "Optimize Core Web Vitals and page performance",
      "Collaborate on design systems and brand consistency",
    ],
    requirements: [
      "2+ years of frontend development experience",
      "Expert-level React and TypeScript skills",
      "Experience with Tailwind CSS and modern CSS",
      "Animation experience (Framer Motion, CSS animations)",
      "Strong eye for design and attention to detail",
      "Accessibility (WCAG) awareness",
    ],
    niceToHave: [
      "Figma design skills",
      "Three.js or WebGL experience",
      "Experience building component libraries",
      "Performance optimization experience",
    ],
    benefits: [
      "Work on public-facing products that showcase your craft",
      "Freedom to propose design improvements",
      "Open source UI components",
      "Remote work with async-friendly culture",
      "Conference and design tool budget",
    ],
    gradient: "from-amber-500 to-orange-500",
  },
  {
    id: "devops-platform-engineer",
    title: "DevOps & Platform Engineer",
    department: "Infrastructure",
    type: "Full-time",
    location: "Remote / India",
    experience: "2+ years",
    description:
      "Docker, CI/CD, cloud infrastructure, and monitoring. Keep our 8+ production apps running smoothly. You'll own the deployment pipeline, monitoring stack, and infrastructure automation.",
    responsibilities: [
      "Manage Docker Compose production deployments",
      "Build and maintain GitHub Actions CI/CD pipelines",
      "Set up monitoring with Prometheus, Grafana, and Loki",
      "Implement automated backup and recovery systems",
      "Configure Nginx reverse proxy and SSL certificates",
      "Security hardening and vulnerability management",
    ],
    requirements: [
      "2+ years of DevOps or SRE experience",
      "Strong Docker and Docker Compose skills",
      "CI/CD pipeline design (GitHub Actions, Jenkins, or similar)",
      "Linux server administration (Ubuntu)",
      "Nginx configuration and SSL management",
      "Monitoring and alerting experience",
    ],
    niceToHave: [
      "Kubernetes experience",
      "Cloud provider experience (AWS, GCP, Azure)",
      "Terraform or Ansible experience",
      "Security audit experience",
    ],
    benefits: [
      "Own the entire infrastructure stack",
      "8+ production apps to keep running",
      "Build monitoring and observability from scratch",
      "Remote work with on-call rotation",
      "Cloud credits for experimentation",
    ],
    gradient: "from-emerald-500 to-teal-500",
  },
];

export const getCareerById = (id: string): CareerRole | undefined => {
  return careerRoles.find((r) => r.id === id);
};

export const careerBenefitsGlobal = [
  {
    title: "Open Source Culture",
    description: "Build in public. Every project is open source.",
    icon: "Globe",
  },
  {
    title: "Full Stack Ownership",
    description: "Own your entire stack — from firmware to frontend.",
    icon: "Layers",
  },
  {
    title: "AI-Augmented Workflow",
    description: "We use AI tools daily to amplify output 10x.",
    icon: "Brain",
  },
  {
    title: "Remote-First",
    description: "Work from anywhere in India. Async-friendly culture.",
    icon: "Globe",
  },
  {
    title: "Learning Budget",
    description: "Conference attendance and course subscriptions covered.",
    icon: "GraduationCap",
  },
  {
    title: "Hardware Budget",
    description: "ESP32 boards, sensors, and dev tools provided.",
    icon: "Cpu",
  },
  {
    title: "Ship Weekly",
    description: "Continuous delivery — deploy to production every week.",
    icon: "Rocket",
  },
  {
    title: "Impact Work",
    description: "Your code serves real users in production environments.",
    icon: "Zap",
  },
];
