"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { isSuperadmin } from "@/lib/roles";

type Props = {
  permission?: string;
  /** Hanya Superadmin (contoh: kelola Users & Roles). */
  superadminOnly?: boolean;
  redirect?: boolean;
  children: ReactNode;
};

export default function PermissionGate({
  permission,
  superadminOnly = false,
  redirect = false,
  children,
}: Props) {
  const { loading, user, hasPermission } = useAuth();
  const router = useRouter();

  const allowed =
    (!permission || hasPermission(permission)) &&
    (!superadminOnly || isSuperadmin(user?.role?.name));

  useEffect(() => {
    if (loading || !redirect) return;
    if (!allowed) router.replace("/dashboard");
  }, [loading, redirect, allowed, router]);

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-slate-500">Memuat...</div>
    );
  }

  if (!allowed) {
    if (redirect) return null;
    return null;
  }

  return <>{children}</>;
}
