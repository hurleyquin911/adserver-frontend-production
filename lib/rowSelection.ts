import { useCallback, useMemo, useState } from "react";
import { ApiError } from "@/lib/api";

export async function eachId(ids: string[], fn: (id: string) => Promise<void>) {
  const results = await Promise.allSettled(ids.map((id) => fn(id)));
  let ok = 0;
  let failed = 0;
  let message: string | undefined;
  for (const result of results) {
    if (result.status === "fulfilled") {
      ok += 1;
    } else {
      failed += 1;
      if (!message) {
        const reason = result.reason;
        message =
          reason instanceof ApiError
            ? reason.message
            : reason instanceof Error
              ? reason.message
              : "Gagal";
      }
    }
  }
  return { ok, failed, message };
}

export type BulkActionResult = {
  cancelled: boolean;
  ok: number;
  failed: number;
  message?: string;
};

export async function runBulkAction(
  ids: string[],
  fn: (id: string) => Promise<void>,
  confirmText?: string
): Promise<BulkActionResult> {
  if (!ids.length) return { cancelled: true, ok: 0, failed: 0 };
  if (confirmText && !window.confirm(confirmText)) {
    return { cancelled: true, ok: 0, failed: 0 };
  }
  const result = await eachId(ids, fn);
  return { cancelled: false, ...result };
}

export function useRowSelection(allIds: string[], visibleIds: string[]) {
  const [raw, setRaw] = useState<Set<string>>(() => new Set());
  const allowKey = allIds.join("\0");
  const visibleKey = visibleIds.join("\0");

  const selected = useMemo(() => {
    const allow = new Set(allIds);
    const next = new Set<string>();
    for (const id of raw) if (allow.has(id)) next.add(id);
    return next;
  }, [raw, allowKey]);

  const ids = useMemo(() => [...selected], [selected]);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someVisibleSelected = visibleIds.some((id) => selected.has(id));

  const toggle = useCallback((id: string) => {
    setRaw((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllVisible = useCallback(() => {
    setRaw((prev) => {
      const next = new Set(prev);
      const allOn = visibleIds.length > 0 && visibleIds.every((id) => next.has(id));
      if (allOn) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  }, [visibleKey, visibleIds]);

  const clear = useCallback(() => setRaw(new Set()), []);

  return {
    selected,
    ids,
    count: ids.length,
    allVisibleSelected,
    someVisibleSelected,
    toggle,
    toggleAllVisible,
    clear,
  };
}
