import pkg from "../../package.json";
import { NODE_ENVIRONMENT } from "@/lib/config";

export const dynamic = "force-dynamic";

/** For the deploy workflows: the commit this build was published from (null in development) and its environment. */
export function GET() {
  return Response.json(
    { ok: true, service: "ensemble-node-web", version: pkg.version, commit: process.env.ENSEMBLE_NODE_COMMIT || null, environment: NODE_ENVIRONMENT },
    { headers: { "cache-control": "no-store" } },
  );
}
