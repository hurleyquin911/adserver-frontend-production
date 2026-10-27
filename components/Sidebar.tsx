"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Modal } from "@/components/Modal";
import { useAuth } from "@/lib/auth";
import { isAdmin, isSuperadmin, isUsersRole, normalizeRoleName } from "@/lib/roles";

type NavItem = {
  href: string;
  label: string;
  permission?: string;
  roles?: Array<"Superadmin" | "Admin" | "Users">;
  icon: ReactNode;
};

type NavSection = {
  id: string;
  items: NavItem[];
};

const iconClass = "h-[1.05rem] w-[1.05rem] shrink-0";

function IconSummary() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 19V5M4 19h16M8 15V9m4 6V7m4 8v-3" />
    </svg>
  );
}
function IconGuide() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 4h11a2 2 0 012 2v14l-3-2-3 2-3-2-3 2V6a2 2 0 012-2z" />
    </svg>
  );
}
function IconBrand() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
    </svg>
  );
}
function IconCampaign() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h10v8H4V6zm10 3h3l3 2v3h-6V9zM8 18a1.5 1.5 0 103 0M16 18a1.5 1.5 0 103 0" />
    </svg>
  );
}
function IconCreative() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 15l6-6m-5 0h5v5" />
    </svg>
  );
}
function IconTag() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.5 10.5l-8-8H6v6.5l8 8 6.5-6.5zM9 8h.01" />
    </svg>
  );
}
function IconPublisher() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 19h16M6 19V8l6-3 6 3v11M10 19v-4h4v4" />
    </svg>
  );
}
function IconReports() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 19V9m7 10V5m7 14v-7" />
    </svg>
  );
}
function IconBilling() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18m4-14.5c-.8-1-2.1-1.5-4-1.5-2.2 0-3.5 1-3.5 2.5S10 10 12 10s3.5 1 3.5 2.5S14.2 15 12 15c-1.9 0-3.2-.5-4-1.5" />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 19v-1a3 3 0 00-3-3H7a3 3 0 00-3 3v1M12.5 7.5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zm8.5 11.5v-.8a2.5 2.5 0 00-1.7-2.35M16.5 5.2a2.5 2.5 0 010 4.6" />
    </svg>
  );
}
function IconRoles() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7.5 3.5v5.2c0 4.4-3.1 7.1-7.5 8.3-4.4-1.2-7.5-3.9-7.5-8.3V6.5L12 3z" />
    </svg>
  );
}
function IconMonitor() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 5h16v11H4V5zm0 11h16M9 19h6M8 9l2.5 3 2-2.5L16 14"
      />
    </svg>
  );
}

const SECTIONS: NavSection[] = [
  {
    id: "overview",
    items: [
      { href: "/dashboard", label: "Overview", icon: <IconSummary /> },
    ],
  },
  {
    id: "delivery",
    items: [
      {
        href: "/dashboard/advertisers",
        label: "Brand",
        permission: "campaign:read",
        roles: ["Superadmin"],
        icon: <IconBrand />,
      },
      {
        href: "/dashboard/campaigns",
        label: "Campaigns",
        permission: "campaign:read",
        roles: ["Superadmin", "Admin", "Users"],
        icon: <IconCampaign />,
      },
      {
        href: "/dashboard/creatives",
        label: "Creatives",
        permission: "campaign:read",
        roles: ["Superadmin", "Admin", "Users"],
        icon: <IconCreative />,
      },
      {
        href: "/dashboard/tag",
        label: "Ad tags",
        permission: "campaign:read",
        roles: ["Superadmin", "Admin", "Users"],
        icon: <IconTag />,
      },
      {
        href: "/dashboard/publishers",
        label: "Publisher",
        permission: "publisher:manage",
        roles: ["Superadmin"],
        icon: <IconPublisher />,
      },
    ],
  },
  {
    id: "account",
    items: [
      {
        href: "/dashboard/users",
        label: "Users",
        permission: "user:manage",
        roles: ["Superadmin"],
        icon: <IconUsers />,
      },
      {
        href: "/dashboard/roles",
        label: "Roles",
        permission: "user:manage",
        roles: ["Superadmin"],
        icon: <IconRoles />,
      },
    ],
  },
  {
    id: "system",
    items: [
      {
        href: "/dashboard/monitoring",
        label: "Monitoring Server",
        roles: ["Superadmin"],
        icon: <IconMonitor />,
      },
    ],
  },
  {
    id: "observe",
    items: [
      {
        href: "/dashboard/billing",
        label: "Billing",
        permission: "report:read",
        roles: ["Admin", "Users"],
        icon: <IconBilling />,
      },
      {
        href: "/dashboard/reports",
        label: "Reports",
        permission: "report:read",
        roles: ["Superadmin", "Admin", "Users"],
        icon: <IconReports />,
      },
    ],
  },
];

function roleKey(name?: string | null): "Superadmin" | "Admin" | "Users" | null {
  const n = normalizeRoleName(name);
  if (isSuperadmin(n)) return "Superadmin";
  if (isAdmin(n)) return "Admin";
  if (isUsersRole(n)) return "Users";
  return null;
}

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
}

export default function Sidebar() {
  const pathname = usePathname();
  const { user, hasPermission } = useAuth();
  const [quickGuideOpen, setQuickGuideOpen] = useState(false);
  const rk = roleKey(user?.role?.name);

  useEffect(() => {
    const openQuickGuide = () => setQuickGuideOpen(true);
    window.addEventListener("jobosrv:open-quick-guide", openQuickGuide);
    return () => window.removeEventListener("jobosrv:open-quick-guide", openQuickGuide);
  }, []);

  function allowed(item: NavItem) {
    if (item.permission && !hasPermission(item.permission)) return false;
    if (item.roles && item.roles.length) {
      if (!rk || !item.roles.includes(rk)) return false;
    }
    return true;
  }

  const sections = SECTIONS.map((sec) => ({
    ...sec,
    items: sec.items.filter(allowed),
  })).filter((sec) => sec.items.length > 0);

  return (
    <aside className="sidebar-root flex h-full w-[15.75rem] shrink-0 flex-col">
      <div className="sidebar-brand shrink-0">
        <div className="min-w-0">
          <p className="sidebar-wordmark">jobosrv.</p>
          <p className="sidebar-subtitle">Rich Media Banner Ad Server</p>
        </div>
      </div>

      <nav className="sidebar-nav min-h-0 flex-1 overflow-y-auto">
        {sections.map((sec) => (
          <div key={sec.id} className="sidebar-group">
            <ul className="sidebar-group-list">
              {sec.items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={active ? "sidebar-link is-active" : "sidebar-link"}
                      aria-current={active ? "page" : undefined}
                    >
                      <span className="sidebar-link-icon">{item.icon}</span>
                      <span className="sidebar-link-text">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {user && (
        <div className="shrink-0 border-t border-[var(--sidebar-line)] px-3 py-3">
          <button
            type="button"
            className="sidebar-link w-full"
            onClick={() => setQuickGuideOpen(true)}
          >
            <span className="sidebar-link-icon"><IconGuide /></span>
            <span className="sidebar-link-text">Quick Guide</span>
          </button>
        </div>
      )}

      <div className="sidebar-footer shrink-0">
        <Image
          src="/pushlab.png"
          alt="Pushlab"
          width={124}
          height={53}
          className="h-auto w-32 object-contain"
          priority
        />
      </div>

      <Modal
        open={quickGuideOpen}
        title="Quick Guide"
        onClose={() => setQuickGuideOpen(false)}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <h3 className="font-semibold text-[var(--ink)]">Upload creative</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              Add your HTML5 ZIP and click-through URL. Brand and Campaign are optional
              and can be updated later.
            </p>
          </section>
          <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <h3 className="font-semibold text-[var(--ink)]">Preview &amp; review</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              Check the layout, dimensions, and click-through destination, then confirm
              your review.
            </p>
          </section>
          <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <h3 className="font-semibold text-[var(--ink)]">Generate ad tag</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              Choose the tag format and your DSP settings, then copy or download the tag.
            </p>
          </section>
          <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <h3 className="font-semibold text-[var(--ink)]">Reports &amp; Billing</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              Choose a reporting period to review performance and the impressions used
              for CPM billing.
            </p>
          </section>
        </div>
      </Modal>
    </aside>
  );
}
