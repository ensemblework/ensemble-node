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
