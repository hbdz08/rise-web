import type { AdminRole } from "@/lib/roles";

export type AdminAuthState = {
  username: string;
  role: AdminRole;
  issuedAt: number;
};

const STORAGE_KEY = "rise.adminAuth";

export function readAdminAuthFromStorage(storage: Storage): AdminAuthState | null {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<AdminAuthState> | null;
    if (!parsed) return null;
    if (typeof parsed.username !== "string" || parsed.username.trim() === "") return null;
    if (parsed.role !== "HR_ADMIN" && parsed.role !== "HR_OPERATOR") return null;
    if (typeof parsed.issuedAt !== "number") return null;
    return { username: parsed.username, role: parsed.role, issuedAt: parsed.issuedAt };
  } catch {
    return null;
  }
}

export function writeAdminAuthToStorage(storage: Storage, state: AdminAuthState): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearAdminAuthFromStorage(storage: Storage): void {
  storage.removeItem(STORAGE_KEY);
}

