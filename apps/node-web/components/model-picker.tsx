"use client";

import { Check, ChevronDown, Cpu, KeyRound, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ENSEMBLE_LINKS } from "@/lib/config";
import { useBootstrap, useModels } from "@/lib/hooks";
import { filterModels, modelDetail, modelName, modelSections, sameModel, shortModelName } from "@/lib/models";
import type { ModelOption } from "@/lib/types";
import { External, Spinner } from "./ui";

export type ModelChoice = { provider: string | null; model: string | null };

const GROUP_ICON = { included: Sparkles, keys: KeyRound, plans: Cpu } as const;

/** The models a node can use: included ones at once, own keys and AI plans once asked for. */
export function useModelOptions(full: boolean): { options: ModelOption[]; fallback: string; loading: boolean; problems: string[] } {
  const boot = useBootstrap();
  const models = useModels(full);
  const options = models.data?.options ?? boot.data?.models.options ?? [];
  return { options, fallback: models.data?.default ?? boot.data?.models.default ?? "gpt-5-mini", loading: full && models.isFetching && !models.data, problems: models.data?.problems ?? [] };
}

/**
 * Picks a node's chat model, grouped as Ensemble shows them: included with Ensemble (Everyday and
 * Step-up, with relative credits), the account's own API keys, and AI plans on a paired computer.
 * `compact` is the chat header's model menu.
 */
export function ModelPicker({ value, onChange, variant = "field", disabled, label = "Chat model" }: { value: ModelChoice; onChange: (next: ModelChoice) => void | Promise<void>; variant?: "field" | "compact"; disabled?: boolean; label?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const { options, fallback, loading, problems } = useModelOptions(open);
  const name = modelName(options, value.provider, value.model, fallback);
  const current = options.find((row) => sameModel(row, value.provider, value.model));
  const sections = useMemo(() => modelSections(filterModels(options, query)), [options, query]);
  const preset = options.find((row) => row.default);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  useEffect(() => {
    if (open) requestAnimationFrame(() => list.current?.querySelector<HTMLElement>("input, [aria-selected='true'], [data-option]")?.focus());
    else setQuery("");
  }, [open]);

  const choose = async (next: ModelChoice) => {
    setOpen(false);
    if (next.model === value.model && (next.provider ?? null) === (value.provider ?? null)) return;
    setBusy(true);
    try {
      await onChange(next);
    } finally {
      setBusy(false);
    }
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = [...(list.current?.querySelectorAll<HTMLElement>("[data-option]") ?? [])];
    if (!items.length) return;
    event.preventDefault();
    const at = items.indexOf(document.activeElement as HTMLElement);
    items[(at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  };

  const row = (option: ModelOption) => {
    const selected = sameModel(option, value.provider, value.model);
    return (
      <button
        key={`${option.provider}:${option.model}`}
        type="button"
        data-option
        role="option"
        aria-selected={selected}
        onClick={() => void choose({ provider: option.provider, model: option.model })}
        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm outline-none hover:bg-raised focus:bg-raised ${selected ? "text-accent" : ""}`}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate">{option.label}</span>
          <span className="block truncate text-xs text-muted">{modelDetail(option)}</span>
        </span>
        {selected ? <Check size={15} className="shrink-0" /> : null}
      </button>
    );
  };

  const Icon = GROUP_ICON[current?.group ?? "included"];
  return (
    <div ref={box} className={`relative ${variant === "field" ? "w-full" : "inline-block"}`} onKeyDown={onKey}>
      {variant === "field" ? (
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`${label}: ${name}`}
          onClick={() => setOpen(!open)}
          className="flex w-full items-center gap-2 rounded-xl border border-line bg-bg px-3 py-2 text-left text-sm outline-none transition hover:border-muted focus:border-accent disabled:opacity-50"
        >
          <Icon size={15} className="shrink-0 text-accent" />
          <span className="min-w-0 flex-1">
            <span className="block truncate">{name}</span>
            {current ? <span className="block truncate text-xs text-muted">{modelDetail(current)}</span> : null}
          </span>
          {busy ? <Spinner /> : <ChevronDown size={15} className="shrink-0 text-muted" />}
        </button>
      ) : (
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`${label}: ${name}`}
          title={`${label}: ${name}`}
          onClick={() => setOpen(!open)}
          className="inline-flex max-w-[52vw] items-center gap-1 rounded-lg px-1.5 py-0.5 text-xs text-muted transition hover:bg-raised hover:text-ink disabled:opacity-50 sm:max-w-xs"
        >
          <Icon size={12} className="shrink-0 text-accent" />
          <span className="truncate">{current ? shortModelName(current.label) : name}</span>
          {busy ? <Spinner className="h-3 w-3" /> : <ChevronDown size={12} className="shrink-0" />}
        </button>
      )}

      {open ? (
        <div ref={list} role="listbox" aria-label={label} className="scroll-thin absolute left-0 z-40 mt-1 max-h-[min(70vh,520px)] w-[min(400px,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-line bg-panel p-1.5 shadow-2xl">
          {options.length > 8 ? (
            <div className="sticky top-0 z-10 bg-panel p-1 pb-1.5">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a model"
                aria-label="Find a model"
                className="w-full rounded-lg border border-line bg-bg px-2.5 py-1.5 text-sm outline-none placeholder:text-muted focus:border-accent"
              />
            </div>
          ) : null}
          {!query ? (
            <button
              type="button"
              data-option
              role="option"
              aria-selected={!value.model}
              onClick={() => void choose({ provider: null, model: null })}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm outline-none hover:bg-raised focus:bg-raised ${!value.model ? "text-accent" : ""}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate">Default{preset ? ` · ${shortModelName(preset.label)}` : ""}</span>
                <span className="block truncate text-xs text-muted">Ensemble&apos;s pick for nodes, from your credits</span>
              </span>
              {!value.model ? <Check size={15} className="shrink-0" /> : null}
            </button>
          ) : null}
          {sections.map((section, index) => (
            <div key={section.id} className="mt-1">
              {sections[index - 1]?.title !== section.title ? <div className="px-2.5 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{section.title}</div> : null}
              {section.sub ? <div className="px-2.5 pb-0.5 pt-1 text-[11px] text-muted">{section.sub}</div> : null}
              {section.options.map(row)}
            </div>
          ))}
          {query && !sections.length ? <p className="px-2.5 py-3 text-sm text-muted">No model matches “{query}”.</p> : null}
          {loading ? (
            <p className="flex items-center gap-2 px-2.5 py-2 text-xs text-muted">
              <Spinner className="h-3 w-3" /> Looking for your API keys and AI plans…
            </p>
          ) : null}
          {problems.map((problem) => (
            <p key={problem} className="px-2.5 py-1 text-xs text-warn">
              {problem}
            </p>
          ))}
          <div className="mt-1 border-t border-line px-2.5 pb-1 pt-2 text-xs text-muted">
            × is a typical turn&apos;s credits next to the 1× model. AI plans run the turn on that computer.{" "}
            <External href={ENSEMBLE_LINKS.models} className="text-accent hover:underline" icon>
              Keys and plans in Ensemble
            </External>
          </div>
        </div>
      ) : null}
    </div>
  );
}
