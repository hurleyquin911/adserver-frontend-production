"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import PermissionGate from "@/components/PermissionGate";
import { Card, ErrorBanner, PageHeader } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { isSuperadmin } from "@/lib/roles";

type BrandOpt = { id: string; name: string; status?: string };

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
  const requestedAdvertiserId = searchParams.get("advertiser_id") || "";
  const requestedSize = searchParams.get("size") || "";
  const { user } = useAuth();
  const amSuperadmin = isSuperadmin(user?.role?.name);
  const [brands, setBrands] = useState<BrandOpt[]>([]);
  const [advertiserId, setAdvertiserId] = useState<string>("");
  const [catalog, setCatalog] = useState<TagData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bootLoading, setBootLoading] = useState(true);

  const [sizeKey, setSizeKey] = useState<string>("300x250");
  const [macroId, setMacroId] = useState<string>("dv360");
  const [format, setFormat] = useState<"script" | "iframe" | "html">("script");

  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<GeneratedTag | null>(null);
  const [resultKey, setResultKey] = useState(0);

  useEffect(() => {
    if (!amSuperadmin) return;
    api<{ data: BrandOpt[] }>("/api/advertisers")
      .then((r) => {
        const active = r.data.filter((b) => b.status !== "inactive");
        const available = active.length ? active : r.data;
        setBrands(available);
        const requested = available.find((brand) => brand.id === requestedAdvertiserId);
        if (requested) setAdvertiserId(requested.id);
        else if (!advertiserId && available[0]) setAdvertiserId(available[0].id);
      })
      .catch(() => setBrands([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amSuperadmin, requestedAdvertiserId]);

  /** Katalog awal: daftar ukuran + set macro (tanpa regenerate tiap ganti opsi). */
  useEffect(() => {
    let cancelled = false;
    async function loadCatalog() {
      setBootLoading(true);
      setError(null);
      setGenerated(null);
      try {
        if (amSuperadmin && !advertiserId) {
          setCatalog(null);
          setBootLoading(false);
          return;
        }
        const params = new URLSearchParams();
        if (amSuperadmin && advertiserId) params.set("advertiser_id", advertiserId);
        params.set("macros", "dv360");
        const r = await api<{ data: TagData }>(`/api/tag?${params}`);
        if (cancelled) return;
        setCatalog(r.data);
        const sizes = r.data.sizes || [];
        setSizeKey(
          sizes.find((size) => size.size === requestedSize)?.size ||
            r.data.primary_size ||
            sizes[0]?.size ||
            "300x250"
        );
        setMacroId(r.data.macros?.sets?.[0]?.id || "dv360");
      } catch (e) {
        if (!cancelled) {
          setCatalog(null);
          setError(e instanceof ApiError ? e.message : "Gagal memuat katalog tag");
        }
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    }
    loadCatalog();
    return () => {
      cancelled = true;
    };
  }, [amSuperadmin, advertiserId, requestedSize]);

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

  const sizeOptions = catalog?.sizes || [];

  const generate = useCallback(async () => {
    if (amSuperadmin && !advertiserId) return;
    setGenerating(true);
    setError(null);
    setGenerated(null);
    try {
      const params = new URLSearchParams();
      if (amSuperadmin && advertiserId) params.set("advertiser_id", advertiserId);
      params.set("macros", macroId);
      const [r] = await Promise.all([
        api<{ data: TagData }>(`/api/tag?${params}`),
        sleep(750),
      ]);
      const sizes = r.data.sizes || [];
      const row = sizes.find((s) => s.size === sizeKey) || sizes[0];
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
  }, [amSuperadmin, advertiserId, macroId, sizeKey, format, selectedMacroMeta]);

  return (
    <PermissionGate permission="campaign:read" redirect>
      <PageHeader
        eyebrow="Third-party"
        title="Ad tags DSP / SSP"
        subtitle="Atur ukuran, platform, dan format — lalu Generate untuk membuat tag."
      />
      <ErrorBanner message={error} />

      {amSuperadmin && (
        <Card className="mb-4 p-4">
          <label className="block text-sm font-medium text-[var(--ink)]">
            Brand
            <select
              className="field mt-1"
              value={advertiserId}
              onChange={(e) => {
                setGenerated(null);
                setAdvertiserId(e.target.value);
              }}
            >
              {!brands.length && <option value="">Belum ada brand</option>}
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        </Card>
      )}

      {bootLoading && <p className="mt-4 text-sm text-[var(--muted)]">Memuat…</p>}

      {catalog && !bootLoading && (
        <Card className="mt-4 p-5">
          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
            <label className="block text-sm font-medium">
              Ukuran (IAB)
              <select
                className="field mt-1"
                value={sizeKey}
                onChange={(e) => {
                  setGenerated(null);
                  setSizeKey(e.target.value);
                }}
                disabled={generating}
              >
                {sizeOptions.map((s) => (
                  <option key={s.size} value={s.size}>
                    {s.size}
                    {s.eligible_count > 0
                      ? ` · ${s.eligible_count} creative`
                      : " · belum ada creative"}
                  </option>
                ))}
              </select>
            </label>
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
              disabled={generating || (amSuperadmin && !advertiserId)}
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
