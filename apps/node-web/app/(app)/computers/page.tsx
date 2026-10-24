"use client";

import { DeviceList, ComputerList, PairComputer } from "@/components/connect-computer";
import { NeedsMe } from "@/components/needs-me";
import { Spinner } from "@/components/ui";
import { liveDevices } from "@/lib/ensemble";
import { useBootstrap, useDevices } from "@/lib/hooks";

export default function ComputersPage() {
  const boot = useBootstrap();
  const devices = useDevices();
  const list = liveDevices(devices.data ?? []);
  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-10 px-4 py-8 md:px-8">
        <section className="space-y-4">
          <div>
            <h1 className="text-2xl font-semibold">Needs me</h1>
            <p className="mt-1 text-sm text-muted">The same list as Ensemble&apos;s Needs me: approvals and questions from runs on your computers. Answer here, in Ensemble or on your phone; the first answer counts.</p>
          </div>
          <NeedsMe />
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Computers</h2>
            <p className="mt-1 text-sm text-muted">Nodes never run anything on Ensemble&apos;s servers. Work happens on a computer paired with your Ensemble account, inside the folders it shares, and only after you approve it.</p>
          </div>
          {devices.isLoading ? (
            <div className="flex justify-center py-4 text-muted">
              <Spinner />
            </div>
          ) : devices.error ? (
            <ComputerList computers={boot.data?.computers ?? []} />
          ) : (
            <DeviceList devices={list} />
          )}
          <PairComputer paired={list.length > 0 || Boolean(boot.data?.computers.length)} />
        </section>
      </div>
    </div>
  );
}
