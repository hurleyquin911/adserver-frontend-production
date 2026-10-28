"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { BulkBar, CheckAll, RowCheck } from "@/components/BulkBar";
import { ListFilters } from "@/components/ListFilters";
import { Modal } from "@/components/Modal";
import PermissionGate from "@/components/PermissionGate";
import { Card, EmptyRow, ErrorBanner, FieldHint, PageHeader, StatusBadge } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { emptyFilterText, matchesQuery } from "@/lib/listFilter";
import { isSuperadmin, needsBrand, ROLE } from "@/lib/roles";
import { runBulkAction, useRowSelection } from "@/lib/rowSelection";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role_id: string;
  advertiser_id: string | null;
  is_active: boolean;
  role?: { id: string; name: string };
};

type RoleRow = { id: string; name: string };
type AdvertiserRow = { id: string; name: string };

const inputClass = "field";

export default function UsersPage() {
  const { user: me } = useAuth();
  const amSuperadmin = isSuperadmin(me?.role?.name);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [advertisers, setAdvertisers] = useState<AdvertiserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [roleId, setRoleId] = useState("");
  const [advertiserId, setAdvertiserId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [query, setQuery] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterActive, setFilterActive] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedRole = useMemo(
    () => roles.find((r) => r.id === roleId) || null,
    [roles, roleId]
  );
  const brandRequired = needsBrand(selectedRole?.name);

  const load = useCallback(async () => {
    const [u, r, a] = await Promise.all([
      api<{ data: UserRow[] }>("/api/users"),
      api<{ data: RoleRow[] }>("/api/roles"),
      api<{ data: AdvertiserRow[] }>("/api/advertisers").catch(() => ({
        data: [] as AdvertiserRow[],
      })),
    ]);
    const visibleUsers = amSuperadmin
      ? u.data
      : u.data.filter((row) => !isSuperadmin(row.role?.name));
    const visibleRoles = amSuperadmin
      ? r.data
      : r.data.filter((row) => !isSuperadmin(row.name));
    setUsers(visibleUsers);
    setRoles(visibleRoles);
    setAdvertisers(a.data);
  }, [amSuperadmin]);

  useEffect(() => {
    load().catch((e) =>
      setError(e instanceof ApiError ? e.message : "Gagal memuat data")
    );
  }, [load]);

  const filtered = useMemo(
    () =>
      users.filter((u) => {
        if (filterRole && u.role_id !== filterRole) return false;
        if (filterActive === "1" && !u.is_active) return false;
        if (filterActive === "0" && u.is_active) return false;
        const advertiserName = u.advertiser_id
          ? advertisers.find((a) => a.id === u.advertiser_id)?.name
          : "Semua";
        return matchesQuery(query, u.name, u.email, u.role?.name, advertiserName);
      }),
    [users, query, filterRole, filterActive, advertisers]
  );

  function resetForm() {
    setEditId(null);
    setEmail("");
    setName("");
    setPassword("");
    setPasswordConfirm("");
    setShowPassword(false);
    setAdvertiserId("");
    setIsActive(true);
    setFormError(null);
    const usersRole = roles.find((x) => x.name === ROLE.USERS) || roles[0];
    setRoleId(usersRole?.id || "");
  }

  function openCreate() {
    resetForm();
    setFormOpen(true);
  }

  function openEdit(row: UserRow) {
    setEditId(row.id);
    setEmail(row.email);
    setName(row.name);
    setPassword("");
    setPasswordConfirm("");
    setShowPassword(false);
    setRoleId(row.role_id);
    setAdvertiserId(row.advertiser_id || "");
    setIsActive(row.is_active);
    setFormError(null);
    setFormOpen(true);
  }

  const closeForm = useCallback(() => {
    setFormOpen(false);
    setEditId(null);
    setEmail("");
    setName("");
    setPassword("");
    setPasswordConfirm("");
    setShowPassword(false);
    setAdvertiserId("");
    setIsActive(true);
    setFormError(null);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (brandRequired && !advertiserId) {
      setFormError("Pilih Brand untuk role Users.");
      return;
    }
    const wantsPassword = !editId || password.trim().length > 0 || passwordConfirm.trim().length > 0;
    if (wantsPassword) {
      if (password.length < 8) {
        setFormError("Password minimal 8 karakter.");
        return;
      }
      if (password !== passwordConfirm) {
        setFormError("Password dan konfirmasi password tidak sama.");
        return;
      }
    }
    setFormError(null);
    setSaving(true);
    try {
      if (editId) {
        const json: Record<string, unknown> = {
          email,
          name,
          role_id: Number(roleId),
          advertiser_id: brandRequired ? Number(advertiserId) : null,
          is_active: isActive,
        };
        if (password.trim()) json.password = password;
        await api(`/api/users/${editId}`, { method: "PATCH", json });
      } else {
        await api("/api/users", {
          method: "POST",
          json: {
            email,
            name,
            password,
            role_id: Number(roleId),
            advertiser_id: brandRequired ? Number(advertiserId) : null,
            is_active: isActive,
          },
        });
      }
      closeForm();
      await load();
    } catch (err) {
      setFormError(
        err instanceof ApiError
          ? err.message
          : editId
            ? "Gagal menyimpan user"
            : "Gagal membuat user"
      );
    } finally {
      setSaving(false);
    }
  }

  const allIds = useMemo(() => users.map((u) => u.id), [users]);
  const visibleIds = useMemo(() => filtered.map((u) => u.id), [filtered]);
  const sel = useRowSelection(allIds, visibleIds);

  async function removeUser(id: string) {
    if (!confirm("Hapus user ini?")) return;
    try {
      await api(`/api/users/${id}`, { method: "DELETE" });
      if (editId === id) closeForm();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menghapus");
    }
  }

  async function bulk(fn: (id: string) => Promise<void>, confirmText?: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await runBulkAction(sel.ids, fn, confirmText);
      if (result.cancelled) return;
      if (result.failed) {
        setError(`${result.failed} gagal${result.message ? `: ${result.message}` : ""}`);
      }
      sel.clear();
      await load();
    } finally {
      setBusy(false);
    }
  }

  function brandLabel(u: UserRow) {
    if (!u.advertiser_id) return "Semua";
    return advertisers.find((a) => a.id === u.advertiser_id)?.name ?? u.advertiser_id;
  }

  return (
    <PermissionGate permission="user:manage" superadminOnly redirect>
      <PageHeader
        eyebrow="Akses"
        title="Users"
        subtitle="Kelola akun Superadmin, Admin, dan Users. Hanya Superadmin. Users terikat ke satu Brand."
        action={
          <button type="button" className="btn-primary" onClick={openCreate}>
            Tambah User
          </button>
        }
      />
      <ErrorBanner message={error} />

      <Card className="mt-2 overflow-hidden">
        <ListFilters
          query={query}
          onQueryChange={setQuery}
          placeholder="Cari nama, email, role..."
          resultCount={filtered.length}
          totalCount={users.length}
          selects={[
            {
              id: "role",
              label: "Role",
              value: filterRole,
              onChange: setFilterRole,
              variant: "select",
              options: [
                { value: "", label: "Semua role" },
                ...roles.map((r) => ({ value: r.id, label: r.name })),
              ],
            },
            {
              id: "active",
              label: "Status",
              value: filterActive,
              onChange: setFilterActive,
              options: [
                { value: "", label: "Semua" },
                { value: "1", label: "Aktif" },
                { value: "0", label: "Tidak aktif" },
              ],
            },
          ]}
        />
        <BulkBar count={sel.count} total={allIds.length} noun="user" onClear={sel.clear} busy={busy}>
          <button
            type="button"
            className="bulk-btn"
            onClick={() =>
              bulk((id) => api(`/api/users/${id}`, { method: "PATCH", json: { is_active: true } }))
            }
          >
            Aktifkan
          </button>
          <button
            type="button"
            className="bulk-btn"
            onClick={() =>
              bulk((id) => api(`/api/users/${id}`, { method: "PATCH", json: { is_active: false } }))
            }
          >
            Nonaktifkan
          </button>
          <button
            type="button"
            className="bulk-btn bulk-btn-danger"
            onClick={() =>
              bulk(
                (id) => api(`/api/users/${id}`, { method: "DELETE" }),
                `Hapus ${sel.count} user terpilih?`
              )
            }
          >
            Hapus
          </button>
        </BulkBar>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th className="th-check">
                  <CheckAll
                    checked={sel.allVisibleSelected}
                    indeterminate={sel.someVisibleSelected && !sel.allVisibleSelected}
                    onChange={sel.toggleAllVisible}
                    disabled={filtered.length === 0}
                  />
                </th>
                <th>Nama</th>
                <th>Email</th>
                <th>Role</th>
                <th>Brand</th>
                <th>Aktif</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <EmptyRow
                  cols={7}
                  text={
                    users.length === 0
                      ? "Belum ada user. Klik Tambah User untuk membuat."
                      : emptyFilterText(users.length, "user")
                  }
                />
              )}
              {filtered.map((u) => (
                <tr key={u.id} className={sel.selected.has(u.id) ? "is-selected" : ""}>
                  <td className="th-check">
                    <RowCheck
                      checked={sel.selected.has(u.id)}
                      onChange={() => sel.toggle(u.id)}
                      label={`Pilih ${u.name}`}
                    />
                  </td>
                  <td className="font-medium">{u.name}</td>
                  <td>{u.email}</td>
                  <td>{u.role?.name ?? u.role_id}</td>
                  <td>{brandLabel(u)}</td>
                  <td>
                    <StatusBadge value={u.is_active ? "Ya" : "Tidak"} />
                  </td>
                  <td>
                    <div className="row-actions">
                      <button type="button" className="act-btn" onClick={() => openEdit(u)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="act-btn act-btn-danger"
                        onClick={() => removeUser(u.id)}
                      >
                        Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={formOpen}
        title={editId ? "Edit User" : "Tambah User"}
        onClose={closeForm}
        wide
      >
        <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <ErrorBanner message={formError} />
          </div>
          <div>
            <label className="block text-sm font-medium">Email</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Nama</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <div className="flex items-center justify-between gap-2">
              <label className="block text-sm font-medium">
                Password{editId ? " (opsional)" : ""}
              </label>
              <button
                type="button"
                className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)]"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? "Sembunyikan" : "Tampilkan"}
              </button>
            </div>
            <input
              required={!editId}
              type={showPassword ? "text" : "password"}
              minLength={editId ? undefined : 8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              autoComplete="new-password"
            />
            <FieldHint>
              {editId
                ? "Kosongkan jika tidak ingin mengganti password. Minimal 8 karakter jika diisi."
                : "Minimal 8 karakter."}
            </FieldHint>
          </div>
          <div>
            <label className="block text-sm font-medium">
              Konfirmasi password{editId ? " (opsional)" : ""}
            </label>
            <input
              required={!editId || password.trim().length > 0}
              type={showPassword ? "text" : "password"}
              minLength={editId && !password.trim() ? undefined : 8}
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              className={inputClass}
              autoComplete="new-password"
            />
            <FieldHint>Ulangi password yang sama agar tidak salah ketik.</FieldHint>
          </div>
          <div>
            <label className="block text-sm font-medium">Role</label>
            <select
              required
              value={roleId}
              onChange={(e) => {
                setRoleId(e.target.value);
                const r = roles.find((x) => x.id === e.target.value);
                if (r && !needsBrand(r.name)) setAdvertiserId("");
              }}
              className={inputClass}
            >
              {roles.length === 0 && <option value="">Belum ada role</option>}
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <FieldHint>Pilih Superadmin, Admin, atau Users.</FieldHint>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium">
              Brand
              {brandRequired
                ? " (wajib untuk Users)"
                : " (tidak perlu untuk Superadmin atau Admin)"}
            </label>
            <select
              required={brandRequired}
              value={advertiserId}
              onChange={(e) => setAdvertiserId(e.target.value)}
              disabled={!brandRequired}
              className={inputClass}
            >
              <option value="">{brandRequired ? "Pilih brand" : "Tidak perlu"}</option>
              {advertisers.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <FieldHint>
              Users terhubung ke satu Brand dan hanya melihat campaign Brand tersebut.
              Admin bekerja lintas Brand.
            </FieldHint>
          </div>
          <div>
            <label className="block text-sm font-medium">Status</label>
            <select
              value={isActive ? "1" : "0"}
              onChange={(e) => setIsActive(e.target.value === "1")}
              className={inputClass}
            >
              <option value="1">Aktif</option>
              <option value="0">Tidak aktif</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-1 md:col-span-2">
            <button type="button" className="btn-ghost" onClick={closeForm} disabled={saving}>
              Batal
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={saving || !roles.length || (brandRequired && !advertisers.length)}
            >
              {saving ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </form>
      </Modal>
    </PermissionGate>
  );
}
