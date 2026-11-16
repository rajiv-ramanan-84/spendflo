"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LEGACY_HASH } from "@/lib/settings/nav";

/** Old links like /settings#data still land on the right page. */
export function LegacyHashRedirect() {
  const router = useRouter();
  useEffect(() => {
    const to = LEGACY_HASH[window.location.hash.replace("#", "")];
    if (to) router.replace(to);
  }, [router]);
  return null;
}
