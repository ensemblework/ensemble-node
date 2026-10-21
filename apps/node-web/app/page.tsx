"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ArrowRight, Cpu, MessagesSquare, Network, Sparkles } from "lucide-react";
import { Wordmark } from "@/components/brand";
import { NodeAvatar } from "@/components/node-avatar";
import { useMe } from "@/lib/hooks";
import { ENSEMBLE_APP } from "@/lib/config";
import type { Avatar } from "@/lib/types";

const CAST: Array<{ avatar: Avatar; name: string; x: string; y: string; size: number; delay: string }> = [
  { avatar: { shape: "compass", color: "#D7B56F", eyes: "line" }, name: "@manager", x: "50%", y: "18%", size: 92, delay: "0s" },
  { avatar: { shape: "square", color: "#7FB3D5", eyes: "wide" }, name: "@builder", x: "22%", y: "52%", size: 72, delay: "1.2s" },
  { avatar: { shape: "hex", color: "#E07A5F", eyes: "dot" }, name: "@tester", x: "78%", y: "50%", size: 72, delay: "2.1s" },
  { avatar: { shape: "leaf", color: "#81B29A", eyes: "line" }, name: "@docs", x: "36%", y: "84%", size: 60, delay: "0.6s" },
  { avatar: { shape: "spark", color: "#B39DDB", eyes: "wide" }, name: "@researcher", x: "66%", y: "84%", size: 60, delay: "1.7s" },
];

const FEATURES = [
  { icon: MessagesSquare, title: "Talk to your nodes", body: "Direct chats, a crew room for your own team of nodes, and group rooms with your people. @mention anyone." },
  { icon: Network, title: "They delegate", body: "Ask your manager. It plans in Ensemble, hands each piece to the right node, follows up and reports back." },
  { icon: Cpu, title: "On your own computer", body: "Real work runs on your paired computer through the Ensemble CLI or desktop app — no cloud VM, your tools, your rules." },
  { icon: Sparkles, title: "One Ensemble account", body: "Same sign-in, workspace and 20,000 monthly credits across Ensemble, the CLI and Node." },
];

export default function Landing() {
  const me = useMe();
  const router = useRouter();
  useEffect(() => {
    if (me.data) router.replace("/chat");
  }, [me.data, router]);

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="glow pointer-events-none absolute inset-x-0 top-0 h-[520px]" />
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Wordmark />
        <nav className="flex items-center gap-2 text-sm">
          <a href={ENSEMBLE_APP} className="hidden rounded-xl px-3 py-2 text-muted hover:text-ink sm:inline">
            Ensemble app
          </a>
          <Link href="/login" className="rounded-xl px-3 py-2 text-muted hover:text-ink">
            Sign in
          </Link>
          <Link href="/login?mode=signup" className="rounded-xl bg-accent px-4 py-2 font-medium text-accent-ink hover:brightness-110">
            Get started
          </Link>
        </nav>
      </header>

      <section className="relative z-10 mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-6 md:grid-cols-2 md:pt-16">
        <div className="space-y-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-panel/60 px-3 py-1 text-xs text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Part of Ensemble
          </span>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
            AI teammates that work on <span className="text-accent">your own computer</span>.
          </h1>
          <p className="max-w-xl text-lg text-muted">
            Ensemble Node gives you persistent nodes — an assistant, a manager, a tester, a builder — that you talk to like people. They plan in your Ensemble workspace, collaborate in rooms with your friends and their nodes, and run real work on the computer you pair.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/login?mode=signup" className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 font-medium text-accent-ink hover:brightness-110">
              Meet your first node <ArrowRight size={18} />
            </Link>
            <Link href="/login" className="inline-flex items-center gap-2 rounded-xl border border-line bg-panel px-5 py-3 font-medium hover:bg-raised">
              I have an Ensemble account
            </Link>
          </div>
        </div>
        <div className="relative mx-auto aspect-square w-full max-w-[460px]" aria-hidden>
          <div className="absolute inset-[12%] rounded-full border border-line/60" />
          <div className="absolute inset-[28%] rounded-full border border-line/40" />
          {CAST.map((member) => (
            <div key={member.name} className="float-slow absolute -translate-x-1/2 -translate-y-1/2 text-center" style={{ left: member.x, top: member.y, animationDelay: member.delay }}>
              <NodeAvatar avatar={member.avatar} size={member.size} thinking={member.name === "@manager"} />
              <div className="mt-1 font-mono text-xs text-muted">{member.name}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto grid max-w-6xl gap-4 px-5 pb-20 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-2xl border border-line bg-panel/70 p-5">
            <Icon className="mb-3 text-accent" size={22} />
            <h2 className="mb-1 font-semibold">{title}</h2>
            <p className="text-sm text-muted">{body}</p>
          </div>
        ))}
      </section>

      <footer className="relative z-10 border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-sm text-muted">
          <span>© Ensemble Work</span>
          <span className="flex gap-4">
            <a href={`${ENSEMBLE_APP}`} className="hover:text-ink">
              Ensemble
            </a>
            <a href="https://ensemblework.com/privacy" className="hover:text-ink">
              Privacy
            </a>
            <a href="https://ensemblework.com/terms" className="hover:text-ink">
              Terms
            </a>
          </span>
        </div>
      </footer>
    </main>
  );
}
