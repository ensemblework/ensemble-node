"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useBootstrap } from "@/lib/hooks";
import { dmRoomOf } from "@/components/shell";
import { Spinner } from "@/components/ui";

/** A node's settings live with its direct chat: this address opens them there. */
export default function NodePage() {
  const { nodeId } = useParams<{ nodeId: string }>();
  const router = useRouter();
  const boot = useBootstrap();
  const dm = dmRoomOf(boot.data, nodeId);
  useEffect(() => {
    if (dm) router.replace(`/r/${dm.id}?settings=1`);
  }, [dm, router]);
  if (boot.data && !dm) return <div className="p-8 text-sm text-muted">That node is not available. <Link href="/chat" className="text-accent">Back</Link></div>;
  return <div className="flex h-full items-center justify-center text-muted"><Spinner /></div>;
}
