import type { NextConfig } from "next";
import { resolve } from "node:path";

const appRoot = resolve(__dirname);
const config: NextConfig = {
  output: "standalone",
  // Keep the nested app and standalone layout stable with either lockfile.
  turbopack: { root: appRoot },
  outputFileTracingRoot: appRoot,
  poweredByHeader: false,
  outputFileTracingExcludes: {
    "/*": ["./.env", "./.env.*", "./.local/**/*", "./uploads/**/*"],
  },
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-mariadb"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(self)",
          },
        ],
      },
    ];
  },
};
export default config;
