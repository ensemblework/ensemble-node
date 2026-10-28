"use client";

import { NeedsMe } from "@/components/needs-me";

export default function NeedsMePage() {
  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-8 md:px-8">
        <div>
          <h1 className="text-2xl font-semibold">Needs me</h1>
          <p className="mt-1 text-sm text-muted">The same list as Ensemble&apos;s Needs me: what your nodes and the agents on your computers ask you, and tasks waiting for you. Answer here or in Ensemble; the first answer counts.</p>
        </div>
        <NeedsMe />
      </div>
    </div>
  );
}
