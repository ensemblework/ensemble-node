/** Ensemble's API (shared sign-in, credits and data) and the Ensemble app, from the build's env. */
const clean = (value: string | undefined, fallback: string) => (value?.trim() || fallback).replace(/\/+$/, "");

export const ENSEMBLE_API = clean(process.env.NEXT_PUBLIC_ENSEMBLE_API, "http://localhost:4000");
export const ENSEMBLE_APP = clean(process.env.NEXT_PUBLIC_ENSEMBLE_APP, "http://localhost:3000");

/** Places in Ensemble that Node links to. They open in a new tab. */
export const ENSEMBLE_LINKS = {
  app: ENSEMBLE_APP,
  pairComputer: `${ENSEMBLE_APP}/settings?tab=account#this-mac`,
  download: "https://ensemblework.com/download",
  connections: `${ENSEMBLE_APP}/settings?tab=connections#connections`,
  connector: (id: string) => `${ENSEMBLE_APP}/settings?tab=connections&connector=${encodeURIComponent(id)}`,
  runProfiles: `${ENSEMBLE_APP}/settings?tab=assistant#run-profiles`,
  models: `${ENSEMBLE_APP}/settings?tab=assistant#models`,
  assistant: `${ENSEMBLE_APP}/settings?tab=assistant#assistant`,
  account: `${ENSEMBLE_APP}/settings?tab=account#account`,
  needsMe: `${ENSEMBLE_APP}/needs-me`,
  metrics: `${ENSEMBLE_APP}/metrics`,
  board: `${ENSEMBLE_APP}/board`,
  task: (id: string) => `${ENSEMBLE_APP}/tasks/${id}`,
  forgot: `${ENSEMBLE_APP}/forgot`,
  terms: "https://ensemblework.com/terms",
  privacy: "https://ensemblework.com/privacy",
} as const;
