import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/agent",
        destination: "/demo#compliance-agent",
        permanent: false,
      },
      {
        source: "/locations",
        destination: "/demo/locations",
        permanent: true,
      },
      {
        source: "/acquisitions",
        destination: "/demo/acquisitions",
        permanent: true,
      },
      {
        source: "/licenses",
        destination: "/demo/licenses",
        permanent: true,
      },
      {
        source: "/alerts",
        destination: "/demo/alerts",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
