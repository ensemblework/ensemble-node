"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Inbox, Laptop, LogOut, Plug, Search } from "lucide-react";
import { api } from "@/lib/api";
import { ENSEMBLE_LINKS } from "@/lib/config";
import { useBootstrap } from "@/lib/hooks";
import { ComputerList } from "@/components/connect-computer";
import { CreditsMeter } from "@/components/credits";
import { PersonAvatar } from "@/components/node-avatar";
import { Button, External, InfoTip, Spinner } from "@/components/ui";

export default function SettingsPage() {
  const boot = useBootstrap();
  const client = useQueryClient();
  const router = useRouter();
  if (!boot.data) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <Spinner />
      </div>
    );
  }
  const { me, computers, credits } = boot.data;
  const signOut = async () => {
    await api("/api/auth/logout", { body: {} }).catch(() => undefined);
    client.clear();
    router.replace("/login");
  };
  const places: Array<[string, string, typeof Laptop, string]> = [
    ["/computers", "Computers & Needs me", Laptop, "Paired computers, their shared folders, and what waits for your answer"],
    ["/connections", "Connections", Plug, "The apps your nodes can read, the same as in Ensemble"],
    ["/requests", "Requests to join", Inbox, "Rooms other people asked you to join"],
    ["/search", "Search", Search, "Every conversation you are in"],
  ];
  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 md:px-8">
        <h1 className="text-2xl font-semibold">Settings</h1>

        <section className="space-y-3 rounded-2xl border border-line bg-panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <PersonAvatar name={me.name || me.email} size={44} />
              <div>
                <div className="font-medium">{me.name || "Your account"}</div>
                <div className="text-sm text-muted">{me.email}</div>
              </div>
            </div>
            <External href={ENSEMBLE_LINKS.account} icon className="text-sm text-accent hover:underline">
              Ensemble account
            </External>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted">One account across Ensemble <InfoTip text="Your connections, computers, run profiles and credits are shared. Manage your name, password and sign-in methods in Ensemble." /></div>
        </section>

        <section className="space-y-3 rounded-2xl border border-line bg-panel p-5">
          <h2 className="font-semibold">Credits</h2>
          <CreditsMeter credits={credits} />
          <External href={ENSEMBLE_LINKS.metrics} icon className="text-sm text-accent hover:underline">
            Usage by model and purpose
          </External>
        </section>

        <nav className="overflow-hidden rounded-2xl border border-line bg-panel" aria-label="More settings">
          {places.map(([href, label, Icon, hint]) => (
            <Link key={href} href={href} className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-b-0 hover:bg-raised/60">
              <Icon size={18} className="shrink-0 text-accent" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{label}</span>
                <span className="block truncate text-xs text-muted">{hint}</span>
              </span>
              <ChevronRight size={16} className="text-muted" />
            </Link>
          ))}
        </nav>

        <section id="computers" className="space-y-3">
          <h2 className="font-semibold">Computers</h2>
          <ComputerList computers={computers} />
          <p className="text-sm text-muted">
            Pairing happens in Ensemble.{" "}
            <External href={ENSEMBLE_LINKS.pairComputer} icon className="text-accent hover:underline">
              Connect a computer in Ensemble
            </External>{" "}
            ·{" "}
            <External href={ENSEMBLE_LINKS.download} icon className="text-accent hover:underline">
              Download Ensemble
            </External>
          </p>
        </section>

        <section className="space-y-2 rounded-2xl border border-line bg-panel p-5 text-sm">
          <h2 className="font-semibold">In Ensemble</h2>
          <p className="text-muted">Your nodes use the same workspace, write policy, run profiles and connected apps as the Ensemble assistant.</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {(
              [
                ["Assistant and write policy", ENSEMBLE_LINKS.assistant],
                ["Run profiles", ENSEMBLE_LINKS.runProfiles],
                ["Models and API keys", ENSEMBLE_LINKS.models],
                ["Needs me", ENSEMBLE_LINKS.needsMe],
                ["Board", ENSEMBLE_LINKS.board],
              ] as const
            ).map(([label, href]) => (
              <External key={href} href={href} icon className="text-accent hover:underline">
                {label}
              </External>
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
