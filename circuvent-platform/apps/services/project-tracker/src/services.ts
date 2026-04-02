// ──────────────────────────────────────────────────────────────
// Project Tracker — Service Layer (business logic)
// ──────────────────────────────────────────────────────────────

import { PrismaClient, Prisma } from "@circuvent/database";
import { generateCode, PROJECT_CODE_PREFIX, getFinancialYear } from "@circuvent/shared";
import { createAuditLog } from "@circuvent/audit";

const prisma = new PrismaClient();

// ── Project Service ──

export class ProjectService {
  static async list(params: {
    page: number;
    limit: number;
    sortBy: string;
    sortOrder: "asc" | "desc";
    search?: string;
    type?: string;
    status?: string;
    isRnD?: boolean;
  }) {
    const where: Prisma.ProjectWhereInput = {};

    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: "insensitive" } },
        { code: { contains: params.search, mode: "insensitive" } },
        { description: { contains: params.search, mode: "insensitive" } },
      ];
    }
    if (params.type) where.type = params.type as any;
    if (params.status) where.status = params.status as any;
    if (params.isRnD !== undefined) where.isRnD = params.isRnD;

    const [data, total] = await Promise.all([
      prisma.project.findMany({
        where,
        orderBy: { [params.sortBy]: params.sortOrder },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        include: {
          members: {
            include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
          },
          _count: { select: { sprints: true, hardwareRevisions: true, devices: true } },
        },
      }),
      prisma.project.count({ where }),
    ]);

    return { data, total };
  }

  static async getById(id: string) {
    return prisma.project.findUnique({
      where: { id },
      include: {
        members: {
          include: { user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } } },
        },
        sprints: {
          orderBy: { sprintNumber: "desc" },
          include: {
            tasks: {
              include: { assignee: { select: { id: true, firstName: true, lastName: true } } },
            },
            _count: { select: { tasks: true } },
          },
        },
        hardwareRevisions: {
          orderBy: { createdAt: "desc" },
          include: { _count: { select: { bomItems: true } } },
        },
        devices: { take: 20, orderBy: { createdAt: "desc" } },
        clientProject: {
          include: { client: { select: { id: true, companyName: true } } },
        },
        _count: { select: { sprints: true, hardwareRevisions: true, devices: true } },
      },
    });
  }

  static async create(data: any, userId: string) {
    const count = await prisma.project.count();
    const code = generateCode(PROJECT_CODE_PREFIX, count + 1);

    const project = await prisma.project.create({
      data: {
        ...data,
        code,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        members: {
          create: { userId, role: "lead" },
        },
      },
      include: { members: { include: { user: { select: { id: true, firstName: true, lastName: true } } } } },
    });

    // R&D Tax tagging
    if (data.isRnD) {
      await prisma.rnDTaxRecord.create({
        data: {
          financialYear: getFinancialYear(),
          category: data.rnDCategory || "SOFTWARE_DEVELOPMENT",
          description: `Project: ${project.name}`,
          amount: data.budget || 0,
          sourceEntity: "project",
          sourceEntityId: project.id,
        },
      });
    }

    await createAuditLog({
      userId,
      action: "CREATE",
      entity: "Project",
      entityId: project.id,
      newValue: { name: project.name, code, type: data.type },
    });

    return project;
  }

  static async update(id: string, data: any, userId: string) {
    const old = await prisma.project.findUnique({ where: { id } });
    if (!old) throw new Error("Project not found");

    const project = await prisma.project.update({
      where: { id },
      data: {
        ...data,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
      },
    });

    await createAuditLog({
      userId,
      action: "UPDATE",
      entity: "Project",
      entityId: id,
      oldValue: old as any,
      newValue: project as any,
    });

    return project;
  }

  static async delete(id: string, userId: string) {
    const old = await prisma.project.findUnique({ where: { id } });
    if (!old) throw new Error("Project not found");

    await prisma.project.delete({ where: { id } });
    await createAuditLog({ userId, action: "DELETE", entity: "Project", entityId: id, oldValue: old as any });
  }

  static async addMember(projectId: string, userId: string, role: string, actorId: string) {
    const member = await prisma.projectMember.create({
      data: { projectId, userId, role },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });

    await createAuditLog({ userId: actorId, action: "CREATE", entity: "ProjectMember", entityId: member.id });
    return member;
  }

  static async removeMember(projectId: string, userId: string, actorId: string) {
    await prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId } },
    });
    await createAuditLog({ userId: actorId, action: "DELETE", entity: "ProjectMember" });
  }

  static async getDashboard() {
    const [totalProjects, active, byType, byStatus, recentProjects] = await Promise.all([
      prisma.project.count(),
      prisma.project.count({ where: { status: "ACTIVE" } }),
      prisma.project.groupBy({ by: ["type"], _count: { id: true } }),
      prisma.project.groupBy({ by: ["status"], _count: { id: true } }),
      prisma.project.findMany({
        orderBy: { updatedAt: "desc" },
        take: 5,
        include: { _count: { select: { sprints: true, hardwareRevisions: true } } },
      }),
    ]);

    return { totalProjects, active, byType, byStatus, recentProjects };
  }
}

// ── Sprint Service ──

export class SprintService {
  static async listByProject(projectId: string) {
    return prisma.sprint.findMany({
      where: { projectId },
      orderBy: { sprintNumber: "desc" },
      include: {
        tasks: {
          include: { assignee: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: "desc" },
        },
        _count: { select: { tasks: true } },
      },
    });
  }

  static async create(data: any, userId: string) {
    const lastSprint = await prisma.sprint.findFirst({
      where: { projectId: data.projectId },
      orderBy: { sprintNumber: "desc" },
    });

    const sprint = await prisma.sprint.create({
      data: {
        projectId: data.projectId,
        name: data.name,
        sprintNumber: (lastSprint?.sprintNumber || 0) + 1,
        goal: data.goal,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
      },
    });

    await createAuditLog({ userId, action: "CREATE", entity: "Sprint", entityId: sprint.id });
    return sprint;
  }

  static async updateStatus(id: string, status: string, velocity?: number) {
    return prisma.sprint.update({
      where: { id },
      data: { status: status as any, velocity },
    });
  }

  static async createTask(sprintId: string, data: any, creatorId: string) {
    const task = await prisma.sprintTask.create({
      data: {
        sprintId,
        title: data.title,
        description: data.description,
        assigneeId: data.assigneeId,
        creatorId,
        priority: data.priority || "MEDIUM",
        storyPoints: data.storyPoints,
        tags: data.tags || [],
        isRnDRelated: data.isRnDRelated || false,
      },
      include: { assignee: { select: { id: true, firstName: true, lastName: true } } },
    });

    await createAuditLog({ userId: creatorId, action: "CREATE", entity: "SprintTask", entityId: task.id });
    return task;
  }

  static async updateTask(taskId: string, data: any, userId: string) {
    const task = await prisma.sprintTask.update({
      where: { id: taskId },
      data,
      include: { assignee: { select: { id: true, firstName: true, lastName: true } } },
    });

    await createAuditLog({ userId, action: "UPDATE", entity: "SprintTask", entityId: taskId });
    return task;
  }

  static async deleteTask(taskId: string, userId: string) {
    await prisma.sprintTask.delete({ where: { id: taskId } });
    await createAuditLog({ userId, action: "DELETE", entity: "SprintTask", entityId: taskId });
  }

  static async getSprintBoard(sprintId: string) {
    const tasks = await prisma.sprintTask.findMany({
      where: { sprintId },
      include: { assignee: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: "asc" },
    });

    const columns = {
      BACKLOG: tasks.filter((t) => t.status === "BACKLOG"),
      TODO: tasks.filter((t) => t.status === "TODO"),
      IN_PROGRESS: tasks.filter((t) => t.status === "IN_PROGRESS"),
      IN_REVIEW: tasks.filter((t) => t.status === "IN_REVIEW"),
      DONE: tasks.filter((t) => t.status === "DONE"),
      BLOCKED: tasks.filter((t) => t.status === "BLOCKED"),
    };

    const totalPoints = tasks.reduce((sum, t) => sum + (t.storyPoints || 0), 0);
    const completedPoints = tasks.filter((t) => t.status === "DONE").reduce((sum, t) => sum + (t.storyPoints || 0), 0);

    return { columns, totalPoints, completedPoints, totalTasks: tasks.length };
  }
}

// ── Hardware Revision Service ──

export class HardwareService {
  static async listRevisions(projectId: string) {
    return prisma.hardwareRevision.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: {
        bomItems: { orderBy: { partNumber: "asc" } },
        _count: { select: { bomItems: true } },
      },
    });
  }

  static async createRevision(data: any, userId: string) {
    const revision = await prisma.hardwareRevision.create({ data });
    await createAuditLog({ userId, action: "CREATE", entity: "HardwareRevision", entityId: revision.id });
    return revision;
  }

  static async updateRevisionStatus(id: string, status: string, userId: string) {
    const revision = await prisma.hardwareRevision.update({
      where: { id },
      data: { status: status as any },
    });
    await createAuditLog({ userId, action: "UPDATE", entity: "HardwareRevision", entityId: id, newValue: { status } });
    return revision;
  }

  static async addBOMItem(revisionId: string, data: any, userId: string) {
    const item = await prisma.bOMItem.create({
      data: { ...data, revisionId },
    });

    // Auto-tag R&D
    if (data.isRnDComponent) {
      await prisma.rnDTaxRecord.create({
        data: {
          financialYear: getFinancialYear(),
          category: "COMPONENT_PROCUREMENT",
          description: `BOM: ${data.partName} (${data.partNumber})`,
          amount: data.unitPrice * data.quantity,
          sourceEntity: "bom_item",
          sourceEntityId: item.id,
        },
      });
    }

    await createAuditLog({ userId, action: "CREATE", entity: "BOMItem", entityId: item.id });
    return item;
  }

  static async updateBOMItem(id: string, data: any, userId: string) {
    const item = await prisma.bOMItem.update({ where: { id }, data });
    await createAuditLog({ userId, action: "UPDATE", entity: "BOMItem", entityId: id });
    return item;
  }

  static async deleteBOMItem(id: string, userId: string) {
    await prisma.bOMItem.delete({ where: { id } });
    await createAuditLog({ userId, action: "DELETE", entity: "BOMItem", entityId: id });
  }

  static async getBOMSummary(revisionId: string) {
    const items = await prisma.bOMItem.findMany({ where: { revisionId } });
    const totalCost = items.reduce((sum, i) => sum + Number(i.unitPrice) * i.quantity, 0);
    const rndCost = items.filter((i) => i.isRnDComponent).reduce((sum, i) => sum + Number(i.unitPrice) * i.quantity, 0);
    const categories = [...new Set(items.map((i) => i.category).filter(Boolean))];

    return { items, totalCost, rndCost, itemCount: items.length, categories };
  }
}
