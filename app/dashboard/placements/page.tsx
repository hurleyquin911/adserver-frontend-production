"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Sites & Placements disembunyikan sementara - redirect ke dashboard. */
export default function PlacementsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return (
    <p className="py-8 text-center text-sm text-[var(--muted)]">Mengalihkan...</p>
  );
}
