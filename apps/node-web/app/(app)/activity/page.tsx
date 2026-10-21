"use client";

import { ActivityPanel } from "@/components/activity";

export default function ActivityPage() {
  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <h1 className="px-4 pt-4 text-xl font-semibold">Activity</h1>
      <ActivityPanel />
    </div>
  );
}
