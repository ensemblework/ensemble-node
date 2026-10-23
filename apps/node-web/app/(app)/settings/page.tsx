"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, LogOut } from "lucide-react";
import { api } from "@/lib/api";
import { ENSEMBLE_APP } from "@/lib/config";
import { useBootstrap } from "@/lib/hooks";
import { ConnectComputer } from "@/components/connect-computer";
import { CreditsMeter } from "@/components/credits";
import { PersonAvatar } from "@/components/node-avatar";
import { Button, Spinner } from "@/components/ui";

export default function SettingsPage() {
  const boot = useBootstrap();
  const client = useQueryClient();
  const router = useRouter();
  if (!boot.data) return <div className="flex h-full items-center justify-center text-muted"><Spinner /></div>;
  const { me, computers, credits } = boot.data;
  const signOut = async () => {
    await api("/api/auth/logout", { body: {} }).catch(() => undefined);
    client.clear();
    router.replace("/login");
  };
  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 md:px-8">
        <h1 className="text-2xl font-semibold">Settings</h1>

        <section className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-panel p-5">
          <div className="flex items-center gap-3">
            <PersonAvatar name={me.name || me.email} size={44} />
            <div>
              <div className="font-medium">{me.name || "Your account"}</div>
              <div className="text-sm text-muted">{me.email}</div>
            </div>
          </div>
          <a href={`${ENSEMBLE_APP}/settings`} className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
            Ensemble account <ExternalLink size={12} />
          </a>
        </section>

        <section className="space-y-3 rounded-2xl border border-line bg-panel p-5">
          <h2 className="font-semibold">Credits</h2>
          <CreditsMeter credits={credits} />
          <a href={`${ENSEMBLE_APP}/metrics`} className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
            Usage by model and purpose <ExternalLink size={12} />
          </a>
        </section>

        <section id="computers" className="space-y-3">
          <h2 className="font-semibold">Computers</h2>
          <p className="text-sm text-muted">Nodes never run anything on Ensemble&apos;s servers. Work happens on a computer you pair, under your run profile, and only after you approve it.</p>
          <ConnectComputer computers={computers} />
        </section>

        <section className="space-y-2 rounded-2xl border border-line bg-panel p-5 text-sm">
          <h2 className="font-semibold">In Ensemble</h2>
          <p className="text-muted">Your nodes use the same workspace, write policy (Settings → Assistant), run profiles and connected apps as the Ensemble assistant.</p>
          <div className="flex flex-wrap gap-3">
            {[
              ["Assistant and write policy", "/settings"],
              ["Needs me", "/needs-me"],
              ["Board", "/board"],
            ].map(([label, path]) => (
              <a key={path} href={`${ENSEMBLE_APP}${path}`} className="inline-flex items-center gap-1 text-accent hover:underline">
                {label} <ExternalLink size={12} />
              </a>
            ))}
          </div>
        </section>

        <Button tone="ghost" onClick={() => void signOut()}>
          <LogOut size={16} /> Sign out
        </Button>
        <p className="text-xs text-muted">Signing out here signs you out of Ensemble in this browser too: it is one account.</p>
      </div>
    </div>
  );
}
