"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BulkBar, CheckAll, RowCheck } from "@/components/BulkBar";
import { ListFilters } from "@/components/ListFilters";
import { Modal } from "@/components/Modal";
import PermissionGate from "@/components/PermissionGate";
import { Card, EmptyRow, ErrorBanner, FieldHint, PageHeader, StatusBadge } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { emptyFilterText, matchesQuery } from "@/lib/listFilter";
import { isSuperadmin } from "@/lib/roles";
import { runBulkAction, useRowSelection } from "@/lib/rowSelection";

type Brand = {
  id: string;
  name: string;
  website_url?: string | null;
  notes?: string | null;
  status: "active" | "inactive";
  campaign_count?: number;
  created_at?: string;
};

const inputClass = "field";

function confirmDeleteBrand(row: Brand) {
  const n = row.campaign_count ?? 0;
  if (n > 0) {
    return window.confirm(
      `Brand "${row.name}" masih punya ${n} campaign.\n\nMenghapus brand ini juga menghapus campaign dan creative-nya. Lanjutkan?`
    );
  }
  return window.confirm(`Hapus brand "${row.name}"?`);
}

function confirmBulkDeleteBrands(selected: Brand[]) {
  const withCampaigns = selected.filter((row) => (row.campaign_count ?? 0) > 0);
  const campaignTotal = withCampaigns.reduce((sum, row) => sum + (row.campaign_count ?? 0), 0);
  if (withCampaigns.length) {
    return `Peringatan: ${withCampaigns.length} dari ${selected.length} brand masih punya campaign (total ${campaignTotal}).\n\nMenghapus juga menghapus campaign dan creative-nya. Lanjutkan?`;
  }
  return `Hapus ${selected.length} brand terpilih?`;
}

export default function AdvertisersPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<Brand[]>([]);
  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">("active");

  const load = useCallback(async () => {
    const res = await api<{ data: Brand[] }>("/api/advertisers");
    setRows(res.data);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!isSuperadmin(user?.role?.name)) {
      router.replace("/dashboard");
      return;
    }
    load().catch((e) => setError(e instanceof ApiError ? e.message : "Gagal memuat"));
  }, [load, authLoading, user, router]);

  if (!authLoading && !isSuperadmin(user?.role?.name)) {
    return (
      <p className="py-8 text-center text-sm text-[var(--muted)]">Mengalihkan...</p>
    );
  }

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (filterStatus && r.status !== filterStatus) return false;
        return matchesQuery(query, r.name, r.id, r.website_url, r.notes);
      }),
    [rows, query, filterStatus]
  );

  const allIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const visibleIds = useMemo(() => filtered.map((r) => r.id), [filtered]);
  const sel = useRowSelection(allIds, visibleIds);

  function openCreate() {
    setEditId(null);
    setName("");
    setWebsiteUrl("");
    setNotes("");
    setStatus("active");
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(row: Brand) {
    setEditId(row.id);
    setName(row.name);
    setWebsiteUrl(row.website_url || "");
    setNotes(row.notes || "");
    setStatus(row.status);
    setFormError(null);
    setFormOpen(true);
  }

  const closeForm = useCallback(() => {
    setFormOpen(false);
    setEditId(null);
    setName("");
    setWebsiteUrl("");
    setNotes("");
    setStatus("active");
    setFormError(null);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const json = {
        name,
        website_url: websiteUrl.trim() || null,
        notes: notes.trim() || null,
        status,
      };
      if (editId) {
        await api(`/api/advertisers/${editId}`, {
          method: "PATCH",
          json,
        });
      } else {
        await api("/api/advertisers", {
          method: "POST",
          json,
        });
      }
      closeForm();
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: Brand) {
    if (!confirmDeleteBrand(row)) return;
    try {
      await api(`/api/advertisers/${row.id}`, { method: "DELETE" });
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

  return (
    <PermissionGate permission="campaign:read" redirect>
      <PageHeader
        eyebrow="Pengiklan"
        title="Brand"
        subtitle="Daftar brand yang memiliki campaign dan creative."
        action={
          <button type="button" className="btn-primary" onClick={openCreate}>
            Tambahkan
          </button>
        }
      />
      <ErrorBanner message={error} />

      <Card className="mt-2 overflow-hidden">
        <ListFilters
          query={query}
          onQueryChange={setQuery}
          placeholder="Cari nama atau ID..."
          resultCount={filtered.length}
          totalCount={rows.length}
          selects={[
            {
              id: "status",
              label: "Status",
              value: filterStatus,
              onChange: setFilterStatus,
              options: [
                { value: "", label: "Semua" },
                { value: "active", label: "active" },
                { value: "inactive", label: "inactive" },
              ],
            },
          ]}
        />
        <BulkBar count={sel.count} total={allIds.length} noun="brand" onClear={sel.clear} busy={busy}>
          <button
            type="button"
            className="bulk-btn"
            onClick={() =>
              bulk((id) => api(`/api/advertisers/${id}`, { method: "PATCH", json: { status: "active" } }))
            }
          >
            Aktifkan
          </button>
          <button
            type="button"
            className="bulk-btn"
            onClick={() =>
              bulk((id) =>
                api(`/api/advertisers/${id}`, { method: "PATCH", json: { status: "inactive" } })
              )
            }
          >
            Nonaktifkan
          </button>
          <button
            type="button"
            className="bulk-btn bulk-btn-danger"
            onClick={() => {
              const selected = rows.filter((row) => sel.selected.has(row.id));
              bulk(
                (id) => api(`/api/advertisers/${id}`, { method: "DELETE" }),
                confirmBulkDeleteBrands(selected)
              );
            }}
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
                <th>ID</th>
                <th>Nama</th>
                <th>Website</th>
                <th>Campaign</th>
                <th>Status</th>
                <th>Dibuat</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <EmptyRow cols={8} text={emptyFilterText(rows.length, "brand")} />
              )}
              {filtered.map((r) => (
                <tr key={r.id} className={sel.selected.has(r.id) ? "is-selected" : ""}>
                  <td className="th-check">
                    <RowCheck
                      checked={sel.selected.has(r.id)}
                      onChange={() => sel.toggle(r.id)}
                      label={`Pilih ${r.name}`}
                    />
                  </td>
                  <td className="font-mono text-xs">{r.id}</td>
                  <td className="font-medium">
                    <span className="block">{r.name}</span>
                    {r.notes && (
                      <span className="mt-0.5 block max-w-[16rem] truncate text-xs font-normal text-[var(--muted)]">
                        {r.notes}
                      </span>
                    )}
                  </td>
                  <td className="max-w-[12rem]">
                    {r.website_url ? (
                      <a
                        href={r.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-link break-all text-xs"
                      >
                        {r.website_url.replace(/^https?:\/\//, "")}
                      </a>
                    ) : (
                      <span className="text-[var(--muted)]">-</span>
                    )}
                  </td>
                  <td className="text-[var(--muted)]">{r.campaign_count ?? 0}</td>
                  <td>
                    <StatusBadge value={r.status} />
                  </td>
                  <td className="text-[var(--muted)]">
                    {r.created_at ? String(r.created_at).slice(0, 10) : "-"}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button type="button" className="act-btn" onClick={() => openEdit(r)}>
                        Edit
                      </button>
                      <button type="button" className="act-btn act-btn-danger" onClick={() => remove(r)}>
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
        title={editId ? "Edit brand" : "Tambah brand"}
        onClose={closeForm}
        wide
      >
        <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <ErrorBanner message={formError} />
          </div>
          <div>
            <label className="block text-sm font-medium">Nama brand</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="Contoh: Testing Brand"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as "active" | "inactive")}
              className={inputClass}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium">Website / URL brand</label>
            <input
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              className={inputClass}
              placeholder="https://contoh.com"
            />
            <FieldHint>Opsional. Pakai http:// atau https://.</FieldHint>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium">Informasi brand</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={`${inputClass} min-h-[6.5rem] resize-y`}
              placeholder="Catatan internal: kontak, kategori, keterangan singkat, dll."
              maxLength={4000}
            />
            <FieldHint>Opsional. Hanya terlihat di dashboard Superadmin.</FieldHint>
          </div>
          <div className="flex justify-end gap-2 pt-1 md:col-span-2">
            <button type="button" className="btn-ghost" onClick={closeForm} disabled={saving}>
              Batal
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </form>
      </Modal>
    </PermissionGate>
  );
}
