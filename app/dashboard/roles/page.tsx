"use client";

import { useEffect, useMemo, useState } from "react";
import { ListFilters } from "@/components/ListFilters";
import PermissionGate from "@/components/PermissionGate";
import { Card, EmptyRow, ErrorBanner, PageHeader } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { emptyFilterText, matchesQuery } from "@/lib/listFilter";
import { isSuperadmin, ROLE } from "@/lib/roles";
import { useRouter } from "next/navigation";

type Permission = { id: string; code: string; description: string | null };
type Role = {
  id: string;
  name: string;
  description: string | null;
  permissions: Permission[];
};

const SIDEBAR_BY_ROLE: Record<string, string[]> = {
  [ROLE.SUPERADMIN]: [
    "Summary",
    "Panduan",
    "Brand",
    "Campaigns",
    "Tag",
    "Publisher",
    "Reports",
    "Users",
    "Roles",
    "Sites & Placements (legacy)",
  ],
  [ROLE.ADMIN]: [
    "Summary",
    "Panduan",
    "Campaigns",
    "Tag",
    "Publisher",
    "Reports",
    "Users",
    "Sites & Placements (legacy)",
  ],
  [ROLE.USERS]: ["Summary", "Panduan", "Campaigns", "Tag", "Reports"],
};

export default function RolesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [roles, setRoles] = useState<Role[]>([]);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!isSuperadmin(user?.role?.name)) {
      router.replace("/dashboard");
    }
  }, [loading, user, router]);

  useEffect(() => {
    Promise.all([
      api<{ data: Role[] }>("/api/roles"),
      api<{ data: Permission[] }>("/api/roles/permissions"),
    ])
      .then(([r, p]) => {
        setRoles(r.data);
        setAllPermissions(p.data);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Gagal memuat"));
  }, []);

  const filteredPermissions = useMemo(
    () => allPermissions.filter((p) => matchesQuery(query, p.code, p.description)),
    [allPermissions, query]
  );

  if (!loading && !isSuperadmin(user?.role?.name)) {
    return null;
  }

  return (
    <PermissionGate permission="user:manage" superadminOnly redirect>
      <PageHeader
        eyebrow="RBAC"
        title="Roles"
        subtitle="Hanya 3 role sistem: Superadmin, Admin, dan Users. Tidak dapat menambah role baru."
      />
      <ErrorBanner message={error} />

      <div className="mt-2 grid gap-4 lg:grid-cols-3">
        {roles.map((role) => (
          <Card key={role.id} className="p-5">
            <h2 className="text-lg font-semibold">{role.name}</h2>
            {role.description && (
              <p className="mt-1 text-sm text-[var(--muted)]">{role.description}</p>
            )}
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                Menu sidebar
              </p>
              <ul className="mt-2 space-y-1 text-sm text-[var(--ink)]">
                {(SIDEBAR_BY_ROLE[role.name] || []).map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="text-[var(--muted)]">·</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                Permission
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {role.permissions.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-md bg-[var(--surface-2)] px-2.5 py-1 text-xs font-medium text-[var(--ink-soft)]"
                    title={p.description ?? undefined}
                  >
                    {p.code}
                  </li>
                ))}
                {role.permissions.length === 0 && (
                  <li className="text-sm text-[var(--muted)]">Tidak ada permission</li>
                )}
              </ul>
            </div>
          </Card>
        ))}
      </div>

      <Card className="mt-8 overflow-hidden">
        <ListFilters
          title="Semua permission"
          query={query}
          onQueryChange={setQuery}
          placeholder="Cari code atau deskripsi..."
          resultCount={filteredPermissions.length}
          totalCount={allPermissions.length}
        />
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Deskripsi</th>
              </tr>
            </thead>
            <tbody>
              {filteredPermissions.length === 0 && (
                <EmptyRow cols={2} text={emptyFilterText(allPermissions.length, "permission")} />
              )}
              {filteredPermissions.map((p) => (
                <tr key={p.id}>
                  <td className="font-mono text-xs">{p.code}</td>
                  <td className="text-[var(--muted)]">{p.description ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </PermissionGate>
  );
}
