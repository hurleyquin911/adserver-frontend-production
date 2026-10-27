export type Metrics = {
  request: number;
  no_fill: number;
  impression: number;
  viewable_impression: number;
  click: number;
  interaction: number;
  interaction_unique: number;
  fill_rate: number;
  viewability_rate: number;
  ctr: number;
  interaction_rate: number;
  fill_rate_pct: number;
  viewability_rate_pct: number;
  ctr_pct: number;
  interaction_rate_pct: number;
};

export function pct(n: number) {
  return `${Number(n || 0).toFixed(2)}%`;
}

export function num(n: number) {
  return new Intl.NumberFormat("id-ID").format(Number(n || 0));
}

export function paceClass(status: string) {
  if (status === "on track") return "chip-pace chip-pace-on-track";
  if (status === "tertinggal") return "chip-pace chip-pace-tertinggal";
  if (status === "terlalu cepat") return "chip-pace chip-pace-terlalu-cepat";
  if (status === "selesai") return "chip-pace chip-pace-selesai";
  return "chip-pace chip-pace-tanpa-target";
}

/** Tanggal kalender lokal (YYYY-MM-DD). Jangan pakai toISOString - UTC bisa mundur 1 hari di WIB. */
export function ymdLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function rangeFromPreset(days: number) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  return { from: ymdLocal(from), to: ymdLocal(to) };
}

export function fmtDateId(iso: string) {
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function eachDate(from: string, to: string) {
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    const [y, m, d] = cur.split("-").map(Number);
    const next = new Date(y, m - 1, d + 1);
    cur = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
  }
  return out;
}

export function campaignReportHref(id: string, from: string, to: string) {
  return `/dashboard/reports/campaigns/${id}?from=${from}&to=${to}`;
}

export function publisherReportHref(id: string, from?: string, to?: string) {
  if (from && to) return `/dashboard/reports/publishers/${id}?from=${from}&to=${to}`;
  return `/dashboard/reports/publishers/${id}`;
}
