/** Inisial 1-2 huruf dari nama tampilan. */
export function avatarInitials(name?: string | null, email?: string | null): string {
  const raw = String(name || email || "?").trim();
  if (!raw) return "?";
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return raw.slice(0, 2).toUpperCase();
}

/** Warna latar avatar stabil dari string. */
export function avatarTone(seed?: string | null): string {
  const s = String(seed || "x");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const tones = [
    "bg-[#7c3aed]",
    "bg-[#db2777]",
    "bg-[#ea580c]",
    "bg-[#0891b2]",
    "bg-[#16a34a]",
    "bg-[#4f46e5]",
    "bg-[#ca8a04]",
  ];
  return tones[h % tones.length];
}
