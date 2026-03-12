// ──────────────────────────────────────────────────────────────
// HR Employee Controller — handles employee CRUD with
// compliance checklist, leave balance, and gratuity checks.
// ──────────────────────────────────────────────────────────────

import { Request, Response } from "express";
import { EmployeeService } from "../services";
import { EmployeeEntity } from "../domain/employee.entity";
import { createEmployeeSchema, updateEmployeeSchema } from "../validators";
import { successResponse, errorResponse, normalizePagination, buildPaginationMeta } from "@circuvent/shared";
import { LeaveApprovalWorkflow } from "../workflows/leave-approval.workflow";

export class EmployeeController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const pagination = normalizePagination(req.query);
      const { department, employmentType } = req.query;
      const { data, total } = await EmployeeService.list({
        ...pagination, department: department as string, employmentType: employmentType as string,
      });
      res.json(successResponse(data, undefined, buildPaginationMeta(total, pagination.page, pagination.limit)));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const employee = await EmployeeService.getById(req.params.id);
      if (!employee) { res.status(404).json(errorResponse("Employee not found")); return; }

      // Enrich with domain analysis
      const entity = new EmployeeEntity({
        id: employee.id, employeeCode: employee.employeeCode, userId: employee.userId,
        employmentType: employee.employmentType, designation: employee.designation,
        department: employee.department, dateOfJoining: employee.dateOfJoining,
        dateOfLeaving: employee.dateOfLeaving, baseSalary: Number(employee.baseSalary),
        currency: employee.currency, panNumber: employee.panNumber,
        aadhaarNumber: employee.aadhaarNumber, uanNumber: employee.uanNumber,
      });

      res.json(successResponse({
        ...employee,
        _analysis: {
          yearsOfService: entity.getYearsOfService(),
          isEligibleForGratuity: entity.isEligibleForGratuity(),
          isProbationComplete: entity.isProbationComplete(),
          isInRnDDepartment: entity.isInRnDDepartment(),
          complianceChecklist: entity.getComplianceChecklist(),
          monthlySalary: entity.getMonthlySalary(),
        },
      }));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createEmployeeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json(errorResponse(parsed.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("; ")));
        return;
      }
      const actorId = (req as any).user?.userId;
      const employee = await EmployeeService.create(parsed.data, actorId);
      res.status(201).json(successResponse(employee, "Employee created"));
    } catch (error: any) {
      if (error?.code === "P2002") { res.status(409).json(errorResponse("Employee already exists")); return; }
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const parsed = updateEmployeeSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json(errorResponse(parsed.error.errors[0].message)); return; }
      const actorId = (req as any).user?.userId;
      const employee = await EmployeeService.update(req.params.id, parsed.data, actorId);
      res.json(successResponse(employee, "Employee updated"));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async getDashboard(req: Request, res: Response): Promise<void> {
    try {
      const dashboard = await EmployeeService.getDashboard();
      res.json(successResponse(dashboard));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  // ── Leave Endpoints ──

  static async submitLeave(req: Request, res: Response): Promise<void> {
    try {
      const actorId = (req as any).user?.userId;
      const record = await LeaveApprovalWorkflow.submit(req.body, actorId);
      res.status(201).json(successResponse(record, "Leave request submitted"));
    } catch (error: any) {
      const status = error.message.includes("Insufficient") ? 400
        : error.message.includes("overlap") ? 409
        : error.message.includes("not found") ? 404
        : error.message.includes("Cannot") ? 400 : 500;
      res.status(status).json(errorResponse(error.message));
    }
  }

  static async approveLeave(req: Request, res: Response): Promise<void> {
    try {
      const actorId = (req as any).user?.userId;
      const record = await LeaveApprovalWorkflow.approve(req.params.id, actorId, req.body.comments);
      res.json(successResponse(record, "Leave approved"));
    } catch (error: any) {
      res.status(400).json(errorResponse(error.message));
    }
  }

  static async rejectLeave(req: Request, res: Response): Promise<void> {
    try {
      const actorId = (req as any).user?.userId;
      const record = await LeaveApprovalWorkflow.reject(req.params.id, actorId, req.body.comments);
      res.json(successResponse(record, "Leave rejected"));
    } catch (error: any) {
      res.status(400).json(errorResponse(error.message));
    }
  }

  static async cancelLeave(req: Request, res: Response): Promise<void> {
    try {
      const actorId = (req as any).user?.userId;
      const record = await LeaveApprovalWorkflow.cancel(req.params.id, actorId);
      res.json(successResponse(record, "Leave cancelled"));
    } catch (error: any) {
      res.status(400).json(errorResponse(error.message));
    }
  }

  static async getLeaveBalance(req: Request, res: Response): Promise<void> {
    try {
      const balance = await LeaveApprovalWorkflow.getBalance(req.params.employeeId);
      res.json(successResponse(balance));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async getTeamCalendar(req: Request, res: Response): Promise<void> {
    try {
      const { department, month, year } = req.query;
      if (!department || !month || !year) {
        res.status(400).json(errorResponse("department, month, year required")); return;
      }
      const calendar = await LeaveApprovalWorkflow.getTeamCalendar(
        department as string, Number(month), Number(year)
      );
      res.json(successResponse(calendar));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async getPendingLeaves(req: Request, res: Response): Promise<void> {
    try {
      const pending = await LeaveApprovalWorkflow.getPendingApprovals();
      res.json(successResponse(pending));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }
}
