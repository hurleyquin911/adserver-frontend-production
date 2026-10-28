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
  publisher_id: string;
  host: string;
  slot_size: string;
  metrics: Metrics;
};

export default function NoFillPage() {
  return (
    <Suspense
      fallback={<p className="py-8 text-center text-sm text-[var(--muted)]">Memuat no-fill...</p>}
    >
      <NoFillBody />
    </Suspense>
  );
}

function NoFillBody() {
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
      const res = await api<{ data: Row[] }>(`/api/reports/no-fill?from=${from}&to=${to}`);
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
        title="No-fill"
        subtitle="Request tanpa creative, per ukuran dan publisher. Fill rate = (request - no_fill) / request."
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
                <th>Publisher</th>
                <th>Ukuran</th>
                <th>Request</th>
                <th>No-fill</th>
                <th>Fill rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <EmptyRow cols={5} text="Tidak ada no-fill pada rentang ini." />}
              {rows.map((r) => (
                <tr key={`${r.publisher_id}-${r.slot_size}`}>
                  <td>{r.host}</td>
                  <td>{r.slot_size}</td>
                  <td>{num(r.metrics.request)}</td>
                  <td>{num(r.metrics.no_fill)}</td>
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
