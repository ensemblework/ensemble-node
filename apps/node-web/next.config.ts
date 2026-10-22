import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The commit this build is published from (set by .github/actions/vercel-deploy); /health reports it.
  env: { ENSEMBLE_NODE_COMMIT: process.env.ENSEMBLE_NODE_COMMIT ?? "" },
  devIndicators: false,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
