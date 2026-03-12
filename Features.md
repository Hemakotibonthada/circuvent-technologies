# Circuvent Technologies — Features & Functionalities

> Complete catalog of every feature and functionality available in the HRMS & DevOps Portal.

---

## 1. Authentication & Security

| Feature | What You Can Do |
|---------|----------------|
| **Email/Password Login** | Register, login, logout with email and password |
| **OTP Registration** | Register with email OTP verification |
| **TOTP Two-Factor Auth** | Set up Google Authenticator / TOTP 2FA, verify on login |
| **Password Reset** | Reset password via OTP sent to email |
| **Admin Login Portal** | Separate admin-specific login page |
| **Role-Based Access** | 12 roles: admin, super_admin, candidate, employee, hr_manager, manager, product_manager, developer, tester, ceo, intern, marketing |
| **Session Management** | JWT-based sessions (2h expiry), auto-logout on expiry |
| **Security Audit Trail** | Log all security events, vulnerability scans, compliance reports |
| **Rate Limiting** | Tiered rate limits: auth (5/15min), API (1000/15min), uploads (50/hr), password reset (3/hr) |
| **Activity Logging** | Every API request logged (user, method, URL, status, duration) |

---

## 2. Public Marketing Site

| Feature | What You Can Do |
|---------|----------------|
| **Landing Page** | Animated hero, company stats, project showcase, open positions |
| **Capabilities Page** | Platform features and capabilities showcase |
| **Team Page** | Browse team members with individual profile pages |
| **Careers Page** | Browse job postings, view job details, apply online |
| **Contact / Partnerships** | Contact form and partnership inquiry |
| **HRMS & WorkStation Marketing** | Product marketing pages |
| **Privacy & Terms** | Legal policy pages |

---

## 3. User Dashboard

| Feature | What You Can Do |
|---------|----------------|
| **Personalized Welcome** | Dynamic greeting (Good morning/afternoon/evening) with first name |
| **Onboarding Wizard** | Step-by-step setup guide for new users (profile, resume, 2FA, first application) with progress ring |
| **Profile Completion Tracking** | Visual progress bar and percentage of profile setup completion |
| **Quick Actions Grid** | Role-segregated quick-launch cards (Employee: 6 actions, Candidate: 4 actions) |
| **Application Overview** | Summary stats for all application statuses with mini progress bars |
| **Application Tracker** | Track each application with status, timeline, contact info, linked profiles |
| **Candidate Profile** | Build and maintain fast-apply candidate profile (education, experience, certifications) |
| **Recommended Roles** | Curated job openings based on profile |
| **Bank Details** | View and update bank account, PAN, UAN, PF details (employees) |
| **Theme Toggle** | Switch between dark and light mode |
| **Account Security** | Manage 2FA, view security status, delete account |
| **Privacy Settings** | View data retention policies and export options |
| **Birthday Celebrations** | Automatic celebration effects on birthdays |
| **Employee Promotion Celebration** | Confetti animation when promoted to employee role |

---

## 4. Employee Workspace

| Feature | What You Can Do |
|---------|----------------|
| **Timesheets** | Create, update, delete daily timesheet entries; track hours by project |
| **Kanban Task Board** | Create tasks, drag-and-drop between columns (Backlog → In Progress → Review → Done); task notes and AI insights |
| **Payslips** | View payslip history, download PDF payslips |
| **Clock In / Clock Out** | Daily attendance with clock-in and clock-out timestamps |
| **Leave Requests** | Submit leave requests with 12+ leave types, view balances, track status |
| **Salary Advances** | Request salary advances, track approval status |
| **Manager Approvals** | Approve/reject team leave requests and salary advance requests |
| **Resignation** | Submit resignation, track resignation status |
| **Org Directory** | Browse organization structure and team members |
| **Personal Details** | View and edit profile information, contact details, personal info |
| **Calendar Activity** | View calendar events and upcoming activities |
| **Leave Policies** | View all available leave policies, balances, accrual rules |
| **Attendance & Shifts** | View assigned shifts and attendance records |

---

## 5. Employee Management (Enhanced)

| Feature | What You Can Do |
|---------|----------------|
| **Employee Directory** | Advanced search and filter across all employees |
| **Employee Lifecycle** | Track lifecycle stages (onboarding → active → offboarding) |
| **Goals & Performance** | Set OKRs/goals, conduct performance reviews, rate employees |
| **Employee Analytics** | Performance trends, engagement metrics, team comparisons |
| **Communication Center** | Internal communication hub for announcements and updates |
| **Employee Profile 360°** | Comprehensive profile with performance, learning, benefits, history tabs |

---

## 6. HR Portal

| Feature | What You Can Do |
|---------|----------------|
| **Workforce Dashboard** | Overview metrics — headcount, hiring, onboarding, leave, attendance |
| **People Management** | List/search employees, view profiles, create new employees, change roles/departments |
| **Onboarding Pipeline** | Manage candidate onboarding stages, trigger onboarding (single/bulk), assign checklists |
| **Leave Approvals** | View all pending leaves, approve/reject with notes |
| **Advance Approvals** | Review and approve/reject salary advance requests |
| **Compensation Management** | Set default compensation per role, manage individual compensation packages |
| **Recruitment Pipeline** | Track candidate applications, update status, schedule interviews, trigger recruiting automation |
| **Document Templates** | CRUD document templates (offer letters, payslips, contracts), upload attachments |
| **HR Automations** | Create and manage workflow automations, recruiting automation rules |
| **Calendar Settings** | Configure weekend days and HR calendar |
| **Timesheet Settings** | Set timesheet approval mode (auto/manual) |
| **Email Dispatch** | Send template-based emails to employees/candidates |
| **Feature Flags** | Toggle feature flags for gradual rollout |
| **Smart Notifications** | Configure notification rules and templates |
| **Payroll Automation** | Toggle automatic payroll processing, generate payslips (individual/bulk) |
| **Holiday Management** | CRUD holidays, bulk import from Excel |

---

## 7. Intern Management

| Feature | What You Can Do |
|---------|----------------|
| **Intern Roles & Programs** | Create and manage intern roles/programs with descriptions, requirements, capacity |
| **Intern Applications** | Review and process intern applications |
| **Intern Enrollments** | Enroll interns, track enrollment status |
| **Intern Tasks** | Assign tasks to interns, track progress, bulk update status |
| **Intern Evaluations** | Create and submit performance evaluations for interns |
| **Intern Certificates** | Generate completion certificates from templates (Puppeteer-based PDF rendering) |

---

## 8. Admin Panel

| Feature | What You Can Do |
|---------|----------------|
| **Admin Overview** | Workforce count, open projects, jobs, applications, onboarding stats; data export (Ctrl+E) |
| **Project Management** | CRUD R&D projects |
| **Job Management** | CRUD job postings with departments, requirements, descriptions |
| **Candidate Management** | View and manage all candidate profiles |
| **User Management** | List users, update roles, create employee accounts |
| **Onboarding Management** | Manage onboarding pipeline and stages |
| **Payroll Management** | List payslips, generate (individual/all), delete, download; toggle payroll automation |
| **Holiday Calendar** | CRUD holidays, bulk import from Excel |
| **Attendance Management** | View and manage all attendance records |
| **Activity Logs** | View system-wide API activity logs with filtering |
| **System Health** | Monitor DB health, system uptime, performance metrics, resource usage |
| **System Configuration** | CRUD application settings, audit trail, export configuration |

---

## 9. ICM (Incident & Case Management)

| Feature | What You Can Do |
|---------|----------------|
| **Dashboard** | Ticket statistics — total, open, high-priority, overdue; status/priority distribution charts |
| **Ticket List** | List, filter, search tickets by status, priority, category, assignee |
| **Create Ticket** | File new incident tickets with title, description, category, priority, assignee |
| **Ticket Detail** | View ticket details, update status/priority, assign, set SLA deadlines |
| **Comments** | Add, edit, delete comments on tickets (internal/external) |
| **Attachments** | Upload, download, delete file attachments on tickets |
| **History/Audit Trail** | View complete ticket change history |
| **Watchers** | Add/remove watchers on tickets, configure notification preferences |

---

## 10. Messaging & Inbox

| Feature | What You Can Do |
|---------|----------------|
| **Conversations** | Create direct and group conversations |
| **Real-time Messages** | Send/receive messages in real-time via Socket.IO |
| **File Attachments** | Send messages with up to 10 file attachments |
| **Message Reactions** | Add/remove emoji reactions to messages |
| **Read Receipts** | See who has read your messages |
| **Typing Indicators** | See when someone is typing |
| **Message Forwarding** | Forward messages to other conversations |
| **Message Deletion** | Delete messages |
| **Conversation Archive** | Archive/unarchive conversations |
| **Pinned Conversations** | Pin frequently used conversations |
| **Advanced Search** | Full-text search across all messages and conversations |
| **Voice Recorder** | Record and send voice messages |
| **Rich Media Viewer** | Preview images, documents, and media inline |
| **Online Presence** | See who's online, away, or offline in real-time |
| **Conversation Info** | View members, shared files, conversation settings |

---

## 11. WorkStation (Jira-like Project Management)

| Feature | What You Can Do |
|---------|----------------|
| **Dashboard** | Project overview with summary metrics, configurable dashboard gadgets |
| **Kanban Board** | Visual kanban board with drag-and-drop issue management, cumulative flow diagram |
| **Scrum Board** | Sprint board with start/complete sprint, burndown charts |
| **Backlog Management** | Reorder backlog items, plan sprints, drag items between sprints |
| **Issue Tracking** | CRUD issues (bugs, stories, tasks, epics), comments, activity log, file attachments |
| **Issue Hierarchy** | Sub-tasks, linked issues, parent/child relationships |
| **Time Tracking** | Log time entries on issues, view time reports |
| **Projects** | CRUD projects with configurable settings |
| **Boards** | CRUD boards with customizable columns |
| **Sprint Management** | Create/start/complete sprints, sprint velocity tracking |
| **Components & Versions** | Manage project components and release versions |
| **Labels** | Categorize issues with custom labels |
| **Reports** | CRUD reports, toggle favorites, generate report data |
| **Roadmap** | Roadmap view with timeline items |
| **Analytics** | Kanban analytics, cumulative flow diagrams, velocity charts |
| **Team Management** | View team, invite/remove members, workload management, bulk updates |
| **Workflows** | CRUD workflows with custom states and transitions |
| **Automation Rules** | CRUD automation rules, toggle on/off, view automation logs |
| **Custom Fields** | CRUD custom fields for issues |
| **Permissions** | CRUD permission schemes, notification schemes, role management |
| **Gadgets** | CRUD dashboard gadgets/widgets |
| **Search & Filters** | Full-text search, saved filter queries |
| **Settings** | WorkStation configuration and preferences |
| **Retrospectives** | CRUD retrospectives, add items, vote, resolve |
| **Discovery Insights** | CRUD insights, vote on insights |
| **AI Task Breakdown** | AI-powered epic/story decomposition, approve AI suggestions, view breakdown history |

---

## 12. DevFlow (Azure DevOps-like DevOps Portal)

| Feature | What You Can Do |
|---------|----------------|
| **Overview Dashboard** | DevOps metrics, recent activity feed, security overview, AI insights |
| **Task Boards** | CRUD boards and tasks, drag-and-drop task management |
| **GitHub Repos** | Browse real GitHub repositories, branches, commits, pull requests, file trees |
| **CI/CD Pipelines** | CRUD pipelines and stages/steps, trigger pipeline runs, cancel runs, view run details |
| **Test Plans** | CRUD test plans, test suites, test cases, test runs, record test results; test configurations |
| **Artifacts** | CRUD artifact feeds and packages, version management, publish packages, usage statistics |
| **Analytics** | Velocity analytics, quality metrics, deployment metrics, code coverage, burndown data, custom reports |
| **Wiki** | CRUD wiki pages (by ID or slug), view page revision history |
| **Code Reviews** | CRUD code reviews, approve/request changes, add/resolve review comments |
| **Releases** | CRUD releases, deploy releases to environments |
| **Automation** | CRUD automation rules, view execution logs |
| **Sprints** | CRUD sprints, add/remove tasks from sprints |
| **Retrospectives** | CRUD retrospectives, add items, vote on items |
| **Environments** | CRUD deployment environments, manage pipeline variables |
| **Team Management** | View team members, add/remove from team |
| **Settings** | GitHub webhook integration, DevFlow configuration |
| **Enhanced DevFlow** | Advanced DevOps experience with integrated view |

---

## 13. Calendar System

| Feature | What You Can Do |
|---------|----------------|
| **Multiple Views** | Day, week, month, and agenda views |
| **Event Management** | CRUD calendar events with title, description, start/end times |
| **Recurring Events** | Create events with recurrence rules (daily, weekly, monthly) |
| **Calendar Sharing** | Share calendars with specific users with permission levels |
| **Meeting Rooms** | CRUD meeting rooms (admin), check availability |
| **Free/Busy Lookup** | Check user availability for scheduling |
| **ICS Export** | Export calendar events to ICS format |
| **Timezone Support** | Timezone-aware scheduling and display |
| **Calendar Preferences** | User-specific calendar display preferences |
| **Interview Scheduling** | Schedule interviews with Google Meet integration |

---

## 14. Training & LMS

| Feature | What You Can Do |
|---------|----------------|
| **Training Dashboard** | Overview of available courses, enrollment stats, completion rates |
| **Course Management** | CRUD courses with thumbnails, modules, and content (admin) |
| **Course Catalog** | Browse and search available courses |
| **Course Enrollment** | Self-enroll or admin-assign courses |
| **Progress Tracking** | Track module completion progress |
| **Assessments** | Take assessments, view results |
| **Certificates** | Earn and view completion certificates |
| **Learning Paths** | Structured learning paths with prerequisites |
| **Training Calendar** | Upcoming sessions and scheduled training |
| **Training Admin** | Manage all courses, modules, enrollment statistics (admin/HR) |

---

## 15. Expense Management

| Feature | What You Can Do |
|---------|----------------|
| **Expense Dashboard** | Monthly trends, category/department/cost-center breakdowns, budget utilization |
| **Submit Expenses** | Create expense claims with receipt uploads and categorization |
| **Expense Reports** | Create, submit, track expense reports |
| **Approvals** | Approve/reject pending expense claims (manager/admin) |
| **Analytics** | Expense analytics, top spenders, trend visualizations |
| **Policy Management** | CRUD expense policies, per diem rates, spending limits (admin) |
| **Reimbursement Tracking** | Track reimbursement status |
| **Export** | Export expense data for reporting |

---

## 16. Asset Management

| Feature | What You Can Do |
|---------|----------------|
| **Asset Dashboard** | Utilization reports, category breakdown, depreciation report, audit compliance |
| **Asset Catalog** | Browse all company assets with filtering |
| **Asset Detail** | View asset details, history, allocation status, maintenance records |
| **Asset Requests** | Request assets, view owned assets, warranty expiration tracking |
| **Asset Allocation** | Allocate/deallocate assets to employees (admin), bulk allocation |
| **Maintenance** | Schedule, complete, cancel asset maintenance (admin) |
| **Audits** | CRUD asset audits, track compliance |
| **Disposal** | Manage asset disposal workflow |
| **Insurance** | Track asset insurance policies |
| **QR/Barcode** | Generate QR codes and barcodes for asset identification |
| **Reports** | Generate asset utilization, depreciation, maintenance cost reports |

---

## 17. Employee Surveys

| Feature | What You Can Do |
|---------|----------------|
| **Survey Dashboard** | Overview of active surveys, response rates, trend analysis |
| **Create Surveys** | Build surveys with sections, multiple question types, and logic |
| **Use Templates** | Create surveys from pre-built templates |
| **Respond to Surveys** | Complete survey responses with various question types |
| **Results & Analytics** | View response data, charts, and statistical analysis |
| **Survey Lifecycle** | Publish, close, pause, resume, clone surveys |
| **Survey Settings** | Configure survey behavior and access |
| **Report Generation** | Generate survey result reports |

---

## 18. Grievance Management

| Feature | What You Can Do |
|---------|----------------|
| **Grievance Dashboard** | Overview metrics, overdue grievances tracking |
| **File Grievance** | Submit formal grievances with category, description, evidence |
| **Grievance Detail** | View full grievance details, update status, track timeline |
| **Investigator Assignment** | Assign investigators (manual or auto-assign) |
| **Comments** | Add and view comments on grievances |
| **Escalation** | Escalate grievances to higher authority |
| **Resolution** | Record resolution actions and outcomes |
| **Withdrawal** | Withdraw filed grievances |
| **Grievance List** | List, search, filter, bulk update grievances |
| **Policy Reference** | View grievance handling policies |
| **Export** | Export grievance reports |

---

## 19. Shift & Schedule Management

| Feature | What You Can Do |
|---------|----------------|
| **Shift Dashboard** | Overview of shifts and scheduling |
| **Shift CRUD** | Create, update, delete shift definitions |
| **Schedule Management** | Create individual and bulk schedules, publish schedules |
| **Check-In / Check-Out** | Clock in/out per scheduled shift |
| **Shift Swap** | Request shift swaps, approve/reject swap requests |
| **Shift Patterns** | CRUD repeating shift patterns |
| **Employee/Department Views** | View schedules by employee or department |
| **Overtime Tracking** | Monitor overtime hours |
| **Staffing Levels** | Track and manage staffing requirements |

---

## 20. Benefits Administration

| Feature | What You Can Do |
|---------|----------------|
| **Benefits Dashboard** | Overview of available plans and enrollment status |
| **Plan Management** | CRUD benefit plans by type (health, dental, vision, life, retirement, etc.) |
| **Enrollment** | Self-enroll in benefit plans, cancel enrollment, view history |
| **Open Enrollment** | Manage open enrollment periods |
| **Dependents** | CRUD dependents for benefit coverage |
| **Claims** | Submit and track benefit claims |
| **Deductions** | View payroll deductions for benefits |

---

## 21. Travel Management

| Feature | What You Can Do |
|---------|----------------|
| **Travel Dashboard** | Overview of travel requests and analytics |
| **Travel Requests** | Create, update, submit, cancel travel requests |
| **Policy Validation** | Auto-validate travel requests against policies |
| **Approvals** | Approve/reject travel requests (manager/admin) |
| **Itinerary Management** | CRUD itinerary segments (flights, hotels, transport), reorder |
| **Travel Expenses** | Track and submit travel-specific expenses |
| **Travel Policies** | CRUD travel policies, per diem rates, spending limits |
| **Department/Employee Views** | View travel requests by department or employee |

---

## 22. Compliance & Policy

| Feature | What You Can Do |
|---------|----------------|
| **Compliance Dashboard** | Overview of compliance status and pending actions |
| **Policy Management** | CRUD compliance policies, publish/archive |
| **Acknowledgments** | Assign policies for acknowledgment, track who has acknowledged |
| **Regulatory Requirements** | Track regulatory compliance requirements |
| **Compliance Training** | Assign and track compliance training completion |
| **Audit Management** | CRUD audits, track findings and remediation |
| **Reports** | Generate compliance reports |

---

## 23. Recognition & Awards

| Feature | What You Can Do |
|---------|----------------|
| **Recognition Dashboard** | Metrics, top performers, recognition trends |
| **Recognition Wall** | Social feed of recognitions, give kudos to colleagues |
| **Give Recognition** | Recognize employees with points, emoji reactions, comments |
| **Award Programs** | CRUD award programs with nomination/selection workflows |
| **Nominations** | Nominate employees for awards |
| **Leaderboard** | View recognition leaderboards by period |
| **Rewards Catalog** | Browse rewards, redeem recognition points |
| **Points Management** | View point balance, transaction history |
| **Employee Summary** | View individual recognition history |

---

## 24. Visitor Management

| Feature | What You Can Do |
|---------|----------------|
| **Visitor Dashboard** | Today's visits, currently in building, statistics |
| **Pre-Registration** | Pre-register expected visitors |
| **Visitor Check-In** | Check in visitors at reception |
| **Visitor Check-Out** | Check out departing visitors |
| **Visit Management** | CRUD visits, approve/deny visits, cancel visits |
| **Visitor Passes** | Generate passes, deactivate passes, record pass returns |
| **Watchlist** | Manage visitor watchlist (add, remove, update) |
| **Emergency Mode** | Initiate building evacuation, view active emergencies |
| **Search** | Search visitor history |
| **Reports** | Generate visitor reports |

---

## 25. Role-Specific Dashboards

| Dashboard | Who It's For | Key Features |
|-----------|-------------|-------------|
| **Product Manager** | product_manager, admin | Product metrics, project status, resource allocation insights |
| **Developer/Tester** | employee, manager, product_manager, admin | Bug reports, code quality metrics, sprint progress, build statuses, PR tracking, test suites |
| **Marketing** | manager, product_manager, hr_manager, admin | Campaign performance, engagement analytics |
| **CEO / Executive** | admin (CEO) | Executive scorecard, risk alerts, scenario modeling, financial insights, segment performance |

---

## 26. Workflow Automation

| Feature | What You Can Do |
|---------|----------------|
| **Workflow Templates** | CRUD workflow definitions with triggers, conditions, and steps |
| **Workflow Execution** | Start, cancel, monitor workflow instances |
| **Approval Processing** | Built-in approval/rejection steps in workflows |
| **Workflow Metrics** | View execution analytics and performance |
| **Event-Driven Triggers** | Automatically trigger workflows based on system events |
| **Import/Export** | Import/export workflow templates between environments |
| **Template Validation** | Validate workflow definitions before deployment |

---

## 27. Notifications

| Feature | What You Can Do |
|---------|----------------|
| **In-App Notifications** | Real-time push notifications via Socket.IO |
| **Notification List** | View all notifications, mark as read |
| **Smart Notifications** | Configurable notification templates and delivery rules |
| **Notification Preferences** | Per-user channel and category preferences |
| **Bulk Notifications** | Send notifications to groups or all users |
| **Analytics** | Notification delivery and engagement analytics |

---

## 28. Integrations & Platform

| Feature | What You Can Do |
|---------|----------------|
| **GitHub Integration** | Browse repos, branches, commits, PRs, file trees from GitHub |
| **Jira-Style API** | Full Jira-compatible project and issue API |
| **Webhooks** | Register, test, and manage webhooks for external systems |
| **External Integrations** | Connect Slack, JIRA, GitHub, and other systems |
| **Integration Marketplace** | Browse and install marketplace integrations |
| **Mobile API** | Device registration, push notifications, offline sync |
| **Google Meet/Calendar** | Interview scheduling with Google Meet links |
| **Email Service** | SMTP-based notifications, OTP delivery, template emails |

---

## 29. AI & Analytics

| Feature | What You Can Do |
|---------|----------------|
| **ML Model Management** | CRUD ML models for prediction tasks |
| **Performance Predictions** | AI-powered employee performance forecasting |
| **Turnover Predictions** | Predict employee turnover risk |
| **Project Risk Analysis** | AI-based project risk assessment |
| **Resource Allocation** | ML-driven resource optimization recommendations |
| **Natural Language Queries** | Ask analytics questions in natural language |
| **AI Task Breakdown** | LLM-powered epic/story decomposition into tasks |
| **Resume Analysis** | AI-powered resume parsing and candidate matching |
| **System Monitoring** | Application performance, DB metrics, API usage dashboards |

---

## 30. Feature Flags

| Feature | What You Can Do |
|---------|----------------|
| **Flag Management** | CRUD feature flags with names, descriptions, and default states |
| **Targeting Rules** | Target flags by user, role, percentage, or custom rules |
| **A/B Testing** | Run A/B tests with percentage-based rollouts |
| **Gradual Rollout** | Schedule gradual feature rollouts |
| **Emergency Kill Switch** | Instantly enable/disable features in emergencies |
| **Audit Log** | Track all flag changes over time |
| **Analytics** | Per-flag evaluation metrics and usage data |
| **Bulk Evaluation** | Evaluate multiple flags at once per user |

---

## 31. Document Processing

| Feature | What You Can Do |
|---------|----------------|
| **Document Upload** | Upload documents for processing |
| **OCR** | Extract text from scanned documents |
| **Document Analysis** | AI-powered document classification and data extraction |
| **Template Generation** | Generate documents from templates (offer letters, payslips, contracts) |
| **Batch Processing** | Process multiple documents at once |
| **Processing Metrics** | View document processing statistics |

---

## 32. Work Items

| Feature | What You Can Do |
|---------|----------------|
| **Project Management** | CRUD projects with team member management |
| **Work Item CRUD** | Create, update, delete work items (tasks, bugs, features, epics) |
| **Hierarchy** | Parent/child work item relationships |
| **Comments & History** | Threaded comments and change history on work items |
| **Categorization** | Work item types, statuses, categories, and priorities |
| **Statistics** | Work item metrics and progress tracking |

---

## 33. Collaboration

| Feature | What You Can Do |
|---------|----------------|
| **Team Workspaces** | Create shared workspaces for teams |
| **Shared Documents** | Collaborative document management |
| **Real-time Editing** | Multiple users editing documents simultaneously |
| **Comments System** | Threaded comments on any resource with emoji reactions |
| **@Mentions** | Mention users in comments with auto-complete |

---

## Platform Capabilities

| Capability | Details |
|-----------|---------|
| **Dark/Light Theme** | Full dark and light mode with OS preference detection |
| **Responsive Design** | Works on desktop and mobile browsers |
| **Real-time Updates** | Socket.IO for instant notifications, messages, and status updates |
| **PDF Generation** | Payslips, certificates, and documents via Puppeteer/PDFKit |
| **Excel Import/Export** | Bulk data import/export via ExcelJS |
| **File Uploads** | Resume, document, image, and attachment uploads |
| **Command Palette** | ⌘K / Ctrl+K keyboard shortcut for quick navigation |
| **Code Splitting** | Lazy-loaded pages for fast initial load |
| **Error Boundaries** | Graceful error handling with recovery UI |
| **Activity Monitoring** | System-wide performance and health monitoring |
| **Graceful Shutdown** | Clean server shutdown with connection draining |
| **Docker Support** | Docker Compose for PostgreSQL, Redis, backend, and frontend |

---

*Total: **33 feature categories** · **~1,400 API endpoints** · **120+ frontend pages** · **12 user roles** · **85+ database tables***
