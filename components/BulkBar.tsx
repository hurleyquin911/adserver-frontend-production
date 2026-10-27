"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function RowCheck({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      className="row-check"
      checked={checked}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      aria-label={label}
    />
  );
}

export function CheckAll({
  checked,
  indeterminate,
  onChange,
  disabled,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked;
  }, [indeterminate, checked]);

  return (
    <input
      ref={ref}
      type="checkbox"
      className="row-check"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      aria-label="Pilih semua yang terlihat"
    />
  );
}

export function BulkBar({
  count,
  total,
  noun,
  onClear,
  busy,
  children,
}: {
  count: number;
  total: number;
  noun: string;
  onClear: () => void;
  busy?: boolean;
  children: ReactNode;
}) {
  if (count === 0) return null;
  const allSelected = count === total;
  return (
    <div className={`bulk-bar${busy ? " is-busy" : ""}`}>
      <span className="bulk-bar-count">
        {allSelected ? (
          <>
            Semua <strong>{count}</strong> {noun} dipilih
          </>
        ) : (
          <>
            <strong>{count}</strong> dari {total} {noun} dipilih
          </>
        )}
      </span>
      <div className="bulk-bar-actions">{children}</div>
      <button type="button" className="bulk-bar-cancel" onClick={onClear} disabled={busy}>
        Batal
      </button>
    </div>
  );
}
