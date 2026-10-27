"use client";

import { Suspense } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Modal } from "@/components/Modal";
import PermissionGate from "@/components/PermissionGate";
import { Card, EmptyRow, ErrorBanner, PageHeader } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Creative = {
  id: string;
  name: string;
  width: number;
  height: number;
  preview_url: string;
  preview_ready: boolean;
  status: string;
  campaign: {
    id: string;
    name: string;
    advertiser?: { id: string; name: string };
  };
};

type Campaign = { id: string; name: string };
type Tab = "all" | "ready" | "attention";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All creatives" },
  { id: "ready", label: "Ready to preview" },
  { id: "attention", label: "Needs attention" },
];

export default function CreativesPage() {
  return (
    <Suspense fallback={<p className="py-8 text-center text-sm text-[var(--muted)]">Loading creatives...</p>}>
      <CreativesContent />
    </Suspense>
  );
}

function CreativesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasPermission } = useAuth();
  const canUpload = hasPermission("creative:upload");
  const [rows, setRows] = useState<Creative[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>(() => {
    const status = searchParams.get("status");
    if (status === "ready" || status === "attention") return status;
    return "all";
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [campaignId, setCampaignId] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [creativeResult, campaignResult] = await Promise.all([
          api<{ data: Creative[] }>("/api/creatives"),
          api<{ data: Campaign[] }>("/api/campaigns"),
        ]);
        if (cancelled) return;
        setRows(creativeResult.data);
        setCampaigns(campaignResult.data);
        setCampaignId(campaignResult.data[0]?.id ?? "");
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Gagal memuat creatives");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(
    () => ({
      all: rows.length,
      ready: rows.filter((row) => row.preview_ready).length,
      attention: rows.filter((row) => !row.preview_ready).length,
    }),
    [rows]
  );
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (tab === "ready" && !row.preview_ready) return false;
      if (tab === "attention" && row.preview_ready) return false;
      return (
        !normalizedQuery ||
        [row.name, row.campaign?.advertiser?.name, row.campaign?.name]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalizedQuery))
      );
    });
  }, [rows, query, tab]);

  function startUpload() {
    if (!campaignId) return;
    setUploadOpen(false);
    router.push(`/dashboard/campaigns?c=${encodeURIComponent(campaignId)}&upload=1`);
  }

  return (
    <PermissionGate permission="campaign:read" redirect>
      <PageHeader
        title="Creatives"
        subtitle="Manage your files, preview each creative, and generate its ad tag."
        action={
          canUpload ? (
            <button type="button" className="btn-primary" onClick={() => setUploadOpen(true)}>
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L8 8m4-4l4 4M5 14v5h14v-5" />
              </svg>
              Upload creative
            </button>
          ) : undefined
        }
      />

      <ErrorBanner message={error} />

      <div className="mb-5 flex gap-7 overflow-x-auto border-b border-[var(--line)]">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`shrink-0 border-b-2 px-0.5 pb-3 text-sm transition-colors ${
              tab === item.id
                ? "border-indigo-400 font-semibold text-indigo-200"
                : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
            onClick={() => setTab(item.id)}
          >
            {item.label} <span className="ml-1 tabular-nums">{counts[item.id]}</span>
          </button>
        ))}
      </div>

      <div className="mb-5 flex items-center gap-3">
        <label className="relative min-w-0 flex-1">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden
          >
            <circle cx="10.8" cy="10.8" r="6.8" />
            <path strokeLinecap="round" d="m16 16 4 4" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by creative, brand, or campaign"
            aria-label="Search creatives"
            className="field !mt-0 !pl-10"
          />
        </label>
        <span className="shrink-0 rounded-full bg-indigo-400/10 px-3 py-1.5 text-xs font-medium text-indigo-200">
          {filtered.length} {filtered.length === 1 ? "creative" : "creatives"}
        </span>
      </div>

      <Card className="overflow-hidden">
        <div className="table-scroll">
          <table className="data-table min-w-[48rem]">
            <thead>
              <tr>
                <th>Creative</th>
                <th>Size</th>
                <th>Status</th>
                <th>Campaign</th>
                <th>Next step</th>
              </tr>
            </thead>
            <tbody>
              {!loading && filtered.length === 0 && (
                <EmptyRow
                  cols={5}
                  text={rows.length === 0 ? "Belum ada creative." : "Tidak ada creative yang cocok."}
                />
              )}
              {loading && <EmptyRow cols={5} text="Memuat creatives..." />}
              {filtered.map((row) => (
                <tr
                  key={row.id}
                  className="row-click cursor-pointer"
                  tabIndex={0}
                  aria-label={`Open preview for ${row.name}`}
                  onClick={() => router.push(`/dashboard/creatives/${encodeURIComponent(row.id)}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(`/dashboard/creatives/${encodeURIComponent(row.id)}`);
                    }
                  }}
                >
                  <td>
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                          row.preview_ready
                            ? "bg-emerald-400/10 text-emerald-200"
                            : "bg-amber-400/10 text-amber-200"
                        }`}
                        aria-hidden
                      >
                        {row.preview_ready ? (
                          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 20a8 8 0 100-16 8 8 0 000 16zm-3-5 6-6" />
                          </svg>
                        ) : (
                          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3 2.8 19h18.4L12 3zm0 6v4m0 3h.01" />
                          </svg>
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{row.name}</span>
                        <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">
                          {row.campaign?.advertiser?.name ?? "Brand"} · HTML5
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap tabular-nums">{row.width} × {row.height}</td>
                  <td>
                    <span
                      className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${
                        row.preview_ready
                          ? "bg-emerald-400/10 text-emerald-200"
                          : "bg-amber-400/10 text-amber-200"
                      }`}
                    >
                      {row.preview_ready ? "Ready to preview" : "Needs attention"}
                    </span>
                  </td>
                  <td>{row.campaign?.name ?? "—"}</td>
                  <td>
                    {row.preview_ready ? (
                      <button
                        type="button"
                        className="btn-link whitespace-nowrap"
                        onClick={(event) => {
                          event.stopPropagation();
                          router.push(`/dashboard/creatives/${encodeURIComponent(row.id)}`);
                        }}
                      >
                        Preview creative →
                      </button>
                    ) : canUpload ? (
                      <button
                        type="button"
                        className="btn-link whitespace-nowrap"
                        onClick={(event) => {
                          event.stopPropagation();
                          router.push(
                            `/dashboard/campaigns?c=${encodeURIComponent(row.campaign.id)}&fix=${encodeURIComponent(row.id)}`
                          );
                        }}
                      >
                        Fix upload →
                      </button>
                    ) : (
                      <span className="text-sm text-[var(--muted)]">Contact your admin</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="mt-5 text-xs text-[var(--muted)]">jobosrv. · by Pushlab</p>

      <Modal
        open={uploadOpen}
        title="Upload creative"
        onClose={() => setUploadOpen(false)}
      >
        <p className="text-sm text-[var(--muted)]">
          Choose a campaign first. You can upload the creative from its campaign panel.
        </p>
        <label className="mt-4 block text-sm font-medium">
          Campaign
          <select
            className="field mt-1"
            value={campaignId}
            onChange={(event) => setCampaignId(event.target.value)}
            disabled={campaigns.length === 0}
          >
            {campaigns.length === 0 ? (
              <option value="">No campaigns available</option>
            ) : (
              campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
              ))
            )}
          </select>
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => setUploadOpen(false)}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={startUpload} disabled={!campaignId}>
            Continue to campaign
          </button>
        </div>
      </Modal>

    </PermissionGate>
  );
}
