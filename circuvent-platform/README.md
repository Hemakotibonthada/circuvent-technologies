# Circuvent Technologies — Internal Management Platform

A unified monorepo platform integrating **Project Tracking**, **IoT Device Registry**, **HR & Payroll**, and **Client Portal** into a single source of truth.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Next.js Frontend (:3005)                 │
├──────────────────────────────────────────────────────────────┤
│                    API Gateway (:3000)                        │
│              JWT Auth │ RBAC │ Rate Limiting                 │
├──────────┬───────────┬───────────┬───────────────────────────┤
│ Project  │    IoT    │    HR &   │   Client &                │
│ Tracker  │ Registry  │  Payroll  │   Consulting              │
│  :3001   │   :3002   │   :3003   │    :3004                  │
├──────────┴───────────┴───────────┴───────────────────────────┤
│              PostgreSQL  │  Redis  │  Prisma ORM             │
└──────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer       | Technology                    |
|-------------|-------------------------------|
| Frontend    | Next.js 14, React, Tailwind   |
| Gateway     | Express + Proxy Middleware    |
| Services    | Express (TypeScript)          |
| Database    | PostgreSQL + Prisma ORM       |
| Auth        | JWT + bcrypt + RBAC           |
| Monorepo    | Turborepo + pnpm workspaces   |
| Containers  | Docker Compose                |

## Modules

### 1. Project & Engineering Tracker
- Sprint management (Kanban board)
- Hardware revision tracking with BOM (Bill of Materials)
- R&D tax tagging for eligible projects and components

### 2. IoT Device Registry
- Device registration with MAC address tracking
- Firmware version management and OTA updates
- Real-time telemetry data ingestion and monitoring

### 3. HR & Payroll Engine
- Employee database with India tax compliance
- Automated salary calculations (PF, ESI, TDS, Professional Tax)
- R&D expense reimbursement linked to BOM items

### 4. Client & Consulting Portal
- Lead tracking pipeline (CRM)
- Multi-currency automated invoicing (GST compliant)
- Revenue dashboard and analytics

## Quick Start

```bash
# 1. Clone and install
pnpm install

# 2. Start databases
docker compose up postgres redis -d

# 3. Setup database
cp .env.example .env
pnpm db:generate
pnpm db:push
pnpm db:seed

# 4. Start all services
pnpm dev
```

## Project Structure

```
circuvent-platform/
├── apps/
│   ├── api-gateway/           # API Gateway (port 3000)
│   ├── web/                   # Next.js Frontend (port 3005)
│   └── services/
│       ├── project-tracker/   # Module 1 (port 3001)
│       ├── iot-registry/      # Module 2 (port 3002)
│       ├── hr-payroll/        # Module 3 (port 3003)
│       └── client-portal/     # Module 4 (port 3004)
├── packages/
│   ├── database/              # Prisma schema & client (shared)
│   ├── shared/                # Types, utils, constants
│   ├── auth/                  # JWT + RBAC middleware
│   └── audit/                 # Audit logging service
├── docker/                    # Dockerfiles
├── docker-compose.yml
├── turbo.json
└── package.json
```

## RBAC Roles

| Role     | Access                                              |
|----------|-----------------------------------------------------|
| ADMIN    | Full access to all modules                          |
| ENGINEER | Projects, IoT, own HR records, assigned tasks       |
| CLIENT   | Client portal, own invoices, project visibility     |

## API Endpoints

| Service          | Base Route        | Description               |
|------------------|-------------------|---------------------------|
| Auth             | `/api/auth`       | Login, register, refresh  |
| Projects         | `/api/projects`   | CRUD projects, sprints    |
| Hardware         | `/api/projects`   | BOM, revisions            |
| IoT Devices      | `/api/iot`        | Device registry, firmware |
| HR               | `/api/hr`         | Employees, payroll        |
| Clients          | `/api/clients`    | Leads, invoices           |
| Health           | `/api/health`     | System status             |

## Seed Credentials

| Role     | Email                      | Password     |
|----------|----------------------------|--------------|
| Admin    | admin@circuvent.com        | admin@123    |
| Engineer | engineer@circuvent.com     | engineer@123 |
| Client   | client@example.com         | client@123   |
