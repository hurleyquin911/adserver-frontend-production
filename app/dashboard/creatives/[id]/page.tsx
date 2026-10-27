"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import PermissionGate from "@/components/PermissionGate";
import { Card, ErrorBanner, PageHeader } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { isSuperadmin } from "@/lib/roles";
import { IFRAME_SANDBOX } from "@/lib/sandbox";

type CreativeDetails = {
  id: string;
  name: string;
  width: number;
  height: number;
  preview_url: string;
  preview_ready: boolean;
  entry_file: string;
  file_size: number;
  click_url: string | null;
  campaign: {
    id: string;
    name: string;
    advertiser_id: string;
    advertiser?: { id: string; name: string };
  };
};

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** unitIndex).toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function Step({
  number,
  label,
  complete = false,
  active = false,
}: {
  number: number;
  label: string;
  complete?: boolean;
  active?: boolean;
}) {
  return (
    <div
      className={`flex min-h-12 items-center gap-3 rounded-xl border px-4 py-2 text-sm ${
        active
          ? "border-indigo-400/40 bg-indigo-400/10 font-medium text-indigo-200"
          : "border-[var(--line)] bg-[var(--card)] text-[var(--muted)]"
      }`}
    >
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          complete || active
            ? "bg-indigo-500 text-white"
            : "bg-[var(--surface-2)] text-[var(--muted)]"
        }`}
      >
        {complete ? "✓" : number}
      </span>
      {label}
    </div>
  );
}

function CheckRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange?: () => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className={`mt-0.5 text-sm font-semibold ${checked ? "text-emerald-300" : "text-[var(--muted)]"}`}>
        {checked ? "✓" : "○"}
      </span>
      <div className="min-w-0 flex-1">
        {onChange ? (
          <label className="flex cursor-pointer items-start gap-2 text-sm font-semibold">
            <input type="checkbox" checked={checked} onChange={onChange} className="mt-1 accent-indigo-500" />
            <span>{title}</span>
          </label>
        ) : (
          <p className="text-sm font-semibold">{title}</p>
        )}
        <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{description}</p>
      </div>
    </div>
  );
}

export default function CreativeReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, hasPermission } = useAuth();
  const [creative, setCreative] = useState<CreativeDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visualReviewed, setVisualReviewed] = useState(false);
  const [clickThroughChecked, setClickThroughChecked] = useState(false);
  const [showDestination, setShowDestination] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const canUpload = hasPermission("creative:upload");
  const amSuperadmin = isSuperadmin(user?.role?.name);

  useEffect(() => {
    let cancelled = false;
    async function loadCreative() {
      try {
        const result = await api<{ data: CreativeDetails }>(
          `/api/creatives/${encodeURIComponent(id)}`
        );
        if (!cancelled) setCreative(result.data);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Gagal memuat creative");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadCreative();
    return () => {
      cancelled = true;
    };
  }, [id]);

  function continueToAdTag() {
    if (!creative || !creative.preview_ready || !visualReviewed || !clickThroughChecked) return;
    const params = new URLSearchParams({ size: `${creative.width}x${creative.height}` });
    if (amSuperadmin) params.set("advertiser_id", creative.campaign.advertiser_id);
    router.push(`/dashboard/tag?${params.toString()}`);
  }

  const canContinue = Boolean(
    creative?.preview_ready && visualReviewed && clickThroughChecked
  );

  return (
    <PermissionGate permission="campaign:read" redirect>
      <div className="pb-24">
        <PageHeader
          title="Preview creative"
          subtitle="Check the layout and click-through destination before generating your ad tag."
          action={
            <span className="rounded-full bg-indigo-400/10 px-3 py-1 text-xs font-medium text-indigo-200">
              Preview
            </span>
          }
        />
        <ErrorBanner message={error} />

        {loading && <p className="py-8 text-center text-sm text-[var(--muted)]">Loading creative...</p>}

        {!loading && creative && (
          <>
            <div className="mb-5 grid gap-3 md:grid-cols-3">
              <Step number={1} label="Upload creative" complete />
              <Step number={2} label="Preview & review" active />
              <Step number={3} label="Generate ad tag" />
            </div>

            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(20rem,0.9fr)]">
              <Card className="p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="truncate font-semibold">{creative.name}</h2>
                  <button
                    type="button"
                    className="btn-ghost !py-1.5 !px-3 text-xs"
                    onClick={() => setReplayKey((key) => key + 1)}
                    disabled={!creative.preview_ready}
                  >
                    ↻ Replay
                  </button>
                </div>
                <div className="mt-4 flex min-h-[18rem] items-center justify-center overflow-auto rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:min-h-[22rem]">
                  {creative.preview_ready ? (
                    <iframe
                      key={replayKey}
                      title={`Preview ${creative.name}`}
                      src={creative.preview_url}
                      width={creative.width}
                      height={creative.height}
                      sandbox={IFRAME_SANDBOX}
                      className="block max-w-none shrink-0 border-0 bg-white shadow-sm"
                    />
                  ) : (
                    <div className="max-w-md text-center">
                      <p className="font-semibold">Creative file needs attention</p>
                      <p className="mt-2 text-sm text-[var(--muted)]">
                        The creative entry file could not be found in storage. Upload the ZIP again to preview it.
                      </p>
                      {canUpload && (
                        <Link
                          href={`/dashboard/campaigns?c=${encodeURIComponent(creative.campaign.id)}&fix=${encodeURIComponent(creative.id)}`}
                          className="btn-primary mt-4 inline-flex"
                        >
                          Fix upload
                        </Link>
                      )}
                    </div>
                  )}
                </div>
                <p className="mt-2 text-center text-xs text-[var(--muted)]">
                  {creative.width} × {creative.height} px · Actual size · HTML5
                </p>

                <div className="mt-5 rounded-xl border border-indigo-300/10 bg-indigo-400/[0.08] p-4">
                  <h3 className="text-sm font-semibold text-indigo-100">Try the ad’s call to action</h3>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                    Review the destination without opening it in another page.
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-[var(--muted)]">
                    {clickThroughChecked ? "Click-through destination checked." : "No click-through check yet."}
                  </p>
                  <button
                    type="button"
                    className="btn-ghost !py-1.5 !px-3 text-xs"
                    onClick={() => {
                      setShowDestination((shown) => !shown);
                      setClickThroughChecked(true);
                    }}
                    disabled={!creative.preview_ready}
                  >
                    {showDestination ? "Hide destination" : "Test click-through"}
                  </button>
                </div>
                {showDestination && (
                  <div className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3">
                    <p className="text-xs font-medium">Click-through destination</p>
                    <p className="mt-1 break-all text-xs text-[var(--muted)]">
                      {creative.click_url || "No click-through URL is configured for this creative."}
                    </p>
                  </div>
                )}
              </Card>

              <div className="grid gap-5">
                <Card className="p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-semibold">Creative details</h2>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        creative.preview_ready
                          ? "bg-emerald-400/10 text-emerald-200"
                          : "bg-amber-400/10 text-amber-200"
                      }`}
                    >
                      {creative.preview_ready ? "File checked" : "Needs attention"}
                    </span>
                  </div>
                  <dl className="mt-4 space-y-3 text-xs">
                    <div className="flex justify-between gap-4">
                      <dt className="text-[var(--muted)]">Brand</dt>
                      <dd className="text-right">{creative.campaign.advertiser?.name ?? "—"}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-[var(--muted)]">Campaign</dt>
                      <dd className="text-right">{creative.campaign.name}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-[var(--muted)]">Format</dt>
                      <dd className="text-right">HTML5 · {creative.width} × {creative.height}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-[var(--muted)]">Entry file</dt>
                      <dd className="text-right">{creative.entry_file || "index.html"}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-[var(--muted)]">Extracted size</dt>
                      <dd className="text-right">{formatFileSize(creative.file_size)}</dd>
                    </div>
                    <div className="border-t border-[var(--line)] pt-3">
                      <dt className="text-[var(--muted)]">Click-through URL</dt>
                      <dd className="mt-1 break-all">{creative.click_url || "Not configured"}</dd>
                    </div>
                  </dl>
                  {canUpload && (
                    <Link
                      href={`/dashboard/campaigns?c=${encodeURIComponent(creative.campaign.id)}&fix=${encodeURIComponent(creative.id)}`}
                      className="btn-link mt-4 inline-flex text-xs"
                    >
                      Edit creative details
                    </Link>
                  )}
                </Card>

                <Card className="p-5">
                  <h2 className="font-semibold">Review checklist</h2>
                  <div className="mt-4 space-y-4">
                    <CheckRow
                      title={creative.preview_ready ? "File check passed" : "File check needs attention"}
                      description={
                        creative.preview_ready
                          ? `${creative.entry_file || "index.html"} is present and the creative can be previewed.`
                          : "The entry file is missing from storage. Upload the creative ZIP again."
                      }
                      checked={creative.preview_ready}
                    />
                    <CheckRow
                      title="Review the visual"
                      description="Check that the creative fits the size and its content is legible."
                      checked={visualReviewed}
                      onChange={() => setVisualReviewed((checked) => !checked)}
                    />
                    <CheckRow
                      title="Test the click-through"
                      description="Check the destination shown above without navigating away."
                      checked={clickThroughChecked}
                      onChange={() => {
                        setClickThroughChecked((checked) => !checked);
                        setShowDestination(true);
                      }}
                    />
                  </div>
                  {!creative.preview_ready && (
                    <p className="mt-4 border-t border-[var(--line)] pt-3 text-xs text-amber-200">
                      Resolve the upload issue before continuing to ad tags.
                    </p>
                  )}
                </Card>
              </div>
            </div>
          </>
        )}

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--line)] bg-[var(--card)]/95 px-4 py-3 backdrop-blur sm:px-6">
          <div className="mx-auto flex max-w-[90rem] items-center justify-between gap-3">
            <Link href="/dashboard/creatives" className="btn-ghost !py-2 !px-3 text-xs sm:text-sm">
              ← <span className="ml-1">Back to creatives</span>
            </Link>
            <button
              type="button"
              className="btn-primary !py-2 !px-3 text-xs sm:!px-4 sm:text-sm"
              onClick={continueToAdTag}
              disabled={!canContinue}
            >
              Continue to ad tag →
            </button>
          </div>
        </div>
      </div>
    </PermissionGate>
  );
}
