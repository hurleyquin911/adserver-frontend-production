import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="mb-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            {eyebrow}
          </p>
        )}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function StatusBadge({ value }: { value: string }) {
  const key = value.toLowerCase();
  return <span className={`badge badge-${key}`}>{value}</span>;
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="alert-error">{message}</p>;
}

export function FieldHint({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{children}</p>;
}

export function EmptyRow({ cols, text }: { cols: number; text: string }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-8 text-center text-sm text-[var(--muted)]">
        {text}
      </td>
    </tr>
  );
}
