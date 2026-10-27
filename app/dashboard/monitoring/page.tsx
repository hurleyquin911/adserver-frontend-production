"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import PermissionGate from "@/components/PermissionGate";
import { Card, ErrorBanner, PageHeader, StatusBadge } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

const OVERVIEW_MS = 12_000;
const LOGS_MS = 2_500;
const LOG_LIMIT = 50;

type Pm2Proc = {
  name: string;
  status: string;
  pid: number | null;
  cpu: number | null;
  memory: number | null;
  memory_label: string;
  restarts: number;
  uptime_ms: number | null;
};

type LogTail = {
  path: string;
  lines: string[];
  size: number;
  mtime: string | null;
  missing?: boolean;
};

type MonitoringData = {
  generated_at: string;
  app: {
    name: string;
    env: string;
    version: string;
    public_base_url: string;
    frontend_origin: string;
    node: string;
    pid: number;
    uptime_sec: number;
    started_at: string;
  };
  process: {
    memory: {
      rss_label: string;
      heap_used_label: string;
      heap_total_label: string;
    };
    cpu_count: number;
    loadavg: { "1m": number; "5m": number; "15m": number };
    hostname: string;
    platform: string;
    freemem_label: string;
    totalmem_label: string;
  };
  database: { status: string; error: string | null };
  event_buffer: {
    pending: number;
    flushing: boolean;
    interaction_keys: number;
  };
  inventory: {
    publishers: number;
    publishers_pending: number;
    publishers_active: number;
    publishers_blocked: number;
    campaigns: number;
    campaigns_active: number;
    creatives: number;
    users_active: number;
    events_24h: number;
  };
  storage: {
    creatives: { bytes_label: string; files: number; truncated?: boolean };
    disk: {
      path: string;
      used_label: string;
      available_label: string;
      total_label: string;
      used_pct: number | null;
    } | null;
  };
  pm2: Pm2Proc[] | null;
};

type LogsPayload = {
  generated_at: string;
  out: LogTail;
  error: LogTail;
};

function fmtUptime(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

function fmtUptimeMs(ms: number | null) {
  if (ms == null) return "-";
  return fmtUptime(ms / 1000);
}

function Metric({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="metric-card">
      <p className="text-[0.68rem] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-1.5 text-xl font-semibold tracking-tight tabular-nums text-[var(--ink)]">
        {value}
      </p>
      {hint && <p className="mt-1 text-[0.7rem] text-[var(--muted)]">{hint}</p>}
    </div>
  );
}

function parseAccessLog(line: string) {
  const m = line.match(
    /^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"([A-Z]+)\s+([^"]*?)\s+HTTP\/[^"]+"\s+(\d{3})\s+(\S+)(?:\s+"([^"]*)"\s+"([^"]*)")?/
  );
  if (!m) return null;
  return {
    ip: m[1],
    time: m[2],
    method: m[3],
    path: m[4],
    status: m[5],
    size: m[6] === "-" ? null : m[6],
    referrer: m[7] && m[7] !== "-" ? m[7] : null,
    ua: m[8] && m[8] !== "-" ? m[8] : null,
  };
}

function statusTone(status: string) {
  const n = Number(status);
  if (n >= 500) return "text-rose-300";
  if (n >= 400) return "text-amber-300";
  if (n >= 300) return "text-sky-300";
  if (n >= 200) return "text-emerald-300";
  return "text-zinc-300";
}

type LogEntry = { id: string; line: string; animate: boolean };

function overlapSuffixPrefix(prev: string[], next: string[]) {
  const max = Math.min(prev.length, next.length);
  for (let k = max; k >= 0; k--) {
    let ok = true;
    for (let i = 0; i < k; i++) {
      if (prev[prev.length - k + i] !== next[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return k;
  }
  return 0;
}

function LogPanel({ title, log, live }: { title: string; log: LogTail | null; live: boolean }) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);
  const primedRef = useRef(false);
  const seqRef = useRef(0);
  const [entries, setEntries] = useState<LogEntry[]>([]);

  useEffect(() => {
    const nextLines = log?.lines ?? [];
    setEntries((prev) => {
      if (!primedRef.current) {
        primedRef.current = true;
        return nextLines.map((line) => ({
          id: `seed-${seqRef.current++}`,
          line,
          animate: false,
        }));
      }
      const prevLines = prev.map((e) => e.line);
      const k = overlapSuffixPrefix(prevLines, nextLines);
      const kept = prev.slice(prev.length - k).map((e) => ({ ...e, animate: false }));
      const addedLines = nextLines.slice(k);
      // Hindari flash massal jika window bergeser besar; animasikan paling banyak 8 terakhir.
      const animateFrom = addedLines.length > 8 ? addedLines.length - 8 : 0;
      const stamp = Date.now();
      const added = addedLines.map((line, i) => ({
        id: `new-${stamp}-${seqRef.current++}`,
        line,
        animate: i >= animateFrom,
      }));
      return [...kept, ...added];
    });
  }, [log?.lines]);

  useEffect(() => {
    const el = listRef.current;
    if (!el || !stickRef.current) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [entries]);

  function onScroll() {
    const el = listRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickRef.current = dist < 48;
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-0.5 text-[0.7rem] text-[var(--muted)]">
            {log?.path || "…"}
            {log?.mtime ? ` · ${new Date(log.mtime).toLocaleString("id-ID")}` : ""}
            {log?.missing ? " · file tidak ditemukan" : ""}
            {` · max ${LOG_LIMIT} baris`}
          </p>
        </div>
        {live && (
          <span className="inline-flex items-center gap-1.5 text-[0.68rem] font-medium text-emerald-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            Live
          </span>
        )}
      </div>
      <div
        ref={listRef}
        onScroll={onScroll}
        className="max-h-[26rem] space-y-2 overflow-auto bg-[var(--paper)] p-3"
      >
        {entries.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-[var(--muted)]">(kosong)</p>
        ) : (
          entries.map((entry) => {
            const parsed = parseAccessLog(entry.line);
            return (
              <article
                key={entry.id}
                className={`log-entry${entry.animate ? " log-entry-new" : ""}`}
              >
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  {parsed ? (
                    <>
                      <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.65rem] font-semibold text-zinc-200">
                        {parsed.method}
                      </span>
                      <span
                        className={`font-mono text-[0.7rem] font-semibold tabular-nums ${statusTone(parsed.status)}`}
                      >
                        {parsed.status}
                      </span>
                      <span className="truncate font-mono text-[0.68rem] text-zinc-500">
                        {parsed.time}
                      </span>
                    </>
                  ) : (
                    <span className="text-[0.68rem] text-zinc-500">raw</span>
                  )}
                </div>
                {parsed ? (
                  <div className="space-y-1">
                    <p className="break-all font-mono text-[0.75rem] leading-snug text-zinc-100">
                      {parsed.path}
                    </p>
                    <p className="font-mono text-[0.68rem] text-zinc-500">
                      {parsed.ip}
                      {parsed.size ? ` · ${parsed.size} B` : ""}
                    </p>
                    {parsed.referrer && (
                      <p
                        className="truncate font-mono text-[0.65rem] text-zinc-600"
                        title={parsed.referrer}
                      >
                        ref: {parsed.referrer}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="break-all font-mono text-[0.72rem] leading-relaxed text-zinc-300">
                    {entry.line}
                  </p>
                )}
              </article>
            );
          })
        )}
      </div>
    </Card>
  );
}

export default function MonitoringPage() {
  const [data, setData] = useState<MonitoringData | null>(null);
  const [logs, setLogs] = useState<LogsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [auto, setAuto] = useState(true);
  const overviewInflight = useRef(false);
  const logsInflight = useRef(false);

  const loadOverview = useCallback(async () => {
    if (overviewInflight.current) return;
    overviewInflight.current = true;
    try {
      const res = await api<{ data: MonitoringData }>("/api/monitoring");
      setData(res.data);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat monitoring");
    } finally {
      overviewInflight.current = false;
      setLoading(false);
    }
  }, []);

  const loadLogs = useCallback(async () => {
    if (logsInflight.current) return;
    logsInflight.current = true;
    try {
      const res = await api<{ data: LogsPayload }>(`/api/monitoring/logs?limit=${LOG_LIMIT}`);
      setLogs(res.data);
    } catch {
      /* log poll gagal tidak mengganti error overview */
    } finally {
      logsInflight.current = false;
    }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([loadOverview(), loadLogs()]);
  }, [loadOverview, loadLogs]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!auto) return;
    const overviewTimer = setInterval(() => {
      loadOverview().catch(() => undefined);
    }, OVERVIEW_MS);
    const logsTimer = setInterval(() => {
      loadLogs().catch(() => undefined);
    }, LOGS_MS);
    return () => {
      clearInterval(overviewTimer);
      clearInterval(logsTimer);
    };
  }, [auto, loadOverview, loadLogs]);

  const inv = data?.inventory;
  const proc = data?.process;
  const app = data?.app;

  return (
    <PermissionGate superadminOnly redirect>
      <PageHeader
        eyebrow="System"
        title="Monitoring Server"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
              <input
                type="checkbox"
                checked={auto}
                onChange={(e) => setAuto(e.target.checked)}
                className="rounded border-[var(--line)]"
              />
              Live refresh
            </label>
            <button type="button" className="btn-ghost" onClick={() => loadAll()} disabled={loading}>
              {loading ? "Memuat..." : "Muat ulang"}
            </button>
          </div>
        }
      />
      <ErrorBanner message={error} />

      {data && (
        <p className="mt-1 text-xs text-[var(--muted)]">
          Metrik {new Date(data.generated_at).toLocaleString("id-ID")}
          {logs?.generated_at
            ? ` · Log ${new Date(logs.generated_at).toLocaleTimeString("id-ID")}`
            : ""}
          {auto ? " · log tiap 2.5 dtk · metrik tiap 12 dtk" : ""}
        </p>
      )}

      {!data && loading && (
        <p className="mt-6 text-sm text-[var(--muted)]">Memuat data monitoring...</p>
      )}

      {data && app && proc && inv && (
        <div className="mt-4 space-y-5">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="API uptime"
              value={fmtUptime(app.uptime_sec)}
              hint={`${app.env} · Node ${app.node}`}
            />
            <Metric
              label="Database"
              value={data.database.status === "up" ? "UP" : "DOWN"}
              hint={data.database.error || "Koneksi OK"}
            />
            <Metric
              label="Memory API"
              value={proc.memory.rss_label}
              hint={`Heap ${proc.memory.heap_used_label} / ${proc.memory.heap_total_label}`}
            />
            <Metric
              label="Load average"
              value={`${proc.loadavg["1m"]}`}
              hint={`5m ${proc.loadavg["5m"]} · 15m ${proc.loadavg["15m"]} · ${proc.cpu_count} CPU`}
            />
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Events 24 jam" value={inv.events_24h} />
            <Metric
              label="Publisher"
              value={inv.publishers}
              hint={`Aktif ${inv.publishers_active} · Pending ${inv.publishers_pending} · Blokir ${inv.publishers_blocked}`}
            />
            <Metric
              label="Campaign"
              value={inv.campaigns}
              hint={`Aktif ${inv.campaigns_active} · Creative ${inv.creatives}`}
            />
            <Metric
              label="Event buffer"
              value={data.event_buffer.pending}
              hint={data.event_buffer.flushing ? "Sedang flush..." : "Antrian tulis DB"}
            />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="text-base font-semibold">Runtime</h2>
              <dl className="mt-3 grid grid-cols-[8.5rem_1fr] gap-x-3 gap-y-2 text-sm">
                <dt className="text-[var(--muted)]">Host</dt>
                <dd className="truncate font-medium">{proc.hostname}</dd>
                <dt className="text-[var(--muted)]">Platform</dt>
                <dd className="truncate">{proc.platform}</dd>
                <dt className="text-[var(--muted)]">PID</dt>
                <dd className="tabular-nums">{app.pid}</dd>
                <dt className="text-[var(--muted)]">RAM host</dt>
                <dd>
                  {proc.freemem_label} bebas / {proc.totalmem_label}
                </dd>
                <dt className="text-[var(--muted)]">API URL</dt>
                <dd className="truncate">{app.public_base_url}</dd>
                <dt className="text-[var(--muted)]">Frontend</dt>
                <dd className="truncate">{app.frontend_origin}</dd>
                <dt className="text-[var(--muted)]">Users aktif</dt>
                <dd className="tabular-nums">{inv.users_active}</dd>
              </dl>
            </Card>

            <Card className="p-5">
              <h2 className="text-base font-semibold">Storage</h2>
              <dl className="mt-3 grid grid-cols-[8.5rem_1fr] gap-x-3 gap-y-2 text-sm">
                <dt className="text-[var(--muted)]">Creatives</dt>
                <dd>
                  {data.storage.creatives.bytes_label}
                  <span className="text-[var(--muted)]">
                    {" "}
                    · {data.storage.creatives.files} file
                    {data.storage.creatives.truncated ? " (sample)" : ""}
                  </span>
                </dd>
                {data.storage.disk ? (
                  <>
                    <dt className="text-[var(--muted)]">Disk</dt>
                    <dd>
                      {data.storage.disk.used_label} / {data.storage.disk.total_label}
                      {data.storage.disk.used_pct != null
                        ? ` (${data.storage.disk.used_pct}%)`
                        : ""}
                    </dd>
                    <dt className="text-[var(--muted)]">Tersedia</dt>
                    <dd>{data.storage.disk.available_label}</dd>
                    <dt className="text-[var(--muted)]">Mount</dt>
                    <dd className="truncate">{data.storage.disk.path}</dd>
                  </>
                ) : (
                  <>
                    <dt className="text-[var(--muted)]">Disk</dt>
                    <dd className="text-[var(--muted)]">Tidak tersedia di runtime ini</dd>
                  </>
                )}
              </dl>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <div className="border-b border-[var(--line)] px-5 py-3">
              <h2 className="text-base font-semibold">Sistem running</h2>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                Status layanan backend dan frontend jobosrv. yang sedang berjalan
              </p>
            </div>
            {!data.pm2 ? (
              <p className="px-5 py-4 text-sm text-[var(--muted)]">
                Status layanan tidak terbaca dari server saat ini.
              </p>
            ) : data.pm2.length === 0 ? (
              <p className="px-5 py-4 text-sm text-[var(--muted)]">
                Tidak ada layanan jobosrv. yang terdeteksi sedang berjalan.
              </p>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Nama</th>
                      <th>Status</th>
                      <th>PID</th>
                      <th>CPU</th>
                      <th>Memory</th>
                      <th>Restarts</th>
                      <th>Uptime</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.pm2.map((p) => (
                      <tr key={p.name}>
                        <td className="font-medium">
                          {p.name.replace(/^adserver-(backend|frontend)$/i, (_, service: string) =>
                            `jobosrv. ${service[0].toUpperCase()}${service.slice(1)}`
                          )}
                        </td>
                        <td>
                          <StatusBadge
                            value={
                              p.status === "online" || p.status === "launching"
                                ? "running"
                                : "stop"
                            }
                          />
                        </td>
                        <td className="tabular-nums text-[var(--muted)]">{p.pid ?? "-"}</td>
                        <td className="tabular-nums">{p.cpu != null ? `${p.cpu}%` : "-"}</td>
                        <td className="tabular-nums">{p.memory_label}</td>
                        <td className="tabular-nums">{p.restarts}</td>
                        <td className="tabular-nums text-[var(--muted)]">
                          {fmtUptimeMs(p.uptime_ms)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <LogPanel title="Log backend (stdout)" log={logs?.out ?? null} live={auto} />
            <LogPanel title="Log backend (stderr)" log={logs?.error ?? null} live={auto} />
          </div>
        </div>
      )}
    </PermissionGate>
  );
}
