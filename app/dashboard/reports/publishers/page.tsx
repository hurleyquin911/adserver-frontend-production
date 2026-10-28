"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import PermissionGate from "@/components/PermissionGate";
import { Card, EmptyRow, ErrorBanner, PageHeader } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Metrics, num, pct, rangeFromPreset } from "@/lib/metrics";

type Row = {
  id: string;
  host: string;
  status: string;
  metrics: Metrics;
};

export default function PublisherReportsPage() {
  return (
    <Suspense
      fallback={
        <p className="py-8 text-center text-sm text-[var(--muted)]">Memuat report publisher...</p>
      }
    >
      <PublisherReportsBody />
    </Suspense>
  );
}

function PublisherReportsBody() {
  const { user } = useAuth();
  const router = useRouter();
  const search = useSearchParams();
  const initial = rangeFromPreset(7);
  const [from, setFrom] = useState(search.get("from") || initial.from);
  const [to, setTo] = useState(search.get("to") || initial.to);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ data: Row[] }>(`/api/reports/publishers?from=${from}&to=${to}`);
      setRows(res.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat");
    }
  }, [from, to]);

  useEffect(() => {
    if (user?.advertiser_id != null) {
      router.replace("/dashboard/reports");
      return;
    }
    load();
  }, [load, user?.advertiser_id, router]);

  if (user?.advertiser_id != null) {
    return (
      <p className="py-8 text-center text-sm text-[var(--muted)]">Mengalihkan...</p>
    );
  }

  return (
    <PermissionGate permission="report:read" superadminOnly redirect>
      <PageHeader
        eyebrow="Publisher"
        title="Report publisher"
        subtitle="Host dari header browser, bukan autentikasi. Data tiap 5 menit."
        action={
          <Link href={`/dashboard/reports?from=${from}&to=${to}`} className="btn-ghost">
            ← Report campaign
          </Link>
        }
      />
      <div className="flex gap-3">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="field max-w-40" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="field max-w-40" />
      </div>
      <ErrorBanner message={error} />
      <Card className="mt-4 overflow-hidden">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Host</th>
                <th>Status</th>
                <th>Request</th>
                <th>Impression</th>
                <th>Klik</th>
                <th>CTR</th>
                <th>Fill rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <EmptyRow cols={7} text="Belum ada publisher." />}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link
                      className="btn-link"
                      href={`/dashboard/reports/publishers/${r.id}?from=${from}&to=${to}`}
                    >
                      {r.host}
                    </Link>
                  </td>
                  <td>{r.status}</td>
                  <td>{num(r.metrics.request)}</td>
                  <td>{num(r.metrics.impression)}</td>
                  <td>{num(r.metrics.click)}</td>
                  <td>{pct(r.metrics.ctr_pct)}</td>
                  <td>{pct(r.metrics.fill_rate_pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </PermissionGate>
  );
}
