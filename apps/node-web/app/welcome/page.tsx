"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowRight, Check, Inbox, Users } from "lucide-react";
import { Wordmark } from "@/components/brand";
import { ComputerList, PairComputer } from "@/components/connect-computer";
import { NodeAvatar } from "@/components/node-avatar";
import { Button, External, Field, Input, Notice, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { ENSEMBLE_LINKS } from "@/lib/config";
import { uniqueName } from "@/lib/crew";
import { keys, useMe } from "@/lib/hooks";
import type { Bootstrap, NodeFull, Room } from "@/lib/types";

type Step = "verify" | "account" | "node" | "computer";

export default function Welcome() {
  const router = useRouter();
  const client = useQueryClient();
  const me = useMe();
  const unverified = Boolean(me.data?.verificationRequired);
  const [step, setStep] = useState<Step | null>(null);
  const boot = useQuery({
    queryKey: keys.bootstrap,
    queryFn: () => api<Bootstrap>("/api/node/bootstrap"),
    enabled: Boolean(me.data),
    refetchInterval: step === "computer" ? 5000 : false,
  });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [pick, setPick] = useState<string>("assistant");
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);

  useEffect(() => {
    if (me.error instanceof ApiError && me.error.status === 401) router.replace("/login?mode=signup");
  }, [me.error, router]);
  useEffect(() => {
    if (step || !me.data || !boot.data) return;
    setStep(unverified ? "verify" : boot.data.nodes.length ? "computer" : "account");
  }, [step, me.data, boot.data, unverified]);

  if (!me.data || !boot.data || !step) {
    return (
      <main className="flex min-h-screen items-center justify-center text-muted">
        <Spinner />
      </main>
    );
  }
  const templates = boot.data.templates;
  const chosen = templates.nodes.find((row) => row.id === pick);
  const chosenCrew = templates.crews.find((row) => row.id === pick);
  const steps: Step[] = unverified || step === "verify" ? ["verify", "account", "node", "computer"] : ["account", "node", "computer"];

  const run = async (work: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await work();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  const verify = () =>
    run(async () => {
      await api("/api/auth/verify-email", { body: { code } });
      await client.invalidateQueries({ queryKey: keys.me });
      setStep("account");
    });

  const create = () =>
    run(async () => {
      if (chosenCrew) {
        // A crew suggestion: make its nodes (the server numbers names already taken), then the crew.
        const made: NodeFull[] = [];
        for (const id of chosenCrew.nodes) made.push((await api<{ node: NodeFull }>("/api/node/nodes", { body: { templateId: id } })).node);
        const lead = made.find((node) => node.templateId === chosenCrew.lead) ?? made[0];
        const taken = new Set(boot.data.rooms.filter((room) => room.kind !== "dm").map((room) => room.title.toLowerCase()));
        const result = await api<{ room: Room }>("/api/node/crews", { body: { title: uniqueName(chosenCrew.title, taken, 80), nodeIds: made.map((node) => node.id), ...(lead ? { leadNodeId: lead.id } : {}) } });
        setCreated(result.room.id);
      } else {
        const result = await api<{ room: Room }>("/api/node/nodes", { body: { templateId: pick, ...(name.trim() ? { name: name.trim() } : {}) } });
        setCreated(result.room.id);
      }
      await client.invalidateQueries({ queryKey: keys.bootstrap });
      setStep("computer");
    });

  const finish = () => {
    const room = created ?? boot.data.rooms[0]?.id;
    router.replace(room ? `/r/${room}` : "/chat");
  };

  return (
    <main className="relative min-h-screen px-4 py-8">
      <div className="glow pointer-events-none absolute inset-x-0 top-0 h-80" />
      <div className="relative mx-auto max-w-3xl space-y-8">
        <div className="flex items-center justify-between">
          <Wordmark />
          <ol className="flex items-center gap-2 text-xs text-muted">
            {steps.map((row, index) => (
              <li key={row} className={`flex items-center gap-1 ${row === step ? "text-accent" : ""}`}>
                <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${steps.indexOf(step) > index ? "border-ok bg-ok/20 text-ok" : row === step ? "border-accent" : "border-line"}`}>
                  {steps.indexOf(step) > index ? <Check size={12} /> : index + 1}
                </span>
                <span className="hidden sm:inline">{{ verify: "Verify", account: "Account", node: "First node", computer: "Computer" }[row]}</span>
              </li>
            ))}
          </ol>
        </div>

        {error ? <Notice tone="error">{error}</Notice> : null}

        {step === "verify" ? (
          <section className="space-y-4 rounded-2xl border border-line bg-panel p-6">
            <h1 className="text-2xl font-semibold">Check your email</h1>
            <p className="text-muted">We sent a code to {me.data.user.email}. Enter it to verify your account; nodes use AI credits, so a verified email is needed before they can work.</p>
            <Field label="Verification code">
              <Input value={code} onChange={(event) => setCode(event.target.value)} placeholder="123456" inputMode="numeric" autoComplete="one-time-code" />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button onClick={verify} busy={busy} disabled={!code.trim()}>
                Verify
              </Button>
              <Button tone="ghost" onClick={() => run(async () => (await api("/api/auth/resend-verification", { body: {} }), setSent(true)))}>
                {sent ? "Sent again" : "Send a new code"}
              </Button>
            </div>
          </section>
        ) : null}

        {step === "account" ? (
          <section className="space-y-5 rounded-2xl border border-line bg-panel p-6">
            <h1 className="text-2xl font-semibold">Welcome{me.data.user.name ? `, ${me.data.user.name.split(" ")[0]}` : ""}. You&apos;re in Ensemble.</h1>
            <p className="text-muted">
              Node runs on your <strong className="text-ink">Ensemble account</strong> ({me.data.user.email}). If you just signed up here, that made the account. If you already used Ensemble, Node uses it as it is: your connected apps, paired computers, trusted folders and credits come along, and nothing is copied. One account everywhere:
            </p>
            <ul className="grid gap-3 sm:grid-cols-3">
              {[
                ["Ensemble", "Your workspace: tasks, pages, projects, people, connected apps. Your nodes read and write it.", ENSEMBLE_LINKS.app],
                ["Ensemble desktop app and CLI", "Pair your computer and run the work nodes hand to agents.", ENSEMBLE_LINKS.download],
                ["Ensemble Node", "Here: talk to your nodes, alone, in a crew, or in rooms with other people.", null],
              ].map(([title, body, link]) => (
                <li key={title} className="rounded-xl border border-line bg-bg p-4">
                  <div className="font-medium">{title}</div>
                  <p className="mt-1 text-sm text-muted">{body}</p>
                  {link ? (
                    <External href={link} icon className="mt-2 inline-block text-sm text-accent hover:underline">
                      Open
                    </External>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted">
              Every month you get <strong className="text-ink">{(boot.data.credits?.available ? boot.data.credits.limit : 20_000).toLocaleString()} credits</strong>, shared by all three. Nodes talk with GPT-5 mini by default.
            </p>
            <Button onClick={() => setStep("node")}>
              Make my first node <ArrowRight size={16} />
            </Button>
          </section>
        ) : null}

        {step === "node" ? (
          <section className="space-y-5 rounded-2xl border border-line bg-panel p-6">
            <h1 className="text-2xl font-semibold">Pick your first node</h1>
            <p className="text-muted">A node is a teammate with a role and a charter. You can change everything later, and add more.</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {templates.nodes.map((template) => (
                <button key={template.id} onClick={() => (setPick(template.id), setName(""))} className={`flex gap-3 rounded-xl border p-3 text-left transition ${pick === template.id ? "border-accent bg-accent/10" : "border-line bg-bg hover:border-muted"}`}>
                  <NodeAvatar avatar={template.avatar} size={40} />
                  <span>
                    <span className="block font-medium">{template.name}</span>
                    <span className="block text-xs text-muted">{template.summary}</span>
                  </span>
                </button>
              ))}
              {templates.crews.map((crew) => (
                <button key={crew.id} onClick={() => setPick(crew.id)} className={`flex gap-3 rounded-xl border p-3 text-left transition ${pick === crew.id ? "border-accent bg-accent/10" : "border-line bg-bg hover:border-muted"}`}>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-raised text-accent">
                    <Users size={20} />
                  </span>
                  <span>
                    <span className="block font-medium">{crew.title} crew</span>
                    <span className="block text-xs text-muted">{crew.summary}</span>
                  </span>
                </button>
              ))}
            </div>
            {chosen ? (
              <Field label="Name">
                <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={chosen.name} maxLength={60} />
              </Field>
            ) : null}
            <Button onClick={create} busy={busy}>
              {chosenCrew ? `Create the ${chosenCrew.title} crew` : `Create ${name.trim() || chosen?.name || "node"}`}
            </Button>
          </section>
        ) : null}

        {step === "computer" ? (
          <section className="space-y-5 rounded-2xl border border-line bg-panel p-6">
            <h1 className="text-2xl font-semibold">Connect a computer</h1>
            <p className="text-muted">
              Nodes plan and manage your Ensemble workspace from here. For real work (code, files, tests), they assign tasks to an agent on <strong className="text-ink">your</strong> computer, and you approve each one. A computer you already paired with Ensemble is ready; this page notices when one connects.
            </p>
            <ComputerList computers={boot.data.computers} />
            <PairComputer paired={boot.data.computers.length > 0} />
            {boot.data.invites?.length ? (
              <Link href="/requests" className="flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/5 px-3 py-2 text-sm hover:border-accent">
                <Inbox size={16} className="text-accent" /> {boot.data.invites.length} request{boot.data.invites.length === 1 ? "" : "s"} to join a room wait{boot.data.invites.length === 1 ? "s" : ""} for you
              </Link>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button onClick={finish}>
                {boot.data.computers.some((row) => row.online) ? "Start chatting" : "Continue without a computer"} <ArrowRight size={16} />
              </Button>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
