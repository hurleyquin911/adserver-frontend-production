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
import { Card, EmptyRow, ErrorBanner, PageHeader, StatusBadge } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  Metrics,
  campaignReportHref,
  eachDate,
  fmtDateId,
  num,
  pct,
  rangeFromPreset,
} from "@/lib/metrics";
import { isSuperadmin } from "@/lib/roles";

type Payload = {
  publisher: {
    id: string;
    host: string;
    status: string;
    first_seen_at?: string;
    last_seen_at?: string;
    created_at?: string;
    updated_at?: string;
  };
  from: string;
  to: string;
  metrics: Metrics;
  campaigns: {
    campaign_id: string;
    name: string;
    status: string | null;
    advertiser: { id: string; name: string } | null;
    metrics: Metrics;
  }[];
  creatives: {
    creative_id: string;
    name: string;
    size: string | null;
    campaign_id: string | null;
    metrics: Metrics;
  }[];
  sizes: { size: string; metrics: Metrics }[];
  devices?: { device: string; metrics: Metrics }[];
  daily: { bucket: string; type: string; total: number }[];
};

type Tab = "campaign" | "creative" | "device";

function n(row: Record<string, string | number>, key: string) {
  return Number(row[key] || 0);
}

function fmtDt(d?: string) {
  if (!d) return "-";
  return new Date(d).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Link buka host di tab baru (http untuk loopback, https untuk domain publik). */
function hostHref(host: string) {
  if (/^(localhost|127\.0\.0\.1|\[::1\])/i.test(host)) return `http://${host}/`;
  return `https://${host}/`;
}

export default function PublisherDetailReportPage() {
  return (
    <Suspense
      fallback={
        <p className="py-8 text-center text-sm text-[var(--muted)]">Memuat detail publisher...</p>
      }
    >
      <PublisherDetailBody />
    </Suspense>
  );
}

function PublisherDetailBody() {
  const { user } = useAuth();
  const showBrand = isSuperadmin(user?.role?.name);
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const id = params.id;
  const initial = rangeFromPreset(7);
  const [from, setFrom] = useState(search.get("from") || initial.from);
  const [to, setTo] = useState(search.get("to") || initial.to);
  const [data, setData] = useState<Payload | null>(null);
  const [tab, setTab] = useState<Tab>("campaign");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api<{ data: Payload }>(
        `/api/reports/publishers/${id}?from=${from}&to=${to}`
      );
      setData(res.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat");
    }
  }, [id, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const byDay = useMemo(() => {
    const map = new Map<string, Record<string, string | number>>();
    for (const row of data?.daily || []) {
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
        interaction_unique: n(entry, "interaction_unique"),
        ctr: impression ? (click / impression) * 100 : 0,
        viewability: impression ? (viewable / impression) * 100 : 0,
      };
    });
  }, [data?.daily, from, to]);

  function applyPreset(days: number) {
    const r = rangeFromPreset(days);
    setFrom(r.from);
    setTo(r.to);
  }

  const m = data?.metrics;
  const pub = data?.publisher;
  const sizes = data?.sizes || [];
  const devices = data?.devices || [];

  return (
    <PermissionGate permission="report:read" redirect>
      <PageHeader
        eyebrow="Publisher"
        title={pub?.host || "Detail publisher"}
        subtitle="Profil host, ukuran slot iklan, dan delivery di rentang tanggal."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href={`/dashboard/reports?from=${from}&to=${to}`} className="btn-ghost">
              ← Report campaign
            </Link>
            <Link href={`/dashboard/reports/publishers?from=${from}&to=${to}`} className="btn-ghost">
              ← Semua publisher
            </Link>
            <Link href="/dashboard/publishers" className="btn-ghost">
              Kelola publisher
            </Link>
          </div>
        }
      />

      <ErrorBanner message={error} />

      {pub && (
        <Card className="mt-2 p-5">
          <h2 className="text-lg font-semibold">Informasi publisher</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Host dikenali dari Origin/Referer halaman, bukan autentikasi.
          </p>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Host</dt>
              <dd className="mt-1 font-medium">
                <a
                  href={hostHref(pub.host)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-link"
                >
                  {pub.host}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Tautan</dt>
              <dd className="mt-1 break-all text-sm text-[var(--muted)]">{hostHref(pub.host)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Status</dt>
              <dd className="mt-1">
                <StatusBadge value={pub.status} />
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">ID</dt>
              <dd className="mt-1 font-mono text-sm">{pub.id}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Pertama terhubung</dt>
              <dd className="mt-1">{fmtDt(pub.first_seen_at)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Terakhir terlihat</dt>
              <dd className="mt-1">{fmtDt(pub.last_seen_at)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Dicatat di sistem</dt>
              <dd className="mt-1">{fmtDt(pub.created_at)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Diperbarui</dt>
              <dd className="mt-1">{fmtDt(pub.updated_at)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Ringkasan rentang</dt>
              <dd className="mt-1 text-sm">
                {sizes.length} ukuran slot · {data?.campaigns.length || 0} campaign ·{" "}
                {data?.creatives.length || 0} creative
              </dd>
            </div>
          </dl>
        </Card>
      )}

      <div className="mt-6 flex flex-wrap items-end gap-3">
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
            onChange={(e) => setFrom(e.target.value)}
            className="field mt-1"
          />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Sampai
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="field mt-1"
          />
        </label>
      </div>

      {m && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Ad request", value: num(m.request) },
            { label: "Impression", value: num(m.impression) },
            {
              label: "Viewable",
              value: `${num(m.viewable_impression)} (${pct(m.viewability_rate_pct)})`,
            },
            { label: "Klik", value: `${num(m.click)} (${pct(m.ctr_pct)})` },
            {
              label: "Interaksi unik",
              value: `${num(m.interaction_unique)} (${pct(m.interaction_rate_pct)})`,
            },
            { label: "No fill", value: num(m.no_fill) },
            { label: "Fill rate", value: pct(m.fill_rate_pct) },
            { label: "Ukuran slot aktif", value: num(sizes.length) },
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
          <h2 className="text-lg font-semibold">Ukuran placement / slot ({sizes.length})</h2>
          <p className="text-sm text-[var(--muted)]">
            Ukuran dari <code>data-size</code> per tag (satu tag = satu ukuran). Creative harus
            berukuran persis sama; kalau tidak, request tetap tercatat sebagai no-fill.
          </p>
        </div>
        <div className="table-scroll mt-2">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ukuran</th>
                <th>Status</th>
                <th>Request</th>
                <th>Impression</th>
                <th>No fill</th>
                <th>Fill rate</th>
                <th>Viewable</th>
                <th>Klik</th>
                <th>CTR</th>
              </tr>
            </thead>
            <tbody>
              {sizes.length === 0 && (
                <EmptyRow
                  cols={9}
                  text="Belum ada request ukuran di rentang ini. Pastikan tag punya data-size atau kontainer berukuran."
                />
              )}
              {[...sizes]
                .sort(
                  (a, b) =>
                    (b.metrics.request || 0) - (a.metrics.request || 0) ||
                    (b.metrics.impression || 0) - (a.metrics.impression || 0)
                )
                .map((s) => {
                  const filled = (s.metrics.impression || 0) > 0;
                  return (
                    <tr key={s.size}>
                      <td className="font-mono text-sm font-medium">{s.size}</td>
                      <td>
                        <span className={filled ? "badge badge-active" : "badge badge-pending"}>
                          {filled ? "Ada tayangan" : "No fill"}
                        </span>
                      </td>
                      <td>{num(s.metrics.request)}</td>
                      <td>{num(s.metrics.impression)}</td>
                      <td>{num(s.metrics.no_fill)}</td>
                      <td>{pct(s.metrics.fill_rate_pct)}</td>
                      <td>{num(s.metrics.viewable_impression)}</td>
                      <td>{num(s.metrics.click)}</td>
                      <td>{pct(s.metrics.ctr_pct)}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-8 overflow-hidden">
        <div className="px-5 pt-4">
          <h2 className="text-lg font-semibold">Per hari</h2>
          <p className="text-sm text-[var(--muted)]">
            Delivery di host ini untuk setiap tanggal di rentang yang dipilih.
          </p>
        </div>
        <div className="table-scroll mt-2">
          <table className="data-table">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Request</th>
                <th>Impression</th>
                <th>Viewable</th>
                <th>Klik</th>
                <th>CTR</th>
                <th>Interaksi</th>
              </tr>
            </thead>
            <tbody>
              {byDay.length === 0 && <EmptyRow cols={7} text="Tidak ada data di rentang ini." />}
              {byDay.map((r) => (
                <tr key={r.bucket}>
                  <td className="font-medium">{fmtDateId(r.bucket)}</td>
                  <td>{num(r.request)}</td>
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
          <LineChart data={byDay}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e4ddd0" />
            <XAxis dataKey="bucket" tick={{ fontSize: 11 }} tickFormatter={fmtDateId} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip labelFormatter={(v) => fmtDateId(String(v))} />
            <Legend />
            <Line
              type="monotone"
              dataKey="impression"
              name="Impression"
              stroke="#7c5cff"
              strokeWidth={2}
              dot={false}
            />
            <Line type="monotone" dataKey="click" name="Klik" stroke="#ff4d6d" strokeWidth={2} dot={false} />
            <Line
              type="monotone"
              dataKey="viewable_impression"
              name="Viewable"
              stroke="#2dd4bf"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card className="mt-8 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
          <div className="mr-auto">
            <h2 className="text-lg font-semibold">Rincian delivery</h2>
            <p className="text-sm text-[var(--muted)]">
              Campaign, creative, atau perangkat yang menerima traffic di publisher ini.
            </p>
          </div>
          {(
            [
              { id: "campaign", label: "Campaign" },
              { id: "creative", label: "Creative" },
              { id: "device", label: "Perangkat" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? "btn-primary" : "btn-ghost"}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "campaign" && (
          <div className="table-scroll mt-2">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Campaign</th>
                  {showBrand && <th>Brand</th>}
                  <th>Status</th>
                  <th>Request</th>
                  <th>Impression</th>
                  <th>Klik</th>
                  <th>CTR</th>
                  <th>Viewable</th>
                  <th>Interaksi</th>
                </tr>
              </thead>
              <tbody>
                {(!data || data.campaigns.length === 0) && (
                  <EmptyRow
                    cols={showBrand ? 9 : 8}
                    text="Belum ada campaign yang menerima traffic di host ini."
                  />
                )}
                {data?.campaigns.map((c) => (
                  <tr key={c.campaign_id}>
                    <td>
                      {c.campaign_id === "0" ? (
                        c.name
                      ) : (
                        <Link
                          href={campaignReportHref(c.campaign_id, from, to)}
                          className="btn-link"
                        >
                          {c.name}
                        </Link>
                      )}
                    </td>
                    {showBrand && (
                      <td className="text-[var(--muted)]">{c.advertiser?.name ?? "-"}</td>
                    )}
                    <td>{c.status ? <StatusBadge value={c.status} /> : "-"}</td>
                    <td>{num(c.metrics.request)}</td>
                    <td>{num(c.metrics.impression)}</td>
                    <td>{num(c.metrics.click)}</td>
                    <td>{pct(c.metrics.ctr_pct)}</td>
                    <td>{num(c.metrics.viewable_impression)}</td>
                    <td>{num(c.metrics.interaction_unique)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "creative" && (
          <div className="table-scroll mt-2">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Creative</th>
                  <th>Ukuran</th>
                  <th>Impression</th>
                  <th>Klik</th>
                  <th>CTR</th>
                  <th>Viewable</th>
                  <th>Interaksi</th>
                </tr>
              </thead>
              <tbody>
                {(!data || data.creatives.length === 0) && (
                  <EmptyRow cols={7} text="Belum ada creative yang tampil di host ini." />
                )}
                {data?.creatives.map((c) => (
                  <tr key={c.creative_id}>
                    <td className="font-medium">{c.name}</td>
                    <td className="font-mono text-xs">{c.size ?? "-"}</td>
                    <td>{num(c.metrics.impression)}</td>
                    <td>{num(c.metrics.click)}</td>
                    <td>{pct(c.metrics.ctr_pct)}</td>
                    <td>{num(c.metrics.viewable_impression)}</td>
                    <td>{num(c.metrics.interaction_unique)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "device" && (
          <div className="table-scroll mt-2">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Perangkat</th>
                  <th>Request</th>
                  <th>Impression</th>
                  <th>Klik</th>
                  <th>CTR</th>
                  <th>Viewable</th>
                </tr>
              </thead>
              <tbody>
                {devices.length === 0 && (
                  <EmptyRow cols={6} text="Belum ada breakdown perangkat di rentang ini." />
                )}
                {devices.map((d) => (
                  <tr key={d.device}>
                    <td className="font-medium">{d.device}</td>
                    <td>{num(d.metrics.request)}</td>
                    <td>{num(d.metrics.impression)}</td>
                    <td>{num(d.metrics.click)}</td>
                    <td>{pct(d.metrics.ctr_pct)}</td>
                    <td>{num(d.metrics.viewable_impression)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PermissionGate>
  );
}
