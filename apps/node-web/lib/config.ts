import { nodeEnvironment } from "./environment";

/** Ensemble's API (shared sign-in, credits and data) and the Ensemble app, from the build's env. */
const clean = (value: string | undefined, fallback: string) => (value?.trim() || fallback).replace(/\/+$/, "");

export const ENSEMBLE_API = clean(process.env.NEXT_PUBLIC_ENSEMBLE_API, "http://localhost:4000");
export const ENSEMBLE_APP = clean(process.env.NEXT_PUBLIC_ENSEMBLE_APP, "http://localhost:3000");

/** "testing" on the testing website (node-test.ensemblework.com), else "production". */
export const NODE_ENVIRONMENT = nodeEnvironment(process.env.NEXT_PUBLIC_ENSEMBLE_NODE_ENV);
export const TESTING = NODE_ENVIRONMENT === "testing";
/** The product name, marked on the testing website so the two are never confused. */
export const PRODUCT_NAME = TESTING ? "Ensemble Node Testing" : "Ensemble Node";
/** The CLI of this environment: testing computers pair with the separate ensemble-test (Ensemble docs/36). */
export const CLI_COMMAND = TESTING ? "ensemble-test" : "ensemble";

/** Places in Ensemble that Node links to. They open in a new tab. */
export const ENSEMBLE_LINKS = {
  app: ENSEMBLE_APP,
  pairComputer: `${ENSEMBLE_APP}/settings?tab=account#this-mac`,
  // The testing environment pairs computers with the separate ensemble-test CLI (Ensemble docs/36).
  download: TESTING ? "https://github.com/ensemblework/ensemble/releases/tag/cli-testing-latest" : "https://ensemblework.com/download",
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
  files: `${ENSEMBLE_APP}/files`,
  file: (id: string) => `${ENSEMBLE_APP}/files/${encodeURIComponent(id)}`,
  forgot: `${ENSEMBLE_APP}/forgot`,
  terms: "https://ensemblework.com/terms",
  privacy: "https://ensemblework.com/privacy",
} as const;
