// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Express Auth & RBAC Middleware
// ──────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from "express";
import { Role, HTTP_STATUS } from "@circuvent/shared";
import { verifyAccessToken } from "./jwt";
import type { JwtPayload } from "@circuvent/shared";

// Extend Express Request to include authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Middleware: Authenticate JWT from Authorization header.
 * Attaches decoded user to `req.user`.
 */
export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      error: "Authentication required. Provide a valid Bearer token.",
    });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded;
    next();
  } catch {
    res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      error: "Invalid or expired token.",
    });
  }
}

/**
 * Middleware: Authorize based on allowed roles (RBAC).
 * Must be used AFTER `authenticate` middleware.
 *
 * Usage: `router.get("/admin", authenticate, authorize(Role.ADMIN), handler)`
 */
export function authorize(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: "Authentication required.",
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role as Role)) {
      res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        error: `Access denied. Required roles: ${allowedRoles.join(", ")}`,
      });
      return;
    }

    next();
  };
}

/**
 * Middleware: Allow resource owner OR specific roles.
 * Checks if req.user.userId matches the param userId, or user has allowed role.
 */
export function authorizeOwnerOrRoles(
  userIdParam: string,
  ...allowedRoles: Role[]
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: "Authentication required.",
      });
      return;
    }

    const resourceUserId = req.params[userIdParam];
    const isOwner = req.user.userId === resourceUserId;
    const hasRole = allowedRoles.includes(req.user.role as Role);

    if (!isOwner && !hasRole) {
      res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        error: "Access denied. You can only access your own resources.",
      });
      return;
    }

    next();
  };
}
