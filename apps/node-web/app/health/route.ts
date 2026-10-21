import pkg from "../../package.json";

export const dynamic = "force-dynamic";

/**
 * For the home server's deploy, its watchdog and the deploy workflow: the commit being served.
 * ENSEMBLE_NODE_COMMIT comes from the release's own .release-env (infra/deploy/home/update.sh);
 * it is null in development.
 */
export function GET() {
  return Response.json(
    { ok: true, service: "ensemble-node-web", version: pkg.version, commit: process.env.ENSEMBLE_NODE_COMMIT || null },
    { headers: { "cache-control": "no-store" } },
  );
}
