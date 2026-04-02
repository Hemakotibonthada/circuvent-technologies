// ══════════════════════════════════════════════════════════════
// Survey Routes — Create, distribute, analyze employee surveys
// ══════════════════════════════════════════════════════════════

import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// GET /surveys — List surveys
router.get("/", async (req: Request, res: Response) => {
  try {
    const { status, category } = req.query;
    const where: any = {};
    if (status) where.status = status;
    if (category) where.category = category;

    const surveys = await prisma.survey.findMany({
      where,
      include: {
        _count: { select: { questions: true, responses: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: surveys });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch surveys" });
  }
});

// GET /surveys/active — Active surveys for responding
router.get("/active", async (_req: Request, res: Response) => {
  try {
    const surveys = await prisma.survey.findMany({
      where: { status: "ACTIVE" },
      include: { _count: { select: { questions: true, responses: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: surveys });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch active surveys" });
  }
});

// GET /surveys/:id — Survey detail with questions
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const survey = await prisma.survey.findUnique({
      where: { id: req.params.id },
      include: {
        questions: { orderBy: { sortOrder: "asc" } },
        _count: { select: { responses: true } },
      },
    });
    if (!survey) { res.status(404).json({ success: false, error: "Survey not found" }); return; }
    res.json({ success: true, data: survey });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch survey" });
  }
});

// POST /surveys — Create survey
router.post("/", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { title, description, category, isAnonymous, startDate, endDate, questions } = req.body;

    if (!title) {
      res.status(400).json({ success: false, error: "title required" });
      return;
    }

    const survey = await prisma.survey.create({
      data: {
        title, description,
        category: category || "ENGAGEMENT",
        isAnonymous: isAnonymous || false,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        createdBy: userId,
        questions: questions ? {
          create: questions.map((q: any, idx: number) => ({
            text: q.text,
            type: q.type || "RATING",
            options: q.options || null,
            isRequired: q.isRequired !== false,
            sortOrder: idx,
          })),
        } : undefined,
      },
      include: { questions: true },
    });

    res.status(201).json({ success: true, data: survey });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to create survey" });
  }
});

// PUT /surveys/:id — Update survey
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const { title, description, category, isAnonymous, startDate, endDate } = req.body;
    const survey = await prisma.survey.update({
      where: { id: req.params.id },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(category && { category }),
        ...(isAnonymous !== undefined && { isAnonymous }),
        ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
      },
    });
    res.json({ success: true, data: survey });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to update survey" });
  }
});

// POST /surveys/:id/publish — Publish survey
router.post("/:id/publish", async (req: Request, res: Response) => {
  try {
    const survey = await prisma.survey.update({
      where: { id: req.params.id },
      data: { status: "ACTIVE", startDate: new Date() },
    });

    // Auto-notify all active employees
    const employees = await prisma.user.findMany({
      where: { status: "ACTIVE", role: { not: "CANDIDATE" } },
      select: { id: true },
    });
    await prisma.notification.createMany({
      data: employees.map(e => ({
        userId: e.id,
        type: "SURVEY",
        module: "SURVEY",
        title: `New Survey: ${survey.title}`,
        message: "Please take a moment to complete this survey",
      })),
    });

    res.json({ success: true, data: survey, message: `Survey published. ${employees.length} employees notified.` });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to publish survey" });
  }
});

// POST /surveys/:id/close — Close survey
router.post("/:id/close", async (req: Request, res: Response) => {
  try {
    const survey = await prisma.survey.update({
      where: { id: req.params.id },
      data: { status: "CLOSED", endDate: new Date() },
    });
    res.json({ success: true, data: survey });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to close survey" });
  }
});

// Add questions
router.post("/:id/questions", async (req: Request, res: Response) => {
  try {
    const { text, type, options, isRequired } = req.body;
    const count = await prisma.surveyQuestion.count({ where: { surveyId: req.params.id } });
    const question = await prisma.surveyQuestion.create({
      data: {
        surveyId: req.params.id,
        text, type: type || "RATING",
        options: options || null,
        isRequired: isRequired !== false,
        sortOrder: count,
      },
    });
    res.status(201).json({ success: true, data: question });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to add question" });
  }
});

// POST /surveys/:id/respond — Submit a response
router.post("/:id/respond", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { answers } = req.body; // [{questionId, value, numericValue}]

    const survey = await prisma.survey.findUnique({ where: { id: req.params.id } });
    if (!survey || survey.status !== "ACTIVE") {
      res.status(400).json({ success: false, error: "Survey not active" });
      return;
    }

    // Check if already responded
    const existing = await prisma.surveyResponse.findFirst({
      where: { surveyId: req.params.id, respondentId: userId },
    });
    if (existing) {
      res.status(409).json({ success: false, error: "Already responded to this survey" });
      return;
    }

    const response = await prisma.surveyResponse.create({
      data: {
        surveyId: req.params.id,
        respondentId: survey.isAnonymous ? null : userId,
        answers: {
          create: answers.map((a: any) => ({
            questionId: a.questionId,
            value: String(a.value),
            numericValue: a.numericValue !== undefined ? Number(a.numericValue) : null,
          })),
        },
      },
      include: { answers: true },
    });

    res.status(201).json({ success: true, data: response, message: "Response submitted" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to submit response" });
  }
});

// GET /surveys/:id/results — Survey results & analytics
router.get("/:id/results", async (req: Request, res: Response) => {
  try {
    const survey = await prisma.survey.findUnique({
      where: { id: req.params.id },
      include: {
        questions: { orderBy: { sortOrder: "asc" } },
        responses: { include: { answers: true } },
      },
    });
    if (!survey) { res.status(404).json({ success: false, error: "Survey not found" }); return; }

    const totalResponses = survey.responses.length;
    const questionResults = survey.questions.map(q => {
      const answers = survey.responses.flatMap(r => r.answers.filter(a => a.questionId === q.id));

      if (q.type === "RATING" || q.type === "SCALE") {
        const numericValues = answers.filter(a => a.numericValue !== null).map(a => a.numericValue!);
        return {
          questionId: q.id,
          text: q.text,
          type: q.type,
          responseCount: answers.length,
          average: numericValues.length > 0 ? (numericValues.reduce((s, v) => s + v, 0) / numericValues.length).toFixed(2) : null,
          min: numericValues.length > 0 ? Math.min(...numericValues) : null,
          max: numericValues.length > 0 ? Math.max(...numericValues) : null,
          distribution: [1, 2, 3, 4, 5].map(v => ({ value: v, count: numericValues.filter(n => Math.round(n) === v).length })),
        };
      }

      if (q.type === "MULTIPLE_CHOICE" || q.type === "CHECKBOX") {
        const valueCounts: Record<string, number> = {};
        answers.forEach(a => { valueCounts[a.value] = (valueCounts[a.value] || 0) + 1; });
        return {
          questionId: q.id,
          text: q.text,
          type: q.type,
          responseCount: answers.length,
          distribution: Object.entries(valueCounts).map(([value, count]) => ({ value, count })),
        };
      }

      return {
        questionId: q.id,
        text: q.text,
        type: q.type,
        responseCount: answers.length,
        answers: answers.map(a => a.value).slice(0, 50),
      };
    });

    // Calculate engagement score
    const totalEmployees = await prisma.user.count({ where: { status: "ACTIVE", role: { not: "CANDIDATE" } } });
    const responseRate = totalEmployees > 0 ? ((totalResponses / totalEmployees) * 100).toFixed(1) : "0";

    res.json({
      success: true,
      data: {
        surveyId: survey.id,
        title: survey.title,
        totalResponses,
        responseRate,
        questionResults,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch results" });
  }
});

// Dashboard
router.get("/dashboard/stats", async (_req: Request, res: Response) => {
  try {
    const [total, active, avgResponseRate, bySurvey] = await Promise.all([
      prisma.survey.count(),
      prisma.survey.count({ where: { status: "ACTIVE" } }),
      prisma.surveyResponse.count(),
      prisma.survey.findMany({
        include: { _count: { select: { responses: true } } },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    res.json({
      success: true,
      data: {
        totalSurveys: total,
        activeSurveys: active,
        totalResponses: avgResponseRate,
        recentSurveys: bySurvey.map(s => ({
          id: s.id, title: s.title, status: s.status,
          responses: s._count.responses,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch stats" });
  }
});

export { router as surveyRouter };
