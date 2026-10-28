"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { ErrorBanner, FieldHint, StatusBadge } from "@/components/ui";
import { api, apiFormData, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  Metrics,
  campaignReportHref,
  fmtDateId,
  num,
  paceClass,
  pct,
  rangeFromPreset,
} from "@/lib/metrics";
import { isSuperadmin } from "@/lib/roles";
import { IFRAME_SANDBOX } from "@/lib/sandbox";

export type CampaignSummary = {
  id: string;
  name: string;
  status: string;
  start_date?: string;
  end_date?: string;
  priority?: number;
  impression_goal?: number | null;
  delivered?: number;
  creative_count?: number;
  advertiser?: { id: string; name: string };
};

type Creative = {
  id: string;
  name: string;
  campaign_id: string;
  width: number;
  height: number;
  cpm_usd?: number | null;
  status: string;
  click_url: string;
  preview_url: string;
  delivered?: number;
  metrics?: Metrics;
};

type CampaignMiniReport = {
  from: string;
  to: string;
  delivered: number;
  goal_pct: number | null;
  pace_status: string;
  metrics: Metrics;
  campaign: {
    impression_goal: number | null;
    start_date: string;
    end_date: string;
    priority?: number;
  };
};

const inputClass = "field";

type Props = {
  campaign: CampaignSummary;
  autoUpload?: boolean;
  autoEditCreativeId?: string | null;
  onClose: () => void;
  onChanged?: () => void;
};

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3.5 py-3">
      <p className="text-[0.7rem] text-[var(--muted)]">{label}</p>
      <p className="mt-1.5 text-lg font-semibold tabular-nums tracking-[-0.02em]">{value}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
      <p className="text-[0.65rem] text-[var(--muted)]">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums tracking-[-0.02em]">{value}</p>
    </div>
  );
}

/** Skala creative agar muat di viewport, rasio tetap. */
function fitCreativeSize(width: number, height: number) {
  if (typeof window === "undefined") {
    return { width, height, scale: 1 };
  }
  const maxW = Math.max(120, window.innerWidth - 96);
  const maxH = Math.max(120, window.innerHeight - 200);
  const scale = Math.min(1, maxW / Math.max(width, 1), maxH / Math.max(height, 1));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
}

function CreativePreviewModal({
  open,
  creative,
  missing,
  onClose,
}: {
  open: boolean;
  creative: Creative;
  missing: boolean;
  onClose: () => void;
}) {
  const [box, setBox] = useState(() => fitCreativeSize(creative.width, creative.height));

  useEffect(() => {
    if (!open) return;
    const update = () => setBox(fitCreativeSize(creative.width, creative.height));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open, creative.width, creative.height]);

  return (
    <Modal
      open={open}
      title={`${creative.name} · ${creative.width}×${creative.height}`}
      onClose={onClose}
      fitWidth={box.width}
    >
      {missing ? (
        <p className="py-6 text-center text-sm text-[var(--muted)]">
          File ZIP tidak ada di storage. Edit lalu unggah ulang.
        </p>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <div
            className="overflow-hidden rounded-lg border border-[var(--line)] bg-[#f3eee5]"
            style={{ width: box.width, height: box.height }}
          >
            <iframe
              title={creative.name}
              src={creative.preview_url}
              width={creative.width}
              height={creative.height}
              sandbox={IFRAME_SANDBOX}
              className="origin-top-left border-0 bg-[var(--field)]"
              style={
                box.scale < 1
                  ? {
                      width: creative.width,
                      height: creative.height,
                      transform: `scale(${box.scale})`,
                      transformOrigin: "top left",
                    }
                  : undefined
              }
            />
          </div>
          {box.scale < 1 && (
            <p className="text-[0.7rem] text-[var(--muted)]">
              Ditampilkan {Math.round(box.scale * 100)}% agar muat di layar (asli{" "}
              {creative.width}×{creative.height}).
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

export function CampaignCreativesPanel({
  campaign,
  autoUpload = false,
  autoEditCreativeId = null,
  onClose,
  onChanged,
}: Props) {
  const { hasPermission, user } = useAuth();
  const showBrand = isSuperadmin(user?.role?.name);
  const canReport = hasPermission("report:read");
  const campaignId = campaign.id;
  const [rows, setRows] = useState<Creative[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewMissing, setPreviewMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [miniReport, setMiniReport] = useState<CampaignMiniReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const [formOpen, setFormOpen] = useState(autoUpload);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [width, setWidth] = useState("300");
  const [height, setHeight] = useState("250");
  const [clickUrl, setClickUrl] = useState("");
  const [cpmUsd, setCpmUsd] = useState("");
  const [originalCpmUsd, setOriginalCpmUsd] = useState("");
  const [cpmChangeReason, setCpmChangeReason] = useState("");
  const [status, setStatus] = useState("draft");
  const [file, setFile] = useState<File | null>(null);

  const reportRange = rangeFromPreset(7);

  const load = useCallback(async () => {
    const cr = await api<{ data: Creative[] }>(`/api/creatives?campaign_id=${campaignId}`);
    setRows(cr.data);
    setSelectedId((prev) => {
      if (prev && cr.data.some((r) => r.id === prev)) return prev;
      return cr.data[0]?.id ?? null;
    });
    const creativeToFix = autoEditCreativeId
      ? cr.data.find((row) => row.id === autoEditCreativeId)
      : undefined;
    if (creativeToFix) openEdit(creativeToFix);
  }, [campaignId, autoEditCreativeId]);

  const loadMiniReport = useCallback(async () => {
    if (!canReport) {
      setMiniReport(null);
      return;
    }
    setReportLoading(true);
    try {
      const res = await api<{ data: CampaignMiniReport }>(
        `/api/reports/campaigns/${campaignId}/summary?from=${reportRange.from}&to=${reportRange.to}`
      );
      setMiniReport(res.data);
    } catch {
      setMiniReport(null);
    } finally {
      setReportLoading(false);
    }
  }, [canReport, campaignId, reportRange.from, reportRange.to]);

  useEffect(() => {
    setLoading(true);
    setSelectedId(null);
    setPreviewOpen(false);
    setError(null);
    setMiniReport(null);
    Promise.all([load(), loadMiniReport()])
      .catch((e) => setError(e instanceof ApiError ? e.message : "Gagal memuat creative"))
      .finally(() => setLoading(false));
  }, [load, loadMiniReport]);

  function openCreate() {
    setEditId(null);
    setName("");
    setWidth("300");
    setHeight("250");
    setClickUrl("");
    setCpmUsd("");
    setOriginalCpmUsd("");
    setCpmChangeReason("");
    setStatus("draft");
    setFile(null);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(row: Creative) {
    setEditId(row.id);
    setName(row.name);
    setWidth(String(row.width));
    setHeight(String(row.height));
    setClickUrl(row.click_url || "");
    setCpmUsd(row.cpm_usd == null ? "" : String(row.cpm_usd));
    setOriginalCpmUsd(row.cpm_usd == null ? "" : String(row.cpm_usd));
    setCpmChangeReason("");
    setStatus(row.status || "draft");
    setFile(null);
    setFormError(null);
    setFormOpen(true);
  }

  const closeForm = useCallback(() => {
    setFormOpen(false);
    setEditId(null);
    setName("");
    setWidth("300");
    setHeight("250");
    setClickUrl("");
    setCpmUsd("");
    setOriginalCpmUsd("");
    setCpmChangeReason("");
    setStatus("draft");
    setFile(null);
    setFormError(null);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const normalizedRate = cpmUsd.trim() === "" ? null : Number(cpmUsd);
    const originalRate = originalCpmUsd.trim() === "" ? null : Number(originalCpmUsd);
    const cpmChanged = showBrand && normalizedRate !== originalRate;
    if (cpmChanged && cpmChangeReason.trim().length < 5) {
      setFormError("Tuliskan ketentuan atau alasan perubahan CPM (minimal 5 karakter).");
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        if (file) {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("name", name);
          fd.append("width", width);
          fd.append("height", height);
          fd.append("click_url", clickUrl);
          if (cpmChanged) {
            fd.append("cpm_usd", cpmUsd);
            fd.append("cpm_change_reason", cpmChangeReason.trim());
          }
          fd.append("status", status);
          await apiFormData(`/api/creatives/${editId}`, fd, "PATCH");
        } else {
          await api(`/api/creatives/${editId}`, {
            method: "PATCH",
            json: {
              name,
              width: Number(width),
              height: Number(height),
              click_url: clickUrl || null,
              ...(cpmChanged
                ? { cpm_usd: normalizedRate, cpm_change_reason: cpmChangeReason.trim() }
                : {}),
              status,
            },
          });
        }
      } else {
        if (!file) {
          setFormError("Pilih file ZIP creative");
          setSaving(false);
          return;
        }
        const fd = new FormData();
        fd.append("file", file);
        fd.append("name", name);
        fd.append("campaign_id", campaignId);
        fd.append("width", width);
        fd.append("height", height);
        fd.append("click_url", clickUrl);
        if (showBrand && normalizedRate != null) {
          fd.append("cpm_usd", cpmUsd);
          fd.append("cpm_change_reason", cpmChangeReason.trim());
        }
        fd.append("status", status);
        await apiFormData("/api/creatives", fd);
      }
      closeForm();
      await Promise.all([load(), loadMiniReport()]);
      onChanged?.();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : editId ? "Gagal menyimpan" : "Upload gagal");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const row = rows.find((r) => r.id === id);
    const label = row?.name ? `"${row.name}"` : "creative ini";
    if (
      !confirm(
        `Hapus ${label}?\n\nCreative akan dihapus dari campaign. Tindakan ini tidak bisa dibatalkan.`
      )
    ) {
      return;
    }
    try {
      await api(`/api/creatives/${id}`, { method: "DELETE" });
      if (selectedId === id) setSelectedId(null);
      setPreviewOpen(false);
      await Promise.all([load(), loadMiniReport()]);
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menghapus");
    }
  }

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) || null,
    [rows, selectedId]
  );
  const m = selected?.metrics;
  const cm = miniReport?.metrics;
  const delivered = miniReport?.delivered ?? campaign.delivered ?? 0;
  const goal = miniReport?.campaign.impression_goal ?? campaign.impression_goal ?? null;
  const goalPct = miniReport?.goal_pct;

  useEffect(() => {
    if (!previewOpen || !selected?.preview_url) {
      setPreviewMissing(false);
      return;
    }
    let cancelled = false;
    setPreviewMissing(false);
    fetch(selected.preview_url, { method: "GET", credentials: "omit" })
      .then((r) => {
        if (!cancelled) setPreviewMissing(!r.ok);
      })
      .catch(() => {
        if (!cancelled) setPreviewMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [previewOpen, selected]);

  const startDate = miniReport?.campaign.start_date || campaign.start_date;
  const endDate = miniReport?.campaign.end_date || campaign.end_date;
  const priority = miniReport?.campaign.priority ?? campaign.priority;
  const cpmRateChanged =
    (cpmUsd.trim() === "" ? null : Number(cpmUsd)) !==
    (originalCpmUsd.trim() === "" ? null : Number(originalCpmUsd));

  return (
    <div className="creative-panel flex h-full min-h-[32rem] flex-col">
      <div className="border-b border-[var(--line)] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
              Detail campaign
            </p>
            <h2 className="mt-1 truncate text-lg font-semibold tracking-[-0.02em]">
              {campaign.name}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-[var(--muted)]">
              {showBrand && <span>{campaign.advertiser?.name ?? "Brand"}</span>}
              <StatusBadge value={campaign.status} />
              {miniReport?.pace_status && (
                <span className={paceClass(miniReport.pace_status)}>{miniReport.pace_status}</span>
              )}
              {priority != null && <span>Priority {priority}</span>}
            </div>
            <p className="mt-1.5 text-xs text-[var(--muted)]">
              Flight{" "}
              {startDate && endDate
                ? `${fmtDateId(startDate)} s.d. ${fmtDateId(endDate)}`
                : "-"}
              {canReport && (
                <>
                  <span className="mx-1.5">·</span>
                  Mini report {fmtDateId(reportRange.from)} s.d. {fmtDateId(reportRange.to)}
                </>
              )}
            </p>
          </div>
          <div className="relative z-10 flex shrink-0 flex-wrap items-center gap-2">
            {canReport && (
              <Link
                href={campaignReportHref(campaignId, reportRange.from, reportRange.to)}
                className="btn-ghost !py-2 !px-3 text-xs"
              >
                Full Reports
              </Link>
            )}
            <button type="button" className="btn-primary !py-2 !px-3.5 text-xs" onClick={openCreate}>
              Tambah creative
            </button>
            <button
              type="button"
              className="btn-ghost !py-2 !px-3 text-xs"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }}
            >
              Tutup
            </button>
          </div>
        </div>

        {/* Info ringkas + progress goal */}
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <MiniMetric label="Creative" value={loading ? "..." : String(rows.length)} />
          <MiniMetric
            label="Delivery (lifetime)"
            value={goal != null ? `${num(delivered)} / ${num(goal)}` : num(delivered)}
          />
          <MiniMetric
            label="Pencapaian goal"
            value={goalPct != null ? pct(goalPct) : goal != null ? "0%" : "Tanpa goal"}
          />
          <MiniMetric
            label="Periode flight"
            value={
              startDate && endDate ? `${fmtDateId(startDate)} → ${fmtDateId(endDate)}` : "-"
            }
          />
        </div>

        {goal != null && (
          <div className="mt-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--field)]">
              <div
                className="h-full rounded-full bg-[#a78bfa] transition-[width] duration-300"
                style={{ width: `${Math.min(100, goalPct ?? 0)}%` }}
              />
            </div>
          </div>
        )}

        {/* Mini report metrik 7 hari */}
        {canReport && (
          <div className="mt-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                Mini report · 7 hari
              </p>
              {reportLoading && (
                <span className="text-[0.7rem] text-[var(--muted)]">Memuat metrik...</span>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
              <MiniMetric label="Impression" value={num(cm?.impression ?? 0)} />
              <MiniMetric label="Viewable" value={num(cm?.viewable_impression ?? 0)} />
              <MiniMetric label="Viewability" value={pct(cm?.viewability_rate_pct ?? 0)} />
              <MiniMetric label="Klik" value={num(cm?.click ?? 0)} />
              <MiniMetric label="CTR" value={pct(cm?.ctr_pct ?? 0)} />
              <MiniMetric label="Fill rate" value={pct(cm?.fill_rate_pct ?? 0)} />
              {showBrand && <MiniMetric label="Ad request" value={num(cm?.request ?? 0)} />}
              <MiniMetric label="No fill" value={num(cm?.no_fill ?? 0)} />
              <MiniMetric label="Interaksi" value={num(cm?.interaction_unique ?? 0)} />
              <MiniMetric
                label="Interaction rate"
                value={pct(cm?.interaction_rate_pct ?? 0)}
              />
            </div>
          </div>
        )}
      </div>

      <div className="px-5 pt-3">
        <ErrorBanner message={error} />
      </div>

      <div className="grid min-h-0 flex-1 gap-4 px-5 pb-5 lg:grid-cols-[minmax(14rem,0.38fr)_minmax(0,0.62fr)]">
        {/* Kiri: daftar creative */}
        <div className="flex min-h-0 flex-col border-r-0 lg:border-r lg:border-[var(--line)] lg:pr-4">
          <p className="mb-2 text-xs font-medium text-[var(--muted)]">Daftar creative</p>
          <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
            {loading && <p className="px-1 py-3 text-xs text-[var(--muted)]">Memuat...</p>}
            {!loading && rows.length === 0 && (
              <div className="rounded-xl border border-dashed border-[var(--line)] px-3 py-6 text-center">
                <p className="text-xs text-[var(--muted)]">Belum ada creative.</p>
                <button
                  type="button"
                  className="btn-primary mt-3 !py-1.5 !px-3 text-xs"
                  onClick={openCreate}
                >
                  Upload ZIP
                </button>
              </div>
            )}
            {rows.map((r, i) => {
              const active = selectedId === r.id;
              return (
                <div
                  key={r.id}
                  role="button"
                  tabIndex={0}
                  className={`creative-tile ${active ? "is-active" : ""}`}
                  style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}
                  onClick={() => {
                    setSelectedId(r.id);
                    setPreviewOpen(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedId(r.id);
                      setPreviewOpen(false);
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.name}</p>
                      <p className="mt-0.5 font-mono text-[0.7rem] text-[var(--muted)]">
                        {r.width}×{r.height}
                      </p>
                    </div>
                    <StatusBadge value={r.status} />
                  </div>
                  <div className="row-actions mt-2">
                    <button
                      type="button"
                      className="act-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(r.id);
                        setPreviewOpen(true);
                      }}
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      className="act-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(r);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="act-btn act-btn-danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(r.id);
                      }}
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Kanan: report creative terpilih */}
        <div className="flex min-h-0 flex-col">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-[var(--line)] px-4 py-10 text-center">
              <p className="text-sm text-[var(--muted)]">
                Pilih creative di kiri untuk melihat report-nya.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                    Report creative
                  </p>
                  <h3 className="mt-1 truncate text-base font-semibold">{selected.name}</h3>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                    <span className="font-mono">
                      {selected.width}×{selected.height}
                    </span>
                    <StatusBadge value={selected.status} />
                    <span>
                      {reportRange.from} s.d. {reportRange.to}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-ghost !py-1.5 !px-3 text-xs"
                  onClick={() => setPreviewOpen(true)}
                >
                  Preview
                </button>
              </div>

              <p className="mt-4 text-xs text-[var(--muted)]">
                Delivery = impression lifetime. Metrik lain = 7 hari terakhir (agregat ~5 menit).
              </p>

              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                <MetricCard label="Delivery (lifetime)" value={num(selected.delivered ?? 0)} />
                <MetricCard label="Impression" value={num(m?.impression ?? 0)} />
                <MetricCard label="Viewable" value={num(m?.viewable_impression ?? 0)} />
                <MetricCard label="Viewability" value={pct(m?.viewability_rate_pct ?? 0)} />
                <MetricCard label="Klik" value={num(m?.click ?? 0)} />
                <MetricCard label="CTR" value={pct(m?.ctr_pct ?? 0)} />
                <MetricCard label="Interaksi" value={num(m?.interaction_unique ?? 0)} />
                <MetricCard label="Interaction rate" value={pct(m?.interaction_rate_pct ?? 0)} />
                {showBrand && <MetricCard label="Ad request" value={num(m?.request ?? 0)} />}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[var(--line)] pt-4">
                <button type="button" className="btn-ghost w-full" onClick={() => openEdit(selected)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="btn-danger-outline w-full border border-rose-400/70 bg-rose-500/25 text-rose-100 hover:bg-rose-500/40 hover:text-white"
                  onClick={() => remove(selected.id)}
                >
                  Hapus
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {selected && (
        <CreativePreviewModal
          open={previewOpen}
          creative={selected}
          missing={previewMissing}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      <Modal
        open={formOpen}
        title={editId ? "Edit creative" : "Upload ZIP HTML5"}
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
          <div className="md:col-span-2">
            <label className="block text-sm font-medium">Campaign</label>
            <input readOnly value={campaign.name} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
              <option value="draft">draft</option>
              <option value="active">active</option>
              <option value="paused">paused</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">Lebar</label>
            <input
              type="number"
              required
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Tinggi</label>
            <input
              type="number"
              required
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium">Click URL (opsional)</label>
            <input
              type="url"
              value={clickUrl}
              onChange={(e) => setClickUrl(e.target.value)}
              className={inputClass}
            />
          </div>
          {showBrand && (
            <div className="md:col-span-2">
              <label className="block text-sm font-medium">
                CPM (USD per 1.000 impressions)
              </label>
              <input
                type="number"
                min="0"
                max="999999.9999"
                step="0.0001"
                value={cpmUsd}
                onChange={(e) => setCpmUsd(e.target.value)}
                className={inputClass}
                placeholder="Kosong = belum ditagihkan"
              />
              <FieldHint>
                Tarif ini hanya dapat diubah Superadmin. Creative tanpa tarif tidak
                dihitung dalam estimasi Billing.
              </FieldHint>
              {(!editId || cpmRateChanged) && (
                <>
                  <label className="mt-3 block text-sm font-medium">
                    Ketentuan / alasan perubahan harga
                  </label>
                  <input
                    type="text"
                    maxLength={500}
                    minLength={5}
                    required={(!editId && cpmUsd.trim() !== "") || cpmRateChanged}
                    value={cpmChangeReason}
                    onChange={(e) => setCpmChangeReason(e.target.value)}
                    className={inputClass}
                    placeholder="Contoh: Tarif CPM sesuai kontrak periode berjalan"
                  />
                </>
              )}
            </div>
          )}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium">
              File ZIP {editId ? "(opsional, ganti file)" : ""}
            </label>
            <input
              required={!editId}
              type="file"
              accept=".zip,application/zip"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="field file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--surface)] file:px-3 file:py-1.5 file:text-xs file:font-semibold"
            />
            <FieldHint>
              {editId
                ? "Kosongkan untuk tetap memakai ZIP lama."
                : "Wajib berisi index.html."}
            </FieldHint>
          </div>
          <div className="flex justify-end gap-2 pt-1 md:col-span-2">
            <button type="button" className="btn-ghost" onClick={closeForm} disabled={saving}>
              Batal
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Menyimpan..." : editId ? "Simpan" : "Upload"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
