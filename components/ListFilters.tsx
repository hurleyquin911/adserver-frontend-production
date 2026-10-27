type FilterOption = { value: string; label: string };

type SelectFilter = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  variant?: "select" | "pills";
};

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

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" className="list-icon" aria-hidden>
      <path
        d="M7 7l10 10M17 7 7 17"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function usesPills(select: SelectFilter) {
  if (select.variant === "select") return false;
  if (select.variant === "pills") return true;
  return select.options.length > 1 && select.options.length <= 5;
}

function pillLabel(label: string) {
  return /^Semua(\s|$)/i.test(label) ? "Semua" : label;
}

export function ListFilters({
  query,
  onQueryChange,
  placeholder = "Cari...",
  selects = [],
  resultCount,
  totalCount,
  title,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  placeholder?: string;
  selects?: SelectFilter[];
  resultCount: number;
  totalCount: number;
  title?: string;
}) {
  const queryActive = Boolean(query.trim());
  const selectChips = selects.filter((s) => s.value && !usesPills(s));
  const anyActive = queryActive || selects.some((s) => s.value);

  function clearAll() {
    onQueryChange("");
    for (const select of selects) select.onChange("");
  }

  return (
    <div className="list-toolbar-wrap">
      {title && <p className="list-toolbar-title">{title}</p>}
      <div className="list-toolbar">
        <label className="list-search">
          <IconSearch />
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && query) onQueryChange("");
            }}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
          />
          {queryActive && (
            <button
              type="button"
              className="list-icon-btn"
              aria-label="Hapus pencarian"
              onClick={() => onQueryChange("")}
            >
              <IconClose />
            </button>
          )}
        </label>

        {selects.map((select) =>
          usesPills(select) ? (
            <div key={select.id} className="list-pills" role="group" aria-label={select.label}>
              {select.options.map((option) => (
                <button
                  key={option.value || "all"}
                  type="button"
                  className={`list-pill${select.value === option.value ? " is-on" : ""}`}
                  onClick={() => select.onChange(option.value)}
                >
                  {pillLabel(option.label)}
                </button>
              ))}
            </div>
          ) : (
            <select
              key={select.id}
              value={select.value}
              aria-label={select.label}
              onChange={(e) => select.onChange(e.target.value)}
              className={`list-select${select.value ? " is-on" : ""}`}
            >
              {select.options.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )
        )}

        <div className="list-toolbar-meta">
          <span>
            <strong>{resultCount}</strong>
            {anyActive ? ` / ${totalCount}` : ""}
          </span>
          {anyActive && (
            <button type="button" className="list-clear" onClick={clearAll}>
              Reset
            </button>
          )}
        </div>
      </div>

      {(queryActive || selectChips.length > 0) && (
        <div className="list-chips">
          {queryActive && (
            <span className="list-chip">
              <b>Cari</b>
              <span title={query.trim()}>{query.trim()}</span>
              <button
                type="button"
                className="list-icon-btn"
                aria-label="Hapus pencarian"
                onClick={() => onQueryChange("")}
              >
                <IconClose />
              </button>
            </span>
          )}
          {selectChips.map((select) => {
            const chosen = select.options.find((o) => o.value === select.value);
            return (
              <span key={select.id} className="list-chip">
                <b>{select.label}</b>
                <span title={chosen?.label}>{chosen?.label}</span>
                <button
                  type="button"
                  className="list-icon-btn"
                  aria-label={`Hapus filter ${select.label}`}
                  onClick={() => select.onChange("")}
                >
                  <IconClose />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
