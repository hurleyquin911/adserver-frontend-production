"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import PermissionGate from "@/components/PermissionGate";
import { Card, ErrorBanner, PageHeader } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type CreativeOption = {
  id: string;
  name: string;
  width: number;
  height: number;
  status: string;
  campaign: {
    id: string;
    name: string;
    advertiser?: { id: string; name: string };
  };
};

type MacroSet = {
  id: string;
  label: string;
  group?: string;
  cachebuster: string;
  click: string;
  click_enc: string;
  click_enc_enc?: string | null;
  notes?: string | null;
};

type SizeSnippet = {
  size: string;
  width: number;
  height: number;
  script: string;
  iframe: string;
  html: string;
  eligible_count: number;
  macro_set?: string;
  common?: boolean;
};

type TagData = {
  js: string | null;
  iframe: string | null;
  html?: string | null;
  primary_size?: string | null;
  advertiser?: {
    id: string;
    name: string;
    tag_key: string;
    status: string;
  };
  creative?: {
    id: string;
    name: string;
    status: string;
    width: number;
    height: number;
    campaign: { id: string; name: string; status: string };
  } | null;
  macros?: {
    active: MacroSet;
    sets: MacroSet[];
  };
  sizes?: SizeSnippet[];
};

type GeneratedTag = {
  size: string;
  format: "script" | "iframe" | "html";
  macro: MacroSet;
  value: string;
  script: string;
  iframe: string;
};

function CopyBlock({
  label,
  value,
  hint,
  reveal,
}: {
  label: string;
  value: string;
  hint?: string;
  reveal?: boolean;
}) {
  const [done, setDone] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  }
  return (
    <div
      className={`rounded-xl border border-[var(--line)] bg-[var(--card)] p-4${
        reveal ? " tag-result-reveal" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--ink)]">{label}</p>
        <button type="button" className="btn-ghost" onClick={copy}>
          {done ? "Tersalin" : "Salin"}
        </button>
      </div>
      {hint && <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>}
      <pre className="mt-2 overflow-x-auto rounded-lg bg-[var(--field)] p-3 text-xs text-[var(--ink-soft)]">
        {value}
      </pre>
    </div>
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function TagPage() {
  return (
    <Suspense fallback={<p className="py-8 text-center text-sm text-[var(--muted)]">Memuat katalog tag...</p>}>
      <TagPageContent />
    </Suspense>
  );
}

function TagPageContent() {
  const searchParams = useSearchParams();
  const requestedCreativeId = searchParams.get("creative_id") || "";
  const [creatives, setCreatives] = useState<CreativeOption[]>([]);
  const [creativeId, setCreativeId] = useState(requestedCreativeId);
  const [catalog, setCatalog] = useState<TagData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bootLoading, setBootLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(false);

  const [macroId, setMacroId] = useState<string>("dv360");
  const [format, setFormat] = useState<"script" | "iframe" | "html">("script");

  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<GeneratedTag | null>(null);
  const [resultKey, setResultKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function loadCreatives() {
      setBootLoading(true);
      setError(null);
      try {
        const result = await api<{ data: CreativeOption[] }>("/api/creatives");
        if (cancelled) return;
        setCreatives(result.data);
        const selected = result.data.find((creative) => creative.id === requestedCreativeId);
        setCreativeId(selected?.id ?? "");
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Gagal memuat creative");
        }
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    }
    void loadCreatives();
    return () => {
      cancelled = true;
    };
  }, [requestedCreativeId]);

  useEffect(() => {
    let cancelled = false;
    async function loadCatalog() {
      if (!creativeId) {
        setCatalog(null);
        setCatalogLoading(false);
        return;
      }
      setCatalogLoading(true);
      setGenerated(null);
      try {
        const params = new URLSearchParams();
        params.set("creative_id", creativeId);
        params.set("macros", "dv360");
        const r = await api<{ data: TagData }>(`/api/tag?${params}`);
        if (cancelled) return;
        setCatalog(r.data);
        setMacroId(r.data.macros?.sets?.[0]?.id || "dv360");
      } catch (e) {
        if (!cancelled) {
          setCatalog(null);
          setError(e instanceof ApiError ? e.message : "Gagal memuat tag creative");
        }
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    }
    void loadCatalog();
    return () => {
      cancelled = true;
    };
  }, [creativeId]);

  const macroSets = useMemo(() => catalog?.macros?.sets || [], [catalog]);
  const macroGroups = useMemo(() => {
    const map = new Map<string, MacroSet[]>();
    for (const m of macroSets) {
      const g = m.group || "Lainnya";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(m);
    }
    return [...map.entries()];
  }, [macroSets]);

  const selectedMacroMeta = useMemo(
    () => macroSets.find((m) => m.id === macroId) || macroSets[0] || null,
    [macroSets, macroId]
  );

  const selectedCreative = creatives.find((creative) => creative.id === creativeId) || null;
  const sizeKey = selectedCreative ? `${selectedCreative.width}x${selectedCreative.height}` : "";

  const generate = useCallback(async () => {
    if (!creativeId) return;
    setGenerating(true);
    setError(null);
    setGenerated(null);
    try {
      const params = new URLSearchParams();
      params.set("creative_id", creativeId);
      params.set("macros", macroId);
      const [r] = await Promise.all([
        api<{ data: TagData }>(`/api/tag?${params}`),
        sleep(750),
      ]);
      const sizes = r.data.sizes || [];
      const row = sizes[0];
      if (!row) throw new Error("Ukuran tag tidak tersedia");
      const macro = r.data.macros?.active || selectedMacroMeta;
      if (!macro) throw new Error("Set macro tidak tersedia");
      const value =
        format === "iframe" ? row.iframe : format === "html" ? row.html : row.script;
      setGenerated({
        size: row.size,
        format,
        macro,
        value,
        script: row.script,
        iframe: row.iframe,
      });
      setResultKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal generate tag");
    } finally {
      setGenerating(false);
    }
  }, [creativeId, macroId, format, selectedMacroMeta]);

  return (
    <PermissionGate permission="campaign:read" redirect>
      <PageHeader
        eyebrow="Creative-specific"
        title="Ad tags DSP / SSP"
        subtitle="Pilih creative, lalu buat tag DSP yang hanya akan menayangkan creative tersebut."
      />
      <ErrorBanner message={error} />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:items-end">
          <label className="block text-sm font-medium text-[var(--ink)]">
            Creative
            <select
              className="field mt-1"
              value={creativeId}
              onChange={(e) => {
                setGenerated(null);
                setCatalog(null);
                setCreativeId(e.target.value);
              }}
              disabled={bootLoading || generating}
            >
              <option value="">Pilih creative</option>
              {creatives.map((creative) => (
                <option key={creative.id} value={creative.id}>
                  {creative.name} · {creative.width}×{creative.height} · {creative.campaign.name}
                </option>
              ))}
            </select>
          </label>
          {selectedCreative && (
            <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm">
              <p className="font-semibold">{selectedCreative.name}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {selectedCreative.campaign.advertiser?.name ?? selectedCreative.campaign.name}
                {" · "}{selectedCreative.campaign.name}
                {" · "}{sizeKey}
                {" · "}{selectedCreative.status}
              </p>
            </div>
          )}
        </div>
      </Card>

      {(bootLoading || catalogLoading) && (
        <p className="mt-4 text-sm text-[var(--muted)]">
          {bootLoading ? "Memuat daftar creative..." : "Memuat opsi tag creative..."}
        </p>
      )}
      {!bootLoading && !creatives.length && (
        <Card className="p-6 text-center">
          <p className="font-semibold">Belum ada creative</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Upload dan review creative terlebih dahulu sebelum membuat ad tag.
          </p>
        </Card>
      )}

      {catalog && !catalogLoading && (
        <Card className="mt-4 p-5">
          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
            <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5">
              <p className="text-xs text-[var(--muted)]">Creative size</p>
              <p className="mt-1 text-sm font-semibold">{sizeKey}</p>
            </div>
            <label className="block text-sm font-medium">
              Platform / set macro
              <select
                className="field mt-1"
                value={macroId}
                onChange={(e) => {
                  setGenerated(null);
                  setMacroId(e.target.value);
                }}
                disabled={generating}
              >
                {macroGroups.map(([group, items]) => (
                  <optgroup key={group} label={group}>
                    {items.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Format tag
              <select
                className="field mt-1"
                value={format}
                onChange={(e) => {
                  setGenerated(null);
                  setFormat(e.target.value as "script" | "iframe" | "html");
                }}
                disabled={generating}
              >
                <option value="script">JavaScript (paling umum)</option>
                <option value="iframe">Iframe</option>
                <option value="html">HTML wrapper</option>
              </select>
            </label>
            <button
              type="button"
              className={`btn-primary mt-1 inline-flex min-h-[2.75rem] items-center justify-center gap-2 px-5${
                generating ? " tag-generate-pulse opacity-90" : ""
              }`}
              onClick={() => generate()}
              disabled={generating || !creativeId || catalogLoading}
            >
              {generating ? (
                <>
                  <span className="tag-generate-spin" aria-hidden />
                  Generating…
                </>
              ) : (
                "Generate"
              )}
            </button>
          </div>

          {selectedMacroMeta && !generating && !generated && (
            <p className="mt-3 text-xs text-[var(--muted)]">
              Siap generate · {selectedMacroMeta.label} · {sizeKey} · {format}
            </p>
          )}

          {generating && (
            <div className="mt-6 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--line)] bg-[var(--field)] px-4 py-10 tag-generate-pulse">
              <span className="tag-generate-spin" style={{ width: "1.75rem", height: "1.75rem" }} />
              <p className="text-sm font-medium text-[var(--ink-soft)]">Menyusun tag…</p>
              <p className="text-xs text-[var(--muted)]">
                {selectedMacroMeta?.label || macroId} · {sizeKey} · {format}
              </p>
            </div>
          )}

          {!generating && !generated && (
            <div className="mt-6 rounded-xl border border-dashed border-[var(--line)] px-4 py-8 text-center text-sm text-[var(--muted)]">
              Pilih opsi di atas, lalu tekan <strong className="text-[var(--ink-soft)]">Generate</strong>{" "}
              untuk menampilkan tag.
            </div>
          )}

          {!generating && generated && (
            <div key={resultKey} className="mt-4 space-y-4">
              <div className="rounded-lg border border-[var(--line)] bg-[var(--field)] px-3 py-2 text-xs text-[var(--muted)] tag-result-reveal">
                <span className="font-medium text-[var(--ink-soft)]">Macro:</span>{" "}
                cachebuster{" "}
                <code className="text-[var(--ink)]">{generated.macro.cachebuster}</code>
                {" · "}
                click <code className="text-[var(--ink)]">{generated.macro.click}</code>
                {" · "}
                click (enc){" "}
                <code className="text-[var(--ink)]">{generated.macro.click_enc}</code>
              </div>
              <CopyBlock
                reveal
                label={`Tag ${generated.size} · ${generated.macro.label} · ${generated.format}`}
                hint="Tempel ke creative third-party di DSP/SSP."
                value={generated.value}
              />
              <div className="grid gap-4 lg:grid-cols-2">
                <CopyBlock reveal label="Script" value={generated.script} />
                <CopyBlock reveal label="Iframe" value={generated.iframe} />
              </div>
            </div>
          )}
        </Card>
      )}
    </PermissionGate>
  );
}
