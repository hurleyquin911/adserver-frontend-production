"use client";

import { KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { matchesQuery } from "@/lib/listFilter";

export type SearchSelectOption = { value: string; label: string };

function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" className="list-icon" aria-hidden>
      <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M16.2 16.2 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SearchSelect({
  value,
  onChange,
  options,
  placeholder = "Pilih...",
  searchPlaceholder = "Cari...",
  emptyText = "Tidak ada yang cocok",
  required = false,
  name,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SearchSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  required?: boolean;
  name?: string;
  disabled?: boolean;
}) {
  const uid = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(
    () => options.filter((o) => matchesQuery(query, o.label, o.value)),
    [options, query]
  );

  useEffect(() => {
    if (!open) return;
    const idx = options.findIndex((o) => o.value === value);
    setActive(idx >= 0 ? idx : 0);
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
    // Hanya saat buka: jangan reset highlight setiap ketikan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) close();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>("[data-active='true']");
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  function pick(next: string) {
    onChange(next);
    close();
  }

  function onTriggerKey(e: KeyboardEvent) {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  }

  function onSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = filtered[active];
      if (hit) pick(hit.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  const listId = `${uid}-list`;

  return (
    <div className="search-select relative mt-[0.35rem]" ref={rootRef}>
      <select
        className="search-select-native pointer-events-none absolute m-0 h-px w-px overflow-hidden border-0 p-0 opacity-0"
        name={name}
        required={required}
        value={value}
        tabIndex={-1}
        aria-hidden
        onChange={(e) => onChange(e.target.value)}
        onInvalid={() => setOpen(true)}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <button
        type="button"
        className={`search-select-trigger field mt-0 flex items-center justify-between gap-2 text-left${
          open ? " is-open" : ""
        }`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={onTriggerKey}
      >
        <span className={`min-w-0 truncate ${selected ? "" : "text-[#9a9488]"}`}>
          {selected?.label ?? placeholder}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          className={`h-3 w-3 shrink-0 text-[#8d8794] ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path
            d="M3 4.5 6 7.5 9 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="search-select-panel absolute top-[calc(100%+0.35rem)] right-0 left-0 z-40 overflow-hidden rounded-[0.9rem] border border-[var(--line)] bg-[var(--card)] shadow-[0_18px_36px_-20px_rgba(0,0,0,0.65)]">
          <label className="list-search mx-2 mt-2 mb-1 min-w-0">
            <IconSearch />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onSearchKey}
              placeholder={searchPlaceholder}
              autoComplete="off"
              spellCheck={false}
              aria-autocomplete="list"
              aria-controls={listId}
            />
          </label>
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            className="search-select-list max-h-56 overflow-y-auto px-1.5 pb-1.5"
          >
            {filtered.length === 0 && (
              <li className="search-select-empty px-2.5 py-2.5 text-sm text-[var(--muted)]">
                {emptyText}
              </li>
            )}
            {filtered.map((o, i) => (
              <li key={o.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  data-active={i === active ? "true" : undefined}
                  className={`search-select-option block w-full rounded-[0.55rem] px-2.5 py-2 text-left text-sm${
                    o.value === value ? " is-on font-semibold" : ""
                  }${i === active ? " is-active" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(o.value)}
                >
                  {o.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
