"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import PermissionGate from "@/components/PermissionGate";
import { Card, EmptyRow, ErrorBanner, PageHeader } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { campaignReportHref, Metrics, num, paceClass, pct, rangeFromPreset } from "@/lib/metrics";
import { isSuperadmin } from "@/lib/roles";

type ViewMode = "campaign" | "creative";

type CampaignRow = {
  id: string;
  name: string;
  status: string;
  impression_goal: number | null;
  delivered: number;
  goal_pct: number | null;
  pace_status: string;
  advertiser: { id: string; name: string } | null;
  metrics: Metrics;
};

type CreativeRow = {
  id: string;
  name: string;
  status: string;
  size: string;
  delivered: number;
  campaign: {
    id: string;
    name: string;
    advertiser: { id: string; name: string } | null;
  } | null;
  metrics: Metrics;
};

export default function ReportsPage() {
  return (
    <Suspense fallback={<p className="py-8 text-center text-sm text-[var(--muted)]">Loading...</p>}>
      <ReportsContent />
    </Suspense>
  );
}

function ReportsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasPermission, user } = useAuth();
  const initial = rangeFromPreset(7);
  const [from, setFrom] = useState(() => searchParams.get("from") || initial.from);
  const [to, setTo] = useState(() => searchParams.get("to") || initial.to);
  const [view, setView] = useState<ViewMode>("campaign");
  const [campaignRows, setCampaignRows] = useState<CampaignRow[]>([]);
  const [creativeRows, setCreativeRows] = useState<CreativeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const showBrand = isSuperadmin(user?.role?.name);

  useEffect(() => {
    let cancelled = false;
    async function fetchReport() {
      try {
        if (view === "campaign") {
          const res = await api<{ data: CampaignRow[] }>(`/api/reports/campaigns?from=${from}&to=${to}`);
          if (!cancelled) setCampaignRows(res.data);
        } else {
          const res = await api<{ data: CreativeRow[] }>(`/api/reports/creatives?from=${from}&to=${to}`);
          if (!cancelled) setCreativeRows(res.data);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Gagal memuat");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchReport();
    return () => {
      cancelled = true;
    };
  }, [from, to, view, refreshKey]);

  async function refreshNow() {
    setLoading(true);
    setError(null);
    try {
      await api("/api/reports/aggregate", { method: "POST", json: {} });
      setRefreshKey((key) => key + 1);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal agregasi");
      setLoading(false);
    }
  }

  function applyPreset(days: number) {
    const r = rangeFromPreset(days);
    setLoading(true);
    setError(null);
    setFrom(r.from);
    setTo(r.to);
  }

  return (
    <PermissionGate permission="report:read" redirect>
      <PageHeader
        eyebrow="Analitik"
        title="Reports"
        subtitle="Ringkasan per campaign atau creative. Buka baris campaign untuk angka harian dan breakdown."
        action={
          <div className="flex flex-wrap gap-2">
            {showBrand && (
              <>
                <Link href={`/dashboard/reports/publishers?from=${from}&to=${to}`} className="btn-ghost">
                  Publisher
                </Link>
                <Link href={`/dashboard/reports/no-fill?from=${from}&to=${to}`} className="btn-ghost">
                  No-fill
                </Link>
              </>
            )}
          </div>
        }
      />

      <p className="text-sm text-[var(--muted)]">
        Data diperbarui tiap 5 menit.
        {hasPermission("report:aggregate") && (
          <button type="button" className="btn-link ml-2" onClick={refreshNow}>
            Perbarui sekarang
          </button>
        )}
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="filter-pills" role="group" aria-label="Tampilan report">
          {(
            [
              { id: "campaign" as const, label: "Campaign" },
              { id: "creative" as const, label: "Creative" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`filter-pill${view === opt.id ? " is-on" : ""}`}
              onClick={() => {
                setLoading(true);
                setError(null);
                setView(opt.id);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {[7, 14, 30].map((d) => (
            <button key={d} type="button" className="btn-ghost" onClick={() => applyPreset(d)}>
              {d} hari
            </button>
          ))}
        </div>
        <label className="text-xs text-[var(--muted)]">
          Dari
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setLoading(true);
              setError(null);
              setFrom(e.target.value);
            }}
            className="field mt-1"
          />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Sampai
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setLoading(true);
              setError(null);
              setTo(e.target.value);
            }}
            className="field mt-1"
          />
        </label>
      </div>

      <ErrorBanner message={error} />
      {loading && <p className="mt-3 text-sm text-[var(--muted)]">Memuat...</p>}

      <Card className="mt-4 overflow-hidden">
        <div className="table-scroll">
          {view === "campaign" ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Impression</th>
                  <th>Viewable</th>
                  <th>Viewability</th>
                  <th>Klik</th>
                  <th>CTR</th>
                  <th>Interaksi</th>
                  <th>IR</th>
                  <th>Goal</th>
                  <th>Laju</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {campaignRows.length === 0 && <EmptyRow cols={11} text="Belum ada campaign." />}
                {campaignRows.map((r) => {
                  const href = campaignReportHref(r.id, from, to);
                  return (
                    <tr key={r.id} className="row-click" onClick={() => router.push(href)}>
                      <td>
                        <Link href={href} className="btn-link" onClick={(e) => e.stopPropagation()}>
                          {r.name}
                        </Link>
                        {showBrand && r.advertiser?.name && (
                          <p className="text-xs text-[var(--muted)]">{r.advertiser.name}</p>
                        )}
                      </td>
                      <td>{num(r.metrics.impression)}</td>
                      <td>{num(r.metrics.viewable_impression)}</td>
                      <td>{pct(r.metrics.viewability_rate_pct)}</td>
                      <td>{num(r.metrics.click)}</td>
                      <td>{pct(r.metrics.ctr_pct)}</td>
                      <td>{num(r.metrics.interaction_unique)}</td>
                      <td>{pct(r.metrics.interaction_rate_pct)}</td>
                      <td>
                        <div className="min-w-[7rem]">
                          <p className="text-xs">
                            {num(r.delivered)}
                            {r.impression_goal ? ` / ${num(r.impression_goal)}` : " / -"}
                          </p>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
                            <div
                              className="h-full rounded-full bg-[#a78bfa]"
                              style={{ width: `${r.goal_pct ?? 0}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={paceClass(r.pace_status)}>{r.pace_status}</span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <Link href={href} className="act-btn" onClick={(e) => e.stopPropagation()}>
                            Detail
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Creative</th>
                  <th>Campaign</th>
                  <th>Ukuran</th>
                  <th>Impression</th>
                  <th>Viewable</th>
                  <th>Viewability</th>
                  <th>Klik</th>
                  <th>CTR</th>
                  <th>Interaksi</th>
                  <th>IR</th>
                  <th>Delivery</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {creativeRows.length === 0 && <EmptyRow cols={12} text="Belum ada creative." />}
                {creativeRows.map((r) => {
                  const href = r.campaign
                    ? campaignReportHref(r.campaign.id, from, to)
                    : "#";
                  return (
                    <tr
                      key={r.id}
                      className={r.campaign ? "row-click" : undefined}
                      onClick={() => {
                        if (r.campaign) router.push(href);
                      }}
                    >
                      <td>
                        <span className="font-medium">{r.name}</span>
                        <p className="text-xs text-[var(--muted)]">{r.status}</p>
                      </td>
                      <td>
                        {r.campaign ? (
                          <>
                            <Link
                              href={href}
                              className="btn-link"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {r.campaign.name}
                            </Link>
                            {showBrand && r.campaign.advertiser?.name && (
                              <p className="text-xs text-[var(--muted)]">
                                {r.campaign.advertiser.name}
                              </p>
                            )}
                          </>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>{r.size}</td>
                      <td>{num(r.metrics.impression)}</td>
                      <td>{num(r.metrics.viewable_impression)}</td>
                      <td>{pct(r.metrics.viewability_rate_pct)}</td>
                      <td>{num(r.metrics.click)}</td>
                      <td>{pct(r.metrics.ctr_pct)}</td>
                      <td>{num(r.metrics.interaction_unique)}</td>
                      <td>{pct(r.metrics.interaction_rate_pct)}</td>
                      <td>{num(r.delivered)}</td>
                      <td>
                        {r.campaign && (
                          <div className="row-actions">
                            <Link
                              href={href}
                              className="act-btn"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Detail
                            </Link>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </PermissionGate>
  );
}
