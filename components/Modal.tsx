"use client";

import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function Modal({
  open,
  title,
  onClose,
  children,
  wide,
  xl,
  /** Lebar panel mengikuti konten (px), dibatasi viewport. Untuk preview creative. */
  fitWidth,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  /** Lebih lebar dari wide - cocok untuk detail + tabel. */
  xl?: boolean;
  fitWidth?: number;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => {
      const focusable = panelRef.current?.querySelector<HTMLElement>(
        "input, select, textarea, button, [tabindex]:not([tabindex='-1'])"
      );
      focusable?.focus();
    }, 0);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const padX = 40; // padding kiri+kanan body
  const fitStyle: CSSProperties | undefined =
    fitWidth != null && fitWidth > 0
      ? {
          width: `min(calc(100vw - 2.5rem), ${Math.round(fitWidth + padX)}px)`,
          maxWidth: "calc(100vw - 2.5rem)",
          maxHeight: "min(92vh, 56rem)",
        }
      : undefined;

  const panelClass =
    fitWidth != null
      ? "modal-panel relative z-[1] flex max-h-[min(92vh,56rem)] flex-col overflow-hidden rounded-[1.25rem] border border-[var(--line)] bg-[var(--card)] shadow-[0_28px_60px_-28px_rgba(11,16,32,0.55)]"
      : `modal-panel relative z-[1] rounded-[1.25rem] border border-[var(--line)] bg-[var(--card)] shadow-[0_28px_60px_-28px_rgba(11,16,32,0.55)] ${
          xl
            ? "flex max-h-[min(92vh,48rem)] w-[min(100%,56rem)] flex-col overflow-hidden"
            : wide
              ? "max-h-[min(92vh,48rem)] w-[min(100%,48rem)] overflow-auto"
              : "max-h-[min(92vh,44rem)] w-[min(100%,36rem)] overflow-auto"
        }`;

  return createPortal(
    <div
      className="modal-root fixed inset-0 z-[100] flex items-center justify-center p-5"
      role="presentation"
    >
      <button
        type="button"
        className="modal-backdrop absolute inset-0 border-0 bg-[rgba(11,16,32,0.48)]"
        aria-label="Tutup"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className={panelClass}
        style={fitStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal-head flex shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] px-[1.15rem] pt-4 pb-3">
          <h2 id={titleId} className="modal-title text-[1.05rem] font-semibold tracking-[-0.02em]">
            {title}
          </h2>
          <button
            type="button"
            className="modal-close inline-flex h-8 w-8 items-center justify-center rounded-[0.65rem] border-0 bg-transparent text-[1.35rem] leading-none text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
            onClick={onClose}
            aria-label="Tutup"
          >
            ×
          </button>
        </div>
        <div
          className={`modal-body ${
            fitWidth != null
              ? "min-h-0 flex-1 overflow-auto px-[1.15rem] pt-4 pb-5"
              : xl
                ? "min-h-0 flex-1 overflow-auto px-[1.35rem] pb-5 pt-4"
                : "px-[1.15rem] pt-4 pb-5"
          }`}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
