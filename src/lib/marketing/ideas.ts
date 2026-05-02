import type { IdeaStatus, ServiceLine } from "@prisma/client";

export const SERVICE_LINE_LABELS: Record<ServiceLine, string> = {
  GROOMING: "Grooming",
  DAYCARE: "Daycare",
  BOARDING: "Boarding",
  TRAINING: "Training",
  MULTIPLE: "Multiple",
};

export const IDEA_STATUS_LABELS: Record<IdeaStatus, string> = {
  DRAFT: "Draft",
  IN_PRODUCTION: "In production",
  SHIPPED: "Shipped",
  ARCHIVED: "Archived",
};

export const IDEA_STATUS_VARIANT: Record<
  IdeaStatus,
  "default" | "info" | "success" | "warning"
> = {
  DRAFT: "default",
  IN_PRODUCTION: "warning",
  SHIPPED: "success",
  ARCHIVED: "default",
};
