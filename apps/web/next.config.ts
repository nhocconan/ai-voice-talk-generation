import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  experimental: {
    typedRoutes: true,
  },
  serverExternalPackages: ["pino", "pino-pretty"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.younetgroup.com",
      },
    ],
  },
}

export default nextConfig
