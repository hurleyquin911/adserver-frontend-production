"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import PermissionGate from "@/components/PermissionGate";
import { Card, EmptyRow, ErrorBanner, PageHeader } from "@/components/ui";
import { api, ApiError, downloadCsv } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  Metrics,
  eachDate,
  fmtDateId,
  num,
  paceClass,
  pct,
  rangeFromPreset,
} from "@/lib/metrics";
import { isSuperadmin } from "@/lib/roles";

type Summary = {
  campaign: {
    id: string;
    name: string;
    status: string;
    impression_goal: number | null;
    start_date: string;
    end_date: string;
    advertiser: { id: string; name: string } | null;
  };
  from: string;
  to: string;
  delivered: number;
  goal_pct: number | null;
  pace_status: string;
  metrics: Metrics;
};

type TsRow = { bucket: string; type: string; total: number };
type BdRow = { key: string; label: string; metrics: Metrics };

const BYS = [
  { id: "creative", label: "Creative" },
  { id: "publisher", label: "Publisher" },
  { id: "size", label: "Ukuran" },
  { id: "device", label: "Perangkat" },
  { id: "interaction", label: "Interaksi" },
] as const;

function n(row: Record<string, string | number>, key: string) {
  return Number(row[key] || 0);
}

export default function CampaignReportPage() {
  return (
    <Suspense
      fallback={
        <p className="py-8 text-center text-sm text-[var(--muted)]">Memuat report...</p>
      }
    >
      <CampaignReportBody />
    </Suspense>
  );
}

function CampaignReportBody() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const { hasPermission, user } = useAuth();
  const showBrand = isSuperadmin(user?.role?.name);
  const id = params.id;
  const initial = rangeFromPreset(7);
  const [from, setFrom] = useState(search.get("from") || initial.from);
  const [to, setTo] = useState(search.get("to") || initial.to);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [series, setSeries] = useState<TsRow[]>([]);
  const [by, setBy] = useState<(typeof BYS)[number]["id"]>("creative");
  const [breakdown, setBreakdown] = useState<BdRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const qs = `from=${from}&to=${to}`;

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, t, b] = await Promise.all([
        api<{ data: Summary }>(`/api/reports/campaigns/${id}/summary?${qs}`),
        api<{ data: TsRow[] }>(`/api/reports/campaigns/${id}/timeseries?${qs}&granularity=day`),
        api<{ data: BdRow[] }>(`/api/reports/campaigns/${id}/breakdown?${qs}&by=${by}`),
      ]);
      setSummary(s.data);
      setSeries(t.data);
      setBreakdown(b.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat");
    }
  }, [id, qs, by]);

  useEffect(() => {
    load();
  }, [load]);

  async function refreshNow() {
    setRefreshing(true);
    setError(null);
    try {
      if (hasPermission("report:aggregate")) {
        await api("/api/reports/aggregate", { method: "POST", json: {} });
      }
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menyegarkan");
    } finally {
      setRefreshing(false);
    }
  }

  const byDay = useMemo(() => {
    const map = new Map<string, Record<string, string | number>>();
    for (const row of series) {
      const bucket = String(row.bucket).slice(0, 10);
      const entry = map.get(bucket) ?? { bucket };
      entry[row.type] = Number(entry[row.type] || 0) + Number(row.total);
      map.set(bucket, entry);
    }
    return eachDate(from, to).map((day) => {
      const entry = map.get(day) ?? { bucket: day };
      const impression = n(entry, "impression");
      const click = n(entry, "click");
      const viewable = n(entry, "viewable_impression");
      return {
        bucket: day,
        request: n(entry, "request"),
        no_fill: n(entry, "no_fill"),
        impression,
        viewable_impression: viewable,
        click,
        interaction: n(entry, "interaction"),
        ctr: impression ? (click / impression) * 100 : 0,
        viewability: impression ? (viewable / impression) * 100 : 0,
      };
    });
  }, [series, from, to]);

  const chartData = useMemo(() => {
    let cum = 0;
    const goal = summary?.campaign.impression_goal || 0;
    return byDay.map((r) => {
      cum += r.impression;
      return { ...r, cumulative: cum, goal };
    });
  }, [byDay, summary?.campaign.impression_goal]);

  const m = summary?.metrics;
  const camp = summary?.campaign;

  function applyPreset(days: number) {
    const r = rangeFromPreset(days);
    setFrom(r.from);
    setTo(r.to);
  }

  return (
    <PermissionGate permission="report:read" redirect>
      <PageHeader
        eyebrow="Campaign"
        title={camp?.name || "Detail report"}
        subtitle={
          camp
            ? showBrand && camp.advertiser?.name
              ? `${camp.advertiser.name} · ${fmtDateId(from)} s.d. ${fmtDateId(to)}`
              : `${fmtDateId(from)} s.d. ${fmtDateId(to)}`
            : "Angka harian, creative, dan publisher untuk campaign ini."
        }
        action={
          <Link href={`/dashboard/reports?from=${from}&to=${to}`} className="btn-ghost">
            ← Semua campaign
          </Link>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex gap-1">
          {[7, 14, 30].map((d) => (
            <button key={d} type="button" className="btn-ghost" onClick={() => applyPreset(d)}>
              {d} hari
            </button>
          ))}
        </div>
        <label className="text-xs text-[var(--muted)]">
          Dari
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="field mt-1" />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Sampai
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="field mt-1" />
        </label>
        <button
          type="button"
          className="btn-ghost"
          onClick={() =>
            downloadCsv(`/api/reports/campaigns/${id}/export.csv?${qs}&by=${by}`, `campaign-${id}.csv`)
          }
        >
          Export CSV
        </button>
        <button type="button" className="btn-ghost" onClick={refreshNow} disabled={refreshing}>
          {refreshing ? "Menyegarkan..." : "Segarkan"}
        </button>
        {summary && <span className={paceClass(summary.pace_status)}>{summary.pace_status}</span>}
      </div>
      <ErrorBanner message={error} />

      {m && camp && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ...(showBrand ? [{ label: "Ad request", value: num(m.request) }] : []),
            { label: "Impression", value: num(m.impression) },
            { label: "Viewable", value: `${num(m.viewable_impression)} (${pct(m.viewability_rate_pct)})` },
            { label: "Klik", value: `${num(m.click)} (${pct(m.ctr_pct)})` },
            { label: "Interaksi unik", value: `${num(m.interaction_unique)} (${pct(m.interaction_rate_pct)})` },
            { label: "No fill", value: num(m.no_fill) },
            { label: "Fill rate", value: pct(m.fill_rate_pct) },
            {
              label: "Delivered / goal (lifetime)",
              value: `${num(summary.delivered)}${camp.impression_goal ? ` / ${num(camp.impression_goal)}` : " / -"}`,
            },
          ].map((c) => (
            <Card key={c.label} className="p-4">
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{c.label}</p>
              <p className="mt-1 text-xl font-bold">{c.value}</p>
            </Card>
          ))}
        </div>
      )}

      <Card className="mt-8 overflow-hidden">
        <div className="px-5 pt-4">
          <h2 className="text-lg font-semibold">Per hari</h2>
          <p className="text-sm text-[var(--muted)]">
            Ikuti rentang tanggal di atas. Delivered di kartu adalah total lifetime (bukan filter tanggal).
            Agregat jalan tiap ~5 menit. Gunakan Segarkan bila angka belum muncul.
          </p>
        </div>
        <div className="table-scroll mt-2">
          <table className="data-table">
            <thead>
              <tr>
                <th>Tanggal</th>
                {showBrand && <th>Ad request</th>}
                <th>Impression</th>
                <th>Viewable</th>
                <th>Klik</th>
                <th>CTR</th>
                <th>Interaksi</th>
              </tr>
            </thead>
            <tbody>
              {byDay.length === 0 && (
                <EmptyRow cols={showBrand ? 7 : 6} text="Tidak ada data di rentang ini." />
              )}
              {byDay.map((r) => (
                <tr key={r.bucket}>
                  <td className="font-medium">{fmtDateId(r.bucket)}</td>
                  {showBrand && <td>{num(r.request)}</td>}
                  <td>{num(r.impression)}</td>
                  <td>{num(r.viewable_impression)}</td>
                  <td>{num(r.click)}</td>
                  <td>{pct(r.ctr)}</td>
                  <td>{num(r.interaction)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-8 h-80 p-5">
        <h2 className="text-lg font-semibold">Tren harian</h2>
        <ResponsiveContainer width="100%" height="90%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e4ddd0" />
            <XAxis dataKey="bucket" tick={{ fontSize: 11 }} tickFormatter={fmtDateId} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip labelFormatter={(v) => fmtDateId(String(v))} />
            <Legend />
            <Line type="monotone" dataKey="impression" name="Impression" stroke="#7c5cff" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="click" name="Klik" stroke="#ff4d6d" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="viewable_impression" name="Viewable" stroke="#2dd4bf" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card className="mt-8 h-80 p-5">
        <h2 className="text-lg font-semibold">Kumulatif impression vs goal</h2>
        <ResponsiveContainer width="100%" height="90%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e4ddd0" />
            <XAxis dataKey="bucket" tick={{ fontSize: 11 }} tickFormatter={fmtDateId} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip labelFormatter={(v) => fmtDateId(String(v))} />
            <Legend />
            <Line type="monotone" dataKey="cumulative" name="Kumulatif" stroke="#7c5cff" strokeWidth={2} dot={false} />
            {summary?.campaign.impression_goal ? (
              <Line type="monotone" dataKey="goal" name="Goal" stroke="#f59e0b" strokeDasharray="6 4" dot={false} />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card className="mt-8 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
          <div className="mr-auto">
            <h2 className="text-lg font-semibold">Rincian</h2>
            <p className="text-sm text-[var(--muted)]">Pecah angka campaign ini per creative, publisher, atau dimensi lain.</p>
          </div>
          {BYS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={by === item.id ? "btn-primary" : "btn-ghost"}
              onClick={() => setBy(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="table-scroll mt-2">
          <table className="data-table">
            <thead>
              <tr>
                <th>{BYS.find((item) => item.id === by)?.label}</th>
                <th>Impression</th>
                <th>Klik</th>
                <th>CTR</th>
                <th>Viewable</th>
                <th>Interaksi</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.length === 0 && <EmptyRow cols={6} text="Tidak ada data." />}
              {breakdown.map((r) => (
                <tr key={r.key}>
                  <td>{r.label}</td>
                  <td>{num(r.metrics.impression)}</td>
                  <td>{num(r.metrics.click)}</td>
                  <td>{pct(r.metrics.ctr_pct)}</td>
                  <td>{num(r.metrics.viewable_impression)}</td>
                  <td>{num(by === "interaction" ? r.metrics.interaction : r.metrics.interaction_unique)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </PermissionGate>
  );
}
