// Status color maps for badges across all modules

export type StatusColorMap = Record<string, "blue" | "green" | "red" | "amber" | "purple" | "slate" | "cyan" | "pink" | "emerald" | "orange">;

export const projectStatusColors: StatusColorMap = {
  PLANNING: "purple",
  ACTIVE: "green",
  ON_HOLD: "amber",
  COMPLETED: "blue",
  ARCHIVED: "slate",
};

export const sprintStatusColors: StatusColorMap = {
  PLANNED: "purple",
  ACTIVE: "green",
  COMPLETED: "blue",
  CANCELLED: "red",
};

export const taskStatusColors: StatusColorMap = {
  BACKLOG: "slate",
  TODO: "purple",
  IN_PROGRESS: "blue",
  IN_REVIEW: "amber",
  DONE: "green",
  BLOCKED: "red",
};

export const taskPriorityColors: StatusColorMap = {
  CRITICAL: "red",
  HIGH: "orange",
  MEDIUM: "amber",
  LOW: "slate",
};

export const deviceStatusColors: StatusColorMap = {
  REGISTERED: "purple",
  PROVISIONED: "cyan",
  ONLINE: "green",
  OFFLINE: "red",
  MAINTENANCE: "amber",
  DECOMMISSIONED: "slate",
};

export const revisionStatusColors: StatusColorMap = {
  DRAFT: "slate",
  IN_REVIEW: "amber",
  APPROVED: "green",
  PRODUCTION: "blue",
  DEPRECATED: "red",
};

export const invoiceStatusColors: StatusColorMap = {
  DRAFT: "slate",
  SENT: "blue",
  VIEWED: "cyan",
  PAID: "green",
  OVERDUE: "red",
  CANCELLED: "slate",
  PARTIALLY_PAID: "amber",
};

export const leadStatusColors: StatusColorMap = {
  NEW: "blue",
  CONTACTED: "cyan",
  QUALIFIED: "purple",
  PROPOSAL_SENT: "amber",
  NEGOTIATION: "orange",
  WON: "green",
  LOST: "red",
};

export const expenseStatusColors: StatusColorMap = {
  DRAFT: "slate",
  SUBMITTED: "blue",
  APPROVED: "green",
  REJECTED: "red",
  REIMBURSED: "emerald",
};
