/**
 * Which Ensemble this build belongs to. The production website talks only to production Ensemble and
 * the testing website only to Ensemble's testing environment (docs/04); `next.config.ts` refuses a
 * build that would mix them.
 */
export type NodeEnvironment = "production" | "testing";

export const TESTING_ENSEMBLE = { api: "https://api-test.ensemblework.com", app: "https://test.ensemblework.com" } as const;

const origin = (value: string | undefined) => (value ?? "").trim().replace(/\/+$/, "");
const local = (value: string) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(value);

export function nodeEnvironment(name: string | undefined): NodeEnvironment {
  return name?.trim() === "testing" ? "testing" : "production";
}

/** Why these build settings would connect one environment to the other's Ensemble; empty when they do not. */
export function environmentProblems(env: Record<string, string | undefined>): string[] {
  const which = nodeEnvironment(env.NEXT_PUBLIC_ENSEMBLE_NODE_ENV);
  const api = origin(env.NEXT_PUBLIC_ENSEMBLE_API);
  const app = origin(env.NEXT_PUBLIC_ENSEMBLE_APP);
  const problems: string[] = [];
  if (which === "testing") {
    if (api !== TESTING_ENSEMBLE.api && !local(api)) problems.push(`A testing build must use ${TESTING_ENSEMBLE.api} (NEXT_PUBLIC_ENSEMBLE_API is "${api}").`);
    if (app !== TESTING_ENSEMBLE.app && !local(app)) problems.push(`A testing build must link to ${TESTING_ENSEMBLE.app} (NEXT_PUBLIC_ENSEMBLE_APP is "${app}").`);
  } else {
    if (api === TESTING_ENSEMBLE.api) problems.push("A production build cannot use the testing API. Set NEXT_PUBLIC_ENSEMBLE_NODE_ENV=testing for the testing website.");
    if (app === TESTING_ENSEMBLE.app) problems.push("A production build cannot link to the testing Ensemble. Set NEXT_PUBLIC_ENSEMBLE_NODE_ENV=testing for the testing website.");
  }
  return problems;
}
