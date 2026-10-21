/** Ensemble's API (shared sign-in, credits and data) and the Ensemble app, from the build's env. */
const clean = (value: string | undefined, fallback: string) => (value?.trim() || fallback).replace(/\/+$/, "");

export const ENSEMBLE_API = clean(process.env.NEXT_PUBLIC_ENSEMBLE_API, "http://localhost:4000");
export const ENSEMBLE_APP = clean(process.env.NEXT_PUBLIC_ENSEMBLE_APP, "http://localhost:3000");
