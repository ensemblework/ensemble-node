"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Spinner } from "@/components/ui";

/** Computers live in Settings, Needs me has its own page. */
export default function ComputersPage() {
  const router = useRouter();
  useEffect(() => router.replace("/settings#computers"), [router]);
  return (
    <div className="flex h-full items-center justify-center text-muted">
      <Spinner />
    </div>
  );
}
