"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Globe, Inbox, LogOut, Plug, Repeat, Search, SquareTerminal } from "lucide-react";
import { api } from "@/lib/api";
import { ENSEMBLE_LINKS } from "@/lib/config";
import { liveDevices } from "@/lib/ensemble";
import { useBootstrap, useDevices, useOwnerSettings, useSaveOwnerSettings } from "@/lib/hooks";
import { askBeforeBrowsing } from "@/lib/owner-settings";
import { toast, toastError } from "@/lib/toast";
import { ComputerList, DeviceList, PairComputer } from "@/components/connect-computer";
import { CreditsMeter } from "@/components/credits";
import { PersonAvatar } from "@/components/node-avatar";
import { Button, External, InfoTip, Spinner, Switch } from "@/components/ui";

/**
 * Whether a node asks before it opens a website for the first time (Ensemble's `node.askBeforeBrowsing`,
 * off by default): public pages open without asking, sign-ins always ask on their card.
 */
function BrowsingSetting() {
  const settings = useOwnerSettings();
  const save = useSaveOwnerSettings();
  const value = askBeforeBrowsing(settings.data);
  if (settings.isLoading) return <Spinner className="h-4 w-4 text-muted" />;
  if (settings.error) return <p className="text-sm text-danger">{settings.error.message}</p>;
  const change = (next: boolean) =>
    save.mutate(
      { node: { askBeforeBrowsing: next } },
      {
        onSuccess: (saved) => {
          if (askBeforeBrowsing(saved) !== next) toastError(new Error("Ensemble did not keep this setting. Update Ensemble, then try again."));
          else toast(next ? "Saved: your nodes ask before opening a new website." : "Saved: your nodes open public websites without asking.", "ok");
        },
        onError: toastError,
      },
    );
  return (
    <Switch
      label="Ask before a node opens a new website"
      hint={value === null ? "Your Ensemble does not offer this yet." : value ? "On: the first visit to each new website asks you in the chat, on a card." : "Off: your nodes open and read public websites without asking. Signing in to a site always asks."}
      checked={value === true}
      disabled={value === null || save.isPending}
      onChange={change}
    />
  );
}

export default function SettingsPage() {
  const boot = useBootstrap();
  const devices = useDevices();
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
  const list = liveDevices(devices.data ?? []);
  const places: Array<[string, string, typeof Plug, string]> = [
    ["/routines", "Routines", Repeat, "Work your nodes do on a schedule, on a change or when a webhook calls"],
    ["/sessions", "Sessions", SquareTerminal, "Your coding agents' sessions, and which node manages each"],
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

        <section id="computers" className="scroll-mt-6 space-y-3">
          <div>
            <h2 className="font-semibold">Computers</h2>
            <p className="mt-1 text-sm text-muted">Your nodes run your own coding agents (Claude Code, Codex, GitHub Copilot and the rest) on these computers, with your own subscriptions, inside the folders each one shares. Nothing runs on Ensemble&apos;s servers.</p>
          </div>
          {devices.isLoading ? (
            <div className="flex justify-center py-4 text-muted">
              <Spinner />
            </div>
          ) : devices.error ? (
            <ComputerList computers={computers} />
          ) : (
            <DeviceList devices={list} />
          )}
          <PairComputer paired={list.length > 0 || computers.length > 0} />
          <div className="rounded-2xl border border-line bg-panel p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Globe size={16} className="text-accent" aria-hidden /> Browsing
            </h3>
            <BrowsingSetting />
          </div>
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
