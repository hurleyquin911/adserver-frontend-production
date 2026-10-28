"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PermissionGate from "@/components/PermissionGate";
import { Card, EmptyRow, ErrorBanner, PageHeader } from "@/components/ui";
import { ApiError, api, downloadCsv } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { isAdmin, isSuperadmin, isUsersRole } from "@/lib/roles";

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

type RateHistoryRow = {
  id: string;
  creative: {
    id: string;
    name: string;
    campaign: { id: string; name: string };
  };
  old_cpm_usd: number | null;
  new_cpm_usd: number | null;
  reason: string;
  changed_by: { id: string; name: string } | null;
  changed_at: string;
};

type RateDraft = { rate: string; reason: string };

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
  const canManagePricing = isSuperadmin(user?.role?.name);
  const allowedRole = canManagePricing || isAdmin(user?.role?.name) || isUsersRole(user?.role?.name);
  const today = dateInTimeZone(new Date(), "Asia/Jakarta");
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [result, setResult] = useState<BillingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [history, setHistory] = useState<RateHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [rateDrafts, setRateDrafts] = useState<Record<string, RateDraft>>({});
  const [savingCreativeId, setSavingCreativeId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

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
  }, [from, to, reloadKey]);

  useEffect(() => {
    let cancelled = false;
    async function fetchHistory() {
      setHistoryLoading(true);
      try {
        const data = await api<{ data: RateHistoryRow[] }>("/api/billing/history");
        if (!cancelled) setHistory(data.data);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Gagal memuat riwayat perubahan tarif");
          setHistory([]);
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }
    void fetchHistory();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

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

  function updateDraft(id: string, patch: Partial<RateDraft>, row: BillingRow) {
    setRateDrafts((current) => ({
      ...current,
      [id]: {
        rate: current[id]?.rate ?? (row.cpm_usd == null ? "" : String(row.cpm_usd)),
        reason: current[id]?.reason ?? "",
        ...patch,
      },
    }));
  }

  async function savePricing(row: BillingRow) {
    const draft = rateDrafts[row.id] ?? {
      rate: row.cpm_usd == null ? "" : String(row.cpm_usd),
      reason: "",
    };
    if (draft.reason.trim().length < 5) {
      setError("Tuliskan ketentuan atau alasan perubahan harga (minimal 5 karakter).");
      return;
    }

    setSavingCreativeId(row.id);
    setError(null);
    setNotice(null);
    try {
      const response = await api<{ data: { changed: boolean } }>(
        `/api/billing/pricing/${encodeURIComponent(row.id)}`,
        {
          method: "PATCH",
          json: {
            cpm_usd: draft.rate.trim() === "" ? null : Number(draft.rate),
            reason: draft.reason.trim(),
          },
        }
      );
      setNotice(
        response.data.changed
          ? `Rate for “${row.name}” updated. The change and its terms are recorded below.`
          : `The rate for “${row.name}” was unchanged; no new history entry was created.`
      );
      setRateDrafts((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
      setReloadKey((key) => key + 1);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menyimpan CPM");
    } finally {
      setSavingCreativeId(null);
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
          subtitle={
            canManagePricing
              ? "Set CPM terms per creative and review a complete change history."
              : "Understand your usage and see exactly how the estimate is calculated."
          }
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
        {notice && (
          <p className="mb-4 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
            {notice}
          </p>
        )}

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

        {canManagePricing && (
          <Card className="mt-5 overflow-hidden">
            <div className="border-b border-[var(--line)] px-5 py-4">
              <h2 className="font-semibold">CPM pricing terms</h2>
              <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                Set the USD amount charged per 1,000 impressions for each creative. A
                reason is required and every actual change is recorded in the history below.
                Changes apply to the current rate; historical estimates are not recalculated
                as separate past rate periods.
              </p>
            </div>
            <div className="table-scroll">
              <table className="data-table min-w-[58rem]">
                <thead>
                  <tr>
                    <th>Creative</th>
                    <th>Current CPM (USD)</th>
                    <th>New CPM (USD)</th>
                    <th>Change terms / reason</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <EmptyRow cols={5} text="Loading pricing..." />
                  ) : result?.data.length ? (
                    result.data.map((row) => {
                      const draft = rateDrafts[row.id] ?? {
                        rate: row.cpm_usd == null ? "" : String(row.cpm_usd),
                        reason: "",
                      };
                      return (
                        <tr key={row.id}>
                          <td>
                            <strong className="block">{row.name}</strong>
                            <span className="text-xs text-[var(--muted)]">{row.campaign.name}</span>
                          </td>
                          <td className="tabular-nums">
                            {row.cpm_usd == null ? "Not configured" : usdFormat.format(row.cpm_usd)}
                          </td>
                          <td>
                            <input
                              aria-label={`New CPM for ${row.name}`}
                              type="number"
                              min="0"
                              max="999999.9999"
                              step="0.0001"
                              value={draft.rate}
                              onChange={(event) => updateDraft(row.id, { rate: event.target.value }, row)}
                              placeholder="No rate"
                              className="field !mt-0 min-w-36"
                              disabled={savingCreativeId === row.id}
                            />
                          </td>
                          <td>
                            <input
                              aria-label={`Change terms for ${row.name}`}
                              type="text"
                              maxLength={500}
                              minLength={5}
                              value={draft.reason}
                              onChange={(event) => updateDraft(row.id, { reason: event.target.value }, row)}
                              placeholder="Required for every change"
                              className="field !mt-0 min-w-64"
                              disabled={savingCreativeId === row.id}
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn-primary whitespace-nowrap"
                              onClick={() => savePricing(row)}
                              disabled={savingCreativeId === row.id || draft.reason.trim().length < 5}
                            >
                              {savingCreativeId === row.id ? "Saving..." : "Save rate"}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <EmptyRow cols={5} text="No creatives found for this account." />
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <Card className="mt-5 overflow-hidden">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h2 className="font-semibold">CPM change history &amp; terms</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Every rate change is recorded with its previous price, new price, reason, and author.
            </p>
          </div>
          <div className="table-scroll">
            <table className="data-table min-w-[52rem]">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Creative</th>
                  <th>Previous CPM</th>
                  <th>New CPM</th>
                  <th>Terms / reason</th>
                  <th>Changed by</th>
                </tr>
              </thead>
              <tbody>
                {historyLoading ? (
                  <EmptyRow cols={6} text="Loading rate change history..." />
                ) : history.length ? (
                  history.map((entry) => (
                    <tr key={entry.id}>
                      <td className="whitespace-nowrap text-xs">
                        {new Intl.DateTimeFormat("en-US", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: result?.meta.timezone ?? "Asia/Jakarta",
                        }).format(new Date(entry.changed_at))}
                      </td>
                      <td>
                        <strong className="block">{entry.creative.name}</strong>
                        <span className="text-xs text-[var(--muted)]">{entry.creative.campaign.name}</span>
                      </td>
                      <td className="tabular-nums">
                        {entry.old_cpm_usd == null ? "Not set" : usdFormat.format(entry.old_cpm_usd)}
                      </td>
                      <td className="tabular-nums">
                        {entry.new_cpm_usd == null ? "Not set" : usdFormat.format(entry.new_cpm_usd)}
                      </td>
                      <td className="max-w-sm whitespace-normal text-xs">{entry.reason}</td>
                      <td>{entry.changed_by?.name ?? "System / prior configuration"}</td>
                    </tr>
                  ))
                ) : (
                  <EmptyRow cols={6} text="No CPM changes have been recorded yet." />
                )}
              </tbody>
            </table>
          </div>
        </Card>

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
