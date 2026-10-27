"use client";

import Link from "next/link";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/lib/auth";

const THEME_KEY = "jobosrv-theme";

export default function Navbar() {
  const { user, logout } = useAuth();

  function toggleTheme() {
    const currentTheme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem(THEME_KEY, nextTheme);
  }

  return (
    <header className="navbar-root flex h-[4.5rem] shrink-0 items-center justify-end gap-3 px-5 backdrop-blur lg:px-8">
      <button
        type="button"
        className="theme-toggle"
        onClick={toggleTheme}
        aria-label="Toggle dark and light theme"
        title="Toggle dark and light theme"
      >
        <svg className="theme-icon-dark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <circle cx="12" cy="12" r="4" />
            <path strokeLinecap="round" d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
        </svg>
        <svg className="theme-icon-light" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.5 15.2A8.5 8.5 0 018.8 3.5 8.5 8.5 0 1020.5 15.2z" />
        </svg>
      </button>
      {user && (
        <>
          <Link
            href="/dashboard/account"
            className="navbar-account flex min-w-0 items-center gap-2.5 rounded-xl px-2 py-1.5 transition"
          >
            <UserAvatar
              name={user.name}
              email={user.email}
              size="sm"
              className="!h-9 !w-9 !text-[0.72rem]"
            />
            <span className="hidden min-w-0 sm:block">
              <span className="navbar-user-name block max-w-48 truncate text-sm font-medium">
                {user.name}
              </span>
              <span className="navbar-user-role block text-xs">
                {user.role?.name ?? "Akun"}
              </span>
            </span>
          </Link>
          <button type="button" className="btn-ghost !px-3 !py-2 text-sm" onClick={() => logout()}>
            Keluar
          </button>
        </>
      )}
    </header>
  );
}
