"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { messageById } from "@/lib/api";
import { cardPage } from "@/lib/login";
import { Spinner } from "@/components/ui";

/**
 * A card's short address (a sign-in card's QR code, `lib/login.ts` `cardLink`): finds the card's
 * conversation and opens the card there, with its remote view (or live view) when it still waits.
 * A phone not signed in comes here again after signing in (the shell keeps the address).
 */
export default function CardPage() {
  const { cardId } = useParams<{ cardId: string }>();
  const router = useRouter();
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let gone = false;
    messageById(cardId).then(
      (card) => {
        if (gone) return;
        const type = card.data?.type;
        const waiting = (type === "login" && ["pending", "needs_code"].includes(String(card.data.status ?? "pending")) && card.data.takeover === true) || (type === "live" && card.data.status !== "ended");
        router.replace(cardPage(card.roomId, card.id, waiting));
      },
      () => {
        if (!gone) setMissing(true);
      },
    );
    return () => {
      gone = true;
    };
  }, [cardId, router]);
  if (missing) {
    return (
      <div className="p-8 text-sm text-muted">
        That card is not available to this account. <Link href="/chat" className="text-accent">Back to your chats</Link>
      </div>
    );
  }
  return (
    <div className="flex h-full items-center justify-center text-muted">
      <Spinner />
    </div>
  );
}
