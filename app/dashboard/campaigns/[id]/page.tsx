"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

/** Deep link lama → buka panel creative di daftar Campaigns. */
export default function CampaignDetailRedirectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    const id = params.id;
    if (id) {
      router.replace(`/dashboard/campaigns?c=${encodeURIComponent(id)}`);
    } else {
      router.replace("/dashboard/campaigns");
    }
  }, [params.id, router]);

  return (
    <p className="py-8 text-center text-sm text-[var(--muted)]">
      Membuka creative di panel Campaigns...
    </p>
  );
}
