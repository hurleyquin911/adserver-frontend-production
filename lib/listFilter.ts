export function matchesQuery(
  query: string,
  ...fields: Array<string | number | null | undefined>
) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((field) => String(field ?? "").toLowerCase().includes(q));
}

export function emptyFilterText(total: number, noun: string) {
  if (total === 0) return `Belum ada ${noun}.`;
  return `Tidak ada ${noun} yang cocok dengan filter.`;
}
