const NAMES = {
  openai: "OpenAI", claude: "Claude", copilot: "GitHub Copilot", cursor: "Cursor",
  gemini: "Gemini", google: "Google", microsoft: "Microsoft", github: "GitHub",
  deepseek: "DeepSeek", mistral: "Mistral", meta: "Meta", ollama: "Ollama",
  qwen: "Qwen", kimi: "Kimi", openrouter: "OpenRouter", opencode: "OpenCode", grok: "Grok",
};

export type ModelBrand = keyof typeof NAMES;
export const MODEL_BRANDS = NAMES;

/** The model identifies its maker; the provider identifies the harness when no model is known. */
export function modelBrand(model?: string | null, provider?: string | null): ModelBrand | null {
  const name = (model ?? "").toLowerCase().split("::").at(-1)?.split("/").at(-1) ?? "";
  if (/claude|haiku|sonnet|opus/.test(name)) return "claude";
  if (/^(gpt-|chatgpt|o[1-9](?:-|$)|codex)/.test(name)) return "openai";
  if (/grok/.test(name)) return "grok";
  if (/gemini|gemma/.test(name)) return "gemini";
  if (/^(mai-|phi-)/.test(name)) return "microsoft";
  if (/deepseek/.test(name)) return "deepseek";
  if (/qwen|qwq/.test(name)) return "qwen";
  if (/kimi|moonshot/.test(name)) return "kimi";
  if (/mistral|mixtral|codestral|devstral|ministral/.test(name)) return "mistral";
  if (/llama/.test(name)) return "meta";
  const key = (provider ?? "").toLowerCase();
  const aliases: Record<string, ModelBrand> = {
    openai: "openai", codex: "openai", anthropic: "claude", "claude-code": "claude",
    "copilot-cli": "copilot", copilot: "copilot", "cursor-agent": "cursor", cursor: "cursor",
    google: "gemini", "gemini-cli": "gemini", antigravity: "google", microsoft: "microsoft",
    xai: "grok", "grok-cli": "grok", deepseek: "deepseek", mistral: "mistral",
    qwen: "qwen", kimi: "kimi", meta: "meta", ollama: "ollama", opencode: "opencode", openrouter: "openrouter",
  };
  return aliases[key] ?? null;
}
