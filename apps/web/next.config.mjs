/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@infrachat/db", "@infrachat/realtime"],
  // Monorepo: trace from the repo root so Vercel/local builds include
  // workspace deps (@infrachat/*) instead of warning about lockfiles.
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
