import type { AdminRole } from "@/lib/roles";

export type CampaignStatus = "draft" | "published" | "archived";

export function roleLabel(role: AdminRole | null): string {
  if (role === "HR_ADMIN") return "管理员";
  if (role === "HR_OPERATOR") return "录入员";
  return "未登录";
}

export function isAdmin(role: AdminRole | null): boolean {
  return role === "HR_ADMIN";
}

export function canPublishCampaign(role: AdminRole | null, status: CampaignStatus): boolean {
  return role === "HR_ADMIN" && status === "draft";
}

export function canArchiveCampaign(role: AdminRole | null, status: CampaignStatus): boolean {
  return role === "HR_ADMIN" && status === "published";
}

export function canDeleteCampaign(_role: AdminRole | null, status: CampaignStatus): boolean {
  // Draft can be deleted (server-side still enforces status=draft).
  return status === "draft";
}

export function canImportCampaignItems(status: CampaignStatus): boolean {
  return status === "draft";
}

export function canEditDraftItems(status: CampaignStatus): boolean {
  return status === "draft";
}

export function canAdminOverrideItems(role: AdminRole | null, status: CampaignStatus): boolean {
  return role === "HR_ADMIN" && status === "published";
}

