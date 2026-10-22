import pkg from "../../package.json";

export const dynamic = "force-dynamic";

/** For the deploy workflow: the commit this build was published from (null in development). */
export function GET() {
  return Response.json(
    { ok: true, service: "ensemble-node-web", version: pkg.version, commit: process.env.ENSEMBLE_NODE_COMMIT || null },
    { headers: { "cache-control": "no-store" } },
  );
}
