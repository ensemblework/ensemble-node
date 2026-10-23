"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, Users } from "lucide-react";
import { Wordmark } from "@/components/brand";
import { ConnectComputer } from "@/components/connect-computer";
import { NodeAvatar } from "@/components/node-avatar";
import { Button, Field, Input, Notice, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { ENSEMBLE_APP } from "@/lib/config";
import { keys, useMe } from "@/lib/hooks";
import type { Bootstrap, Room } from "@/lib/types";

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
        const result = await api<{ room: Room }>("/api/node/crews", { body: { templateId: chosenCrew.id } });
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
              Signing up here created your <strong className="text-ink">Ensemble account</strong> ({me.data.user.email}). It is one account everywhere:
            </p>
            <ul className="grid gap-3 sm:grid-cols-3">
              {[
                ["Ensemble", "Your workspace: tasks, pages, projects, people. Your nodes read and write it.", ENSEMBLE_APP],
                ["Ensemble CLI", "Pairs your computer and runs the work nodes hand to agents.", "https://ensemblework.com/download"],
                ["Ensemble Node", "Here: talk to your nodes, alone or with your people.", null],
              ].map(([title, body, link]) => (
                <li key={title} className="rounded-xl border border-line bg-bg p-4">
                  <div className="font-medium">{title}</div>
                  <p className="mt-1 text-sm text-muted">{body}</p>
                  {link ? (
                    <a href={link} className="mt-2 inline-block text-sm text-accent hover:underline">
                      Open
                    </a>
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
              Nodes plan and manage your Ensemble workspace from here. For real work (code, files, tests), they assign tasks to an agent on <strong className="text-ink">your</strong> computer — you approve each one. Pair a computer with the Ensemble CLI or the desktop app; this page notices when it&apos;s connected.
            </p>
            <ConnectComputer computers={boot.data.computers} />
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
