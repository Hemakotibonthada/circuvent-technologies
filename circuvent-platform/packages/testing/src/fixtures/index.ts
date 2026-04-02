// ══════════════════════════════════════════════════════════════════════════════
// Testing Package — Standard Fixtures
// Reusable test data for all modules. Each fixture function returns a
// complete, valid entity with sensible defaults. Override any field.
// ══════════════════════════════════════════════════════════════════════════════

/** Counter for unique IDs */
let counter = 0;
function nextId(prefix: string = "test"): string { return `${prefix}-${++counter}-${Date.now().toString(36)}`; }

/**
 * User fixtures for auth-related tests.
 */
export const UserFixtures = {
  admin: (overrides?: Record<string, unknown>) => ({
    id: nextId("usr"), email: "admin@circuvent.com", firstName: "System", lastName: "Admin",
    role: "ADMIN", status: "ACTIVE", department: "Management",
    passwordHash: "$2b$12$test", ...overrides,
  }),
  engineer: (overrides?: Record<string, unknown>) => ({
    id: nextId("usr"), email: "engineer@circuvent.com", firstName: "Dev", lastName: "Engineer",
    role: "ENGINEER", status: "ACTIVE", department: "Engineering",
    passwordHash: "$2b$12$test", ...overrides,
  }),
  client: (overrides?: Record<string, unknown>) => ({
    id: nextId("usr"), email: "client@example.com", firstName: "Client", lastName: "User",
    role: "CLIENT", status: "ACTIVE", department: null,
    passwordHash: "$2b$12$test", ...overrides,
  }),
};

/**
 * Employee fixtures for HR module tests.
 */
export const EmployeeFixtures = {
  fullTime: (overrides?: Record<string, unknown>) => ({
    id: nextId("emp"), userId: nextId("usr"), employeeCode: `CIR-EMP-${counter}`,
    employmentType: "FULL_TIME", designation: "Senior Software Engineer",
    department: "Engineering", dateOfJoining: new Date("2024-06-15"),
    baseSalary: 120000, currency: "INR", payFrequency: "MONTHLY",
    panNumber: "ABCDE1234F", aadhaarNumber: "123456789012",
    uanNumber: "100012345678", bankAccountNo: "1234567890",
    bankIFSC: "SBIN0001234", ...overrides,
  }),
  intern: (overrides?: Record<string, unknown>) => ({
    id: nextId("emp"), userId: nextId("usr"), employeeCode: `CIR-INT-${counter}`,
    employmentType: "INTERN", designation: "Software Engineering Intern",
    department: "Engineering", dateOfJoining: new Date("2026-01-10"),
    baseSalary: 25000, currency: "INR", payFrequency: "MONTHLY",
    ...overrides,
  }),
  contractor: (overrides?: Record<string, unknown>) => ({
    id: nextId("emp"), userId: nextId("usr"), employeeCode: `CIR-CON-${counter}`,
    employmentType: "CONTRACT", designation: "DevOps Consultant",
    department: "Infrastructure", dateOfJoining: new Date("2025-09-01"),
    baseSalary: 200000, currency: "INR", payFrequency: "MONTHLY",
    ...overrides,
  }),
};

/**
 * IoT Device fixtures.
 */
export const DeviceFixtures = {
  temperatureSensor: (overrides?: Record<string, unknown>) => ({
    id: nextId("dev"), name: "Temperature Sensor Alpha",
    deviceCode: `DEV-${String(counter).padStart(3, "0")}`,
    macAddress: `AA:BB:CC:DD:${String(counter % 256).padStart(2, "0")}:01`,
    firmwareVersion: "2.1.0", status: "ONLINE",
    hardwareModel: "ESP32-WROOM", location: "Server Room A",
    ipAddress: `192.168.1.${100 + (counter % 100)}`,
    lastHeartbeat: new Date(), ...overrides,
  }),
  pressureSensor: (overrides?: Record<string, unknown>) => ({
    id: nextId("dev"), name: "Pressure Sensor Beta",
    deviceCode: `DEV-${String(counter).padStart(3, "0")}`,
    macAddress: `BB:CC:DD:EE:${String(counter % 256).padStart(2, "0")}:02`,
    firmwareVersion: "1.5.0", status: "ONLINE",
    hardwareModel: "STM32-F4", location: "Factory Floor",
    ...overrides,
  }),
  offlineDevice: (overrides?: Record<string, unknown>) => ({
    id: nextId("dev"), name: "Offline Gateway",
    deviceCode: `DEV-${String(counter).padStart(3, "0")}`,
    macAddress: `CC:DD:EE:FF:${String(counter % 256).padStart(2, "0")}:03`,
    firmwareVersion: "1.0.0", status: "OFFLINE",
    hardwareModel: "RaspberryPi-4", location: "Remote Site",
    lastHeartbeat: new Date(Date.now() - 3600000), // 1 hour ago
    ...overrides,
  }),
};

/**
 * Project fixtures.
 */
export const ProjectFixtures = {
  iotProject: (overrides?: Record<string, unknown>) => ({
    id: nextId("proj"), name: "Smart Sensor Hub v3",
    description: "IoT sensor aggregation platform",
    type: "HARDWARE", status: "ACTIVE",
    startDate: new Date("2026-01-15"), ...overrides,
  }),
  aiProject: (overrides?: Record<string, unknown>) => ({
    id: nextId("proj"), name: "Anomaly Detection Engine",
    description: "ML-based predictive maintenance for IoT devices",
    type: "SOFTWARE", status: "ACTIVE",
    startDate: new Date("2026-02-01"), ...overrides,
  }),
};

/**
 * Financial fixtures.
 */
export const FinancialFixtures = {
  assetAccount: (code: string = "1100", name: string = "Cash", overrides?: Record<string, unknown>) => ({
    id: nextId("acc"), code, name, type: "ASSET", subType: "CASH",
    isPostable: true, isActive: true, balance: 500000, currency: "INR",
    ...overrides,
  }),
  expenseAccount: (code: string = "6100", name: string = "Salary Expense", overrides?: Record<string, unknown>) => ({
    id: nextId("acc"), code, name, type: "EXPENSE", subType: "SALARY_EXPENSE",
    isPostable: true, isActive: true, balance: 0, currency: "INR",
    ...overrides,
  }),
  journalEntry: (overrides?: Record<string, unknown>) => ({
    id: nextId("je"), entryNumber: `JE-2026-${String(counter).padStart(4, "0")}`,
    date: new Date(), description: "Test Journal Entry",
    source: "MANUAL", status: "DRAFT",
    fiscalPeriod: "2026-03", createdBy: "admin",
    ...overrides,
  }),
};
