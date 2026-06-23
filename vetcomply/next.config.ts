import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/agent",
        destination: "/#compliance-agent",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
