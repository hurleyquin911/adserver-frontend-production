"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  preview_ready: boolean;
  created_at?: string;
  campaign: {
    id: string;
    name: string;
    advertiser?: { id: string; name: string };
  };
};

type Campaign = { id: string; name: string };

function CreativeStateIcon({ ready }: { ready: boolean }) {
  return (
    <span
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
        ready ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"
      }`}
      aria-hidden
    >
      {ready ? (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 20a8 8 0 100-16 8 8 0 000 16zm-3-5 6-6" />
        </svg>
      ) : (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3 2.8 19h18.4L12 3zm0 6v4m0 3h.01" />
        </svg>
      )}
    </span>
  );
}

function CreativeRow({
  creative,
  canUpload,
}: {
  creative: Creative;
  canUpload: boolean;
}) {
  const router = useRouter();
  const previewHref = `/dashboard/creatives/${encodeURIComponent(creative.id)}`;
  const nextHref = creative.preview_ready || !canUpload
    ? previewHref
    : `/dashboard/campaigns?c=${encodeURIComponent(creative.campaign.id)}&fix=${encodeURIComponent(creative.id)}`;

  return (
    <tr
      className="row-click cursor-pointer"
      tabIndex={0}
      aria-label={`Open ${creative.name}`}
      onClick={() => router.push(nextHref)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          router.push(nextHref);
        }
      }}
    >
      <td>
        <div className="flex min-w-0 items-center gap-3">
          <CreativeStateIcon ready={creative.preview_ready} />
          <span className="min-w-0">
            <span className="block truncate font-semibold">{creative.name}</span>
            <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">
              {creative.campaign?.advertiser?.name ?? "Brand"} · HTML5
            </span>
          </span>
        </div>
      </td>
      <td className="whitespace-nowrap tabular-nums">{creative.width} × {creative.height}</td>
      <td>
        <span
          className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${
            creative.preview_ready
              ? "bg-emerald-400/10 text-emerald-200"
              : "bg-amber-400/10 text-amber-200"
          }`}
        >
          {creative.preview_ready ? "Ready to preview" : "Needs attention"}
        </span>
      </td>
      <td>
        <Link
          href={nextHref}
          className="btn-link whitespace-nowrap"
          onClick={(event) => event.stopPropagation()}
        >
          {creative.preview_ready || !canUpload ? "Preview creative →" : "Fix upload →"}
        </Link>
      </td>
    </tr>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const canUpload = hasPermission("creative:upload");
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [campaignId, setCampaignId] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadWorkspace() {
      setError(null);
      try {
        const [creativeResult, campaignResult] = await Promise.all([
          api<{ data: Creative[] }>("/api/creatives"),
          canUpload ? api<{ data: Campaign[] }>("/api/campaigns") : Promise.resolve({ data: [] }),
        ]);
        if (cancelled) return;
        const orderedCreatives = [...creativeResult.data].sort((a, b) => {
          const dateDiff =
            new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
          return dateDiff || Number(b.id) - Number(a.id);
        });
        setCreatives(orderedCreatives);
        setCampaigns(campaignResult.data);
        setCampaignId((current) => current || campaignResult.data[0]?.id || "");
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Failed to load your creative workspace");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadWorkspace();
    return () => {
      cancelled = true;
    };
  }, [canUpload]);

  const readyCount = useMemo(
    () => creatives.filter((creative) => creative.preview_ready).length,
    [creatives]
  );
  const attentionCount = creatives.length - readyCount;
  const recentCreatives = creatives.slice(0, 5);

  function continueToUpload() {
    if (!campaignId) return;
    setUploadOpen(false);
    router.push(`/dashboard/campaigns?c=${encodeURIComponent(campaignId)}&upload=1`);
  }

  return (
    <PermissionGate permission="campaign:read" redirect>
      <div className="pb-8">
        <PageHeader
          title="Your creative workspace"
          subtitle="Upload, review, and get your next creative ready for your DSP."
          action={
            canUpload ? (
              <button
                type="button"
                className="btn-primary inline-flex items-center"
                onClick={() => setUploadOpen(true)}
              >
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L8 8m4-4l4 4M5 14v5h14v-5" />
                </svg>
                Upload creative
              </button>
            ) : undefined
          }
        />

        <ErrorBanner message={error} />

        <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
          <h2 className="font-semibold">From creative to ad tag, in three steps</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Upload your HTML5 ZIP, review the creative, and get its ad tag.
          </p>
          <div className="mt-5 grid gap-5 md:grid-cols-3">
            <div className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-400/10 text-xs font-semibold text-indigo-300">1</span>
              <div>
                <p className="text-sm font-semibold">Upload your creative</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Check the file before moving on.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-400/10 text-xs font-semibold text-indigo-300">2</span>
              <div>
                <p className="text-sm font-semibold">See it in action</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Review the size and test the click.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-400/10 text-xs font-semibold text-indigo-300">3</span>
              <div>
                <p className="text-sm font-semibold">Get your ad tag</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Select a format, then copy the tag.</p>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <Link href="/dashboard/creatives" className="card block p-5 transition hover:-translate-y-0.5">
            <p className="text-xs text-[var(--muted)]">Total creatives</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{loading ? "—" : creatives.length}</p>
            <p className="mt-2 text-xs text-[var(--muted)]">In your workspace</p>
          </Link>
          <Link href="/dashboard/creatives?status=ready" className="card block p-5 transition hover:-translate-y-0.5">
            <p className="text-xs text-[var(--muted)]">Ready to preview</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{loading ? "—" : readyCount}</p>
            <p className="mt-2 text-xs text-[var(--muted)]">Review before generating a tag</p>
          </Link>
          <Link href="/dashboard/creatives?status=attention" className="card block p-5 transition hover:-translate-y-0.5">
            <p className="text-xs text-[var(--muted)]">Needs attention</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{loading ? "—" : attentionCount}</p>
            <p className="mt-2 text-xs font-medium text-indigo-300">
              Review file issues →
            </p>
          </Link>
        </div>

        <Card className="mt-5 overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 py-4">
            <h2 className="font-semibold">Recent creatives</h2>
            <Link href="/dashboard/creatives" className="btn-link whitespace-nowrap">
              View all creatives →
            </Link>
          </div>
          <div className="table-scroll">
            <table className="data-table min-w-[42rem]">
              <thead>
                <tr>
                  <th>Creative</th>
                  <th>Size</th>
                  <th>Status</th>
                  <th>Next step</th>
                </tr>
              </thead>
              <tbody>
                {!loading && recentCreatives.length === 0 && (
                  <EmptyRow cols={4} text="No creatives in your workspace yet." />
                )}
                {loading && <EmptyRow cols={4} text="Loading creatives..." />}
                {recentCreatives.map((creative) => (
                  <CreativeRow key={creative.id} creative={creative} canUpload={canUpload} />
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
            <button type="button" className="btn-primary" onClick={continueToUpload} disabled={!campaignId}>
              Continue to upload
            </button>
          </div>
        </Modal>
      </div>
    </PermissionGate>
  );
}
