"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { BulkBar, CheckAll, RowCheck } from "@/components/BulkBar";
import { ListFilters } from "@/components/ListFilters";
import { Modal } from "@/components/Modal";
import PermissionGate from "@/components/PermissionGate";
import { Card, EmptyRow, ErrorBanner, FieldHint, PageHeader, StatusBadge } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { emptyFilterText, matchesQuery } from "@/lib/listFilter";
import { Metrics, num, pct, publisherReportHref } from "@/lib/metrics";
import { isSuperadmin } from "@/lib/roles";
import { runBulkAction, useRowSelection } from "@/lib/rowSelection";

type BrandOpt = { id: string; name: string; status?: string };

type DetectedSize = { size: string; requests: number };

type Pub = {
  id: string;
  host: string;
  status: "active" | "pending" | "blocked";
  first_seen_at: string;
  last_seen_at: string;
  created_at?: string;
  updated_at?: string;
  metrics?: {
    request: number;
    impression: number;
    click: number;
  };
  detected_sizes?: DetectedSize[];
};

type DetailData = {
  publisher: {
    id: string;
    host: string;
    status: string;
    first_seen_at?: string;
    last_seen_at?: string;
    created_at?: string;
    updated_at?: string;
  };
  metrics?: Metrics;
  sizes?: { size: string; metrics: Metrics }[];
  campaigns?: { campaign_id: string; name: string }[];
  creatives?: { creative_id: string; name: string }[];
};

type PlacementSize = {
  size: string;
  width: number;
  height: number;
  eligible_count: number;
  active: boolean;
};

const STATUSES = ["active", "blocked"] as const;
const inputClass = "field";

function fmt(d?: string) {
  if (!d) return "-";
  return new Date(d).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function hostHref(host: string) {
  if (/^(localhost|127\.0\.0\.1|\[::1\])/i.test(host)) return `http://${host}/`;
  return `https://${host}/`;
}

export default function PublishersPage() {
  const { user, hasPermission } = useAuth();
  const amSuperadmin = isSuperadmin(user?.role?.name);
  const canReport = hasPermission("report:read");
  const [rows, setRows] = useState<Pub[]>([]);
  const [brands, setBrands] = useState<BrandOpt[]>([]);
  const [advertiserId, setAdvertiserId] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [host, setHost] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("active");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<Pub | null>(null);
  const [detailData, setDetailData] = useState<DetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [placementSizes, setPlacementSizes] = useState<PlacementSize[]>([]);
  const [listTab, setListTab] = useState<"active" | "blocked">("active");
  const [sizesOpen, setSizesOpen] = useState(false);

  const brandQs = useCallback(() => {
    if (!advertiserId) return "";
    return `?advertiser_id=${encodeURIComponent(advertiserId)}`;
  }, [advertiserId]);

  const brandBody = useCallback(() => {
    return advertiserId ? { advertiser_id: Number(advertiserId) } : {};
  }, [advertiserId]);

  const load = useCallback(async () => {
    if (amSuperadmin && !advertiserId) {
      setRows([]);
      setPlacementSizes([]);
      return;
    }
    const res = await api<{
      data: Pub[];
      meta?: {
        placement_sizes?: PlacementSize[];
        brands?: BrandOpt[];
        advertiser_id?: string | null;
      };
    }>(`/api/publishers${brandQs()}`);
    setRows(res.data);
    setPlacementSizes(res.meta?.placement_sizes || []);
    if (res.meta?.brands?.length) setBrands(res.meta.brands);
  }, [amSuperadmin, advertiserId, brandQs]);

  useEffect(() => {
    if (!amSuperadmin) return;
    api<{ data: BrandOpt[] }>("/api/advertisers")
      .then((r) => {
        const list = r.data.filter((b) => b.status !== "inactive");
        setBrands(list.length ? list : r.data);
        if (!advertiserId && r.data[0]) setAdvertiserId(r.data[0].id);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amSuperadmin]);

  useEffect(() => {
    load().catch((e) => setError(e instanceof ApiError ? e.message : "Gagal memuat"));
  }, [load]);

  const blockedRows = useMemo(
    () => rows.filter((r) => r.status === "blocked"),
    [rows]
  );
  const activeRows = useMemo(
    () => rows.filter((r) => r.status === "active" || r.status === "pending"),
    [rows]
  );

  const tabRows = useMemo(() => {
    if (listTab === "blocked") return blockedRows;
    return activeRows;
  }, [listTab, blockedRows, activeRows]);

  const filtered = useMemo(
    () => tabRows.filter((r) => matchesQuery(query, r.host)),
    [tabRows, query]
  );

  const allIds = useMemo(() => tabRows.map((r) => r.id), [tabRows]);
  const visibleIds = useMemo(() => filtered.map((r) => r.id), [filtered]);
  const sel = useRowSelection(allIds, visibleIds);

  function switchTab(next: "active" | "blocked") {
    setListTab(next);
    setQuery("");
  }

  function sizeChips(list?: DetectedSize[], limit = 6) {
    if (!list?.length) {
      return <span className="text-[0.7rem] text-[var(--muted)]">Belum ada ukuran</span>;
    }
    return (
      <div className="flex flex-wrap gap-1.5">
        {list.slice(0, limit).map((s) => (
          <span
            key={s.size}
            className="rounded-md border border-[var(--line)] bg-[var(--field)] px-2 py-0.5 font-mono text-[0.68rem] text-[var(--ink)]"
            title={`${num(s.requests)} request`}
          >
            {s.size}
          </span>
        ))}
        {list.length > limit && (
          <span className="text-[0.68rem] text-[var(--muted)]">+{list.length - limit}</span>
        )}
      </div>
    );
  }

  function openEdit(row: Pub) {
    setEditId(row.id);
    setHost(row.host);
    setStatus(row.status === "blocked" ? "blocked" : "active");
    setFormError(null);
    setFormOpen(true);
  }

  const closeForm = useCallback(() => {
    setFormOpen(false);
    setEditId(null);
    setHost("");
    setStatus("active");
    setFormError(null);
  }, []);

  const closeDetail = useCallback(() => {
    setDetailOpen(false);
    setDetailRow(null);
    setDetailData(null);
    setDetailError(null);
    setDetailLoading(false);
  }, []);

  async function openDetail(row: Pub) {
    setDetailRow(row);
    setDetailData(null);
    setDetailError(null);
    setDetailOpen(true);
    if (!canReport) return;
    setDetailLoading(true);
    try {
      const res = await api<{ data: DetailData }>(`/api/reports/publishers/${row.id}`);
      setDetailData(res.data);
    } catch (e) {
      setDetailError(
        e instanceof ApiError
          ? e.message
          : "Gagal memuat rincian report (ukuran slot). Info dasar tetap ditampilkan."
      );
    } finally {
      setDetailLoading(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!editId) return;
    setFormError(null);
    setSaving(true);
    try {
      await api(`/api/publishers/${editId}${brandQs()}`, {
        method: "PATCH",
        json: { host, status, ...brandBody() },
      });
      closeForm();
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  async function setRowStatus(id: string, next: string) {
    setError(null);
    try {
      await api(`/api/publishers/${id}${brandQs()}`, {
        method: "PATCH",
        json: { status: next, ...brandBody() },
      });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal mengubah status");
    }
  }

  async function remove(row: Pub) {
    if (
      !confirm(
        advertiserId
          ? `Lepas publisher "${row.host}" dari brand ini?\n\nHost masih bisa muncul lagi jika tag brand ini di-request dari domain tersebut.`
          : `Hapus publisher "${row.host}"?\n\nAgregat laporan untuk host ini ikut dihapus. Host bisa muncul lagi otomatis jika masih ada request dari domain tersebut.`
      )
    ) {
      return;
    }
    setError(null);
    try {
      await api(`/api/publishers/${row.id}${brandQs()}`, { method: "DELETE" });
      if (editId === row.id) closeForm();
      if (detailRow?.id === row.id) closeDetail();
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menghapus");
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

  const pub = detailData?.publisher || detailRow;
  const sizes = detailData?.sizes || [];
  const metrics = detailData?.metrics;
  const activePlacements = placementSizes.filter((s) => s.active);
  const inactivePlacements = placementSizes.filter((s) => !s.active);

  const tabMeta = {
    active: {
      label: "Aktif",
      count: activeRows.length,
      hint: "Host yang terdeteksi dari tag brand — langsung aktif dan boleh menerima creative.",
      empty: "Belum ada publisher. Host muncul otomatis saat tag brand di-load.",
      search: "Cari host aktif...",
    },
    blocked: {
      label: "Diblokir",
      count: blockedRows.length,
      hint: "Host yang diblokir. Bisa diaktifkan kembali kapan saja.",
      empty: "Belum ada publisher yang diblokir.",
      search: "Cari host diblokir...",
    },
  } as const;
  const currentMeta = tabMeta[listTab];

  return (
    <PermissionGate permission="publisher:manage" superadminOnly redirect>
      <PageHeader
        eyebrow="Per brand"
        title="Publisher"
        subtitle="Publisher tercatat dari tag brand dan langsung aktif (tanpa antrean permintaan)."
      />
      <ErrorBanner message={error} />

      {amSuperadmin && (
        <Card className="mb-3 p-4">
          <label className="block text-sm font-medium text-[var(--ink)]">
            Brand
            <select
              className="field mt-1"
              value={advertiserId}
              onChange={(e) => {
                setAdvertiserId(e.target.value);
                sel.clear();
              }}
            >
              {!brands.length && <option value="">Belum ada brand</option>}
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Daftar di bawah hanya publisher yang pernah memuat tag brand ini.
          </p>
        </Card>
      )}

      <Card className="mt-2 overflow-hidden">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-[var(--surface)]"
          onClick={() => setSizesOpen((v) => !v)}
          aria-expanded={sizesOpen}
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold">Ukuran placement</p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              {activePlacements.length} aktif
              {inactivePlacements.length > 0
                ? ` · ${inactivePlacements.length} belum ada creative`
                : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/dashboard/tag"
              className="btn-ghost !py-1.5 !px-2.5 text-xs"
              onClick={(e) => e.stopPropagation()}
            >
              Lihat tag
            </Link>
            <span className="text-xs text-[var(--muted)]">{sizesOpen ? "Tutup" : "Buka"}</span>
          </div>
        </button>
        {sizesOpen && (
          <div className="border-t border-[var(--line)] px-5 py-4">
            {activePlacements.length === 0 ? (
              <p className="rounded-[0.85rem] border border-dashed border-[var(--line)] bg-[var(--surface)] px-3.5 py-3 text-sm text-[var(--muted)]">
                Belum ada ukuran aktif. Upload creative ZIP lalu set status active agar slot
                bisa terisi.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {activePlacements.map((s) => (
                  <div
                    key={s.size}
                    className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 py-2"
                    title={`${s.eligible_count} creative eligible`}
                  >
                    <div className="font-mono text-sm font-semibold tracking-tight text-[var(--ink)]">
                      {s.size}
                    </div>
                    <div className="mt-0.5 text-[0.7rem] font-medium text-emerald-300">
                      {s.eligible_count} creative · aktif
                    </div>
                  </div>
                ))}
              </div>
            )}
            {inactivePlacements.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium text-[var(--muted)]">
                  Ukuran umum belum ada creative (akan no_fill jika dipasang)
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {inactivePlacements.map((s) => (
                    <div
                      key={s.size}
                      className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2"
                    >
                      <div className="font-mono text-sm font-medium text-[var(--muted)]">
                        {s.size}
                      </div>
                      <div className="mt-0.5 text-[0.7rem] text-[var(--muted)]">0 creative</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card className="mt-4 overflow-hidden">
        <div className="sticky top-0 z-10 border-b border-[var(--line)] bg-[var(--card)] px-3 pt-3 sm:px-4">
          <div
            className="flex gap-1 overflow-x-auto pb-3"
            role="tablist"
            aria-label="Daftar publisher"
          >
            {(
              [
                ["active", tabMeta.active],
                ["blocked", tabMeta.blocked],
              ] as const
            ).map(([id, meta]) => {
              const on = listTab === id;
              const highlight =
                id === "blocked" && meta.count > 0 ? "text-rose-200" : "";
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  className={
                    on
                      ? `shrink-0 rounded-lg bg-white/[0.08] px-3.5 py-2 text-sm font-semibold text-[var(--ink)] ${highlight}`
                      : `shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium text-[var(--muted)] transition-colors hover:bg-white/[0.04] hover:text-[var(--ink)] ${highlight}`
                  }
                  onClick={() => switchTab(id)}
                >
                  {meta.label}
                  <span
                    className={
                      on
                        ? "ml-1.5 tabular-nums text-[var(--ink)]"
                        : "ml-1.5 tabular-nums text-[var(--muted)]"
                    }
                  >
                    {meta.count}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="pb-3 text-xs text-[var(--muted)] sm:text-sm">{currentMeta.hint}</p>
        </div>

        <ListFilters
          query={query}
          onQueryChange={setQuery}
          placeholder={currentMeta.search}
          resultCount={filtered.length}
          totalCount={tabRows.length}
        />

        {listTab === "active" && (
          <BulkBar count={sel.count} total={allIds.length} noun="publisher" onClear={sel.clear} busy={busy}>
            <button
              type="button"
              className="bulk-btn bulk-btn-danger"
              onClick={() =>
                bulk(
                  (id) =>
                    api(`/api/publishers/${id}${brandQs()}`, {
                      method: "PATCH",
                      json: { status: "blocked", ...brandBody() },
                    }),
                  `Blokir ${sel.count} publisher terpilih?`
                )
              }
            >
              Blokir
            </button>
            <button
              type="button"
              className="bulk-btn bulk-btn-danger"
              onClick={() =>
                bulk(
                  (id) => api(`/api/publishers/${id}${brandQs()}`, { method: "DELETE" }),
                  `Lepas ${sel.count} publisher dari brand ini?`
                )
              }
            >
              Hapus
            </button>
          </BulkBar>
        )}

        {listTab === "blocked" && sel.count > 0 && (
          <BulkBar count={sel.count} total={allIds.length} noun="ditolak" onClear={sel.clear} busy={busy}>
            <button
              type="button"
              className="bulk-btn"
              onClick={() =>
                bulk((id) =>
                  api(`/api/publishers/${id}${brandQs()}`, {
                    method: "PATCH",
                    json: { status: "active", ...brandBody() },
                  })
                )
              }
            >
              Aktifkan
            </button>
            <button
              type="button"
              className="bulk-btn bulk-btn-danger"
              onClick={() =>
                bulk(
                  (id) => api(`/api/publishers/${id}${brandQs()}`, { method: "DELETE" }),
                  `Lepas ${sel.count} host dari brand ini?`
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
                <th className="th-check">
                  <CheckAll
                    checked={sel.allVisibleSelected}
                    indeterminate={sel.someVisibleSelected && !sel.allVisibleSelected}
                    onChange={sel.toggleAllVisible}
                    disabled={filtered.length === 0}
                  />
                </th>
                <th>Host</th>
                <th>Placement</th>
                <th>Pertama</th>
                <th>Terakhir</th>
                <th>Request 7h</th>
                {listTab === "active" && <th>Impression 7h</th>}
                {listTab === "active" && <th>Klik 7h</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <EmptyRow
                  cols={listTab === "active" ? 9 : 7}
                  text={
                    tabRows.length === 0
                      ? currentMeta.empty
                      : emptyFilterText(tabRows.length, "publisher")
                  }
                />
              )}
              {filtered.map((r) => (
                <tr key={r.id} className={sel.selected.has(r.id) ? "is-selected" : ""}>
                  <td className="th-check">
                    <RowCheck
                      checked={sel.selected.has(r.id)}
                      onChange={() => sel.toggle(r.id)}
                      label={`Pilih ${r.host}`}
                    />
                  </td>
                  <td className="font-medium">
                    <button
                      type="button"
                      className="text-left font-medium text-[var(--ink)] hover:text-[#c4b5fd]"
                      onClick={() => openDetail(r)}
                    >
                      {r.host}
                    </button>
                    {listTab === "blocked" && (
                      <div className="mt-1">
                        <StatusBadge value="blocked" />
                      </div>
                    )}
                  </td>
                  <td>{sizeChips(r.detected_sizes, 4)}</td>
                  <td className="text-[var(--muted)]">{fmt(r.first_seen_at)}</td>
                  <td className="text-[var(--muted)]">{fmt(r.last_seen_at)}</td>
                  <td>{num(r.metrics?.request || 0)}</td>
                  {listTab === "active" && <td>{num(r.metrics?.impression || 0)}</td>}
                  {listTab === "active" && <td>{num(r.metrics?.click || 0)}</td>}
                  <td>
                    <div className="row-actions">
                      {listTab === "active" && (
                        <>
                          <button type="button" className="act-btn" onClick={() => openEdit(r)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="act-btn act-btn-danger"
                            onClick={() => setRowStatus(r.id, "blocked")}
                          >
                            Blokir
                          </button>
                        </>
                      )}
                      {listTab === "blocked" && (
                        <button
                          type="button"
                          className="act-btn"
                          onClick={() => setRowStatus(r.id, "active")}
                        >
                          Aktifkan
                        </button>
                      )}
                      <button type="button" className="act-btn" onClick={() => openDetail(r)}>
                        Detail
                      </button>
                      <button
                        type="button"
                        className="act-btn act-btn-danger"
                        onClick={() => remove(r)}
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

      <Modal open={formOpen} title="Edit publisher" onClose={closeForm}>
        <form onSubmit={onSubmit} className="space-y-4">
          <ErrorBanner message={formError} />
          <div>
            <label className="block text-sm font-medium">Host</label>
            <input
              required
              value={host}
              onChange={(e) => setHost(e.target.value)}
              className={inputClass}
              placeholder="contoh.com atau localhost:5500"
            />
            <FieldHint>
              Disimpan huruf kecil tanpa www. Loopback boleh pakai port (mis. 127.0.0.1:5500).
            </FieldHint>
          </div>
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
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-ghost" onClick={closeForm} disabled={saving}>
              Batal
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={detailOpen} title="Detail publisher" onClose={closeDetail} xl>
        {!pub ? (
          <p className="text-sm text-[var(--muted)]">Tidak ada data.</p>
        ) : (
          <div className="flex flex-col gap-5">
            <ErrorBanner message={detailError} />

            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <a
                  href={hostHref(pub.host)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-[1.15rem] font-semibold tracking-[-0.03em] text-[var(--ink)] hover:text-[#c4b5fd]"
                >
                  {pub.host}
                </a>
                <p className="mt-1 break-all text-[0.8rem] text-[var(--muted)]">{hostHref(pub.host)}</p>
              </div>
              <StatusBadge value={pub.status} />
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[var(--line)] pt-4 text-sm">
              <div>
                <div className="text-[0.72rem] text-[var(--muted)]">ID</div>
                <div className="mt-0.5 font-mono text-xs">{pub.id}</div>
              </div>
              <div>
                <div className="text-[0.72rem] text-[var(--muted)]">Dicatat</div>
                <div className="mt-0.5 tabular-nums">
                  {fmt("created_at" in pub ? pub.created_at : undefined)}
                </div>
              </div>
              <div>
                <div className="text-[0.72rem] text-[var(--muted)]">Pertama terhubung</div>
                <div className="mt-0.5 tabular-nums">{fmt(pub.first_seen_at)}</div>
              </div>
              <div>
                <div className="text-[0.72rem] text-[var(--muted)]">Terakhir terlihat</div>
                <div className="mt-0.5 tabular-nums">{fmt(pub.last_seen_at)}</div>
              </div>
            </div>

            {(detailRow?.metrics || metrics) && (
              <div className="grid grid-cols-3 gap-2" aria-label="Ringkasan 7 hari">
                {(
                  [
                    ["Request", metrics?.request ?? detailRow?.metrics?.request ?? 0],
                    ["Impression", metrics?.impression ?? detailRow?.metrics?.impression ?? 0],
                    ["Klik", metrics?.click ?? detailRow?.metrics?.click ?? 0],
                  ] as const
                ).map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-[0.75rem] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5"
                  >
                    <div className="text-[0.7rem] leading-none text-[var(--muted)]">{label}</div>
                    <div className="mt-1.5 text-[1.05rem] font-semibold leading-none tracking-[-0.02em] tabular-nums">
                      {num(value)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <section>
              <h4 className="text-[0.9rem] font-semibold tracking-[-0.02em]">
                Ukuran placement ({sizes.length})
              </h4>
              <p className="mt-1 text-[0.75rem] leading-relaxed text-[var(--muted)]">
                Semua ukuran yang pernah diminta host ini (7 hari). No-fill = belum ada creative
                aktif berukuran sama.
              </p>
              {detailLoading ? (
                <p className="mt-3 rounded-[0.85rem] border border-dashed border-[var(--line)] bg-[var(--surface)] px-3.5 py-3 text-[0.8rem] text-[var(--muted)]">
                  Memuat ukuran...
                </p>
              ) : !canReport ? (
                <p className="mt-3 rounded-[0.85rem] border border-dashed border-[var(--line)] bg-[var(--surface)] px-3.5 py-3 text-[0.8rem] text-[var(--muted)]">
                  Butuh izin report:read untuk melihat ukuran slot.
                </p>
              ) : sizes.length === 0 ? (
                <p className="mt-3 rounded-[0.85rem] border border-dashed border-[var(--line)] bg-[var(--surface)] px-3.5 py-3 text-[0.8rem] text-[var(--muted)]">
                  Belum ada request ukuran di rentang ini.
                </p>
              ) : (
                <div className="mt-3 overflow-hidden rounded-[0.9rem] border border-[var(--line)] bg-[var(--card)]">
                  {[...sizes]
                    .sort(
                      (a, b) =>
                        (b.metrics.request || 0) - (a.metrics.request || 0) ||
                        (b.metrics.impression || 0) - (a.metrics.impression || 0)
                    )
                    .map((s, i) => {
                      const filled = (s.metrics.impression || 0) > 0;
                      return (
                        <div
                          key={s.size}
                          className={`flex flex-col gap-1.5 px-3.5 py-2.5 ${
                            i > 0 ? "border-t border-[var(--line)]" : ""
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="font-mono text-[0.85rem] font-semibold">{s.size}</div>
                            <span
                              className={`rounded-md px-2 py-0.5 text-[0.68rem] font-semibold ${
                                filled
                                  ? "bg-emerald-500/15 text-emerald-300"
                                  : "bg-[var(--surface-2)] text-[var(--muted)]"
                              }`}
                            >
                              {filled ? "Ada tayangan" : "No fill"}
                            </span>
                          </div>
                          <div className="text-[0.75rem] leading-relaxed text-[var(--muted)] tabular-nums">
                            <span className="font-medium text-[var(--ink)]">{num(s.metrics.request)}</span>
                            {" request · "}
                            <span className="font-medium text-[var(--ink)]">
                              {num(s.metrics.impression)}
                            </span>
                            {" impression · fill "}
                            <span className="font-medium text-[var(--ink)]">
                              {pct(s.metrics.fill_rate_pct)}
                            </span>
                            {s.metrics.no_fill > 0 ? (
                              <>
                                {" · no-fill "}
                                <span className="font-medium text-[var(--ink)]">
                                  {num(s.metrics.no_fill)}
                                </span>
                              </>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </section>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--line)] pt-4">
              <button type="button" className="btn-ghost" onClick={closeDetail}>
                Tutup
              </button>
              {canReport && (
                <Link href={publisherReportHref(pub.id)} className="btn-ghost" onClick={closeDetail}>
                  Full Reports →
                </Link>
              )}
            </div>
          </div>
        )}
      </Modal>
    </PermissionGate>
  );
}
