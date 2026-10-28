"use client";

import Link from "next/link";
import { ChangeEvent, DragEvent, FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PermissionGate from "@/components/PermissionGate";
import { Card, ErrorBanner, PageHeader } from "@/components/ui";
import { ApiError, api, apiFormData } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { isAdmin, isSuperadmin } from "@/lib/roles";

type Campaign = {
  id: string;
  name: string;
  advertiser_id: string;
  advertiser?: { id: string; name: string };
};

type Brand = { id: string; name: string; status: string };

type CreativeDetails = {
  id: string;
  name: string;
  width: number;
  height: number;
  click_url: string | null;
  campaign: Campaign;
};

const fieldClass = "field";

function Step({
  number,
  label,
  active = false,
}: {
  number: number;
  label: string;
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
          active ? "bg-indigo-500 text-white" : "bg-[var(--surface-2)] text-[var(--muted)]"
        }`}
      >
        {number}
      </span>
      {label}
    </div>
  );
}

function UploadCreativeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, hasPermission } = useAuth();
  const superadmin = isSuperadmin(user?.role?.name);
  const canOrganizeBrands = superadmin || isAdmin(user?.role?.name);
  const canWriteCampaign = hasPermission("campaign:write");
  const fixId = searchParams.get("fix");
  const initialCampaignId = searchParams.get("campaign_id") || "";
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [campaignId, setCampaignId] = useState(initialCampaignId);
  const [brandId, setBrandId] = useState("");
  const [name, setName] = useState("");
  const [width, setWidth] = useState("300");
  const [height, setHeight] = useState("250");
  const [clickUrl, setClickUrl] = useState("");
  const [showCreateBrand, setShowCreateBrand] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");
  const [newBrandWebsite, setNewBrandWebsite] = useState("");
  const [creatingBrand, setCreatingBrand] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadFormData() {
      try {
        const [campaignResult, brandResult, creativeResult] = await Promise.all([
          api<{ data: Campaign[] }>("/api/campaigns"),
          api<{ data: Brand[] }>("/api/advertisers"),
          fixId
            ? api<{ data: CreativeDetails }>(`/api/creatives/${encodeURIComponent(fixId)}`)
            : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setCampaigns(campaignResult.data);
        setBrands(brandResult.data);
        if (creativeResult) {
          setCampaignId(creativeResult.data.campaign.id);
          setBrandId(creativeResult.data.campaign.advertiser_id);
          setName(creativeResult.data.name);
          setWidth(String(creativeResult.data.width));
          setHeight(String(creativeResult.data.height));
          setClickUrl(creativeResult.data.click_url || "");
        } else if (initialCampaignId) {
          setCampaignId(initialCampaignId);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Gagal memuat data upload");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadFormData();
    return () => {
      cancelled = true;
    };
  }, [fixId, initialCampaignId]);

  const availableCampaigns = useMemo(
    () => campaigns.filter((campaign) => !brandId || campaign.advertiser_id === brandId),
    [campaigns, brandId]
  );

  async function createBrand() {
    const trimmedName = newBrandName.trim();
    if (!trimmedName) {
      setError("Masukkan nama Brand.");
      return;
    }
    setCreatingBrand(true);
    setError(null);
    try {
      const result = await api<{ data: Brand }>("/api/advertisers", {
        method: "POST",
        json: {
          name: trimmedName,
          website_url: newBrandWebsite.trim() || null,
          status: "active",
        },
      });
      setBrands((current) => [...current, result.data].sort((a, b) => a.name.localeCompare(b.name)));
      setBrandId(result.data.id);
      setCampaignId("");
      setNewBrandName("");
      setNewBrandWebsite("");
      setShowCreateBrand(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal membuat Brand.");
    } finally {
      setCreatingBrand(false);
    }
  }

  function chooseFile(selected: File | null) {
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith(".zip")) {
      setError("Pilih file creative dengan format .zip.");
      setFile(null);
      return;
    }
    setError(null);
    setFile(selected);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    chooseFile(event.target.files?.[0] ?? null);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files?.[0] ?? null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!file && !fixId) {
      setError("Pilih file creative ZIP terlebih dahulu.");
      return;
    }
    if (!campaignId) {
      setError("Pilih campaign untuk creative ini.");
      return;
    }
    const parsedWidth = Number(width);
    const parsedHeight = Number(height);
    if (!Number.isInteger(parsedWidth) || parsedWidth < 1 || !Number.isInteger(parsedHeight) || parsedHeight < 1) {
      setError("Lebar dan tinggi harus berupa bilangan bulat lebih besar dari 0.");
      return;
    }

    setSaving(true);
    try {
      const body = new FormData();
      if (file) body.append("file", file);
      body.append("name", name.trim());
      body.append("width", String(parsedWidth));
      body.append("height", String(parsedHeight));
      body.append("click_url", clickUrl.trim());
      if (fixId) {
        await apiFormData(`/api/creatives/${encodeURIComponent(fixId)}`, body, "PATCH");
        router.push(`/dashboard/creatives/${encodeURIComponent(fixId)}`);
      } else {
        body.append("campaign_id", campaignId);
        const result = await apiFormData<{ data: { id: string } }>("/api/creatives", body);
        router.push(`/dashboard/creatives/${encodeURIComponent(result.data.id)}`);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal mengunggah creative.");
      setSaving(false);
    }
  }

  const selectedCampaign = campaigns.find((campaign) => campaign.id === campaignId);

  return (
    <PermissionGate permission="creative:upload" redirect>
      <div className="pb-8">
        <PageHeader
          title={fixId ? "Replace creative file" : "Upload creative"}
          subtitle="Add an HTML5 ZIP, then check the creative before generating an ad tag."
        />
        <ErrorBanner message={error} />

        <div className="mb-5 grid gap-3 md:grid-cols-3">
          <Step number={1} label="Upload creative" active />
          <Step number={2} label="Preview & review" />
          <Step number={3} label="Generate ad tag" />
        </div>

        <form onSubmit={onSubmit}>
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(20rem,0.9fr)]">
            <Card className="p-5 sm:p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <h2 className="font-semibold">Creative details</h2>
                <span className="rounded-full bg-indigo-400/10 px-3 py-1 text-xs font-medium text-indigo-200">
                  Step 1 of 3
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-medium">
                  Creative name
                  <input
                    required
                    maxLength={255}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className={fieldClass}
                    placeholder="e.g. Fieldwork — Summer collection"
                    disabled={loading || saving}
                  />
                </label>
                <label className="block text-sm font-medium">
                  Click-through URL
                  <input
                    type="url"
                    value={clickUrl}
                    onChange={(event) => setClickUrl(event.target.value)}
                    className={fieldClass}
                    placeholder="https://your-website.com"
                    disabled={loading || saving}
                  />
                  <span className="mt-1 block text-xs font-normal text-[var(--muted)]">
                    Where users go when they click the ad.
                  </span>
                </label>
              </div>

              <div className="my-6 border-t border-[var(--line)]" />
              <div>
                <h3 className="text-sm font-semibold">
                  Organize your creative <span className="ml-1 text-xs font-normal text-[var(--muted)]">Optional brand filter</span>
                </h3>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  The campaign is required for delivery. You can update its details later.
                </p>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {canOrganizeBrands && (
                  <label className="block text-sm font-medium">
                    Brand
                    <select
                      className={fieldClass}
                      value={brandId}
                      onChange={(event) => {
                        setBrandId(event.target.value);
                        setCampaignId("");
                      }}
                      disabled={loading || saving}
                    >
                      <option value="">All brands</option>
                      {brands.map((brand) => (
                        <option key={brand.id} value={brand.id}>{brand.name}</option>
                      ))}
                    </select>
                    <span className="mt-1 block text-xs font-normal text-[var(--muted)]">
                      Filters the campaign list; the selected campaign determines the brand.
                    </span>
                  </label>
                )}
                <label className={`block text-sm font-medium ${canOrganizeBrands ? "" : "md:col-span-2"}`}>
                  Campaign <span className="text-rose-300">*</span>
                  <select
                    required
                    className={fieldClass}
                    value={campaignId}
                    onChange={(event) => setCampaignId(event.target.value)}
                    disabled={loading || saving || Boolean(fixId)}
                  >
                    <option value="">Select a campaign</option>
                    {availableCampaigns.map((campaign) => (
                      <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
                    ))}
                  </select>
                  {selectedCampaign?.advertiser?.name && (
                    <span className="mt-1 block text-xs font-normal text-[var(--muted)]">
                      Brand: {selectedCampaign.advertiser.name}
                    </span>
                  )}
                  {!loading && availableCampaigns.length === 0 && (
                    <span className="mt-1 block text-xs font-normal text-amber-200">
                      No campaign available. Create a campaign before uploading.
                    </span>
                  )}
                </label>
              </div>
              {canOrganizeBrands && !fixId && (
                <div className="mt-3">
                  {!showCreateBrand ? (
                    <button
                      type="button"
                      className="btn-link text-xs"
                      onClick={() => setShowCreateBrand(true)}
                    >
                      + Create brand
                    </button>
                  ) : (
                    <div className="grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
                      <label className="block text-xs font-medium">
                        Brand name
                        <input
                          required
                          maxLength={255}
                          value={newBrandName}
                          onChange={(event) => setNewBrandName(event.target.value)}
                          className="field"
                          disabled={creatingBrand}
                        />
                      </label>
                      <label className="block text-xs font-medium">
                        Website (optional)
                        <input
                          type="url"
                          value={newBrandWebsite}
                          onChange={(event) => setNewBrandWebsite(event.target.value)}
                          className="field"
                          placeholder="https://example.com"
                          disabled={creatingBrand}
                        />
                      </label>
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => setShowCreateBrand(false)}
                        disabled={creatingBrand}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={createBrand}
                        disabled={creatingBrand || !newBrandName.trim()}
                      >
                        {creatingBrand ? "Creating..." : "Create brand"}
                      </button>
                    </div>
                  )}
                </div>
              )}
              {brandId && availableCampaigns.length === 0 && !fixId && canWriteCampaign && (
                <div className="mt-3 rounded-lg border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-sm">
                  <p>No campaign exists for this Brand yet.</p>
                  <Link
                    className="btn-link mt-1 inline-flex text-xs"
                    href={`/dashboard/campaigns?advertiser_id=${encodeURIComponent(brandId)}`}
                  >
                    Create a campaign →
                  </Link>
                </div>
              )}

              <div className="my-6 border-t border-[var(--line)]" />
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">Creative size</h3>
                <span className="text-xs text-[var(--muted)]">Dimensions in pixels</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  Width
                  <input
                    required
                    type="number"
                    min="1"
                    step="1"
                    value={width}
                    onChange={(event) => setWidth(event.target.value)}
                    className={fieldClass}
                    disabled={loading || saving}
                  />
                </label>
                <label className="block text-sm font-medium">
                  Height
                  <input
                    required
                    type="number"
                    min="1"
                    step="1"
                    value={height}
                    onChange={(event) => setHeight(event.target.value)}
                    className={fieldClass}
                    disabled={loading || saving}
                  />
                </label>
              </div>

              <div className="mt-6">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">Creative file</h3>
                  <span className="text-xs text-[var(--muted)]">HTML5 · .zip</span>
                </div>
                <label
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  className={`flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-5 py-8 text-center transition-colors ${
                    dragging
                      ? "border-indigo-300 bg-indigo-400/10"
                      : "border-indigo-300/40 bg-[var(--surface)] hover:bg-[var(--surface-2)]"
                  }`}
                >
                  <input
                    type="file"
                    accept=".zip,application/zip"
                    className="sr-only"
                    onChange={onFileChange}
                    disabled={saving}
                  />
                  <svg className="h-7 w-7 text-indigo-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L8 8m4-4 4 4M5 14v5h14v-5" />
                  </svg>
                  <span className="mt-3 font-semibold">
                    {file?.name ?? (fixId ? "Drop replacement ZIP here" : "Drop your creative ZIP here")}
                  </span>
                  <span className="mt-1 text-xs text-[var(--muted)]">
                    or choose a file from your computer
                  </span>
                  <span className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--card)] px-3 py-2 text-xs font-medium">
                    Choose ZIP file
                  </span>
                  {file && (
                    <span className="mt-2 text-xs text-[var(--muted)]">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  )}
                  {fixId && !file && (
                    <span className="mt-2 text-xs text-[var(--muted)]">
                      Choose a replacement file to continue.
                    </span>
                  )}
                </label>
              </div>
            </Card>

            <div className="grid gap-4">
              <Card className="p-5">
                <h2 className="font-semibold">A quick file check</h2>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  A clear starting point for your HTML5 creative.
                </p>
                <div className="mt-5 space-y-5">
                  <CheckItem
                    title="Keep index.html at the root"
                    detail="ZIP the HTML file together with its assets, without an enclosing folder."
                  />
                  <CheckItem
                    title="Include local assets"
                    detail="Keep images, styles, and scripts inside the ZIP."
                  />
                  <CheckItem
                    title="Set your ad size"
                    detail="Enter the creative dimensions above. The ZIP must contain index.html."
                  />
                </div>
              </Card>
              <div className="rounded-xl border border-indigo-300/10 bg-indigo-400/[0.08] p-5">
                <h2 className="text-sm font-semibold text-indigo-100">Review before generating a tag</h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                  Check the layout, dimensions, and click-through URL in the next step.
                </p>
              </div>
              {!loading && campaigns.length === 0 && (
                <Link href="/dashboard/campaigns" className="btn-ghost justify-center">
                  Go to Campaigns
                </Link>
              )}
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
            <Link href="/dashboard/creatives" className="btn-ghost">
              Cancel
            </Link>
            <button
              type="submit"
              className="btn-primary inline-flex items-center gap-2"
              disabled={loading || saving || campaigns.length === 0 || (!file && !fixId)}
            >
              {saving ? "Uploading..." : "Continue to preview"}
              {!saving && <span aria-hidden>→</span>}
            </button>
          </div>
        </form>
      </div>
    </PermissionGate>
  );
}

function CheckItem({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-sm font-semibold text-emerald-300" aria-hidden>✓</span>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{detail}</p>
      </div>
    </div>
  );
}

export default function UploadCreativePage() {
  return (
    <Suspense fallback={<p className="py-8 text-center text-sm text-[var(--muted)]">Loading upload form...</p>}>
      <UploadCreativeContent />
    </Suspense>
  );
}
