"use client";

import { useEffect } from "react";

export default function ThemeInitializer() {
  useEffect(() => {
    const storedTheme = window.localStorage.getItem("jobosrv-theme");
    if (storedTheme === "light" || storedTheme === "dark") {
      document.documentElement.dataset.theme = storedTheme;
    }
  }, []);

  return null;
}
