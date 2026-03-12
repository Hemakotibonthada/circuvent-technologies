// ──────────────────────────────────────────────────────────────
// Enhanced Employee Routes
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { HTTP_STATUS, successResponse, errorResponse, normalizePagination, buildPaginationMeta } from "@circuvent/shared";
import { EmployeeService } from "../services";
import { createEmployeeSchema, updateEmployeeSchema } from "../validators";

const router = Router();

router.get("/dashboard", async (_req: Request, res: Response) => {
  try {
    const dashboard = await EmployeeService.getDashboard();
    res.json(successResponse(dashboard));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to fetch HR dashboard"));
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const pagination = normalizePagination(req.query);
    const { department, employmentType } = req.query;
    const { data, total } = await EmployeeService.list({ ...pagination, department: department as string, employmentType: employmentType as string });
    res.json(successResponse(data, undefined, buildPaginationMeta(total, pagination.page, pagination.limit)));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to fetch employees"));
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const employee = await EmployeeService.getById(req.params.id);
    if (!employee) { res.status(HTTP_STATUS.NOT_FOUND).json(errorResponse("Employee not found")); return; }
    res.json(successResponse(employee));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to fetch employee"));
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const parsed = createEmployeeSchema.safeParse(req.body);
    if (!parsed.success) { res.status(HTTP_STATUS.BAD_REQUEST).json(errorResponse(parsed.error.errors[0].message)); return; }
    const actorId = (req as any).user?.userId;
    const employee = await EmployeeService.create(parsed.data, actorId);
    res.status(HTTP_STATUS.CREATED).json(successResponse(employee, "Employee created"));
  } catch (error: any) {
    if (error?.code === "P2002") { res.status(HTTP_STATUS.CONFLICT).json(errorResponse("Employee record already exists")); return; }
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse(error.message || "Failed to create employee"));
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  try {
    const parsed = updateEmployeeSchema.safeParse(req.body);
    if (!parsed.success) { res.status(HTTP_STATUS.BAD_REQUEST).json(errorResponse(parsed.error.errors[0].message)); return; }
    const actorId = (req as any).user?.userId;
    const employee = await EmployeeService.update(req.params.id, parsed.data, actorId);
    res.json(successResponse(employee, "Employee updated"));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to update employee"));
  }
});

export { router as employeeRouter };
