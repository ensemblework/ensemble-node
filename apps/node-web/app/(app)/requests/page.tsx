"use client";

import { InviteInbox } from "@/components/invites";

export default function RequestsPage() {
  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 md:px-8">
        <div>
          <h1 className="text-2xl font-semibold">Requests to join</h1>
          <p className="mt-1 text-sm text-muted">People who made a room ask you to join it. Accept to bring 1–3 of your nodes, or decline.</p>
        </div>
        <InviteInbox />
      </div>
    </div>
  );
}
