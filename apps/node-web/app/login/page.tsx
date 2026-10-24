"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Wordmark } from "@/components/brand";
import { Turnstile } from "@/components/turnstile";
import { Button, External, Field, Input, Notice } from "@/components/ui";
import { api, oauthStartUrl } from "@/lib/api";
import { ENSEMBLE_LINKS } from "@/lib/config";
import { keys, useAuthStatus } from "@/lib/hooks";

const PROVIDER_LABEL: Record<string, string> = { google: "Google", microsoft: "Microsoft", github: "GitHub" };

function ProviderIcon({ provider }: { provider: string }) {
  if (provider === "google")
    return (
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
      </svg>
    );
  if (provider === "microsoft")
    return (
      <svg width="16" height="16" viewBox="0 0 23 23" aria-hidden>
        <path fill="#f35325" d="M1 1h10v10H1z" />
        <path fill="#81bc06" d="M12 1h10v10H12z" />
        <path fill="#05a6f0" d="M1 12h10v10H1z" />
        <path fill="#ffba08" d="M12 12h10v10H12z" />
      </svg>
    );
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.7 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A11.5 11.5 0 0 0 23.5 12C23.5 5.7 18.3.5 12 .5z" />
    </svg>
  );
}

function LoginForm() {
  const params = useSearchParams();
  const router = useRouter();
  const client = useQueryClient();
  const status = useAuthStatus();
  const [mode, setMode] = useState<"signin" | "signup">(params.get("mode") === "signup" ? "signup" : "signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(params.get("error"));
  const [busy, setBusy] = useState(false);
  const onToken = useCallback((value: string | null) => setToken(value), []);
  const siteKey = status.data?.turnstileSiteKey ?? null;
  const signupOpen = status.data ? status.data.signup !== "closed" && status.data.emailSignupAvailable : true;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signin") {
        await api("/api/auth/login", { body: { email, password } });
        await client.invalidateQueries({ queryKey: keys.me });
        router.replace("/chat");
      } else {
        if (siteKey && !token) throw new Error("Complete the check above first.");
        await api("/api/auth/signup", { body: { name, email, password, ...(token ? { turnstileToken: token } : {}) } });
        await client.invalidateQueries({ queryKey: keys.me });
        router.replace("/welcome");
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <div className="glow pointer-events-none absolute inset-x-0 top-0 h-80" />
      <div className="relative w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <Link href="/">
            <Wordmark size={30} />
          </Link>
        </div>
        <div className="rounded-2xl border border-line bg-panel p-6 shadow-xl">
          <h1 className="text-xl font-semibold">{mode === "signin" ? "Sign in" : "Create your Ensemble account"}</h1>
          <p className="mt-1 text-sm text-muted">
            {mode === "signin"
              ? "Use your Ensemble account. Node uses it as it is: its connected apps, computers, trusted folders and credits."
              : "This creates your Ensemble account: one account for Ensemble, the CLI and Node, with 20,000 free credits every month. Already have one? Sign in instead."}
          </p>

          {error ? (
            <div className="mt-4">
              <Notice tone="error">{error}</Notice>
            </div>
          ) : null}

          <div className="mt-5 space-y-2">
            {(status.data?.providers ?? []).map((provider) => (
              <a key={provider} href={oauthStartUrl(provider)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-bg px-4 py-2.5 text-sm font-medium hover:bg-raised">
                <ProviderIcon provider={provider} /> Continue with {PROVIDER_LABEL[provider] ?? provider}
              </a>
            ))}
          </div>
          {status.data?.providers.length ? (
            <div className="my-5 flex items-center gap-3 text-xs text-muted">
              <span className="h-px flex-1 bg-line" /> or with email <span className="h-px flex-1 bg-line" />
            </div>
          ) : (
            <div className="h-4" />
          )}

          {mode === "signup" && !signupOpen ? (
            <Notice>Email sign-up is not open on this server. Use a provider above, or ask the operator for an invitation.</Notice>
          ) : (
            <form className="space-y-3" onSubmit={submit}>
              {mode === "signup" ? (
                <Field label="Name">
                  <Input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="Mira Chen" />
                </Field>
              ) : null}
              <Field label="Email">
                <Input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" />
              </Field>
              <Field label="Password" hint={mode === "signup" ? "At least 8 characters." : undefined}>
                <Input type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "signin" ? "current-password" : "new-password"} />
              </Field>
              {mode === "signup" && siteKey ? <Turnstile siteKey={siteKey} onToken={onToken} /> : null}
              <Button type="submit" busy={busy} className="w-full">
                {mode === "signin" ? "Sign in" : "Create account"}
              </Button>
            </form>
          )}

          <div className="mt-5 flex items-center justify-between text-sm">
            <button className="text-accent hover:underline" onClick={() => (setMode(mode === "signin" ? "signup" : "signin"), setError(null))}>
              {mode === "signin" ? "New here? Create an account" : "Have an account? Sign in"}
            </button>
            {mode === "signin" ? (
              <External href={ENSEMBLE_LINKS.forgot} className="text-muted hover:text-ink">
                Forgot password?
              </External>
            ) : null}
          </div>
        </div>
        <p className="text-center text-xs text-muted">
          By continuing you agree to Ensemble&apos;s{" "}
          <External className="underline" href={ENSEMBLE_LINKS.terms}>
            Terms
          </External>{" "}
          and{" "}
          <External className="underline" href={ENSEMBLE_LINKS.privacy}>
            Privacy policy
          </External>
          .
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
