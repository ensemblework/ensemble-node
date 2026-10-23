"use client";

import { useRouter } from "next/navigation";
import { SearchPanel } from "@/components/chat/search";
import { requestJump } from "@/lib/jump";

export default function SearchPage() {
  const router = useRouter();
  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-8 md:px-8">
        <div>
          <h1 className="text-2xl font-semibold">Search</h1>
          <p className="mt-1 text-sm text-muted">Every conversation you are in: messages that have every word you type. Press ⌘K or Ctrl+K anywhere to search.</p>
        </div>
        <SearchPanel
          onPick={({ message, room }) => {
            requestJump(room.id, message.id);
            router.push(`/r/${room.id}#m-${message.id}`);
          }}
        />
      </div>
    </div>
  );
}
