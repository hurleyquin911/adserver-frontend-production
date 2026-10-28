"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  FormEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { BulkBar, CheckAll, RowCheck } from "@/components/BulkBar";
import { CampaignCreativesPanel } from "@/components/CampaignCreativesPanel";
import { ListFilters } from "@/components/ListFilters";
import { Modal } from "@/components/Modal";
import PermissionGate from "@/components/PermissionGate";
import { Card, EmptyRow, ErrorBanner, FieldHint, PageHeader, StatusBadge } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { emptyFilterText, matchesQuery } from "@/lib/listFilter";
import { needsBrand } from "@/lib/roles";
import { runBulkAction, useRowSelection } from "@/lib/rowSelection";

type Campaign = {
  id: string;
  name: string;
  advertiser_id: string;
  start_date: string;
  end_date: string;
  status: string;
  priority: number;
  impression_goal: number | null;
  delivered?: number;
  creative_count?: number;
  advertiser?: { id: string; name: string };
};

type Advertiser = { id: string; name: string };

const STATUSES = ["draft", "active", "paused", "ended"] as const;
const inputClass = "field";

export default function CampaignsPage() {
  return (
    <Suspense fallback={<p className="py-8 text-center text-sm text-[var(--muted)]">Memuat...</p>}>
      <CampaignsBody />
    </Suspense>
  );
}

function CampaignsBody() {
  const { user, hasPermission } = useAuth();
  const canWrite = hasPermission("campaign:write");
  const router = useRouter();
  const search = useSearchParams();
  const brandLocked = needsBrand(user?.role?.name);
  const lockedBrandId = brandLocked ? user?.advertiser_id || "" : "";

  const [rows, setRows] = useState<Campaign[]>([]);
  const [advertisers, setAdvertisers] = useState<Advertiser[]>([]);
  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterAdvertiser, setFilterAdvertiser] = useState(
    () => search.get("advertiser_id") || ""
  );
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [advertiserId, setAdvertiserId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("draft");
  const [priority, setPriority] = useState("1");
  const [impressionGoal, setImpressionGoal] = useState("");

  const load = useCallback(async () => {
    const [c, a] = await Promise.all([
      api<{ data: Campaign[] }>("/api/campaigns"),
      api<{ data: Advertiser[] }>("/api/advertisers"),
    ]);
    setRows(c.data);
    setAdvertisers(a.data);
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e instanceof ApiError ? e.message : "Gagal memuat"));
  }, [load]);

  useEffect(() => {
    if (lockedBrandId) setAdvertiserId(lockedBrandId);
  }, [lockedBrandId]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (filterStatus && r.status !== filterStatus) return false;
        if (filterAdvertiser && r.advertiser_id !== filterAdvertiser) return false;
        return matchesQuery(query, r.name, r.advertiser?.name);
      }),
    [rows, query, filterStatus, filterAdvertiser]
  );

  const allIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const visibleIds = useMemo(() => filtered.map((r) => r.id), [filtered]);
  const sel = useRowSelection(allIds, visibleIds);

  /**
   * Panel split: state lokal saja (tanpa animasi leave / pointer-events:none).
   * URL `?c=` di-update setelah state, hanya untuk deep link & refresh.
   */
  const [panelId, setPanelId] = useState<string | null>(() => search.get("c"));
  const uploadRequested = search.get("upload") === "1";
  const fixCreativeId = search.get("fix");
  const shellOpen = Boolean(panelId);

  useEffect(() => {
    function onPopState() {
      const params = new URLSearchParams(window.location.search);
      setPanelId(params.get("c"));
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const detailCampaign = useMemo(
    () => (panelId ? rows.find((r) => String(r.id) === String(panelId)) || null : null),
    [rows, panelId]
  );

  useEffect(() => {
    if ((!uploadRequested && !fixCreativeId) || !detailCampaign) return;
    const params = new URLSearchParams(search.toString());
    params.delete("upload");
    params.delete("fix");
    router.replace(`/dashboard/campaigns?${params.toString()}`, { scroll: false });
  }, [detailCampaign, fixCreativeId, router, search, uploadRequested]);

  function syncUrl(id: string | null) {
    const params = new URLSearchParams(search.toString());
    if (id) params.set("c", id);
    else params.delete("c");
    const q = params.toString();
    router.replace(q ? `/dashboard/campaigns?${q}` : "/dashboard/campaigns", { scroll: false });
  }

  function openPanel(id: string) {
    const next = String(id);
    setPanelId(next);
    syncUrl(next);
  }

  function closePanel() {
    setPanelId(null);
    syncUrl(null);
  }

  function resetFields(defaults?: { advertiserId?: string }) {
    setEditId(null);
    setName("");
    setStartDate("");
    setEndDate("");
    setStatus("draft");
    setPriority("1");
    setImpressionGoal("");
    setAdvertiserId(
      lockedBrandId || defaults?.advertiserId || advertisers[0]?.id || ""
    );
  }

  function openCreate() {
    resetFields({
      advertiserId: lockedBrandId || filterAdvertiser || advertisers[0]?.id || "",
    });
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(row: Campaign) {
    setEditId(row.id);
    setName(row.name);
    setAdvertiserId(row.advertiser_id);
    setStartDate(row.start_date);
    setEndDate(row.end_date);
    setStatus(row.status as (typeof STATUSES)[number]);
    setPriority(String(row.priority));
    setImpressionGoal(row.impression_goal != null ? String(row.impression_goal) : "");
    setFormError(null);
    setFormOpen(true);
  }

  const closeForm = useCallback(() => {
    setFormOpen(false);
    setEditId(null);
    setName("");
    setStartDate("");
    setEndDate("");
    setStatus("draft");
    setPriority("1");
    setImpressionGoal("");
    setAdvertiserId("");
    setFormError(null);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    const body = {
      name,
      advertiser_id: Number(lockedBrandId || advertiserId),
      start_date: startDate,
      end_date: endDate,
      status,
      priority: Number(priority),
      impression_goal: impressionGoal ? Number(impressionGoal) : null,
    };
    try {
      if (editId) {
        await api(`/api/campaigns/${editId}`, { method: "PATCH", json: body });
      } else {
        await api("/api/campaigns", { method: "POST", json: body });
      }
      closeForm();
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Hapus campaign?")) return;
    try {
      await api(`/api/campaigns/${id}`, { method: "DELETE" });
      if (panelId != null && String(panelId) === String(id)) closePanel();
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
        eyebrow="Flight"
        title="Campaigns"
        subtitle={
          shellOpen
            ? "Pilih campaign di kiri untuk mengganti detail & creative di panel kanan."
            : "Klik nama campaign atau tombol Creatives untuk membuka detail di panel kanan."
        }
        action={
          canWrite && (
            <button
              type="button"
              className="btn-primary"
              onClick={openCreate}
              disabled={brandLocked && !lockedBrandId}
              title={
                brandLocked && !lockedBrandId
                  ? "Akun belum terhubung ke Brand. Hubungi Superadmin."
                  : undefined
              }
            >
              Tambah Campaign
            </button>
          )
        }
      />
      <ErrorBanner message={error} />
      {brandLocked && !lockedBrandId && (
        <ErrorBanner message="Akun Anda belum terhubung ke Brand. Minta Superadmin menetapkan Brand pada akun ini." />
      )}

      <div className={`split-shell mt-2 ${shellOpen ? "is-open" : ""}`}>
        <Card className="split-master overflow-hidden">
          {shellOpen ? (
            <div key="master-names" className="split-master-view">
              <div className="split-name-head">
                <p>Campaign</p>
                <button type="button" className="btn-ghost !py-1.5 !px-2.5 text-xs" onClick={closePanel}>
                  Tutup
                </button>
              </div>
              <div className="px-3 pb-2">
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Cari..."
                  className="field !mt-0 !py-1.5 text-sm"
                  aria-label="Cari campaign"
                />
              </div>
              <div className="split-name-list max-h-[min(70vh,36rem)] overflow-y-auto">
                {filtered.length === 0 && (
                  <p className="px-3 py-4 text-sm text-[var(--muted)]">Tidak ada campaign.</p>
                )}
                {filtered.map((r) => {
                  const active = String(panelId) === String(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      className={`split-name-item ${active ? "is-active" : ""}`}
                      onClick={() => openPanel(r.id)}
                    >
                      <span className="block truncate">{r.name}</span>
                      <span className="mt-0.5 block truncate text-[0.7rem] font-normal text-[var(--muted)]">
                        {!brandLocked && (
                          <>
                            {r.advertiser?.name ?? r.advertiser_id}
                            <span className="mx-1">·</span>
                          </>
                        )}
                        {r.status}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div key="master-table" className="split-master-view">
              <ListFilters
                query={query}
                onQueryChange={setQuery}
                placeholder="Cari nama campaign..."
                resultCount={filtered.length}
                totalCount={rows.length}
                selects={[
                  ...(!brandLocked
                    ? [
                        {
                          id: "advertiser",
                          label: "Brand",
                          value: filterAdvertiser,
                          onChange: setFilterAdvertiser,
                          variant: "select" as const,
                          options: [
                            { value: "", label: "Semua brand" },
                            ...advertisers.map((a) => ({ value: a.id, label: a.name })),
                          ],
                        },
                      ]
                    : []),
                  {
                    id: "status",
                    label: "Status",
                    value: filterStatus,
                    onChange: setFilterStatus,
                    options: [
                      { value: "", label: "Semua" },
                      ...STATUSES.map((s) => ({ value: s, label: s })),
                    ],
                  },
                ]}
              />
              {canWrite && (
                <BulkBar
                  count={sel.count}
                  total={allIds.length}
                  noun="campaign"
                  onClear={sel.clear}
                  busy={busy}
                >
                  <button
                    type="button"
                    className="bulk-btn"
                    onClick={() =>
                      bulk((id) =>
                        api(`/api/campaigns/${id}`, { method: "PATCH", json: { status: "active" } })
                      )
                    }
                  >
                    Aktifkan
                  </button>
                  <button
                    type="button"
                    className="bulk-btn"
                    onClick={() =>
                      bulk((id) =>
                        api(`/api/campaigns/${id}`, { method: "PATCH", json: { status: "paused" } })
                      )
                    }
                  >
                    Pause
                  </button>
                  <button
                    type="button"
                    className="bulk-btn bulk-btn-danger"
                    onClick={() =>
                      bulk(
                        (id) => api(`/api/campaigns/${id}`, { method: "DELETE" }),
                        `Hapus ${sel.count} campaign terpilih?`
                      )
                    }
                  >
                    Hapus
                  </button>
                </BulkBar>
              )}
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      {canWrite && (
                        <th className="th-check">
                          <CheckAll
                            checked={sel.allVisibleSelected}
                            indeterminate={sel.someVisibleSelected && !sel.allVisibleSelected}
                            onChange={sel.toggleAllVisible}
                            disabled={filtered.length === 0}
                          />
                        </th>
                      )}
                      <th>Nama</th>
                      {!brandLocked && <th>Brand</th>}
                      <th>Periode</th>
                      <th>Creative</th>
                      <th>Priority</th>
                      <th>Delivered / goal</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 && (
                      <EmptyRow
                        cols={(brandLocked ? 8 : 9) - (canWrite ? 0 : 1)}
                        text={
                          brandLocked && !lockedBrandId
                            ? "Akun belum terhubung ke Brand. Hubungi Superadmin."
                            : rows.length === 0
                              ? canWrite
                                ? "Belum ada campaign. Klik Tambahkan untuk membuat."
                                : "Belum ada campaign."
                              : emptyFilterText(rows.length, "campaign")
                        }
                      />
                    )}
                    {filtered.map((r) => (
                      <tr
                        key={r.id}
                        className={`row-click ${canWrite && sel.selected.has(r.id) ? "is-selected" : ""}`}
                        onClick={() => openPanel(r.id)}
                      >
                        {canWrite && (
                          <td className="th-check" onClick={(e) => e.stopPropagation()}>
                            <RowCheck
                              checked={sel.selected.has(r.id)}
                              onChange={() => sel.toggle(r.id)}
                              label={`Pilih ${r.name}`}
                            />
                          </td>
                        )}
                        <td className="font-medium">{r.name}</td>
                        {!brandLocked && <td>{r.advertiser?.name ?? r.advertiser_id}</td>}
                        <td className="text-[var(--muted)]">
                          {r.start_date} s.d. {r.end_date}
                        </td>
                        <td>{r.creative_count ?? 0}</td>
                        <td>{r.priority}</td>
                        <td>
                          {r.delivered ?? 0}
                          {r.impression_goal != null ? ` / ${r.impression_goal}` : " / -"}
                        </td>
                        <td>
                          <StatusBadge value={r.status} />
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="act-btn"
                              onClick={() => openPanel(r.id)}
                            >
                              Creatives
                            </button>
                            {canWrite && (
                              <>
                                <button type="button" className="act-btn" onClick={() => openEdit(r)}>
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="act-btn act-btn-danger"
                                  onClick={() => remove(r.id)}
                                >
                                  Hapus
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>

        {shellOpen && (
          <div className="card split-detail is-enter">
            {detailCampaign ? (
              <CampaignCreativesPanel
                key={detailCampaign.id}
                campaign={detailCampaign}
                autoUpload={uploadRequested}
                autoEditCreativeId={fixCreativeId}
                onClose={closePanel}
                onChanged={load}
              />
            ) : (
              <div className="flex h-full min-h-[16rem] flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="text-sm text-[var(--muted)]">
                  {rows.length === 0
                    ? "Memuat detail campaign..."
                    : "Campaign tidak ditemukan di daftar. Mungkin sudah dihapus atau difilter."}
                </p>
                <button type="button" className="btn-ghost" onClick={closePanel}>
                  Tutup panel
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <Modal
        open={formOpen}
        title={editId ? "Edit campaign" : "Buat campaign"}
        onClose={closeForm}
        wide
      >
        <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <ErrorBanner message={formError} />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium">Nama</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </div>
          {!brandLocked && (
            <div>
              <label className="block text-sm font-medium">Brand</label>
              <select
                required
                value={advertiserId}
                onChange={(e) => setAdvertiserId(e.target.value)}
                className={inputClass}
              >
                {advertisers.length === 0 && <option value="">Belum ada brand</option>}
                {advertisers.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as (typeof STATUSES)[number])}
              className={inputClass}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">Mulai</label>
            <input
              required
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Selesai</label>
            <input
              required
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Priority (1-100)</label>
            <input
              type="number"
              min={1}
              max={100}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className={inputClass}
            />
            <FieldHint>
              Bobot pemilihan. Campaign weight = max(1, priority) × pacingFactor.
            </FieldHint>
          </div>
          <div>
            <label className="block text-sm font-medium">Impression goal</label>
            <input
              type="number"
              min={1}
              placeholder="Opsional"
              value={impressionGoal}
              onChange={(e) => setImpressionGoal(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1 md:col-span-2">
            <button type="button" className="btn-ghost" onClick={closeForm} disabled={saving}>
              Batal
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={
                saving ||
                (!brandLocked && !advertisers.length) ||
                (brandLocked && !lockedBrandId)
              }
            >
              {saving ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </form>
      </Modal>
    </PermissionGate>
  );
}
