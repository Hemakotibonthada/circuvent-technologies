// ============================================================================
// FILE TREE DATA - Project structure for showcase
// ============================================================================

export const projectFileTree = [
  {
    name: "circuvent-technologies",
    type: "folder" as const,
    icon: "🏠",
    children: [
      { name: "package.json", type: "file" as const, size: "2.1KB", badge: "npm" },
      { name: "tsconfig.json", type: "file" as const, size: "0.5KB" },
      { name: "next.config.ts", type: "file" as const, size: "0.8KB" },
      { name: "tailwind.config.ts", type: "file" as const, size: "1.2KB" },
      { name: "jest.config.js", type: "file" as const, size: "0.4KB" },
      { name: "playwright.config.ts", type: "file" as const, size: "0.6KB" },
      {
        name: "src",
        type: "folder" as const,
        highlighted: true,
        children: [
          {
            name: "app",
            type: "folder" as const,
            children: [
              { name: "page.tsx", type: "file" as const, size: "35KB", badge: "main", highlighted: true },
              { name: "layout.tsx", type: "file" as const, size: "3.2KB" },
              { name: "globals.css", type: "file" as const, size: "5.1KB" },
              { name: "loading.tsx", type: "file" as const, size: "0.8KB" },
              { name: "error.tsx", type: "file" as const, size: "1.2KB" },
              { name: "not-found.tsx", type: "file" as const, size: "1.5KB" },
              { name: "manifest.ts", type: "file" as const, size: "1.0KB" },
              { name: "robots.ts", type: "file" as const, size: "0.3KB" },
              { name: "sitemap.ts", type: "file" as const, size: "0.8KB" },
              {
                name: "api",
                type: "folder" as const,
                children: [
                  { name: "contact", type: "folder" as const, children: [{ name: "route.ts", type: "file" as const, size: "3.8KB", badge: "Resend" }] },
                  { name: "blog", type: "folder" as const, children: [{ name: "route.ts", type: "file" as const, size: "1.2KB" }] },
                  { name: "newsletter", type: "folder" as const, children: [{ name: "route.ts", type: "file" as const, size: "0.9KB" }] },
                  { name: "projects", type: "folder" as const, children: [{ name: "route.ts", type: "file" as const, size: "1.5KB" }] },
                  { name: "health", type: "folder" as const, children: [{ name: "route.ts", type: "file" as const, size: "0.4KB" }] },
                  { name: "github", type: "folder" as const, children: [{ name: "route.ts", type: "file" as const, size: "2.1KB" }] },
                ],
              },
              { name: "about", type: "folder" as const, children: [{ name: "page.tsx", type: "file" as const, size: "4.5KB" }, { name: "layout.tsx", type: "file" as const, size: "0.5KB" }] },
              { name: "blog", type: "folder" as const, children: [{ name: "page.tsx", type: "file" as const, size: "5.2KB" }, { name: "[slug]", type: "folder" as const, children: [{ name: "page.tsx", type: "file" as const, size: "6.8KB" }] }] },
              { name: "contact", type: "folder" as const, children: [{ name: "page.tsx", type: "file" as const, size: "3.1KB" }] },
              { name: "projects", type: "folder" as const, children: [{ name: "page.tsx", type: "file" as const, size: "4.8KB" }, { name: "[id]", type: "folder" as const, children: [{ name: "page.tsx", type: "file" as const, size: "7.2KB" }] }] },
              { name: "services", type: "folder" as const, children: [{ name: "page.tsx", type: "file" as const, size: "8.5KB" }] },
              { name: "architecture", type: "folder" as const, children: [{ name: "page.tsx", type: "file" as const, size: "9.1KB" }] },
              { name: "team", type: "folder" as const, children: [{ name: "page.tsx", type: "file" as const, size: "5.8KB" }] },
              { name: "docs", type: "folder" as const, children: [{ name: "page.tsx", type: "file" as const, size: "18KB" }] },
              { name: "roadmap", type: "folder" as const, children: [{ name: "page.tsx", type: "file" as const, size: "10KB" }] },
              { name: "careers", type: "folder" as const, children: [{ name: "page.tsx", type: "file" as const, size: "6.2KB" }] },
              { name: "stack", type: "folder" as const, children: [{ name: "page.tsx", type: "file" as const, size: "7.0KB" }] },
              { name: "open-source", type: "folder" as const, children: [{ name: "page.tsx", type: "file" as const, size: "7.5KB" }] },
              { name: "domains", type: "folder" as const, children: [{ name: "page.tsx", type: "file" as const, size: "5.1KB" }] },
              { name: "case-studies", type: "folder" as const, children: [{ name: "page.tsx", type: "file" as const, size: "11KB" }] },
              { name: "privacy", type: "folder" as const, children: [{ name: "page.tsx", type: "file" as const, size: "3.5KB" }] },
            ],
          },
          {
            name: "components",
            type: "folder" as const,
            highlighted: true,
            badge: "30+",
            children: [
              { name: "Hero.tsx", type: "file" as const, size: "6.2KB" },
              { name: "Navigation.tsx", type: "file" as const, size: "8.5KB" },
              { name: "Footer.tsx", type: "file" as const, size: "5.1KB" },
              { name: "ParticleField.tsx", type: "file" as const, size: "18KB", badge: "canvas", highlighted: true },
              { name: "DataVisualization.tsx", type: "file" as const, size: "22KB", highlighted: true },
              { name: "InteractiveComponents.tsx", type: "file" as const, size: "20KB", highlighted: true },
              { name: "AdvancedVisuals.tsx", type: "file" as const, size: "19KB", highlighted: true },
              { name: "AdvancedSections.tsx", type: "file" as const, size: "17KB", highlighted: true },
              { name: "ShowcaseComponents.tsx", type: "file" as const, size: "18KB", highlighted: true },
              { name: "InteractivePlayground.tsx", type: "file" as const, size: "20KB", highlighted: true },
              { name: "InteractiveMaps.tsx", type: "file" as const, size: "16KB", highlighted: true },
              { name: "DeviceShowcase.tsx", type: "file" as const, size: "17KB", highlighted: true },
              { name: "AnimationEffectsAdvanced.tsx", type: "file" as const, size: "15KB" },
              { name: "ProjectManagement.tsx", type: "file" as const, size: "16KB" },
              { name: "VisualizationAdvanced.tsx", type: "file" as const, size: "24KB" },
              { name: "AnimatedBackground.tsx", type: "file" as const, size: "5.8KB" },
              { name: "CodeShowcase.tsx", type: "file" as const, size: "4.2KB" },
              { name: "ContactForm.tsx", type: "file" as const, size: "6.1KB" },
              { name: "CommandPalette.tsx", type: "file" as const, size: "4.5KB" },
              { name: "ThemeProvider.tsx", type: "file" as const, size: "1.8KB" },
              { name: "ScrollReveal.tsx", type: "file" as const, size: "2.1KB" },
              { name: "TiltCard.tsx", type: "file" as const, size: "2.5KB" },
              { name: "Marquee.tsx", type: "file" as const, size: "3.2KB" },
              { name: "SkillRadar.tsx", type: "file" as const, size: "5.5KB" },
              { name: "ScrollTimeline.tsx", type: "file" as const, size: "4.8KB" },
              {
                name: "ui",
                type: "folder" as const,
                children: [
                  { name: "button.tsx", type: "file" as const, size: "2.8KB" },
                  { name: "input.tsx", type: "file" as const, size: "2.2KB" },
                  { name: "textarea.tsx", type: "file" as const, size: "1.5KB" },
                  { name: "select.tsx", type: "file" as const, size: "1.8KB" },
                ],
              },
            ],
          },
          {
            name: "hooks",
            type: "folder" as const,
            children: [
              { name: "index.ts", type: "file" as const, size: "0.5KB" },
              { name: "useAdvanced.ts", type: "file" as const, size: "8.5KB", badge: "15 hooks" },
              { name: "useIntersectionObserver.ts", type: "file" as const, size: "1.2KB" },
              { name: "useMousePosition.ts", type: "file" as const, size: "0.8KB" },
              { name: "useDebounce.ts", type: "file" as const, size: "0.6KB" },
              { name: "useLocalStorage.ts", type: "file" as const, size: "0.9KB" },
              { name: "useMediaQuery.ts", type: "file" as const, size: "0.7KB" },
              { name: "useWindowSize.ts", type: "file" as const, size: "0.5KB" },
              { name: "useScrollProgress.ts", type: "file" as const, size: "0.6KB" },
              { name: "useKeyPress.ts", type: "file" as const, size: "0.8KB" },
              { name: "useCopyToClipboard.ts", type: "file" as const, size: "0.5KB" },
              { name: "useClickOutside.ts", type: "file" as const, size: "0.6KB" },
              { name: "useCountUp.ts", type: "file" as const, size: "0.7KB" },
            ],
          },
          {
            name: "lib",
            type: "folder" as const,
            children: [
              { name: "showcase-landing-data.ts", type: "file" as const, size: "12KB", highlighted: true },
              { name: "extended-showcase-data.ts", type: "file" as const, size: "10KB", highlighted: true },
              { name: "comprehensive-data.ts", type: "file" as const, size: "15KB", highlighted: true },
              { name: "interactive-tools-data.ts", type: "file" as const, size: "8KB", highlighted: true },
              { name: "file-tree-data.ts", type: "file" as const, size: "5KB" },
              { name: "projects-data.ts", type: "file" as const, size: "6.5KB" },
              { name: "blog-data.ts", type: "file" as const, size: "8.2KB" },
              { name: "services-data.ts", type: "file" as const, size: "5.8KB" },
              { name: "stack-data.ts", type: "file" as const, size: "4.1KB" },
              { name: "seo.ts", type: "file" as const, size: "2.5KB" },
              { name: "utils.ts", type: "file" as const, size: "3.2KB" },
              { name: "validation.ts", type: "file" as const, size: "2.8KB" },
              { name: "api-client.ts", type: "file" as const, size: "2.1KB" },
              { name: "animations.ts", type: "file" as const, size: "1.5KB" },
            ],
          },
        ],
      },
      {
        name: "tests",
        type: "folder" as const,
        children: [
          {
            name: "lib",
            type: "folder" as const,
            children: [
              { name: "blog-data.test.ts", type: "file" as const, size: "2.1KB" },
              { name: "projects-data.test.ts", type: "file" as const, size: "1.8KB" },
              { name: "seo.test.ts", type: "file" as const, size: "1.5KB" },
              { name: "validation.test.ts", type: "file" as const, size: "2.3KB" },
              { name: "extended-utils.test.ts", type: "file" as const, size: "1.9KB" },
            ],
          },
        ],
      },
      {
        name: "e2e",
        type: "folder" as const,
        children: [
          { name: "app.spec.ts", type: "file" as const, size: "3.2KB" },
        ],
      },
      {
        name: "public",
        type: "folder" as const,
        children: [
          { name: "sw.js", type: "file" as const, size: "2.8KB" },
          { name: "icons", type: "folder" as const, children: [] },
        ],
      },
    ],
  },
];

// Multi-terminal sessions data
export const terminalSessions = [
  {
    id: "dev",
    name: "dev",
    icon: "▲",
    commands: [
      { prompt: "~/circuvent $", input: "npm run dev", output: ["", "▲ Next.js 16.1.6 (Turbopack)", "  Local:   http://localhost:3000", "", "✓ Ready in 1.2s"] },
      { prompt: "~/circuvent $", input: "curl -s http://localhost:3000/api/health | jq .", output: ['{', '  "status": "healthy",', '  "uptime": "99.5%",', '  "services": 6,', '  "version": "3.0.0"', '}'] },
    ],
  },
  {
    id: "docker",
    name: "docker",
    icon: "🐳",
    commands: [
      { prompt: "~/nexus $", input: "docker-compose up -d", output: ["Creating network 'nexus_default'", "Creating nexus_redis_1      ... done", "Creating nexus_postgres_1   ... done", "Creating nexus_chromadb_1   ... done", "Creating nexus_ollama_1     ... done", "Creating nexus_api_1        ... done", "Creating nexus_web_1        ... done", "", "✅ All 6 services started"] },
      { prompt: "~/nexus $", input: "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'", output: ["NAMES                STATUS          PORTS", "nexus_web_1          Up 2 min        0.0.0.0:3000->3000/tcp", "nexus_api_1          Up 2 min        0.0.0.0:8000->8000/tcp", "nexus_ollama_1       Up 2 min        0.0.0.0:11434->11434/tcp", "nexus_chromadb_1     Up 2 min        0.0.0.0:8001->8000/tcp", "nexus_postgres_1     Up 2 min (healthy)  0.0.0.0:5432->5432/tcp", "nexus_redis_1        Up 2 min        0.0.0.0:6379->6379/tcp"] },
    ],
  },
  {
    id: "test",
    name: "test",
    icon: "✅",
    commands: [
      { prompt: "~/circuvent $", input: "npm run test -- --coverage", output: ["PASS  tests/lib/validation.test.ts", "PASS  tests/lib/seo.test.ts", "PASS  tests/lib/blog-data.test.ts", "PASS  tests/lib/projects-data.test.ts", "PASS  tests/lib/extended-utils.test.ts", "", "Test Suites:  5 passed, 5 total", "Tests:        42 passed, 42 total", "Coverage:     92.3%", "", "✅ All tests passing"] },
      { prompt: "~/circuvent $", input: "npx playwright test", output: ["Running 12 tests using 4 workers", "", "  ✓ [chromium] › app.spec.ts:5 › homepage loads correctly (2.1s)", "  ✓ [chromium] › app.spec.ts:15 › navigation works (1.8s)", "  ✓ [chromium] › app.spec.ts:25 › contact form submits (3.2s)", "  ✓ [chromium] › app.spec.ts:40 › blog page renders (1.5s)", "  ✓ [firefox] › app.spec.ts:5 › homepage loads correctly (2.4s)", "  ✓ [webkit] › app.spec.ts:5 › homepage loads correctly (2.6s)", "", "  12 passed (18.5s)"] },
    ],
  },
  {
    id: "git",
    name: "git",
    icon: "🐙",
    commands: [
      { prompt: "~/circuvent $", input: "git log --oneline -5", output: ["aa50476 feat: add interactive playground tools", "9061e72 feat: massive landing page expansion with 20+ components", "46e5396 fix: Resend contact form with proper error handling", "a3b2c1d feat: add blog system with MDX rendering", "8f4e2a1 feat: initial website launch with 15 pages"] },
      { prompt: "~/circuvent $", input: "git diff --stat HEAD~1", output: [" src/app/page.tsx                        |   110 +++", " src/components/InteractiveMaps.tsx      |   600 +++++++", " src/components/InteractivePlayground.tsx|   750 ++++++++", " src/lib/interactive-tools-data.ts       |   200 +++", " 4 files changed, 2267 insertions(+)"] },
      { prompt: "~/circuvent $", input: "wc -l src/**/*.{tsx,ts,css} 2>/dev/null | tail -1", output: ["  50000+ total", "", "🎉 50K+ lines of production code!"] },
    ],
  },
];

// Code diff data
export const sampleCodeDiff = [
  { type: "header" as const, content: "@@ -85,6 +85,18 @@ export async function POST(request: Request) {" },
  { type: "unchanged" as const, content: "    if (resendError) {", lineNumber: 85 },
  { type: "removed" as const, content: "      console.error('Resend error:', resendError);", lineNumber: 86 },
  { type: "added" as const, content: "      console.error('Resend error:', JSON.stringify(resendError, null, 2));", lineNumber: 86 },
  { type: "unchanged" as const, content: "      return NextResponse.json(", lineNumber: 87 },
  { type: "unchanged" as const, content: "        {", lineNumber: 88 },
  { type: "unchanged" as const, content: "          success: false,", lineNumber: 89 },
  { type: "removed" as const, content: "          message: 'Failed to send email. Please try again.',", lineNumber: 90 },
  { type: "added" as const, content: "          message: `Failed to send email: ${resendError.message || 'Unknown error'}`,", lineNumber: 90 },
  { type: "unchanged" as const, content: "        },", lineNumber: 91 },
  { type: "unchanged" as const, content: "        { status: 500 }", lineNumber: 92 },
  { type: "unchanged" as const, content: "      );", lineNumber: 93 },
  { type: "unchanged" as const, content: "    }", lineNumber: 94 },
  { type: "unchanged" as const, content: "", lineNumber: 95 },
  { type: "removed" as const, content: "    console.log('Contact email sent:', data?.id);", lineNumber: 96 },
  { type: "added" as const, content: "    console.log('Contact email sent successfully:', JSON.stringify(data, null, 2));", lineNumber: 96 },
];

// Showcase device content placeholders
export const deviceShowcaseData = {
  desktopScreenshot: {
    gradient: "from-cyan-950 via-slate-900 to-violet-950",
    sections: [
      { label: "Hero Section", height: 200, color: "rgba(6,182,212,0.1)" },
      { label: "Tech Marquee", height: 60, color: "rgba(139,92,246,0.05)" },
      { label: "Stats", height: 80, color: "rgba(6,182,212,0.05)" },
      { label: "Domains", height: 150, color: "rgba(139,92,246,0.1)" },
    ],
  },
  tabletScreenshot: {
    gradient: "from-violet-950 via-slate-900 to-cyan-950",
  },
  mobileScreenshot: {
    gradient: "from-slate-900 via-cyan-950 to-slate-900",
  },
};
