"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PermissionGate from "@/components/PermissionGate";
import { Card, EmptyRow, ErrorBanner, PageHeader } from "@/components/ui";
import { ApiError, api, downloadCsv } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { isAdmin, isUsersRole } from "@/lib/roles";

type BillingRow = {
  id: string;
  name: string;
  size: string;
  campaign: { id: string; name: string };
  impressions: number;
  cpm_usd: number | null;
  amount_usd: number | null;
};

type BillingResult = {
  data: BillingRow[];
  summary: {
    total_impressions: number;
    billable_impressions: number;
    total_amount_usd: number;
    unpriced_creative_count: number;
  };
  meta: { from: string; to: string; timezone: string; currency: "USD" };
};

function dateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatPeriod(from: string, to: string) {
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${value}T12:00:00Z`));
  return `${formatDate(from)} – ${formatDate(to)}`;
}

const numberFormat = new Intl.NumberFormat("en-US");
const usdFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export default function BillingPage() {
  const router = useRouter();
  const { loading: authLoading, user } = useAuth();
  const allowedRole = isAdmin(user?.role?.name) || isUsersRole(user?.role?.name);
  const today = dateInTimeZone(new Date(), "Asia/Jakarta");
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [result, setResult] = useState<BillingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!authLoading && !allowedRole) router.replace("/dashboard");
  }, [authLoading, allowedRole, router]);

  useEffect(() => {
    let cancelled = false;
    async function fetchBilling() {
      setError(null);
      try {
        const params = new URLSearchParams({ from, to });
        const data = await api<BillingResult>(`/api/billing?${params.toString()}`);
        if (!cancelled) setResult(data);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Gagal memuat Billing");
          setResult(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchBilling();
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const compareHref = useMemo(() => {
    const params = new URLSearchParams({ from, to });
    return `/dashboard/reports?${params.toString()}`;
  }, [from, to]);

  async function exportBreakdown() {
    setDownloading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from, to });
      await downloadCsv(`/api/billing/export.csv?${params.toString()}`, `billing-${from}-${to}.csv`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal mengunduh breakdown");
    } finally {
      setDownloading(false);
    }
  }

  const summary = result?.summary;
  const period = formatPeriod(from, to);

  return (
    <PermissionGate permission="report:read" redirect>
      {!allowedRole ? null : (
      <div className="pb-8">
        <PageHeader
          title="Billing"
          subtitle="Understand your usage and see exactly how the estimate is calculated."
          action={
            <button
              type="button"
              className="btn-ghost"
              onClick={exportBreakdown}
              disabled={downloading || loading || !result}
            >
              {downloading ? "Preparing..." : "Download breakdown"}
            </button>
          }
        />

        <div className="mb-5 flex flex-wrap items-end gap-3">
          <label className="text-xs text-[var(--muted)]">
            From
            <input
              type="date"
              value={from}
              max={to}
              onChange={(event) => {
                setLoading(true);
                setFrom(event.target.value);
              }}
              className="field mt-1"
            />
          </label>
          <label className="text-xs text-[var(--muted)]">
            To
            <input
              type="date"
              value={to}
              min={from}
              max={today}
              onChange={(event) => {
                setLoading(true);
                setTo(event.target.value);
              }}
              className="field mt-1"
            />
          </label>
          <span className="mb-2 rounded-full bg-indigo-400/10 px-3 py-1 text-xs font-medium text-indigo-200">
            Estimate
          </span>
          <span className="mb-2 text-xs text-[var(--muted)]">
            Timezone: {result?.meta.timezone ?? "Asia/Jakarta"}
          </span>
        </div>

        <ErrorBanner message={error} />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(17rem,1fr)]">
          <Card className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">Estimated media serving fee</h2>
                <p className="mt-1 text-xs text-[var(--muted)]">{period} · Based on jobosrv. impressions</p>
              </div>
              <span className="rounded-full bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-200">
                Estimate
              </span>
            </div>
            <p className="mt-5 text-4xl font-bold tracking-tight text-zinc-50">
              {loading ? "—" : usdFormat.format(summary?.total_amount_usd ?? 0)}
              <span className="ml-2 text-xs font-medium text-[var(--muted)]">USD</span>
            </p>

            <div className="mt-7 space-y-3 border-b border-[var(--line)] pb-4 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-[var(--muted)]">Billable impressions</span>
                <strong className="tabular-nums">
                  {loading ? "—" : numberFormat.format(summary?.billable_impressions ?? 0)}
                </strong>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-[var(--muted)]">Rate per 1,000 impressions</span>
                <strong>Varies by creative</strong>
              </div>
              <div className="flex justify-between gap-4 border-t border-[var(--line)] pt-3">
                <span className="text-[var(--muted)]">Estimated total</span>
                <strong className="text-lg tabular-nums">
                  {loading ? "—" : usdFormat.format(summary?.total_amount_usd ?? 0)}
                </strong>
              </div>
            </div>
            <p className="mt-4 text-xs text-[var(--muted)]">
              Each creative: impressions ÷ 1,000 × its CPM rate. Amounts are rounded to
              cents per creative.
            </p>
            {Boolean(summary?.unpriced_creative_count) && (
              <p className="mt-2 text-xs text-amber-200">
                {summary?.unpriced_creative_count} creative(s) have no CPM rate and are
                excluded from the estimate.
              </p>
            )}
          </Card>

          <div className="grid content-start gap-4">
            <Card className="border-indigo-300/10 bg-indigo-400/[0.08] p-5">
              <h2 className="text-sm font-semibold text-indigo-100">
                One source for reports and billing
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                The same jobosrv. impression count is used in both views for the selected
                period.
              </p>
              <Link
                href={compareHref}
                className="mt-4 inline-flex text-sm font-medium text-indigo-200 hover:text-white"
              >
                Compare with report →
              </Link>
            </Card>
            <Card className="p-5">
              <h2 className="font-semibold">About this estimate</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                Calculated from jobosrv. impressions and the CPM rate set for each
                creative in the selected period.
              </p>
            </Card>
          </div>
        </div>

        <Card className="mt-5 overflow-hidden">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h2 className="font-semibold">Billable impression breakdown</h2>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Creative</th>
                  <th>Impressions</th>
                  <th>CPM (USD)</th>
                  <th>Amount (USD)</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <EmptyRow cols={4} text="Loading billing breakdown..." />
                ) : result?.data.length ? (
                  result.data.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong className="block">{row.name}</strong>
                        <span className="text-xs text-[var(--muted)]">
                          {row.size} · {row.campaign.name}
                        </span>
                      </td>
                      <td className="tabular-nums">{numberFormat.format(row.impressions)}</td>
                      <td className="tabular-nums">
                        {row.cpm_usd == null ? "Not configured" : usdFormat.format(row.cpm_usd)}
                      </td>
                      <td className="tabular-nums">
                        {row.amount_usd == null ? "—" : usdFormat.format(row.amount_usd)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <EmptyRow cols={4} text="No creatives found for this account." />
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      )}
    </PermissionGate>
  );
}
