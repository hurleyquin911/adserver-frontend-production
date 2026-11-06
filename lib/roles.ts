export const ROLE = {
  SUPERADMIN: "Superadmin",
  ADMIN: "Admin",
  USERS: "Users",
} as const;

export type SystemRoleName = (typeof ROLE)[keyof typeof ROLE];

export function normalizeRoleName(name?: string | null): string {
  const raw = String(name || "").trim();
  if (raw === "Super Admin") return ROLE.SUPERADMIN;
  if (raw === "Campaign Manager" || raw === "Viewer") return ROLE.USERS;
  return raw;
}

export function isSuperadmin(name?: string | null) {
  return normalizeRoleName(name) === ROLE.SUPERADMIN;
}

export function isAdmin(name?: string | null) {
  return normalizeRoleName(name) === ROLE.ADMIN;
}

export function isUsersRole(name?: string | null) {
  return normalizeRoleName(name) === ROLE.USERS;
}

/** Users harus terikat Brand; Admin dan Superadmin bekerja lintas Brand. */
export function needsBrand(name?: string | null) {
  return isUsersRole(name);
}

/**
 * Role Users hanya melihat data. Buat, ubah, dan hapus campaign, creative,
 * serta mutasi data lain disembunyikan. Profil dan password tetap di halaman akun.
 */
export function isViewOnlyRole(name?: string | null) {
  return isUsersRole(name);
}
